// Copyright (c) 2026 Roman Barinov <rbarinov@gmail.com>
// Licensed under the FSL-1.1-NC.

use crate::config::Config;
use crate::pending::PendingRequests;
use crate::proxy::{handle_http_proxy, handle_websocket_proxy, ProxyState};
use crate::registry::WorkstationRegistry;
use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::IntoResponse,
    routing::{any, get},
    Router,
};
use std::collections::HashMap;
use std::net::SocketAddr;
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::RwLock;
use tokio::task::JoinHandle;
use tracing::{error, info, warn};
use tunnel_core::{quic, ErrorMessage, Message, RegisteredMessage};

type AcmeChallenges = Arc<RwLock<HashMap<String, String>>>;

pub struct TunnelServer {
    config: Config,
    registry: Arc<WorkstationRegistry>,
    pending: Arc<PendingRequests>,
    acme_challenges: AcmeChallenges,
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
            acme_challenges: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    /// Initialize and return Arc<Self> with ACME configured if TLS is enabled
    pub async fn init(config: Config) -> anyhow::Result<Arc<Self>> {
        let registry = Arc::new(WorkstationRegistry::new(Duration::from_secs(
            config.reliability.grace_period,
        )));
        let pending = Arc::new(PendingRequests::new());
        let acme_challenges = Arc::new(RwLock::new(HashMap::new()));

        let server = Arc::new(Self {
            config,
            registry,
            pending,
            acme_challenges,
        });

        if server.config.tls.enabled {
            server.clone().start_acme_manager();
        }

        Ok(server)
    }

