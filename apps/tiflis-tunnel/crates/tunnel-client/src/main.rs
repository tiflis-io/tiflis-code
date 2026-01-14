// Copyright (c) 2026 Roman Barinov <rbarinov@gmail.com>
// Licensed under the FSL-1.1-NC.

use tunnel_client::{client, config};

use clap::Parser;
use std::path::PathBuf;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

#[derive(Parser, Debug)]
#[command(name = "tunnel-client")]
#[command(about = "Tiflis Tunnel Client", version)]
struct Args {
    #[arg(short, long, value_name = "FILE")]
    config: Option<PathBuf>,
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let _ = rustls::crypto::ring::default_provider().install_default();

    tracing_subscriber::registry()
        .with(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "tunnel_client=info".into()),
        )
        .with(tracing_subscriber::fmt::layer())
        .init();

    let args = Args::parse();
    let config = config::Config::load(args.config)?;

    tracing::info!("Starting Tiflis Tunnel Client");
    tracing::info!("Workstation ID: {}", config.workstation.id);
    tracing::info!("Server: {}", config.server.address);

    let mut client = client::TunnelClient::new(config);
    client.run().await
}
