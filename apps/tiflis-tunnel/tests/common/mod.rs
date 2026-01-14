// Copyright (c) 2026 Roman Barinov <rbarinov@gmail.com>
// Licensed under the FSL-1.1-NC.

use axum::{
    extract::{ws::WebSocketUpgrade, Path},
    routing::{any, get},
    Router,
};
use std::net::SocketAddr;
use std::sync::Arc;
use tokio::sync::Mutex;
use tokio::task::JoinHandle;

pub struct TestEnvironment {
    pub server_http_port: u16,
    pub server_quic_port: u16,
    pub mock_server_port: u16,
    pub api_key: String,
    pub workstation_id: String,
    #[allow(dead_code)]
    pub tunnel_url: String,
    _server_handle: JoinHandle<()>,
    _mock_handle: JoinHandle<()>,
    _client_handle: Option<JoinHandle<()>>,
}

impl TestEnvironment {
    pub async fn new() -> Self {
        let workstation_id = format!("test-ws-{}", rand::random::<u16>());
        Self::new_with_config(&workstation_id, None, None).await
    }

    #[allow(dead_code)]
    pub async fn new_with_id(workstation_id: &str) -> Self {
        Self::new_with_config(workstation_id, None, None).await
    }

    #[allow(dead_code)]
    pub async fn new_with_grace_period(grace_period_secs: u64) -> Self {
        let workstation_id = format!("test-ws-{}", rand::random::<u16>());
        Self::new_with_config(&workstation_id, Some(grace_period_secs), None).await
    }

    #[allow(dead_code)]
    pub async fn new_with_limits(max_workstations: usize) -> Self {
        let workstation_id = format!("test-ws-{}", rand::random::<u16>());
        Self::new_with_config(&workstation_id, None, Some(max_workstations)).await
    }

    pub async fn new_with_config(
        workstation_id: &str,
        grace_period: Option<u64>,
        max_workstations: Option<usize>,
    ) -> Self {
        let _ = rustls::crypto::ring::default_provider().install_default();
        
        let api_key = "test-api-key-minimum-32-characters-long".to_string();
        let workstation_id = workstation_id.to_string();

        let server_http_port = get_free_port().await;
        let server_quic_port = get_free_port().await;
        let mock_server_port = get_free_port().await;

        let server_handle = spawn_tunnel_server(
            server_http_port,
            server_quic_port,
            api_key.clone(),
            grace_period,
            max_workstations,
        );

        let mock_handle = spawn_mock_server(mock_server_port);

        tokio::time::sleep(std::time::Duration::from_secs(1)).await;

        let tunnel_url = format!("http://localhost:{}", server_http_port);

        Self {
            server_http_port,
            server_quic_port,
            mock_server_port,
            api_key,
            workstation_id: workstation_id.clone(),
            tunnel_url,
            _server_handle: server_handle,
            _mock_handle: mock_handle,
            _client_handle: None,
        }
    }

    pub async fn start_client(&mut self) {
        let server_address = format!("127.0.0.1:{}", self.server_quic_port);
        let api_key = self.api_key.clone();
        let workstation_id = self.workstation_id.clone();
        let local_address = format!("http://localhost:{}", self.mock_server_port);

        let client_handle = spawn_tunnel_client(
            server_address,
            api_key,
            workstation_id,
            local_address,
        );

        tokio::time::sleep(std::time::Duration::from_secs(2)).await;

        self._client_handle = Some(client_handle);
    }

    pub fn proxy_url(&self, path: &str) -> String {
        format!(
            "http://localhost:{}/t/{}/{}",
            self.server_http_port,
            self.workstation_id,
            path.trim_start_matches('/')
        )
    }

    #[allow(dead_code)]
    pub fn stop_client(&mut self) {
        if let Some(handle) = self._client_handle.take() {
            handle.abort();
        }
    }

    #[allow(dead_code)]
    pub fn stop_server(&mut self) {
        self._server_handle.abort();
    }

    #[allow(dead_code)]
    pub async fn restart_server(&mut self) {
        self.restart_server_with_grace_period(None).await;
    }

    #[allow(dead_code)]
    pub async fn restart_server_with_grace_period(&mut self, grace_period: Option<u64>) {
        self._server_handle.abort();
        tokio::time::sleep(std::time::Duration::from_secs(2)).await;

        self._server_handle = spawn_tunnel_server(
            self.server_http_port,
            self.server_quic_port,
            self.api_key.clone(),
            grace_period,
            None,
        );

        tokio::time::sleep(std::time::Duration::from_secs(1)).await;
    }

