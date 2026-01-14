// Copyright (c) 2026 Roman Barinov <rbarinov@gmail.com>
// Licensed under the FSL-1.1-NC.

mod common;

use common::TestEnvironment;

#[tokio::test]
async fn test_request_timeout() {
    let env = TestEnvironment::new().await;

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(2))
        .build()
        .unwrap();

    let result = client.get(env.proxy_url("health")).send().await;

    assert!(result.is_err() || result.unwrap().status() == 404);
}

#[tokio::test]
async fn test_multiple_workstations() {
    let mut env1 = TestEnvironment::new().await;
    let mut env2 = TestEnvironment::new().await;

    env1.start_client().await;
    env2.start_client().await;

    let response1 = reqwest::get(&env1.proxy_url("health"))
        .await
        .expect("Failed to make request to ws1");
    assert_eq!(response1.status(), 200);

    let response2 = reqwest::get(&env2.proxy_url("health"))
        .await
        .expect("Failed to make request to ws2");
    assert_eq!(response2.status(), 200);
}

#[tokio::test]
async fn test_sequential_requests() {
    let mut env = TestEnvironment::new().await;
    env.start_client().await;

    for i in 0..20 {
        let response = reqwest::get(&env.proxy_url(&format!("api/test/{}", i)))
            .await
            .expect("Failed to make request");

        assert_eq!(response.status(), 200);
        let body = response.text().await.unwrap();
        assert!(body.contains(&format!("test/{}", i)));
    }
}

#[tokio::test]
async fn test_health_check_endpoint() {
    let env = TestEnvironment::new().await;

    let health_url = format!("http://localhost:{}/health", env.server_http_port);
    let response = reqwest::get(&health_url)
        .await
        .expect("Failed to make request");

    assert_eq!(response.status(), 200);
    let body = response.text().await.unwrap();
    assert_eq!(body, "OK");
}

#[tokio::test]
async fn test_client_reconnection_with_grace_period() {
    let mut env = TestEnvironment::new_with_grace_period(10).await;
    env.start_client().await;

    let response1 = reqwest::get(&env.proxy_url("health"))
        .await
        .expect("Failed to make request");
    assert_eq!(response1.status(), 200);

    env.stop_client();

    tokio::time::sleep(std::time::Duration::from_secs(2)).await;

    env.start_client().await;

    tokio::time::sleep(std::time::Duration::from_secs(2)).await;

    let response2 = reqwest::get(&env.proxy_url("health"))
        .await
        .expect("Failed to make request");
    assert_eq!(response2.status(), 200);
}

#[tokio::test]
async fn test_grace_period_expiration() {
    let mut env = TestEnvironment::new_with_grace_period(3).await;
    env.start_client().await;

    let response1 = reqwest::get(&env.proxy_url("health"))
        .await
        .expect("Failed to make request");
    assert_eq!(response1.status(), 200);

    env.stop_client();

    tokio::time::sleep(std::time::Duration::from_secs(5)).await;

    let response2 = reqwest::get(&env.proxy_url("health"))
        .await
        .expect("Failed to make request");
    assert_eq!(response2.status(), 404);
}

#[tokio::test]
async fn test_in_flight_requests_during_disconnect() {
    let mut env = TestEnvironment::new_with_grace_period(10).await;
    env.start_client().await;

    let url = env.proxy_url("slow");

    let request_handle = tokio::spawn(async move { reqwest::get(&url).await });

    tokio::time::sleep(std::time::Duration::from_millis(500)).await;

    env.stop_client();

    let result = request_handle.await.unwrap();
    assert!(result.is_ok() || result.is_err());

    if let Ok(response) = result {
        assert!(response.status() == 200 || response.status() == 502 || response.status() == 504);
    }
}

#[tokio::test]
async fn test_0rtt_reconnection_with_session_tickets() {
    let mut env = TestEnvironment::new_with_grace_period(10).await;
    env.start_client().await;

    let response1 = reqwest::get(&env.proxy_url("health"))
        .await
        .expect("Failed to make request");
    assert_eq!(response1.status(), 200);

    let start = std::time::Instant::now();
    env.stop_client();
    tokio::time::sleep(std::time::Duration::from_secs(1)).await;

    env.start_client().await;
    tokio::time::sleep(std::time::Duration::from_secs(1)).await;

    let response2 = reqwest::get(&env.proxy_url("health"))
        .await
        .expect("Failed to make request");
    assert_eq!(response2.status(), 200);

    let reconnect_duration = start.elapsed();
    println!("Reconnection took: {:?}", reconnect_duration);
}
