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
        }
    }
}
