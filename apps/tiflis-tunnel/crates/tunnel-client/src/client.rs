// Copyright (c) 2026 Roman Barinov <rbarinov@gmail.com>
// Licensed under the FSL-1.1-NC.

use crate::config::Config;
use crate::connection::Connection;
use crate::proxy::LocalProxy;
use crate::reconnect::ReconnectStrategy;
use std::sync::Arc;
use tokio::time::{interval, Duration};
use tracing::{error, info};
use tunnel_core::{quic, Message, PingMessage};

pub struct TunnelClient {
    #[allow(dead_code)]
    config: Config,
    connection: Connection,
    proxy: Arc<LocalProxy>,
    reconnect: Option<ReconnectStrategy>,
}

impl TunnelClient {
    pub fn new(config: Config) -> Self {
        let connection = Connection::new(config.clone());
        let proxy = Arc::new(LocalProxy::new(config.workstation.local_address.clone()));
        let reconnect = if config.reconnect.enabled {
            Some(ReconnectStrategy::new(config.reconnect.max_delay))
        } else {
            None
        };

        Self {
            config,
            connection,
            proxy,
            reconnect,
        }
    }

    pub async fn run(&mut self) -> anyhow::Result<()> {
        loop {
            match self.connect_and_serve().await {
                Ok(()) => {
                    info!("Connection closed gracefully");
                }
                Err(e) => {
                    error!("Connection error: {}", e);
                }
            }

            if let Some(ref mut strategy) = self.reconnect {
                strategy.wait_before_retry().await;
            } else {
                break;
            }
        }

        Ok(())
    }

    async fn connect_and_serve(&mut self) -> anyhow::Result<()> {
        info!("Connecting to tunnel server...");
        let (conn, url) = self.connection.connect().await?;

        info!("Connected! Tunnel URL: {}", url);

        if let Some(ref mut strategy) = self.reconnect {
            strategy.reset();
        }

        let ping_task = self.start_ping_task(conn.clone());
        let message_task = self.handle_messages(conn.clone());

        tokio::select! {
            _ = ping_task => {
                info!("Ping task ended");
            }
            _ = message_task => {
                info!("Message task ended");
            }
        }

        Ok(())
    }

    async fn start_ping_task(&self, connection: quinn::Connection) {
        let mut ticker = interval(Duration::from_secs(20));
        loop {
            ticker.tick().await;

            let ping = Message::Ping(PingMessage {
                timestamp: std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap()
                    .as_secs(),
            });

            if quic::send_bidirectional_message(&connection, &ping)
                .await
                .is_err()
            {
                error!("Failed to send ping");
                break;
            }
        }
    }

    async fn handle_messages(&self, connection: quinn::Connection) {
        loop {
            match connection.accept_bi().await {
                Ok((mut send, mut recv)) => {
                    let proxy = self.proxy.clone();
                    tokio::spawn(async move {
                        match quic::recv_message(&mut recv).await {
                            Ok(msg) => match msg {
                                Message::HttpRequest(req) => {
                                    if let Some(response) =
                                        proxy.handle_message(Message::HttpRequest(req)).await
                                    {
                                        if let Err(e) =
                                            quic::send_message(&mut send, &response).await
                                        {
                                            error!("Failed to send response: {}", e);
                                        } else {
                                            let _ = send.finish();
                                        }
                                    }
                                }
                                Message::WsOpen(open_msg) => {
                                    proxy.handle_websocket_open(open_msg, send, recv).await;
                                }
                                _ => {}
                            },
                            Err(e) => {
                                error!("Failed to receive message: {}", e);
                            }
                        }
                    });
                }
                Err(_) => {
                    info!("Connection closed");
                    break;
                }
            }
        }
    }
}
