// Copyright (c) 2026 Roman Barinov <rbarinov@gmail.com>
// Licensed under the FSL-1.1-NC.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum Message {
    Register(RegisterMessage),
    Registered(RegisteredMessage),
    Reconnect(ReconnectMessage),
    Ping(PingMessage),
    Pong(PongMessage),
    Error(ErrorMessage),
    HttpRequest(HttpRequestMessage),
    HttpResponse(HttpResponseMessage),
    WsOpen(WsOpenMessage),
    WsData(WsDataMessage),
    WsClose(WsCloseMessage),
    SseOpen(SseOpenMessage),
    SseHeaders(SseHeadersMessage),
    SseData(SseDataMessage),
    SseClose(SseCloseMessage),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RegisterMessage {
    pub api_key: String,
    pub workstation_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RegisteredMessage {
    pub url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReconnectMessage {
    pub api_key: String,
    pub workstation_id: String,
    pub session_ticket: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PingMessage {
    pub timestamp: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PongMessage {
    pub timestamp: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ErrorMessage {
    pub code: String,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HttpRequestMessage {
    pub stream_id: Uuid,
    pub method: String,
    pub path: String,
    pub headers: HashMap<String, String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub body: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HttpResponseMessage {
    pub stream_id: Uuid,
    pub status: u16,
    pub headers: HashMap<String, String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub body: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WsOpenMessage {
    pub stream_id: Uuid,
    pub path: String,
    pub headers: HashMap<String, String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WsDataMessage {
    pub stream_id: Uuid,
    pub data: String,
    pub is_binary: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WsCloseMessage {
    pub stream_id: Uuid,
    pub code: Option<u16>,
    pub reason: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SseOpenMessage {
    pub stream_id: Uuid,
    pub method: String,
    pub path: String,
    pub headers: HashMap<String, String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SseHeadersMessage {
    pub stream_id: Uuid,
    pub status: u16,
    pub headers: HashMap<String, String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SseDataMessage {
    pub stream_id: Uuid,
    pub data: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SseCloseMessage {
    pub stream_id: Uuid,
    pub error: Option<String>,
}

impl Message {
    pub fn message_type(&self) -> &'static str {
        match self {
            Message::Register(_) => "register",
            Message::Registered(_) => "registered",
            Message::Reconnect(_) => "reconnect",
            Message::Ping(_) => "ping",
            Message::Pong(_) => "pong",
            Message::Error(_) => "error",
            Message::HttpRequest(_) => "http_request",
            Message::HttpResponse(_) => "http_response",
            Message::WsOpen(_) => "ws_open",
            Message::WsData(_) => "ws_data",
            Message::WsClose(_) => "ws_close",
            Message::SseOpen(_) => "sse_open",
            Message::SseHeaders(_) => "sse_headers",
            Message::SseData(_) => "sse_data",
            Message::SseClose(_) => "sse_close",
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_sse_open_serialization() {
        let stream_id = Uuid::new_v4();
        let msg = Message::SseOpen(SseOpenMessage {
            stream_id,
            method: "GET".to_string(),
            path: "/events".to_string(),
            headers: HashMap::from([("accept".to_string(), "text/event-stream".to_string())]),
        });
        let encoded = serde_json::to_string(&msg).unwrap();
        assert!(encoded.contains("\"type\":\"sse_open\""));
        assert!(encoded.contains("\"method\":\"GET\""));
        assert!(encoded.contains("\"path\":\"/events\""));

        let decoded: Message = serde_json::from_str(&encoded).unwrap();
        match decoded {
            Message::SseOpen(open) => {
                assert_eq!(open.stream_id, stream_id);
                assert_eq!(open.method, "GET");
                assert_eq!(open.path, "/events");
            }
            _ => panic!("Wrong message type"),
        }
    }

    #[test]
    fn test_sse_headers_serialization() {
        let stream_id = Uuid::new_v4();
        let msg = Message::SseHeaders(SseHeadersMessage {
            stream_id,
            status: 200,
            headers: HashMap::from([
                ("content-type".to_string(), "text/event-stream".to_string()),
                ("cache-control".to_string(), "no-cache".to_string()),
            ]),
        });
        let encoded = serde_json::to_string(&msg).unwrap();
        assert!(encoded.contains("\"type\":\"sse_headers\""));
        assert!(encoded.contains("\"status\":200"));

        let decoded: Message = serde_json::from_str(&encoded).unwrap();
        match decoded {
            Message::SseHeaders(h) => {
                assert_eq!(h.stream_id, stream_id);
                assert_eq!(h.status, 200);
                assert_eq!(
                    h.headers.get("content-type"),
                    Some(&"text/event-stream".to_string())
                );
            }
            _ => panic!("Wrong message type"),
        }
    }

    #[test]
    fn test_sse_data_serialization() {
        let stream_id = Uuid::new_v4();
        let msg = Message::SseData(SseDataMessage {
            stream_id,
            data: "ZGF0YTogdGVzdAoK".to_string(), // "data: test\n\n" base64
        });
        let encoded = serde_json::to_string(&msg).unwrap();
        assert!(encoded.contains("\"type\":\"sse_data\""));
        assert!(encoded.contains("\"data\":\"ZGF0YTogdGVzdAoK\""));

        let decoded: Message = serde_json::from_str(&encoded).unwrap();
        match decoded {
            Message::SseData(d) => {
                assert_eq!(d.stream_id, stream_id);
                assert_eq!(d.data, "ZGF0YTogdGVzdAoK");
            }
            _ => panic!("Wrong message type"),
        }
    }

    #[test]
    fn test_sse_close_serialization_no_error() {
        let stream_id = Uuid::new_v4();
        let msg = Message::SseClose(SseCloseMessage {
            stream_id,
            error: None,
        });
        let encoded = serde_json::to_string(&msg).unwrap();
        assert!(encoded.contains("\"type\":\"sse_close\""));
        assert!(encoded.contains("\"error\":null"));

        let decoded: Message = serde_json::from_str(&encoded).unwrap();
        match decoded {
            Message::SseClose(c) => {
                assert_eq!(c.stream_id, stream_id);
                assert!(c.error.is_none());
            }
            _ => panic!("Wrong message type"),
        }
    }

    #[test]
    fn test_sse_close_serialization_with_error() {
        let stream_id = Uuid::new_v4();
        let msg = Message::SseClose(SseCloseMessage {
            stream_id,
            error: Some("Connection refused".to_string()),
        });
        let encoded = serde_json::to_string(&msg).unwrap();
        assert!(encoded.contains("\"type\":\"sse_close\""));
        assert!(encoded.contains("\"error\":\"Connection refused\""));

        let decoded: Message = serde_json::from_str(&encoded).unwrap();
        match decoded {
            Message::SseClose(c) => {
                assert_eq!(c.stream_id, stream_id);
                assert_eq!(c.error, Some("Connection refused".to_string()));
            }
            _ => panic!("Wrong message type"),
        }
    }

    #[test]
    fn test_sse_message_types() {
        let stream_id = Uuid::nil();

        assert_eq!(
            Message::SseOpen(SseOpenMessage {
                stream_id,
                method: String::new(),
                path: String::new(),
                headers: HashMap::new(),
            })
            .message_type(),
            "sse_open"
        );

        assert_eq!(
            Message::SseHeaders(SseHeadersMessage {
                stream_id,
                status: 0,
                headers: HashMap::new(),
            })
            .message_type(),
            "sse_headers"
        );

        assert_eq!(
            Message::SseData(SseDataMessage {
                stream_id,
                data: String::new(),
            })
            .message_type(),
            "sse_data"
        );

        assert_eq!(
            Message::SseClose(SseCloseMessage {
                stream_id,
                error: None,
            })
            .message_type(),
            "sse_close"
        );
    }
}
