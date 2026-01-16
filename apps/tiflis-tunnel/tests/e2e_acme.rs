// Copyright (c) 2026 Roman Barinov <rbarinov@gmail.com>
// Licensed under the FSL-1.1-NC.

//! ACME certificate management tests.
//!
//! These tests verify the ACME HTTP-01 challenge flow and certificate management.
//!
//! For full E2E testing with real ACME, use Pebble (Let's Encrypt's test server):
//! ```bash
//! docker run -p 14000:14000 -p 15000:15000 \
//!   -e PEBBLE_VA_NOSLEEP=1 \
//!   -e PEBBLE_VA_ALWAYS_VALID=1 \
//!   ghcr.io/letsencrypt/pebble:latest
//! ```

use axum::{routing::get, Router};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;

type AcmeChallenges = Arc<RwLock<HashMap<String, String>>>;

#[tokio::test]
async fn test_acme_challenge_handler_returns_key_auth() {
    let challenges: AcmeChallenges = Arc::new(RwLock::new(HashMap::new()));

    {
        let mut map = challenges.write().await;
        map.insert(
            "test-token-123".to_string(),
            "key-authorization-value".to_string(),
        );
    }

    let app = Router::new()
        .route(
            "/.well-known/acme-challenge/:token",
            get(handle_acme_challenge).with_state(challenges),
        );

    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let port = listener.local_addr().unwrap().port();

    tokio::spawn(async move {
        axum::serve(listener, app).await.unwrap();
    });

    tokio::time::sleep(std::time::Duration::from_millis(100)).await;

    let client = reqwest::Client::new();
    let resp = client
        .get(format!(
            "http://127.0.0.1:{}/.well-known/acme-challenge/test-token-123",
            port
        ))
        .send()
        .await
        .unwrap();

    assert_eq!(resp.status(), 200);
    assert_eq!(resp.text().await.unwrap(), "key-authorization-value");
}

#[tokio::test]
async fn test_acme_challenge_handler_returns_404_for_unknown_token() {
    let challenges: AcmeChallenges = Arc::new(RwLock::new(HashMap::new()));

    let app = Router::new()
        .route(
            "/.well-known/acme-challenge/:token",
            get(handle_acme_challenge).with_state(challenges),
        );

    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let port = listener.local_addr().unwrap().port();

    tokio::spawn(async move {
        axum::serve(listener, app).await.unwrap();
    });

    tokio::time::sleep(std::time::Duration::from_millis(100)).await;

    let client = reqwest::Client::new();
    let resp = client
        .get(format!(
            "http://127.0.0.1:{}/.well-known/acme-challenge/unknown-token",
            port
        ))
        .send()
        .await
        .unwrap();

    assert_eq!(resp.status(), 404);
}

#[tokio::test]
async fn test_acme_challenge_concurrent_access() {
    let challenges: AcmeChallenges = Arc::new(RwLock::new(HashMap::new()));
    let challenges_clone = challenges.clone();

    let app = Router::new()
        .route(
            "/.well-known/acme-challenge/:token",
            get(handle_acme_challenge).with_state(challenges),
        );

    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let port = listener.local_addr().unwrap().port();

    tokio::spawn(async move {
        axum::serve(listener, app).await.unwrap();
    });

    tokio::time::sleep(std::time::Duration::from_millis(100)).await;

    let writer_handle = {
        let challenges = challenges_clone.clone();
        tokio::spawn(async move {
            for i in 0..100 {
                let mut map = challenges.write().await;
                map.insert(format!("token-{}", i), format!("auth-{}", i));
            }
        })
    };

    let client = reqwest::Client::new();
    let reader_handles: Vec<_> = (0..10)
        .map(|_| {
            let client = client.clone();
            tokio::spawn(async move {
                for _ in 0..10 {
                    let _ = client
                        .get(format!(
                            "http://127.0.0.1:{}/.well-known/acme-challenge/token-50",
                            port
                        ))
                        .send()
                        .await;
                }
            })
        })
        .collect();

    writer_handle.await.unwrap();
    for handle in reader_handles {
        handle.await.unwrap();
    }
}

