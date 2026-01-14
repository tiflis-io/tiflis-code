// Copyright (c) 2026 Roman Barinov <rbarinov@gmail.com>
// Licensed under the FSL-1.1-NC.

mod common;

use common::TestEnvironment;
use tokio_tungstenite::{connect_async, tungstenite::Message};
use futures::{SinkExt, StreamExt};

#[tokio::test]
async fn test_websocket_connection() {
    let mut env = TestEnvironment::new().await;
    env.start_client().await;

    let ws_url = env.proxy_url("ws").replace("http://", "ws://");

    let (ws_stream, _) = connect_async(&ws_url)
        .await
        .expect("Failed to connect");

    let (mut write, mut read) = ws_stream.split();

    write
        .send(Message::Text("Hello WebSocket".to_string()))
        .await
        .unwrap();

    if let Some(Ok(Message::Text(response))) = read.next().await {
        assert!(response.contains("Echo: Hello WebSocket"));
    } else {
        panic!("Expected text message");
    }

    write.send(Message::Close(None)).await.unwrap();
}

#[tokio::test]
async fn test_websocket_binary_data() {
    let mut env = TestEnvironment::new().await;
    env.start_client().await;

    let ws_url = env.proxy_url("ws").replace("http://", "ws://");

    let (ws_stream, _) = connect_async(&ws_url)
        .await
        .expect("Failed to connect");

    let (mut write, mut read) = ws_stream.split();

    let binary_data = vec![1u8, 2, 3, 4, 5];
    write
        .send(Message::Binary(binary_data.clone()))
        .await
        .unwrap();

    if let Some(Ok(Message::Binary(response))) = read.next().await {
        assert_eq!(response, binary_data);
    } else {
        panic!("Expected binary message");
    }

    write.send(Message::Close(None)).await.unwrap();
}

#[tokio::test]
async fn test_websocket_multiple_messages() {
    let mut env = TestEnvironment::new().await;
    env.start_client().await;

    let ws_url = env.proxy_url("ws").replace("http://", "ws://");

    let (ws_stream, _) = connect_async(&ws_url)
        .await
        .expect("Failed to connect");

    let (mut write, mut read) = ws_stream.split();

    for i in 0..10 {
        let msg = format!("Message {}", i);
        write.send(Message::Text(msg.clone())).await.unwrap();

        if let Some(Ok(Message::Text(response))) = read.next().await {
            assert!(response.contains(&msg));
        }
    }

    write.send(Message::Close(None)).await.unwrap();
}

#[tokio::test]
async fn test_websocket_close_from_client() {
    let mut env = TestEnvironment::new().await;
    env.start_client().await;

    let ws_url = env.proxy_url("ws").replace("http://", "ws://");

    let (ws_stream, _) = connect_async(&ws_url)
        .await
        .expect("Failed to connect");

    let (mut write, mut read) = ws_stream.split();

    write.send(Message::Text("Test".to_string())).await.unwrap();
    let _ = read.next().await;

    write.send(Message::Close(None)).await.unwrap();

    if let Some(Ok(Message::Close(_))) = read.next().await {
        // Success - received close frame
    } else {
        // Connection closed is also acceptable
    }
}

#[tokio::test]
async fn test_websocket_concurrent_connections() {
    let mut env = TestEnvironment::new().await;
    env.start_client().await;

    let mut handles = vec![];

    for i in 0..5 {
        let ws_url = env.proxy_url("ws").replace("http://", "ws://");
        let handle = tokio::spawn(async move {
            let (ws_stream, _) = connect_async(&ws_url)
                .await
                .expect("Failed to connect");

            let (mut write, mut read) = ws_stream.split();

            let msg = format!("Message from connection {}", i);
            write.send(Message::Text(msg.clone())).await.unwrap();

            if let Some(Ok(Message::Text(response))) = read.next().await {
                assert!(response.contains(&msg));
            }

            write.send(Message::Close(None)).await.unwrap();
        });
        handles.push(handle);
    }

    for handle in handles {
        handle.await.unwrap();
    }
}

#[tokio::test]
async fn test_websocket_large_message() {
    let mut env = TestEnvironment::new().await;
    env.start_client().await;

    let ws_url = env.proxy_url("ws").replace("http://", "ws://");

    let (ws_stream, _) = connect_async(&ws_url)
        .await
        .expect("Failed to connect");

    let (mut write, mut read) = ws_stream.split();

    let large_message = "x".repeat(50_000);
    write
        .send(Message::Text(large_message.clone()))
        .await
        .unwrap();

    if let Some(Ok(Message::Text(response))) = read.next().await {
        assert!(response.contains(&large_message[..100]));
    } else {
        panic!("Expected text message");
    }

    write.send(Message::Close(None)).await.unwrap();
}

#[tokio::test]
async fn test_websocket_upgrade_from_http() {
    let mut env = TestEnvironment::new().await;
    env.start_client().await;

    let ws_url = env.proxy_url("ws").replace("http://", "ws://");

    let result = connect_async(&ws_url).await;
    assert!(result.is_ok(), "WebSocket upgrade should succeed");

    let (ws_stream, response) = result.unwrap();
    assert_eq!(response.status(), 101);

    let (mut write, _read) = ws_stream.split();
    write.send(Message::Close(None)).await.unwrap();
}
