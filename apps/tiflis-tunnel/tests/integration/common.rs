// Copyright (c) 2026 Roman Barinov <rbarinov@gmail.com>
// Licensed under the FSL-1.1-NC.

use std::net::SocketAddr;
use std::sync::Arc;
use tokio::sync::oneshot;
use tokio::task::JoinHandle;

pub struct TestContext {
    pub server_http_addr: SocketAddr,
    pub server_quic_addr: SocketAddr,
    pub mock_server_addr: SocketAddr,
    pub api_key: String,
    pub workstation_id: String,
    _server_handle: JoinHandle<()>,
    _mock_handle: JoinHandle<()>,
    _cleanup_tx: oneshot::Sender<()>,
}

impl TestContext {
    pub async fn new() -> Self {
        let api_key = "test-api-key-minimum-32-characters-long".to_string();
        let workstation_id = "test-workstation".to_string();

        let server_http_port = get_free_port().await;
        let server_quic_port = get_free_port().await;
        let mock_server_port = get_free_port().await;

        let server_http_addr = SocketAddr::from(([127, 0, 0, 1], server_http_port));
        let server_quic_addr = SocketAddr::from(([127, 0, 0, 1], server_quic_port));
        let mock_server_addr = SocketAddr::from(([127, 0, 0, 1], mock_server_port));

        let (cleanup_tx, cleanup_rx) = oneshot::channel();

        let server_handle = spawn_tunnel_server(
            server_http_port,
            server_quic_port,
            api_key.clone(),
        );

        let mock_handle = spawn_mock_server(mock_server_port);

        tokio::time::sleep(std::time::Duration::from_millis(500)).await;

        Self {
            server_http_addr,
            server_quic_addr,
            mock_server_addr,
            api_key,
            workstation_id,
            _server_handle: server_handle,
            _mock_handle: mock_handle,
            _cleanup_tx: cleanup_tx,
        }
    }
}

async fn get_free_port() -> u16 {
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0")
        .await
        .unwrap();
    listener.local_addr().unwrap().port()
}

fn spawn_tunnel_server(http_port: u16, quic_port: u16, api_key: String) -> JoinHandle<()> {
    tokio::spawn(async move {
        std::env::set_var("SERVER_DOMAIN", "localhost");
        std::env::set_var("TLS_ENABLED", "false");
        std::env::set_var("AUTH_API_KEY", &api_key);
        std::env::set_var("SERVER_HTTP_PORT", http_port.to_string());
        std::env::set_var("SERVER_HTTPS_PORT", quic_port.to_string());
        std::env::set_var("RUST_LOG", "error");
    })
}

fn spawn_mock_server(port: u16) -> JoinHandle<()> {
    tokio::spawn(async move {
        use axum::{routing::get, Router};

        let app = Router::new()
            .route("/", get(|| async { "Hello from mock server" }))
            .route("/api/*path", get(|_| async { "API response" }));

        let addr = SocketAddr::from(([127, 0, 0, 1], port));
        let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
        axum::serve(listener, app).await.unwrap();
    })
}
