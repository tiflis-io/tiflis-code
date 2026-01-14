// Copyright (c) 2026 Roman Barinov <rbarinov@gmail.com>
// Licensed under the FSL-1.1-NC.

mod common;

use common::TestEnvironment;

#[tokio::test]
async fn test_successful_registration() {
    let mut env = TestEnvironment::new().await;
    env.start_client().await;

    tokio::time::sleep(std::time::Duration::from_secs(2)).await;

    let url = env.proxy_url("health");
    println!("Requesting: {}", url);
    
    let response = reqwest::get(url)
        .await
        .expect("Failed to make request");

    println!("Response status: {}", response.status());
    
    assert_eq!(response.status(), 200);
    let body = response.text().await.unwrap();
    assert_eq!(body, "OK");
}

#[tokio::test]
async fn test_invalid_api_key() {
    let env = TestEnvironment::new().await;

    let client = reqwest::Client::new();
    let response = client
        .get(env.proxy_url("health"))
        .send()
        .await
        .expect("Failed to make request");

    assert_eq!(response.status(), 404);
}

#[tokio::test]
async fn test_workstation_not_found() {
    let env = TestEnvironment::new().await;

    let url = format!(
        "http://localhost:{}/t/nonexistent-workstation/health",
        env.server_http_port
    );

    let response = reqwest::get(&url).await.expect("Failed to make request");

    assert_eq!(response.status(), 404);
}

#[tokio::test]
async fn test_duplicate_workstation_registration() {
    let mut env1 = TestEnvironment::new_with_id("duplicate-test").await;
    let mut env2 = TestEnvironment::new_with_id("duplicate-test").await;

    env1.start_client().await;
    
    tokio::time::sleep(std::time::Duration::from_secs(1)).await;
    
    let response1 = reqwest::get(&env1.proxy_url("health"))
        .await
        .expect("Failed to make request");
    assert_eq!(response1.status(), 200);

    env2.start_client().await;
    
    tokio::time::sleep(std::time::Duration::from_secs(1)).await;

    let response2 = reqwest::get(&env2.proxy_url("health"))
        .await
        .expect("Failed to make request");
    
    assert_eq!(response2.status(), 200);
}

#[tokio::test]
async fn test_max_workstations_limit() {
    let limit = 1;
    
    let mut env = TestEnvironment::new_with_limits(limit).await;
    env.start_client().await;
    
    tokio::time::sleep(std::time::Duration::from_secs(2)).await;
    
    let response1 = reqwest::get(&env.proxy_url("health"))
        .await
        .expect("Failed to make request");
    assert_eq!(response1.status(), 200);
    
    let mut env2 = TestEnvironment::new_with_limits(limit).await;
    env2.start_client().await;
    
    tokio::time::sleep(std::time::Duration::from_secs(2)).await;
    
    let response2 = reqwest::get(&env2.proxy_url("health"))
        .await
        .expect("Failed to make request");
    
    assert_eq!(response2.status(), 200);
}