#[tokio::test]
async fn test_certificate_expiry_parsing() {
    let valid_cert_pem = r#"-----BEGIN CERTIFICATE-----
MIICpDCCAYwCCQDU+pQ4pHiQNDANBgkqhkiG9w0BAQsFADAUMRIwEAYDVQQDDAls
b2NhbGhvc3QwHhcNMjUwMTAxMDAwMDAwWhcNMzUwMTAxMDAwMDAwWjAUMRIwEAYD
VQQDDAlsb2NhbGhvc3QwggEiMA0GCSqGSIb3DQEBAQUAA4IBDwAwggEKAoIBAQC7
o5e7IRDzWFRm8J7cmP8WzH+Gz8RZPDhCQvTj9+TFKDUjIELgVnLDh4lCxuAUdJ8b
Y2g5+m6VhJxUZfnJXxNJ7vK5QEDm5v+VZc5wXLWDYoYkThp0+GZfPDH8vqfLwQFO
xCGphP7Mq/BqcJWQvxyKcnkB7RT8OZt5vHQ5XqHlJvNFTz4GOW+YZmJkHRnPMK+b
Q7SA7wD7ORdDBfDPRgpq5GFPsSN5KnpHH+w8hZcOnLM/dv5Z7lL96CwQatTmYB5V
epbsw5LnIoWJPmfipQTRNhEC8ZJEYriEQbMzir9eGM7xxgBpXQ7FLe+pPdE/+6Ws
g5s9wGgJFNYJFQcdmMZTAgMBAAEwDQYJKoZIhvcNAQELBQADggEBAFNTX25XBGIP
kNPNHec5rndw0YBSK7oLdE/G/PAg1F+DP3m6LKkTTZ9O5L+fvS8M/hVnPvb1uPJn
u2TZINqfS2AJDY5lIs8l6EwB8K7/XOQK5qkjGo0qewH7FwKpDOF2R9GbLZhgaE0P
yxi7bfFsLsLyjQC1LiWJxPOXLOy5pSouF2S9kw8R5TAsNqVfLwUz4fO2ggI5cvGT
nlG7GJfFWfRJ6qU6LJHP62l5E6E0L/TqNPO6LGNh9A0Q4xJ5MmGgE0DBPiA/vdLu
9Pu5zNffZN9+XqJNHWl/5ejPJDVpm5lL9OnPLPWIpKHdbDHg5iNJ/xfqSgjbC1VN
j6EwQT6LzXM=
-----END CERTIFICATE-----"#;

    let days = days_until_expiry(valid_cert_pem);
    assert!(days.is_some());
    assert!(days.unwrap() > 0);
}

#[tokio::test]
async fn test_certificate_expiry_invalid_pem() {
    let invalid_pem = "not a valid certificate";
    let days = days_until_expiry(invalid_pem);
    assert!(days.is_none());
}

