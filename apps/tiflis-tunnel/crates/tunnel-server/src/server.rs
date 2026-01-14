// Copyright (c) 2026 Roman Barinov <rbarinov@gmail.com>
// Licensed under the FSL-1.1-NC.

use crate::config::Config;
use crate::pending::PendingRequests;
use crate::proxy::{handle_http_proxy, handle_websocket_proxy, ProxyState};
use crate::registry::WorkstationRegistry;
use axum::{
    http::StatusCode,
    response::IntoResponse,
    routing::{any, get},
    Router,
};
use std::net::SocketAddr;
use std::sync::Arc;
use std::time::Duration;
use tokio::task::JoinHandle;
use tracing::{error, info};
use tunnel_core::{quic, ErrorMessage, Message, RegisteredMessage};

pub struct TunnelServer {
    config: Config,
    registry: Arc<WorkstationRegistry>,
    pending: Arc<PendingRequests>,
}

impl TunnelServer {
    pub fn new(config: Config) -> Self {
        let registry = Arc::new(WorkstationRegistry::new(Duration::from_secs(
            config.reliability.grace_period,
        )));
        let pending = Arc::new(PendingRequests::new());

        Self {
            config,
            registry,
            pending,
        }
    }

    pub async fn run(self: Arc<Self>) -> anyhow::Result<()> {
        let http_handle = self.clone().start_http_server();
        let quic_handle = self.clone().start_quic_server().await?;
        let cleanup_handle = self.clone().start_cleanup_task();

        tokio::select! {
            result = http_handle => {
                error!("HTTP server stopped: {:?}", result);
            }
            result = quic_handle => {
                error!("QUIC server stopped: {:?}", result);
            }
            result = cleanup_handle => {
                error!("Cleanup task stopped: {:?}", result);
            }
        }

        Ok(())
    }

    fn start_http_server(self: Arc<Self>) -> JoinHandle<()> {
        let port = self.config.server.http_port;
        let proxy_state = Arc::new(ProxyState {
            registry: self.registry.clone(),
            pending: self.pending.clone(),
            request_timeout: Duration::from_secs(self.config.reliability.request_timeout),
        });

        tokio::spawn(async move {
            let app = Router::new()
                .route("/health", get(health_check))
                .route("/t/:workstation_id/*path", any(handle_http_proxy))
                .route("/ws/:workstation_id/*path", get(handle_websocket_proxy))
                .with_state(proxy_state);

            let addr = SocketAddr::from(([0, 0, 0, 0], port));
            let listener = match tokio::net::TcpListener::bind(addr).await {
                Ok(l) => l,
                Err(e) => {
                    error!("Failed to bind HTTP server: {}", e);
                    return;
                }
            };

            info!("HTTP server listening on {}", addr);

            if let Err(e) = axum::serve(listener, app).await {
                error!("HTTP server error: {}", e);
            }
        })
    }

    async fn start_quic_server(self: Arc<Self>) -> anyhow::Result<JoinHandle<()>> {
        let crypto = if self.config.tls.enabled {
            self.setup_tls_with_acme().await?
        } else {
            self.setup_no_tls()?
        };

        let quinn_crypto = quinn::crypto::rustls::QuicServerConfig::try_from(crypto)
            .map_err(|e| anyhow::anyhow!("Failed to create QUIC config: {}", e))?;
        let mut server_config = quinn::ServerConfig::with_crypto(Arc::new(quinn_crypto));
        let transport_config = Arc::get_mut(&mut server_config.transport).unwrap();
        transport_config.max_concurrent_bidi_streams(1000u32.into());
        transport_config.max_concurrent_uni_streams(0u32.into());

        let addr = SocketAddr::from(([0, 0, 0, 0], self.config.server.https_port));
        let endpoint = quinn::Endpoint::server(server_config, addr)?;

        info!("QUIC server listening on {}", addr);

        let handle = tokio::spawn(async move {
            while let Some(conn) = endpoint.accept().await {
                let server = self.clone();
                tokio::spawn(async move {
                    if let Err(e) = server.handle_connection(conn).await {
                        error!("Connection error: {}", e);
                    }
                });
            }
        });

        Ok(handle)
    }

    fn setup_no_tls(&self) -> anyhow::Result<rustls::ServerConfig> {
        let cert = rcgen::generate_simple_self_signed(vec![self.config.server.domain.clone()])?;
        let key = rustls::pki_types::PrivateKeyDer::Pkcs8(
            rustls::pki_types::PrivatePkcs8KeyDer::from(cert.key_pair.serialize_der()),
        );
        let cert_der = rustls::pki_types::CertificateDer::from(cert.cert);

        let mut crypto = rustls::ServerConfig::builder()
            .with_no_client_auth()
            .with_single_cert(vec![cert_der], key)?;

        crypto.alpn_protocols = vec![b"tiflis-tunnel".to_vec()];
        Ok(crypto)
    }

    async fn setup_tls_with_acme(&self) -> anyhow::Result<rustls::ServerConfig> {
        info!("Note: Let's Encrypt ACME support requires additional implementation");
        info!(
            "For production, manually provide certificates in {}",
            self.config.tls.certs_dir.display()
        );
        info!("Falling back to self-signed certificate for testing");
        self.setup_no_tls()
    }

