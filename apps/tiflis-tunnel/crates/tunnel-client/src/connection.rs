// Copyright (c) 2026 Roman Barinov <rbarinov@gmail.com>
// Licensed under the FSL-1.1-NC.

use crate::config::Config;
use std::sync::Arc;
use tunnel_core::{quic, ErrorMessage, Message, RegisterMessage, ReconnectMessage, Result};

pub struct Connection {
    config: Config,
    session_ticket: Option<Vec<u8>>,
}

impl Connection {
    pub fn new(config: Config) -> Self {
        let session_ticket = Self::load_session_ticket(&config);
        Self {
            config,
            session_ticket,
        }
    }

    pub async fn connect(&mut self) -> Result<(quinn::Connection, String)> {
        let endpoint = self.create_endpoint()?;

        let addr = tokio::net::lookup_host(&self.config.server.address)
            .await
            .map_err(|e| tunnel_core::Error::Other(format!("failed to resolve server address: {}", e)))?
            .find(|addr| addr.is_ipv4())
            .ok_or_else(|| tunnel_core::Error::Other("no IPv4 addresses found for server".to_string()))?;

        let connection = endpoint.connect(addr, "tunnel")
            .map_err(|e| tunnel_core::Error::Connection(format!("connection failed: {}", e)))?
            .await
            .map_err(|e| tunnel_core::Error::Connection(format!("connection failed: {}", e)))?;

        let is_reconnect = self.session_ticket.is_some();

        let (mut send, mut recv) = connection.open_bi().await.map_err(|e| {
            tunnel_core::Error::Connection(format!("failed to open stream: {}", e))
        })?;

        let message = if is_reconnect {
            Message::Reconnect(ReconnectMessage {
                api_key: self.config.auth.api_key.clone(),
                workstation_id: self.config.workstation.id.clone(),
                session_ticket: None,
            })
        } else {
            Message::Register(RegisterMessage {
                api_key: self.config.auth.api_key.clone(),
                workstation_id: self.config.workstation.id.clone(),
            })
        };

        quic::send_message(&mut send, &message).await?;
        let response = quic::recv_message(&mut recv).await?;

        match response {
            Message::Registered(reg) => {
                self.save_session_ticket(&connection);
                Ok((connection, reg.url))
            }
            Message::Error(ErrorMessage { message, .. }) => {
                Err(tunnel_core::Error::Other(format!("server error: {}", message)))
            }
            _ => Err(tunnel_core::Error::Other("unexpected response".to_string())),
        }
    }

    fn create_endpoint(&self) -> Result<quinn::Endpoint> {
        let mut client_crypto = rustls::ClientConfig::builder()
            .dangerous()
            .with_custom_certificate_verifier(Arc::new(SkipServerVerification::new()))
            .with_no_client_auth();

        client_crypto.alpn_protocols = vec![b"tiflis-tunnel".to_vec()];

        let mut client_config = quinn::ClientConfig::new(Arc::new(
            quinn::crypto::rustls::QuicClientConfig::try_from(client_crypto).map_err(|e| {
                tunnel_core::Error::Other(format!("failed to create QUIC config: {}", e))
            })?,
        ));

        let mut transport_config = quinn::TransportConfig::default();
        transport_config.max_concurrent_bidi_streams(1000u32.into());
        client_config.transport_config(Arc::new(transport_config));

        let mut endpoint = quinn::Endpoint::client("0.0.0.0:0".parse().unwrap()).map_err(|e| {
            tunnel_core::Error::Other(format!("failed to create endpoint: {}", e))
        })?;

        endpoint.set_default_client_config(client_config);

        Ok(endpoint)
    }

    fn load_session_ticket(config: &Config) -> Option<Vec<u8>> {
        std::fs::read(&config.session.ticket_path).ok()
    }

    fn save_session_ticket(&self, _connection: &quinn::Connection) {
        if let Some(parent) = self.config.session.ticket_path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
    }
}

#[derive(Debug)]
struct SkipServerVerification(Arc<rustls::crypto::CryptoProvider>);

impl SkipServerVerification {
    fn new() -> Self {
        Self(Arc::new(rustls::crypto::ring::default_provider()))
    }
}

impl rustls::client::danger::ServerCertVerifier for SkipServerVerification {
    fn verify_server_cert(
        &self,
        _end_entity: &rustls::pki_types::CertificateDer<'_>,
        _intermediates: &[rustls::pki_types::CertificateDer<'_>],
        _server_name: &rustls::pki_types::ServerName<'_>,
        _ocsp_response: &[u8],
        _now: rustls::pki_types::UnixTime,
    ) -> std::result::Result<rustls::client::danger::ServerCertVerified, rustls::Error> {
        Ok(rustls::client::danger::ServerCertVerified::assertion())
    }

    fn verify_tls12_signature(
        &self,
        message: &[u8],
        cert: &rustls::pki_types::CertificateDer<'_>,
        dss: &rustls::DigitallySignedStruct,
    ) -> std::result::Result<rustls::client::danger::HandshakeSignatureValid, rustls::Error> {
        rustls::crypto::verify_tls12_signature(
            message,
            cert,
            dss,
            &self.0.signature_verification_algorithms,
        )
    }

    fn verify_tls13_signature(
        &self,
        message: &[u8],
        cert: &rustls::pki_types::CertificateDer<'_>,
        dss: &rustls::DigitallySignedStruct,
    ) -> std::result::Result<rustls::client::danger::HandshakeSignatureValid, rustls::Error> {
        rustls::crypto::verify_tls13_signature(
            message,
            cert,
            dss,
            &self.0.signature_verification_algorithms,
        )
    }

    fn supported_verify_schemes(&self) -> Vec<rustls::SignatureScheme> {
        self.0.signature_verification_algorithms.supported_schemes()
    }
}