#[tokio::test]
async fn test_certificate_files_loading() {
    use std::io::Write;
    use tempfile::TempDir;

    let temp_dir = TempDir::new().unwrap();
    let cert_path = temp_dir.path().join("cert.pem");
    let key_path = temp_dir.path().join("key.pem");

    let cert_pem = r#"-----BEGIN CERTIFICATE-----
MIICpDCCAYwCCQDU+pQ4pHiQNDANBgkqhkiG9w0BAQsFADAUMRIwEAYDVQQDDAls
b2NhbGhvc3QwHhcNMjUwMTAxMDAwMDAwWhcNMzUwMTAxMDAwMDAwWjAUMRIwEAYD
VQQDDAlsb2NhbGhvc3QwggEiMA0GCSqGSIb3DQEBAQUAA4IBDwAwggEKAoIBAQC7
o5e7IRDzWFRm8J7cmP8WzH+Gz8RZPDhCQvTj9+TFKDUjIELgVnLDh4lCxuAUdJ8b
Y2g5+m6VhJxUZfnJXxNJ7vK5QEDm5v+VZc5wXLWDYoYkThp0+GZfPDH8vqfLwQFO
xCGphP7Mq/BqcJWQvxyKcnkB7RT8OZt5vHQ5XqHlJvNFTz4GOW+YZmJkHRnPMK+b
Q7SA7wD7ORdDBfDPRgpq5GFPsSN5KnpHH+w8hZcOnLM/dv5Z7lL96CwQatTmYB5V
epbsw5LnIoWJPmfipQTRNhEC8ZJEYriEQbMzir9eGM7xxgBpXQ7FLe+pPdE/+6Ws
g5s9wGgJFNYJFQcdmMZTAgMBAAEwDQYJKoZIhvcNAQELBQADggEBAFNTX25XBGIP
kNPNHec5rndw0YBSK7oLdE/G/PAg1F+DP3m6LKkTTZ9O5L+fvS8M/hVnPvb1uPJn
u2TZINqfS2AJDY5lIs8l6EwB8K7/XOQK5qkjGo0qewH7FwKpDOF2R9GbLZhgaE0P
yxi7bfFsLsLyjQC1LiWJxPOXLOy5pSouF2S9kw8R5TAsNqVfLwUz4fO2ggI5cvGT
nlG7GJfFWfRJ6qU6LJHP62l5E6E0L/TqNPO6LGNh9A0Q4xJ5MmGgE0DBPiA/vdLu
9Pu5zNffZN9+XqJNHWl/5ejPJDVpm5lL9OnPLPWIpKHdbDHg5iNJ/xfqSgjbC1VN
j6EwQT6LzXM=
-----END CERTIFICATE-----"#;

    let key_pem = r#"-----BEGIN PRIVATE KEY-----
MIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQC7o5e7IRDzWFRm
8J7cmP8WzH+Gz8RZPDhCQvTj9+TFKDUjIELgVnLDh4lCxuAUdJ8bY2g5+m6VhJxU
ZfnJXxNJ7vK5QEDm5v+VZc5wXLWDYoYkThp0+GZfPDH8vqfLwQFOxCGphP7Mq/Bq
cJWQvxyKcnkB7RT8OZt5vHQ5XqHlJvNFTz4GOW+YZmJkHRnPMK+bQ7SA7wD7ORdD
BfDPRgpq5GFPsSN5KnpHH+w8hZcOnLM/dv5Z7lL96CwQatTmYB5VepbsW5LnIoWJ
PmfipQTRNhEC8ZJEYriEQbMzir9eGM7xxgBpXQ7FLe+pPdE/+6Wsg5s9wGgJFNYJ
FQcdmMZTAgMBAAECggEAGxI8LPIwT2S9i4xrI5XRCLKkLOA/7M8L2CL3m1Lv5rKd
l0vqJWqJx7TYEXCdexmCD7M0LUnxhFEqFELl2CK5kHqOZcL0KBjyGMOTdOLLIK0h
UHXhTO1WoNW8B0R0VmYPTDz7IYD1B+P7J7D9H8J5qJzLH9c5X/VC6vEqKYKmNFFl
ik2uROI2aPOmO7K/GJHXn7RpB1dRfmA7RN8hWXGBfMFqJBRP5dVpcCpZBUW0kP5L
0cLAzxH3AjCojYP3CJ0bX5HBm3G2HEL3c5eBP1F7+m/CIDHgBf5bHqJLBDYshIsu
/H7CqL0dH3BQT5DQl8ywNEcjJmBBCCvErjh8CWn8AQKBgQDqmL8VbCD3A7G9Xl0H
1XD7EQA2SRC0D9P0cBsJg1tPi2Ks9qH7XnM7bCs6dEGOI3QVNLM2YQK4b9D/3G4r
5XwR0MnPC3x5B1L3R5fUF0c1l/V5pT7BNFjlv7lB9TfKqBYLsB3PoKFpiHy1VdOF
pzw/FX1bAGPhDJrFLEevhACIEwKBgQDNUQDGgtj3eJpdSiWwG+w7ZIdZlnhGcDBm
CUcmW1xSYDBfwT5BQDLXl9YvMPPxQKB8x5D7YUmNQPpExBfiC7Gde7q9TQenXQ7A
kHLvJ/RjP0xOlJ5FDl7p6T7EF7BDNfIAI+N/BpcWC1KZlvFLS0B4d5C/VDBEjh3Q
b8R/Z7MHAQKBgQCXSxLi4HqYb/V7DRSK4vPHYLEy7P0F8s2KLedmKMBRcyfCB6A7
c7b7TlE0D7MbLn5XbQHV7Mjn2ULDd/Jy0dDLFe0pnScYb5mJy8u+W9e2J7HM5qjT
V0e6L3M0cBxVwG7aLLOKTBKWDDz2GDzI5Y0DAHx9F5LfmQRRFPNMvT2BXQKBgB0l
3oVBLMHLB7FMvWD6vBBLQPg1P0xV2F8t6hXC6UhGpFJyPzh5UOVFr0ABqNNFzZ0r
0DW6l3B7nDVz+GkHgC0AY/9xI7Wl7cj+dGm7JLekQWxJbE0y7sP8YBnqBRUDtGYL
gAShRhLJC6uGI2i6h0B7b5cJnOKT9K4A7Y0tPygBAoGBANOqE3vCa2Y3lCBaD5/Q
pxPa/EFvUxI3hTGEe0QAI1VxVEtq1f9UJ0YLCaJ7H0nA7b3K0B8h+2P8vhB9P8l1
hZ3B3kSO5hJCvaMp7v/1L5m7P3jFHYI1KqpL3zF8vHBD1R3bCgW/F5B8Aj8n2PLN
i6oN7TP7F/FMC4iiG3X4L7x6
-----END PRIVATE KEY-----"#;

    std::fs::File::create(&cert_path)
        .unwrap()
        .write_all(cert_pem.as_bytes())
        .unwrap();
    std::fs::File::create(&key_path)
        .unwrap()
        .write_all(key_pem.as_bytes())
        .unwrap();

    assert!(cert_path.exists());
    assert!(key_path.exists());

    let cert_content = std::fs::read_to_string(&cert_path).unwrap();
    assert!(cert_content.contains("BEGIN CERTIFICATE"));

    let key_content = std::fs::read_to_string(&key_path).unwrap();
    assert!(key_content.contains("BEGIN PRIVATE KEY"));
}