    async fn handle_connection(&self, conn: quinn::Incoming) -> anyhow::Result<()> {
        let connection = conn.await?;
        let (mut send, mut recv) = connection.accept_bi().await?;

        let msg = quic::recv_message(&mut recv).await?;

        match msg {
            Message::Register(reg) => {
                if reg.api_key != self.config.auth.api_key {
                    let error_msg = Message::Error(ErrorMessage {
                        code: "AUTH_FAILED".to_string(),
                        message: "Invalid API key".to_string(),
                    });
                    quic::send_message(&mut send, &error_msg).await?;
                    return Ok(());
                }

                if self.registry.count().await >= self.config.limits.max_workstations {
                    let error_msg = Message::Error(ErrorMessage {
                        code: "LIMIT_REACHED".to_string(),
                        message: "Maximum workstations reached".to_string(),
                    });
                    quic::send_message(&mut send, &error_msg).await?;
                    return Ok(());
                }

                if let Err(e) = self
                    .registry
                    .register(reg.workstation_id.clone(), connection.clone())
                    .await
                {
                    let error_msg = Message::Error(ErrorMessage {
                        code: "REGISTRATION_FAILED".to_string(),
                        message: e,
                    });
                    quic::send_message(&mut send, &error_msg).await?;
                    return Ok(());
                }

                let url = format!(
                    "{}://{}/t/{}",
                    if self.config.tls.enabled {
                        "https"
                    } else {
                        "http"
                    },
                    self.config.server.domain,
                    reg.workstation_id
                );

                let response = Message::Registered(RegisteredMessage { url });
                quic::send_message(&mut send, &response).await?;

                info!("Workstation {} registered", reg.workstation_id);

                let workstation_id = reg.workstation_id.clone();
                self.handle_workstation_messages(connection, &workstation_id)
                    .await;

                self.registry.unregister(&workstation_id).await;
                info!("Workstation {} disconnected", workstation_id);
            }
            Message::Reconnect(reconnect) => {
                if reconnect.api_key != self.config.auth.api_key {
                    let error_msg = Message::Error(ErrorMessage {
                        code: "AUTH_FAILED".to_string(),
                        message: "Invalid API key".to_string(),
                    });
                    quic::send_message(&mut send, &error_msg).await?;
                    return Ok(());
                }

                if let Err(e) = self
                    .registry
                    .reconnect(&reconnect.workstation_id, connection.clone())
                    .await
                {
                    let error_msg = Message::Error(ErrorMessage {
                        code: "RECONNECT_FAILED".to_string(),
                        message: e,
                    });
                    quic::send_message(&mut send, &error_msg).await?;
                    return Ok(());
                }

                let url = format!(
                    "{}://{}/t/{}",
                    if self.config.tls.enabled {
                        "https"
                    } else {
                        "http"
                    },
                    self.config.server.domain,
                    reconnect.workstation_id
                );

                let response = Message::Registered(RegisteredMessage { url });
                quic::send_message(&mut send, &response).await?;

                info!("Workstation {} reconnected", reconnect.workstation_id);

                self.handle_workstation_messages(connection, &reconnect.workstation_id)
                    .await;
            }
            _ => {
                let error_msg = Message::Error(ErrorMessage {
                    code: "INVALID_MESSAGE".to_string(),
                    message: "Expected Register or Reconnect message".to_string(),
                });
                quic::send_message(&mut send, &error_msg).await?;
            }
        }

        Ok(())
    }

    async fn handle_workstation_messages(
        &self,
        connection: quinn::Connection,
        workstation_id: &str,
    ) {
        while let Ok((mut send, mut recv)) = connection.accept_bi().await {
            let pending = self.pending.clone();
            tokio::spawn(async move {
                if let Ok(msg) = quic::recv_message(&mut recv).await {
                    match msg {
                        Message::HttpResponse(resp) => {
                            pending
                                .complete(resp.stream_id, Message::HttpResponse(resp))
                                .await;
                        }
                        Message::WsData(data) => {
                            pending
                                .complete(data.stream_id, Message::WsData(data))
                                .await;
                        }
                        Message::WsClose(close) => {
                            pending
                                .complete(close.stream_id, Message::WsClose(close))
                                .await;
                        }
                        Message::Ping(ping) => {
                            let pong = Message::Pong(tunnel_core::PongMessage {
                                timestamp: ping.timestamp,
                            });
                            let _ = quic::send_message(&mut send, &pong).await;
                        }
                        _ => {}
                    }
                }
            });
        }

        self.registry.mark_reconnecting(workstation_id).await;
    }

    fn start_cleanup_task(self: Arc<Self>) -> JoinHandle<()> {
        tokio::spawn(async move {
            let mut interval = tokio::time::interval(Duration::from_secs(10));
            loop {
                interval.tick().await;
                self.registry.cleanup_expired().await;
            }
        })
    }
}

async fn health_check() -> impl IntoResponse {
    (StatusCode::OK, "OK")
}