    pub async fn run(self: Arc<Self>) -> anyhow::Result<()> {
        let http_handle = self.clone().start_http_server();
        let https_handle = self.clone().start_https_server();
        let quic_handle = self.clone().start_quic_server().await?;
        let cleanup_handle = self.clone().start_cleanup_task();

        tokio::select! {
            result = http_handle => {
                error!("HTTP server stopped: {:?}", result);
            }
            result = https_handle => {
                error!("HTTPS server stopped: {:?}", result);
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

    fn start_acme_manager(self: Arc<Self>) {
        tokio::spawn(async move {
            loop {
                if let Err(e) = self.obtain_or_renew_certificate().await {
                    error!("ACME certificate error: {}", e);
                    tokio::time::sleep(Duration::from_secs(60)).await;
                    continue;
                }
                tokio::time::sleep(Duration::from_secs(12 * 60 * 60)).await;
            }
        });
    }

    async fn obtain_or_renew_certificate(&self) -> anyhow::Result<()> {
        use instant_acme::{
            Account, AuthorizationStatus, ChallengeType, Identifier, LetsEncrypt, NewAccount,
            NewOrder, OrderStatus, RetryPolicy,
        };

        let cert_path = self.config.tls.certs_dir.join("cert.pem");
        let key_path = self.config.tls.certs_dir.join("key.pem");

        if cert_path.exists() && key_path.exists() {
            if let Ok(cert_pem) = std::fs::read_to_string(&cert_path) {
                if let Some(days) = Self::days_until_expiry(&cert_pem) {
                    if days > 30 {
                        info!("Certificate valid for {} more days, skipping renewal", days);
                        return Ok(());
                    }
                    info!("Certificate expires in {} days, renewing...", days);
                }
            }
        }

        let email = self
            .config
            .tls
            .acme_email
            .as_ref()
            .ok_or_else(|| anyhow::anyhow!("TLS_ACME_EMAIL required"))?;

        std::fs::create_dir_all(&self.config.tls.certs_dir)?;

        info!(
            "Requesting certificate for {} via Let's Encrypt",
            self.config.server.domain
        );

        let (account, _) = Account::builder()?
            .create(
                &NewAccount {
                    contact: &[&format!("mailto:{}", email)],
                    terms_of_service_agreed: true,
                    only_return_existing: false,
                },
                LetsEncrypt::Production.url().to_owned(),
                None,
            )
            .await?;

        let identifiers = vec![Identifier::Dns(self.config.server.domain.clone())];
        let mut order = account.new_order(&NewOrder::new(&identifiers)).await?;

        let mut authorizations = order.authorizations();
        while let Some(result) = authorizations.next().await {
            let mut authz = result?;

            if authz.status == AuthorizationStatus::Valid {
                continue;
            }

            let mut challenge = authz
                .challenge(ChallengeType::Http01)
                .ok_or_else(|| anyhow::anyhow!("No HTTP-01 challenge found"))?;

            let key_auth = challenge.key_authorization().as_str().to_string();
            let token = challenge.token.clone();

            info!("ACME HTTP-01 challenge: token={}", token);

            {
                let mut challenges = self.acme_challenges.write().await;
                challenges.insert(token, key_auth);
            }

            challenge.set_ready().await?;
        }

        let status = order.poll_ready(&RetryPolicy::default()).await?;

        {
            let mut challenges = self.acme_challenges.write().await;
            challenges.clear();
        }

        if status != OrderStatus::Ready {
            anyhow::bail!("Order not ready: {:?}", status);
        }

        let private_key_pem = order.finalize().await?;
        let cert_chain_pem = order.poll_certificate(&RetryPolicy::default()).await?;

        std::fs::write(&key_path, &private_key_pem)?;
        std::fs::write(&cert_path, &cert_chain_pem)?;

        info!("Certificate saved to {}", cert_path.display());
        Ok(())
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

    fn start_http_server(self: Arc<Self>) -> JoinHandle<()> {
        let port = self.config.server.http_port;
        let acme_challenges = self.acme_challenges.clone();
        let domain = self.config.server.domain.clone();
        let tls_enabled = self.config.tls.enabled;
        let proxy_state = Arc::new(ProxyState {
            registry: self.registry.clone(),
            pending: self.pending.clone(),
            request_timeout: Duration::from_secs(self.config.reliability.request_timeout),
        });

        tokio::spawn(async move {
            let app = if tls_enabled {
                let redirect_handler = move |req: axum::http::Request<axum::body::Body>| {
                    let domain = domain.clone();
                    async move {
                        let uri = req.uri();
                        let path_and_query =
                            uri.path_and_query().map(|pq| pq.as_str()).unwrap_or("/");
                        let https_url = format!("https://{}{}", domain, path_and_query);
                        axum::response::Redirect::permanent(&https_url).into_response()
                    }
                };

                Router::new()
                    .route(
                        "/.well-known/acme-challenge/:token",
                        get(handle_acme_challenge).with_state(acme_challenges),
                    )
                    .fallback(redirect_handler)
            } else {
                Router::new()
                    .route("/health", get(health_check))
                    .route("/t/:workstation_id/*path", any(handle_http_proxy))
                    .route("/ws/:workstation_id/*path", get(handle_websocket_proxy))
                    .with_state(proxy_state)
            };

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

    fn start_https_server(self: Arc<Self>) -> JoinHandle<()> {
        let port = self.config.server.https_port;
        let proxy_state = Arc::new(ProxyState {
            registry: self.registry.clone(),
            pending: self.pending.clone(),
            request_timeout: Duration::from_secs(self.config.reliability.request_timeout),
        });
        let tls_enabled = self.config.tls.enabled;
        let certs_dir = self.config.tls.certs_dir.clone();
        let domain = self.config.server.domain.clone();

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
                    error!("Failed to bind HTTPS server: {}", e);
                    return;
                }
            };

            if tls_enabled {
                let cert_path = certs_dir.join("cert.pem");
                let key_path = certs_dir.join("key.pem");

                let mut attempts = 0;
                while (!cert_path.exists() || !key_path.exists()) && attempts < 30 {
                    tokio::time::sleep(Duration::from_secs(10)).await;
                    attempts += 1;
                }

                if !cert_path.exists() || !key_path.exists() {
                    warn!("HTTPS: Certificates not available, using self-signed");
                    let cert =
                        rcgen::generate_simple_self_signed(vec![domain]).unwrap();
                    let key = rustls::pki_types::PrivateKeyDer::Pkcs8(
                        rustls::pki_types::PrivatePkcs8KeyDer::from(
                            cert.key_pair.serialize_der(),
                        ),
                    );
                    let cert_der = rustls::pki_types::CertificateDer::from(cert.cert);

                    let config = rustls::ServerConfig::builder()
                        .with_no_client_auth()
                        .with_single_cert(vec![cert_der], key)
                        .unwrap();

                    let acceptor = tokio_rustls::TlsAcceptor::from(Arc::new(config));
                    info!("HTTPS server (self-signed) listening on {}", addr);
                    Self::serve_https(listener, acceptor, app).await;
                } else {
                    use rustls::pki_types::{pem::PemObject, CertificateDer, PrivateKeyDer};

                    let cert_pem = std::fs::read_to_string(&cert_path).unwrap();
                    let key_pem = std::fs::read_to_string(&key_path).unwrap();

                    let certs: Vec<CertificateDer> =
                        CertificateDer::pem_slice_iter(cert_pem.as_bytes())
                            .collect::<Result<Vec<_>, _>>()
                            .unwrap();
                    let key = PrivateKeyDer::from_pem_slice(key_pem.as_bytes()).unwrap();

                    let config = rustls::ServerConfig::builder()
                        .with_no_client_auth()
                        .with_single_cert(certs, key)
                        .unwrap();

                    let acceptor = tokio_rustls::TlsAcceptor::from(Arc::new(config));
                    info!("HTTPS server listening on {}", addr);
                    Self::serve_https(listener, acceptor, app).await;
                }
            } else {
                warn!("TLS disabled, HTTPS server not started");
            }
        })
    }

    async fn serve_https(
        listener: tokio::net::TcpListener,
        acceptor: tokio_rustls::TlsAcceptor,
        app: Router,
    ) {
        use hyper::service::service_fn;
        use hyper_util::rt::{TokioExecutor, TokioIo};
        use hyper_util::server::conn::auto::Builder;
        use tower::ServiceExt;

        loop {
            let (stream, _) = match listener.accept().await {
                Ok(conn) => conn,
                Err(e) => {
                    error!("HTTPS accept error: {}", e);
                    continue;
                }
            };

            let acceptor = acceptor.clone();
            let app = app.clone();

            tokio::spawn(async move {
                let tls_stream = match acceptor.accept(stream).await {
                    Ok(s) => s,
                    Err(e) => {
                        error!("TLS handshake error: {}", e);
                        return;
                    }
                };

                let service = service_fn(move |req| {
                    let app = app.clone();
                    async move { app.oneshot(req).await }
                });

                if let Err(e) = Builder::new(TokioExecutor::new())
                    .serve_connection(TokioIo::new(tls_stream), service)
                    .await
                {
                    error!("HTTPS connection error: {}", e);
                }
            });
        }
    }

    async fn start_quic_server(self: Arc<Self>) -> anyhow::Result<JoinHandle<()>> {
        let crypto = if self.config.tls.enabled {
            self.setup_tls_from_files().await?
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
        warn!("TLS disabled, using self-signed certificate");
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

    async fn setup_tls_from_files(&self) -> anyhow::Result<rustls::ServerConfig> {
        use rustls::pki_types::{pem::PemObject, CertificateDer, PrivateKeyDer};

        let cert_path = self.config.tls.certs_dir.join("cert.pem");
        let key_path = self.config.tls.certs_dir.join("key.pem");

        const MAX_CERT_WAIT_ATTEMPTS: u32 = 30;
        let mut attempts = 0;
        while (!cert_path.exists() || !key_path.exists()) && attempts < MAX_CERT_WAIT_ATTEMPTS {
            info!(
                "Waiting for certificates ({}/30)... cert={}, key={}",
                attempts + 1,
                cert_path.exists(),
                key_path.exists()
            );
            tokio::time::sleep(Duration::from_secs(10)).await;
            attempts += 1;
        }

        if !cert_path.exists() || !key_path.exists() {
            warn!("Certificates not available after timeout, falling back to self-signed");
            return self.setup_no_tls();
        }

        info!("Loading certificates from {}", cert_path.display());

        let cert_pem = std::fs::read_to_string(&cert_path)?;
        let key_pem = std::fs::read_to_string(&key_path)?;

        let certs: Vec<CertificateDer> =
            CertificateDer::pem_slice_iter(cert_pem.as_bytes()).collect::<Result<Vec<_>, _>>()?;

        let key = PrivateKeyDer::from_pem_slice(key_pem.as_bytes())?;

        let mut crypto = rustls::ServerConfig::builder()
            .with_no_client_auth()
            .with_single_cert(certs, key)?;

        crypto.alpn_protocols = vec![b"tiflis-tunnel".to_vec()];

        info!("TLS configured with Let's Encrypt certificate");
        Ok(crypto)
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

async fn handle_acme_challenge(
    State(challenges): State<AcmeChallenges>,
    Path(token): Path<String>,
) -> impl IntoResponse {
    let challenges = challenges.read().await;
    match challenges.get(&token) {
        Some(key_auth) => (StatusCode::OK, key_auth.clone()).into_response(),
        None => StatusCode::NOT_FOUND.into_response(),
    }
}
