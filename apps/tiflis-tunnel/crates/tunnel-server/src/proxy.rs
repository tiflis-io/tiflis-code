// Copyright (c) 2026 Roman Barinov <rbarinov@gmail.com>
// Licensed under the FSL-1.1-NC.

use crate::pending::PendingRequests;
use crate::registry::WorkstationRegistry;
use axum::{
    body::Body,
    extract::{Path, State, WebSocketUpgrade},
    http::{HeaderMap, Method, StatusCode},
    response::Response,
};
use std::sync::Arc;
use std::time::Duration;
use tokio::time::timeout;
use tunnel_core::{
    codec, HttpRequestMessage, Message, WsCloseMessage, WsDataMessage,
    WsOpenMessage,
};
use uuid::Uuid;

pub struct ProxyState {
    pub registry: Arc<WorkstationRegistry>,
    pub pending: Arc<PendingRequests>,
    pub request_timeout: Duration,
}

pub async fn handle_http_proxy(
    Path(params): Path<(String, String)>,
    State(state): State<Arc<ProxyState>>,
    ws: Option<WebSocketUpgrade>,
    method: Method,
    headers: HeaderMap,
    body: Body,
) -> Result<Response, StatusCode> {
    let (workstation_id, path) = params;
    let full_path = format!("/{}", path);

    if let Some(ws_upgrade) = ws {
        return handle_websocket_upgrade(workstation_id, path, state, ws_upgrade, headers).await;
    }

    let workstation = state
        .registry
        .get(&workstation_id)
        .await
        .ok_or(StatusCode::NOT_FOUND)?;

    let stream_id = Uuid::new_v4();
    let body_bytes = match axum::body::to_bytes(body, usize::MAX).await {
        Ok(bytes) => bytes,
        Err(_) => return Err(StatusCode::BAD_REQUEST),
    };

    let body_base64 = if !body_bytes.is_empty() {
        Some(codec::encode_body(&body_bytes))
    } else {
        None
    };

    let mut headers_map = std::collections::HashMap::new();
    for (name, value) in headers.iter() {
        if let Ok(val_str) = value.to_str() {
            headers_map.insert(name.to_string(), val_str.to_string());
        }
    }

    let request_msg = Message::HttpRequest(HttpRequestMessage {
        stream_id,
        method: method.to_string(),
        path: full_path,
        headers: headers_map,
        body: body_base64,
    });

    let (mut send, mut recv) = match workstation.connection.open_bi().await {
        Ok(streams) => streams,
        Err(_) => return Err(StatusCode::BAD_GATEWAY),
    };

    if tunnel_core::quic::send_message(&mut send, &request_msg).await.is_err() {
        return Err(StatusCode::BAD_GATEWAY);
    }
    
    if send.finish().is_err() {
        return Err(StatusCode::BAD_GATEWAY);
    }

    let response_msg = match timeout(state.request_timeout, tunnel_core::quic::recv_message(&mut recv)).await {
        Ok(Ok(Message::HttpResponse(resp))) => resp,
        Ok(Ok(_)) => {
            return Err(StatusCode::INTERNAL_SERVER_ERROR);
        }
        Ok(Err(_)) => {
            return Err(StatusCode::BAD_GATEWAY);
        }
        Err(_) => {
            return Err(StatusCode::GATEWAY_TIMEOUT);
        }
    };

    let mut builder = Response::builder().status(response_msg.status);

    for (name, value) in response_msg.headers.iter() {
        builder = builder.header(name, value);
    }

    let body_data = if let Some(body_b64) = response_msg.body {
        match codec::decode_body(&body_b64) {
            Ok(data) => data,
            Err(_) => return Err(StatusCode::INTERNAL_SERVER_ERROR),
        }
    } else {
        vec![]
    };

    Ok(builder.body(Body::from(body_data)).unwrap())
}

async fn handle_websocket_upgrade(
    workstation_id: String,
    path: String,
    state: Arc<ProxyState>,
    ws: WebSocketUpgrade,
    headers: HeaderMap,
) -> Result<Response, StatusCode> {
    let full_path = format!("/{}", path);

    let workstation = state
        .registry
        .get(&workstation_id)
        .await
        .ok_or(StatusCode::NOT_FOUND)?;

    let mut headers_map = std::collections::HashMap::new();
    for (name, value) in headers.iter() {
        if let Ok(val_str) = value.to_str() {
            headers_map.insert(name.to_string(), val_str.to_string());
        }
    }

    let stream_id = Uuid::new_v4();
    let connection = workstation.connection.clone();

    Ok(ws.on_upgrade(move |socket| async move {
        handle_websocket_connection(socket, connection, stream_id, full_path, headers_map).await
    }))
}

pub async fn handle_websocket_proxy(
    Path(params): Path<(String, String)>,
    State(state): State<Arc<ProxyState>>,
    ws: WebSocketUpgrade,
    headers: HeaderMap,
) -> Result<Response, StatusCode> {
    let (workstation_id, path) = params;
    handle_websocket_upgrade(workstation_id, path, state, ws, headers).await
}

async fn handle_websocket_connection(
    socket: axum::extract::ws::WebSocket,
    connection: quinn::Connection,
    stream_id: Uuid,
    path: String,
    headers: std::collections::HashMap<String, String>,
) {
    use axum::extract::ws::Message as WsMessage;
    use futures::{SinkExt, StreamExt};

    let (mut client_sender, mut client_receiver) = socket.split();

    let (mut quic_send, mut quic_recv) = match connection.open_bi().await {
        Ok(streams) => streams,
        Err(_) => return,
    };

    let open_msg = Message::WsOpen(WsOpenMessage {
        stream_id,
        path,
        headers,
    });

    if tunnel_core::quic::send_message(&mut quic_send, &open_msg).await.is_err() {
        return;
    }

    let client_to_tunnel_task = tokio::spawn(async move {
        while let Some(msg) = client_receiver.next().await {
            match msg {
                Ok(WsMessage::Text(text)) => {
                    let data_msg = Message::WsData(WsDataMessage {
                        stream_id,
                        data: codec::encode_body(text.as_bytes()),
                        is_binary: false,
                    });
                    if tunnel_core::quic::send_message(&mut quic_send, &data_msg).await.is_err() {
                        break;
                    }
                }
                Ok(WsMessage::Binary(data)) => {
                    let data_msg = Message::WsData(WsDataMessage {
                        stream_id,
                        data: codec::encode_body(&data),
                        is_binary: true,
                    });
                    if tunnel_core::quic::send_message(&mut quic_send, &data_msg).await.is_err() {
                        break;
                    }
                }
                Ok(WsMessage::Close(frame)) => {
                    let close_msg = Message::WsClose(WsCloseMessage {
                        stream_id,
                        code: frame.as_ref().map(|f| f.code),
                        reason: frame.as_ref().map(|f| f.reason.to_string()),
                    });
                    let _ = tunnel_core::quic::send_message(&mut quic_send, &close_msg).await;
                    let _ = quic_send.finish();
                    break;
                }
                _ => {}
            }
        }
    });

    let tunnel_to_client_task = tokio::spawn(async move {
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
                        if client_sender.send(ws_msg).await.is_err() {
                            break;
                        }
                    }
                }
                Ok(Message::WsClose(_)) => {
                    let _ = client_sender.send(WsMessage::Close(None)).await;
                    break;
                }
                Err(_) => break,
                _ => {}
            }
        }
    });

    let _ = tokio::join!(client_to_tunnel_task, tunnel_to_client_task);
}
