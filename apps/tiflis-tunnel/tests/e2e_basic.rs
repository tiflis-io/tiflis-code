// Copyright (c) 2026 Roman Barinov <rbarinov@gmail.com>
// Licensed under the FSL-1.1-NC.

mod common;

use common::TestEnvironment;

#[tokio::test]
async fn test_server_starts() {
    let env = TestEnvironment::new().await;

    let health_url = format!("http://localhost:{}/health", env.server_http_port);
    let response = reqwest::get(&health_url).await.expect("Failed to connect");

    assert_eq!(response.status(), 200);
}

#[tokio::test]
async fn test_mock_server_works() {
    let env = TestEnvironment::new().await;

    let mock_url = format!("http://localhost:{}/health", env.mock_server_port);
    let response = reqwest::get(&mock_url).await.expect("Failed to connect");

    assert_eq!(response.status(), 200);
    let body = response.text().await.unwrap();
    assert_eq!(body, "OK");
}

#[tokio::test]
async fn test_full_http_workflow() {
    let mut env = TestEnvironment::new().await;
    env.start_client().await;

    let client = reqwest::Client::new();

    let get_response = client
        .get(env.proxy_url("health"))
        .send()
        .await
        .expect("GET request failed");
    assert_eq!(get_response.status(), 200);

    let post_response = client
        .post(env.proxy_url("echo"))
        .body("test data")
        .send()
        .await
        .expect("POST request failed");
    assert_eq!(post_response.status(), 200);
    assert!(post_response.text().await.unwrap().contains("test data"));

    let api_response = client
        .get(env.proxy_url("api/test"))
        .send()
        .await
        .expect("API request failed");
    assert_eq!(api_response.status(), 200);
}

#[tokio::test]
async fn test_mixed_http_and_websocket_traffic() {
    use futures::{SinkExt, StreamExt};
    use tokio_tungstenite::{connect_async, tungstenite::Message};

    let mut env = TestEnvironment::new().await;
    env.start_client().await;

    let http_handle = {
        let url = env.proxy_url("health");
        tokio::spawn(async move {
            for _ in 0..10 {
                let response = reqwest::get(&url).await.expect("HTTP request failed");
                assert_eq!(response.status(), 200);
                tokio::time::sleep(std::time::Duration::from_millis(100)).await;
            }
        })
    };

    let ws_handle = {
        let ws_url = env.proxy_url("ws").replace("http://", "ws://");
        tokio::spawn(async move {
            let (ws_stream, _) = connect_async(&ws_url).await.expect("Failed to connect");
            let (mut write, mut read) = ws_stream.split();

            for i in 0..10 {
                if write
                    .send(Message::Text(format!("WS message {}", i)))
                    .await
                    .is_err()
                {
                    break;
                }
                let _ = read.next().await;
                tokio::time::sleep(std::time::Duration::from_millis(100)).await;
            }
        })
    };

    let (http_result, ws_result) = tokio::join!(http_handle, ws_handle);
    http_result.unwrap();
    ws_result.unwrap();
}

#[tokio::test]
async fn test_long_running_session() {
    let mut env = TestEnvironment::new().await;
    env.start_client().await;

    for i in 0..50 {
        let response = reqwest::get(&env.proxy_url(&format!("api/test/{}", i)))
            .await
            .expect("Request failed");
        assert_eq!(response.status(), 200);
        tokio::time::sleep(std::time::Duration::from_millis(50)).await;
    }
}
