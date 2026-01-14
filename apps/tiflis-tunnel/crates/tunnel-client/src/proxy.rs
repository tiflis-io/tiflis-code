// Copyright (c) 2026 Roman Barinov <rbarinov@gmail.com>
// Licensed under the FSL-1.1-NC.

use reqwest::Client;
use std::collections::HashMap;
use tunnel_core::{codec, HttpRequestMessage, HttpResponseMessage, Message, WsOpenMessage};

pub struct LocalProxy {
    client: Client,
    base_url: String,
}

impl LocalProxy {
    pub fn new(base_url: String) -> Self {
        Self {
            client: Client::new(),
            base_url,
        }
    }

    pub async fn forward_http_request(
        &self,
        request: HttpRequestMessage,
    ) -> Result<HttpResponseMessage, String> {
        let url = format!("{}{}", self.base_url, request.path);
        let method = request
            .method
            .parse()
            .map_err(|e| format!("invalid method: {}", e))?;

        let mut req_builder = self.client.request(method, &url);

        for (name, value) in request.headers.iter() {
            req_builder = req_builder.header(name, value);
        }

        if let Some(body_b64) = request.body {
            let body_bytes = codec::decode_body(&body_b64)
                .map_err(|e| format!("failed to decode body: {}", e))?;
            req_builder = req_builder.body(body_bytes);
        }

        let response = req_builder
            .send()
            .await
            .map_err(|e| format!("request failed: {}", e))?;

        let status = response.status().as_u16();
        let mut headers = HashMap::new();

        for (name, value) in response.headers().iter() {
            if let Ok(val_str) = value.to_str() {
                headers.insert(name.to_string(), val_str.to_string());
            }
        }

        let body_bytes = response
            .bytes()
            .await
            .map_err(|e| format!("failed to read response body: {}", e))?;

        let body_base64 = if !body_bytes.is_empty() {
            Some(codec::encode_body(&body_bytes))
        } else {
            None
        };

        Ok(HttpResponseMessage {
            stream_id: request.stream_id,
            status,
            headers,
            body: body_base64,
        })
    }

    pub async fn handle_websocket_open(
        &self,
        open_msg: WsOpenMessage,
        mut quic_send: quinn::SendStream,
        mut quic_recv: quinn::RecvStream,
    ) {
        let ws_url = self
            .base_url
            .replace("http://", "ws://")
            .replace("https://", "wss://");
        let url = format!("{}{}", ws_url, open_msg.path);

        match tokio_tungstenite::connect_async(&url).await {
            Ok((ws_stream, _)) => {
                use futures::{SinkExt, StreamExt};
                use tokio_tungstenite::tungstenite::Message as WsMessage;

                let (mut ws_sender, mut ws_receiver) = ws_stream.split();
                let stream_id = open_msg.stream_id;

                let ws_to_tunnel_task = tokio::spawn(async move {
                    while let Some(result) = ws_receiver.next().await {
                        match result {
                            Ok(WsMessage::Text(text)) => {
                                let data_msg = Message::WsData(tunnel_core::WsDataMessage {
                                    stream_id,
                                    data: codec::encode_body(text.as_bytes()),
                                    is_binary: false,
                                });
                                if tunnel_core::quic::send_message(&mut quic_send, &data_msg)
                                    .await
                                    .is_err()
                                {
                                    break;
                                }
                            }
                            Ok(WsMessage::Binary(data)) => {
                                let data_msg = Message::WsData(tunnel_core::WsDataMessage {
                                    stream_id,
                                    data: codec::encode_body(&data),
                                    is_binary: true,
                                });
                                if tunnel_core::quic::send_message(&mut quic_send, &data_msg)
                                    .await
                                    .is_err()
                                {
                                    break;
                                }
                            }
                            Ok(WsMessage::Close(frame)) => {
                                let close_msg = Message::WsClose(tunnel_core::WsCloseMessage {
                                    stream_id,
                                    code: frame.as_ref().map(|f| f.code.into()),
                                    reason: frame.as_ref().map(|f| f.reason.to_string()),
                                });
                                let _ = tunnel_core::quic::send_message(&mut quic_send, &close_msg)
                                    .await;
                                let _ = quic_send.finish();
                                break;
                            }
                            Err(_) => break,
                            _ => {}
                        }
                    }
                });

                let tunnel_to_ws_task = tokio::spawn(async move {
                    loop {
                        match tunnel_core::quic::recv_message(&mut quic_recv).await {
                            Ok(Message::WsData(data)) => {
                                if let Ok(decoded) = codec::decode_body(&data.data) {
                                    let ws_msg = if data.is_binary {
                                        WsMessage::Binary(decoded)
                                    } else if let Ok(text) = String::from_utf8(decoded) {
                                        WsMessage::Text(text)
                                    } else {
                                        continue;
                                    };
                                    if ws_sender.send(ws_msg).await.is_err() {
                                        break;
                                    }
                                }
                            }
                            Ok(Message::WsClose(_)) => {
                                let _ = ws_sender.send(WsMessage::Close(None)).await;
                                break;
                            }
                            Err(_) => break,
                            _ => {}
                        }
                    }
                });

                let _ = tokio::join!(ws_to_tunnel_task, tunnel_to_ws_task);
            }
            Err(e) => {
                tracing::error!("Failed to connect to local WebSocket: {}", e);
            }
        }
    }

    pub async fn handle_message(&self, msg: Message) -> Option<Message> {
        match msg {
            Message::HttpRequest(req) => match self.forward_http_request(req).await {
                Ok(resp) => Some(Message::HttpResponse(resp)),
                Err(e) => {
                    tracing::error!("Failed to forward request: {}", e);
                    None
                }
            },
            _ => None,
        }
    }
}
