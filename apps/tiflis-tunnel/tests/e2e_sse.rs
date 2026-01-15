// Copyright (c) 2026 Roman Barinov <rbarinov@gmail.com>
// Licensed under the FSL-1.1-NC.

mod common;

use common::TestEnvironment;
use futures::StreamExt;
use std::time::Duration;
use tokio::time::timeout;

#[tokio::test]
async fn test_sse_basic_streaming() {
    let mut env = TestEnvironment::new().await;
    env.start_client().await;

    let client = reqwest::Client::new();
    let response = client
        .get(env.proxy_url("sse/events"))
        .header("Accept", "text/event-stream")
        .send()
        .await
        .expect("Failed to connect");

    assert_eq!(response.status(), 200);
    assert!(response
        .headers()
        .get("content-type")
        .map(|v| v.to_str().unwrap_or("").contains("text/event-stream"))
        .unwrap_or(false));

    let mut stream = response.bytes_stream();
    let mut events = Vec::new();

    while let Ok(Some(chunk)) = timeout(Duration::from_secs(5), stream.next()).await {
        if let Ok(data) = chunk {
            let text = String::from_utf8_lossy(&data);
            if text.contains("data:") {
                events.push(text.to_string());
            }
        }
        if events.len() >= 3 {
            break;
        }
    }

    assert_eq!(events.len(), 3);
    assert!(events[0].contains("event1"));
    assert!(events[1].contains("event2"));
    assert!(events[2].contains("event3"));
}

#[tokio::test]
async fn test_sse_with_specific_event_count() {
    let mut env = TestEnvironment::new().await;
    env.start_client().await;

    let client = reqwest::Client::new();
    let response = client
        .get(env.proxy_url("sse/events/5"))
        .header("Accept", "text/event-stream")
        .send()
        .await
        .expect("Failed to connect");

    assert_eq!(response.status(), 200);

    let mut stream = response.bytes_stream();
    let mut events = Vec::new();

    while let Ok(Some(chunk)) = timeout(Duration::from_secs(5), stream.next()).await {
        if let Ok(data) = chunk {
            let text = String::from_utf8_lossy(&data);
            if text.contains("data:") {
                events.push(text.to_string());
            }
        }
        if events.len() >= 5 {
            break;
        }
    }

    assert_eq!(events.len(), 5);
    assert!(events[4].contains("event5"));
}

#[tokio::test]
async fn test_sse_workstation_not_found() {
    let mut env = TestEnvironment::new().await;
    env.start_client().await;

    let client = reqwest::Client::new();
    let bad_url = format!(
        "http://localhost:{}/t/nonexistent-ws/sse/events",
        env.server_http_port
    );

    let response = client
        .get(&bad_url)
        .header("Accept", "text/event-stream")
        .send()
        .await
        .expect("Failed to connect");

    assert_eq!(response.status(), 404);
}

#[tokio::test]
async fn test_sse_server_error() {
    let mut env = TestEnvironment::new().await;
    env.start_client().await;

    let client = reqwest::Client::new();
    let response = client
        .get(env.proxy_url("sse/error"))
        .header("Accept", "text/event-stream")
        .send()
        .await
        .expect("Failed to connect");

    assert_eq!(response.status(), 500);
}

#[tokio::test]
async fn test_sse_large_events() {
    let mut env = TestEnvironment::new().await;
    env.start_client().await;

    let client = reqwest::Client::new();
    let response = client
        .get(env.proxy_url("sse/large"))
        .header("Accept", "text/event-stream")
        .send()
        .await
        .expect("Failed to connect");

    assert_eq!(response.status(), 200);

    let body = response.bytes().await.expect("Failed to read body");

    assert!(body.len() >= 50_000);
}

#[tokio::test]
async fn test_sse_client_early_disconnect() {
    let mut env = TestEnvironment::new().await;
    env.start_client().await;

    let client = reqwest::Client::new();
    let response = client
        .get(env.proxy_url("sse/slow"))
        .header("Accept", "text/event-stream")
        .send()
        .await
        .expect("Failed to connect");

    assert_eq!(response.status(), 200);

    let mut stream = response.bytes_stream();

    let first_event = timeout(Duration::from_secs(2), stream.next())
        .await
        .expect("Timeout waiting for first event");
    assert!(first_event.is_some());

    drop(stream);

    tokio::time::sleep(Duration::from_millis(200)).await;
}

#[tokio::test]
async fn test_sse_non_sse_request_unchanged() {
    let mut env = TestEnvironment::new().await;
    env.start_client().await;

    let client = reqwest::Client::new();
    let response = client
        .get(env.proxy_url("health"))
        .header("Accept", "application/json")
        .send()
        .await
        .expect("Failed to connect");

    assert_eq!(response.status(), 200);
    let body = response.text().await.unwrap();
    assert_eq!(body, "OK");
}

#[tokio::test]
async fn test_sse_concurrent_streams() {
    let mut env = TestEnvironment::new().await;
    env.start_client().await;

    let client = reqwest::Client::new();

    let mut handles = vec![];

    for _ in 0..3 {
        let url = env.proxy_url("sse/events/2");
        let client = client.clone();
        let handle = tokio::spawn(async move {
            let response = client
                .get(&url)
                .header("Accept", "text/event-stream")
                .send()
                .await
                .expect("Failed to connect");

            assert_eq!(response.status(), 200);

            let mut stream = response.bytes_stream();
            let mut event_count = 0;

            while let Ok(Some(chunk)) = timeout(Duration::from_secs(5), stream.next()).await {
                if let Ok(data) = chunk {
                    let text = String::from_utf8_lossy(&data);
                    if text.contains("data:") {
                        event_count += 1;
                    }
                }
                if event_count >= 2 {
                    break;
                }
            }

            assert_eq!(event_count, 2);
        });
        handles.push(handle);
    }

    for handle in handles {
        handle.await.unwrap();
    }
}

#[tokio::test]
async fn test_sse_after_client_reconnect() {
    let mut env = TestEnvironment::new().await;
    env.start_client().await;

    let client = reqwest::Client::new();
    let response = client
        .get(env.proxy_url("sse/events/2"))
        .header("Accept", "text/event-stream")
        .send()
        .await
        .expect("Failed to connect first time");
    assert_eq!(response.status(), 200);
    drop(response);

    env.restart_client().await;

    let response2 = client
        .get(env.proxy_url("sse/events/2"))
        .header("Accept", "text/event-stream")
        .send()
        .await
        .expect("Failed to connect after reconnect");
    assert_eq!(response2.status(), 200);

    let mut stream = response2.bytes_stream();
    let mut events = Vec::new();

    while let Ok(Some(chunk)) = timeout(Duration::from_secs(5), stream.next()).await {
        if let Ok(data) = chunk {
            let text = String::from_utf8_lossy(&data);
            if text.contains("data:") {
                events.push(text.to_string());
            }
        }
        if events.len() >= 2 {
            break;
        }
    }

    assert_eq!(events.len(), 2);
}
