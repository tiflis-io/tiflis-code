// Copyright (c) 2026 Roman Barinov <rbarinov@gmail.com>
// Licensed under the FSL-1.1-NC.

use serde::{Deserialize, Serialize};
use std::env;
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Config {
    pub server: ServerConfig,
    pub auth: AuthConfig,
    pub workstation: WorkstationConfig,
    pub reconnect: ReconnectConfig,
    pub session: SessionConfig,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServerConfig {
    pub address: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuthConfig {
    pub api_key: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkstationConfig {
    pub id: String,
    pub local_address: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReconnectConfig {
    #[serde(default = "default_reconnect_enabled")]
    pub enabled: bool,
    #[serde(default = "default_max_delay")]
    pub max_delay: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionConfig {
    #[serde(default = "default_ticket_path")]
    pub ticket_path: PathBuf,
}

fn default_reconnect_enabled() -> bool {
    true
}

fn default_max_delay() -> u64 {
    30
}

fn default_ticket_path() -> PathBuf {
    PathBuf::from("./session.ticket")
}

impl Config {
    pub fn load(config_path: Option<PathBuf>) -> anyhow::Result<Self> {
        let mut config = if let Some(path) = config_path {
            let content = std::fs::read_to_string(path)?;
            toml::from_str(&content)?
        } else {
            Self::default()
        };

        config.apply_env_overrides();
        config.validate()?;
        Ok(config)
    }

    fn apply_env_overrides(&mut self) {
        if let Ok(val) = env::var("SERVER_ADDRESS") {
            self.server.address = val;
        }
        if let Ok(val) = env::var("AUTH_API_KEY") {
            self.auth.api_key = val;
        }
        if let Ok(val) = env::var("WORKSTATION_ID") {
            self.workstation.id = val;
        }
        if let Ok(val) = env::var("WORKSTATION_LOCAL_ADDRESS") {
            self.workstation.local_address = val;
        }
        if let Ok(val) = env::var("RECONNECT_ENABLED") {
            if let Ok(enabled) = val.parse() {
                self.reconnect.enabled = enabled;
            }
        }
        if let Ok(val) = env::var("RECONNECT_MAX_DELAY") {
            if let Ok(delay) = val.parse() {
                self.reconnect.max_delay = delay;
            }
        }
        if let Ok(val) = env::var("SESSION_TICKET_PATH") {
            self.session.ticket_path = PathBuf::from(val);
        }
    }

    fn validate(&self) -> anyhow::Result<()> {
        if self.server.address.is_empty() {
            anyhow::bail!("SERVER_ADDRESS is required");
        }
        if self.auth.api_key.is_empty() {
            anyhow::bail!("AUTH_API_KEY is required");
        }
        if self.workstation.id.is_empty() {
            anyhow::bail!("WORKSTATION_ID is required");
        }
        if self.workstation.local_address.is_empty() {
            anyhow::bail!("WORKSTATION_LOCAL_ADDRESS is required");
        }
        Ok(())
    }
}

impl Default for Config {
    fn default() -> Self {
        Self {
            server: ServerConfig {
                address: String::new(),
            },
            auth: AuthConfig {
                api_key: String::new(),
            },
            workstation: WorkstationConfig {
                id: String::new(),
                local_address: String::new(),
            },
            reconnect: ReconnectConfig {
                enabled: default_reconnect_enabled(),
                max_delay: default_max_delay(),
            },
            session: SessionConfig {
                ticket_path: default_ticket_path(),
            },
        }
    }
}