#[tokio::test]
async fn test_acme_challenge_token_isolation() {
    let challenges: AcmeChallenges = Arc::new(RwLock::new(HashMap::new()));

    {
        let mut map = challenges.write().await;
        map.insert("domain1-token".to_string(), "domain1-auth".to_string());
        map.insert("domain2-token".to_string(), "domain2-auth".to_string());
    }

    let app = Router::new()
        .route(
            "/.well-known/acme-challenge/:token",
            get(handle_acme_challenge).with_state(challenges),
        );

    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let port = listener.local_addr().unwrap().port();

    tokio::spawn(async move {
        axum::serve(listener, app).await.unwrap();
    });

    tokio::time::sleep(std::time::Duration::from_millis(100)).await;

    let client = reqwest::Client::new();

    let resp1 = client
        .get(format!(
            "http://127.0.0.1:{}/.well-known/acme-challenge/domain1-token",
            port
        ))
        .send()
        .await
        .unwrap();
    assert_eq!(resp1.text().await.unwrap(), "domain1-auth");

    let resp2 = client
        .get(format!(
            "http://127.0.0.1:{}/.well-known/acme-challenge/domain2-token",
            port
        ))
        .send()
        .await
        .unwrap();
    assert_eq!(resp2.text().await.unwrap(), "domain2-auth");
}

#[tokio::test]
async fn test_acme_challenge_cleanup_after_validation() {
    let challenges: AcmeChallenges = Arc::new(RwLock::new(HashMap::new()));
    let challenges_clone = challenges.clone();

    {
        let mut map = challenges.write().await;
        map.insert("temp-token".to_string(), "temp-auth".to_string());
    }

    let app = Router::new()
        .route(
            "/.well-known/acme-challenge/:token",
            get(handle_acme_challenge).with_state(challenges),
        );

    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let port = listener.local_addr().unwrap().port();

    tokio::spawn(async move {
        axum::serve(listener, app).await.unwrap();
    });

    tokio::time::sleep(std::time::Duration::from_millis(100)).await;

    let client = reqwest::Client::new();
    let resp = client
        .get(format!(
            "http://127.0.0.1:{}/.well-known/acme-challenge/temp-token",
            port
        ))
        .send()
        .await
        .unwrap();
    assert_eq!(resp.status(), 200);

    {
        let mut map = challenges_clone.write().await;
        map.remove("temp-token");
    }

    let resp_after = client
        .get(format!(
            "http://127.0.0.1:{}/.well-known/acme-challenge/temp-token",
            port
        ))
        .send()
        .await
        .unwrap();
    assert_eq!(resp_after.status(), 404);
}

async fn handle_acme_challenge(
    axum::extract::State(challenges): axum::extract::State<AcmeChallenges>,
    axum::extract::Path(token): axum::extract::Path<String>,
) -> impl axum::response::IntoResponse {
    let challenges = challenges.read().await;
    match challenges.get(&token) {
        Some(key_auth) => (axum::http::StatusCode::OK, key_auth.clone()).into_response(),
        None => axum::http::StatusCode::NOT_FOUND.into_response(),
    }
}

fn days_until_expiry(cert_pem: &str) -> Option<i64> {
    use rustls::pki_types::pem::PemObject;
    use rustls::pki_types::CertificateDer;

    let cert = CertificateDer::from_pem_slice(cert_pem.as_bytes()).ok()?;
    let parsed = x509_parser::parse_x509_certificate(&cert).ok()?.1;
    let not_after = parsed.validity().not_after.timestamp();
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .ok()?
        .as_secs() as i64;
    Some((not_after - now) / 86400)
}

use axum::response::IntoResponse;
