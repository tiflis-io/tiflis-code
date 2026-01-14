// Copyright (c) 2026 Roman Barinov <rbarinov@gmail.com>
// Licensed under the FSL-1.1-NC.

mod common;

use common::TestEnvironment;

#[tokio::test]
async fn test_client_reconnects_after_sudden_restart() {
    let mut env = TestEnvironment::new().await;
    env.start_client().await;

    let response1 = reqwest::get(env.proxy_url("health"))
        .await
        .expect("Failed to make initial request");
    assert_eq!(response1.status(), 200);

    env.stop_client();
    tokio::time::sleep(std::time::Duration::from_millis(500)).await;
    env.start_client().await;

    let response2 = reqwest::get(env.proxy_url("health"))
        .await
        .expect("Failed to make request after client restart");
    assert_eq!(response2.status(), 200);
}

#[tokio::test]
async fn test_client_recovers_after_server_restart() {
    let mut env = TestEnvironment::new().await;
    env.start_client().await;

    let response1 = reqwest::get(env.proxy_url("health"))
        .await
        .expect("Failed to make initial request");
    assert_eq!(response1.status(), 200);

    env.restart_server().await;
    tokio::time::sleep(std::time::Duration::from_secs(3)).await;

    let mut success = false;
    for _ in 0..10 {
        if let Ok(response) = reqwest::get(env.proxy_url("health")).await {
            if response.status() == 200 {
                success = true;
                break;
            }
        }
        tokio::time::sleep(std::time::Duration::from_secs(1)).await;
    }

    assert!(success, "Client should reconnect after server restart");
}

#[tokio::test]
async fn test_multiple_client_restarts() {
    let mut env = TestEnvironment::new().await;

    for i in 0..3 {
        env.start_client().await;

        let response = reqwest::get(env.proxy_url("health"))
            .await
            .expect(&format!("Failed to make request on iteration {}", i));
        assert_eq!(response.status(), 200);

        env.stop_client();
        tokio::time::sleep(std::time::Duration::from_millis(500)).await;
    }
}

#[tokio::test]
async fn test_multiple_server_restarts() {
    let mut env = TestEnvironment::new().await;
    env.start_client().await;

    for i in 0..3 {
        let response = reqwest::get(env.proxy_url("health"))
            .await
            .expect(&format!("Failed to make request before restart {}", i));
        assert_eq!(response.status(), 200);

        env.restart_server().await;
        tokio::time::sleep(std::time::Duration::from_secs(3)).await;

        let mut success = false;
        for _ in 0..10 {
            if let Ok(response) = reqwest::get(env.proxy_url("health")).await {
                if response.status() == 200 {
                    success = true;
                    break;
                }
            }
            tokio::time::sleep(std::time::Duration::from_secs(1)).await;
        }

        assert!(
            success,
            "Client should reconnect after server restart {}",
            i
        );
    }
}

#[tokio::test]
async fn test_request_during_client_restart() {
    let mut env = TestEnvironment::new().await;
    env.start_client().await;

    let response1 = reqwest::get(env.proxy_url("health"))
        .await
        .expect("Failed to make initial request");
    assert_eq!(response1.status(), 200);

    env.stop_client();

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(2))
        .build()
        .unwrap();

    let result = client.get(env.proxy_url("health")).send().await;
    assert!(result.is_err() || result.unwrap().status() != 200);

    env.start_client().await;

    let response2 = reqwest::get(env.proxy_url("health"))
        .await
        .expect("Failed to make request after client restart");
    assert_eq!(response2.status(), 200);
}

#[tokio::test]
async fn test_server_full_restart_cycle() {
    let mut env = TestEnvironment::new().await;
    env.start_client().await;

    let response1 = reqwest::get(env.proxy_url("health"))
        .await
        .expect("Failed to make initial request");
    assert_eq!(response1.status(), 200);

    env.restart_server().await;
    tokio::time::sleep(std::time::Duration::from_secs(3)).await;

    let mut success = false;
    for _ in 0..15 {
        if let Ok(response) = reqwest::get(env.proxy_url("health")).await {
            if response.status() == 200 {
                success = true;
                break;
            }
        }
        tokio::time::sleep(std::time::Duration::from_secs(1)).await;
    }

    assert!(success, "Client should reconnect after server restart");
}

#[tokio::test]
async fn test_concurrent_requests_during_client_restart() {
    let mut env = TestEnvironment::new().await;
    env.start_client().await;

    let response1 = reqwest::get(env.proxy_url("health"))
        .await
        .expect("Failed to make initial request");
    assert_eq!(response1.status(), 200);

    let url1 = env.proxy_url("api/test/1");
    let url2 = env.proxy_url("api/test/2");
    let url3 = env.proxy_url("api/test/3");

    let handle1 = tokio::spawn(async move {
        reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(5))
            .build()
            .unwrap()
            .get(url1)
            .send()
            .await
    });
    let handle2 = tokio::spawn(async move {
        reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(5))
            .build()
            .unwrap()
            .get(url2)
            .send()
            .await
    });
    let handle3 = tokio::spawn(async move {
        reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(5))
            .build()
            .unwrap()
            .get(url3)
            .send()
            .await
    });

    tokio::time::sleep(std::time::Duration::from_millis(100)).await;
    env.restart_client().await;

    let (r1, r2, r3) = tokio::join!(handle1, handle2, handle3);

    let success_count = [r1, r2, r3]
        .into_iter()
        .filter(|r| {
            r.as_ref()
                .ok()
                .and_then(|res| res.as_ref().ok())
                .is_some_and(|resp| resp.status() == 200)
        })
        .count();

    println!("Successful requests during restart: {}/3", success_count);
}

#[tokio::test]
async fn test_rapid_client_restart_cycle() {
    let mut env = TestEnvironment::new().await;

    for _ in 0..5 {
        env.start_client().await;
        tokio::time::sleep(std::time::Duration::from_millis(500)).await;
        env.stop_client();
        tokio::time::sleep(std::time::Duration::from_millis(200)).await;
    }

    env.start_client().await;

    let response = reqwest::get(env.proxy_url("health"))
        .await
        .expect("Failed to make request after rapid restart cycle");
    assert_eq!(response.status(), 200);
}

#[tokio::test]
async fn test_server_restart_preserves_different_workstation() {
    let mut env1 = TestEnvironment::new().await;
    let mut env2 = TestEnvironment::new().await;

    env1.start_client().await;
    env2.start_client().await;

    let response1 = reqwest::get(env1.proxy_url("health"))
        .await
        .expect("Failed to make request to env1");
    assert_eq!(response1.status(), 200);

    let response2 = reqwest::get(env2.proxy_url("health"))
        .await
        .expect("Failed to make request to env2");
    assert_eq!(response2.status(), 200);

    env1.restart_server().await;
    tokio::time::sleep(std::time::Duration::from_secs(3)).await;

    let mut env1_reconnected = false;
    for _ in 0..10 {
        if let Ok(response) = reqwest::get(env1.proxy_url("health")).await {
            if response.status() == 200 {
                env1_reconnected = true;
                break;
            }
        }
        tokio::time::sleep(std::time::Duration::from_secs(1)).await;
    }

    assert!(
        env1_reconnected,
        "env1 client should reconnect after its server restart"
    );

    let response2_after = reqwest::get(env2.proxy_url("health"))
        .await
        .expect("env2 should still work after env1 server restart");
    assert_eq!(response2_after.status(), 200);
}