    #[allow(dead_code)]
    pub async fn restart_client(&mut self) {
        self.stop_client();
        tokio::time::sleep(std::time::Duration::from_millis(500)).await;
        self.start_client().await;
    }
}

async fn get_free_port() -> u16 {
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0")
        .await
        .unwrap();
    listener.local_addr().unwrap().port()
}

fn spawn_tunnel_server(
    http_port: u16,
    quic_port: u16,
    api_key: String,
    grace_period: Option<u64>,
    max_workstations: Option<usize>,
) -> JoinHandle<()> {
    tokio::spawn(async move {
        use tunnel_server::config::Config;
        use tunnel_server::server::TunnelServer;

        std::env::set_var("RUST_LOG", "tunnel_server=info,tunnel_client=info");
        let _ = tracing_subscriber::fmt()
            .with_max_level(tracing::Level::INFO)
            .try_init();

        println!("Starting tunnel server on HTTP:{} QUIC:{}", http_port, quic_port);
        
        let mut config = Config::default();
        config.server.domain = "localhost".to_string();
        config.server.http_port = http_port;
        config.server.https_port = quic_port;
        config.tls.enabled = false;
        config.auth.api_key = api_key;

        if let Some(grace) = grace_period {
            config.reliability.grace_period = grace;
        }

        if let Some(max) = max_workstations {
            config.limits.max_workstations = max;
        }

        let server = Arc::new(TunnelServer::new(config));
        println!("Tunnel server created, starting run loop...");
        match server.run().await {
            Ok(_) => println!("Server exited normally"),
            Err(e) => eprintln!("Server error: {}", e),
        }
    })
}

fn spawn_tunnel_client(
    server_address: String,
    api_key: String,
    workstation_id: String,
    local_address: String,
) -> JoinHandle<()> {
    tokio::spawn(async move {
        use tunnel_client::client::TunnelClient;
        use tunnel_client::config::Config;

        println!("Starting tunnel client for workstation: {}", workstation_id);
        println!("Server address: {}", server_address);
        println!("Local address: {}", local_address);
        
        let mut config = Config::default();
        config.server.address = server_address;
        config.auth.api_key = api_key;
        config.workstation.id = workstation_id.clone();
        config.workstation.local_address = local_address;
        config.reconnect.enabled = true;
        config.reconnect.max_delay = 5;

        let mut client = TunnelClient::new(config);
        println!("Tunnel client created for {}, starting run loop...", workstation_id);
        let _ = client.run().await;
    })
}

fn spawn_mock_server(port: u16) -> JoinHandle<()> {
    tokio::spawn(async move {
        let ws_connections = Arc::new(Mutex::new(Vec::new()));
        let ws_connections_clone = ws_connections.clone();

        let app = Router::new()
            .route("/", get(|| async { "Hello from mock server" }))
            .route("/health", get(|| async { "OK" }))
            .route(
                "/echo",
                any(|body: String| async move { format!("Echo: {}", body) }),
            )
            .route(
                "/error",
                get(|| async { (axum::http::StatusCode::INTERNAL_SERVER_ERROR, "Server Error") }),
            )
            .route(
                "/slow",
                get(|| async {
                    tokio::time::sleep(std::time::Duration::from_secs(5)).await;
                    "Slow response"
                }),
            )
            .route(
                "/api/*path",
                any(|Path(path): Path<String>| async move {
                    format!("API response for: {}", path)
                }),
            )
            .route(
                "/ws",
                get(move |ws: WebSocketUpgrade| {
                    let connections = ws_connections_clone.clone();
                    async move {
                        ws.on_upgrade(move |socket| async move {
                            use axum::extract::ws::Message;
                            use futures::{SinkExt, StreamExt};

                            connections.lock().await.push(());

                            let (mut sender, mut receiver) = socket.split();

                            while let Some(msg) = receiver.next().await {
                                if let Ok(Message::Text(text)) = msg {
                                    let response = format!("Echo: {}", text);
                                    if sender.send(Message::Text(response)).await.is_err() {
                                        break;
                                    }
                                } else if let Ok(Message::Binary(data)) = msg {
                                    if sender.send(Message::Binary(data)).await.is_err() {
                                        break;
                                    }
                                } else if matches!(msg, Ok(Message::Close(_))) {
                                    break;
                                }
                            }
                        })
                    }
                }),
            );

        let addr = SocketAddr::from(([127, 0, 0, 1], port));
        let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
        axum::serve(listener, app).await.unwrap();
    })
}
