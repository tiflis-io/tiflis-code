// Copyright (c) 2026 Roman Barinov <rbarinov@gmail.com>
// Licensed under the FSL-1.1-NC.

mod common;

use common::TestEnvironment;

#[tokio::test]
async fn test_http_get_request() {
    let mut env = TestEnvironment::new().await;
    env.start_client().await;

    let response = reqwest::get(env.proxy_url("health"))
        .await
        .expect("Failed to make request");

    assert_eq!(response.status(), 200);
}

#[tokio::test]
async fn test_http_post_request() {
    let mut env = TestEnvironment::new().await;
    env.start_client().await;

    let client = reqwest::Client::new();
    let response = client
        .post(env.proxy_url("echo"))
        .body("test payload")
        .send()
        .await
        .expect("Failed to make request");

    assert_eq!(response.status(), 200);
    let body = response.text().await.unwrap();
    assert!(body.contains("Echo: test payload"));
}

#[tokio::test]
async fn test_http_with_headers() {
    let mut env = TestEnvironment::new().await;
    env.start_client().await;

    let client = reqwest::Client::new();
    let response = client
        .get(env.proxy_url("health"))
        .header("X-Custom-Header", "test-value")
        .header("User-Agent", "tiflis-tunnel-test")
        .send()
        .await
        .expect("Failed to make request");

    assert_eq!(response.status(), 200);
}

#[tokio::test]
async fn test_http_path_routing() {
    let mut env = TestEnvironment::new().await;
    env.start_client().await;

    let response = reqwest::get(&env.proxy_url("api/users/123"))
        .await
        .expect("Failed to make request");

    assert_eq!(response.status(), 200);
    let body = response.text().await.unwrap();
    assert!(body.contains("users/123"));
}

#[tokio::test]
async fn test_http_large_payload() {
    let mut env = TestEnvironment::new().await;
    env.start_client().await;

    let large_payload = "x".repeat(100_000);

    let client = reqwest::Client::new();
    let response = client
        .post(env.proxy_url("echo"))
        .body(large_payload.clone())
        .send()
        .await
        .expect("Failed to make request");

    assert_eq!(response.status(), 200);
    let body = response.text().await.unwrap();
    assert!(body.contains(&large_payload[..100]));
}

#[tokio::test]
async fn test_http_concurrent_requests() {
    let mut env = TestEnvironment::new().await;
    env.start_client().await;

    let mut handles = vec![];

    for i in 0..10 {
        let url = env.proxy_url(&format!("api/test/{}", i));
        let handle = tokio::spawn(async move {
            let response = reqwest::get(&url).await.unwrap();
            assert_eq!(response.status(), 200);
        });
        handles.push(handle);
    }

    for handle in handles {
        handle.await.unwrap();
    }
}

#[tokio::test]
async fn test_http_error_status_codes() {
    let mut env = TestEnvironment::new().await;
    env.start_client().await;

    let client = reqwest::Client::new();
    
    let response_404 = client
        .get(env.proxy_url("nonexistent"))
        .send()
        .await
        .expect("Failed to make request");
    assert_eq!(response_404.status(), 404);

    let response_500 = client
        .get(env.proxy_url("error"))
        .send()
        .await
        .expect("Failed to make request");
    assert_eq!(response_500.status(), 500);
}

#[tokio::test]
async fn test_http_request_timeout_with_client() {
    let mut env = TestEnvironment::new().await;
    env.start_client().await;

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(2))
        .build()
        .unwrap();

    let result = client
        .get(env.proxy_url("slow"))
        .send()
        .await;

    assert!(result.is_err() || result.unwrap().status() == 504);
}
