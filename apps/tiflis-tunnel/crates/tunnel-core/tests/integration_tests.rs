// Copyright (c) 2026 Roman Barinov <rbarinov@gmail.com>
// Licensed under the FSL-1.1-NC.

use tunnel_core::codec;
use tunnel_core::{HttpRequestMessage, Message, RegisterMessage};

#[tokio::test]
async fn test_message_serialization() {
    let msg = Message::Register(RegisterMessage {
        api_key: "test-key".to_string(),
        workstation_id: "test-ws".to_string(),
    });

    let encoded = codec::encode_message(&msg).unwrap();
    let (decoded, size) = codec::decode_message(&encoded).unwrap();

    assert_eq!(size, encoded.len());
    match decoded {
        Message::Register(reg) => {
            assert_eq!(reg.api_key, "test-key");
            assert_eq!(reg.workstation_id, "test-ws");
        }
        _ => panic!("Expected Register message"),
    }
}

#[tokio::test]
async fn test_http_request_message() {
    let mut headers = std::collections::HashMap::new();
    headers.insert("Content-Type".to_string(), "application/json".to_string());

    let body_data = b"test body";
    let body_base64 = codec::encode_body(body_data);

    let msg = Message::HttpRequest(HttpRequestMessage {
        stream_id: uuid::Uuid::new_v4(),
        method: "POST".to_string(),
        path: "/api/test".to_string(),
        headers,
        body: Some(body_base64.clone()),
    });

    let encoded = codec::encode_message(&msg).unwrap();
    let (decoded, _) = codec::decode_message(&encoded).unwrap();

    match decoded {
        Message::HttpRequest(req) => {
            assert_eq!(req.method, "POST");
            assert_eq!(req.path, "/api/test");
            assert_eq!(req.headers.get("Content-Type").unwrap(), "application/json");
            let decoded_body = codec::decode_body(&req.body.unwrap()).unwrap();
            assert_eq!(decoded_body, body_data);
        }
        _ => panic!("Expected HttpRequest message"),
    }
}

#[tokio::test]
async fn test_large_message() {
    let large_body = vec![0u8; 1_000_000];
    let body_base64 = codec::encode_body(&large_body);

    let msg = Message::HttpRequest(HttpRequestMessage {
        stream_id: uuid::Uuid::new_v4(),
        method: "POST".to_string(),
        path: "/upload".to_string(),
        headers: std::collections::HashMap::new(),
        body: Some(body_base64),
    });

    let encoded = codec::encode_message(&msg).unwrap();
    let (decoded, size) = codec::decode_message(&encoded).unwrap();

    assert_eq!(size, encoded.len());
    match decoded {
        Message::HttpRequest(req) => {
            let decoded_body = codec::decode_body(&req.body.unwrap()).unwrap();
            assert_eq!(decoded_body.len(), 1_000_000);
        }
        _ => panic!("Expected HttpRequest message"),
    }
}

#[tokio::test]
async fn test_base64_encoding() {
    let data = b"Hello, World!";
    let encoded = codec::encode_body(data);
    let decoded = codec::decode_body(&encoded).unwrap();
    assert_eq!(decoded, data);
    
    let empty_data = b"";
    let encoded_empty = codec::encode_body(empty_data);
    let decoded_empty = codec::decode_body(&encoded_empty).unwrap();
    assert_eq!(decoded_empty, empty_data);
    
    let binary_data = vec![0u8, 1, 2, 255, 254, 253];
    let encoded_binary = codec::encode_body(&binary_data);
    let decoded_binary = codec::decode_body(&encoded_binary).unwrap();
    assert_eq!(decoded_binary, binary_data);
}
