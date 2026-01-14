// Copyright (c) 2026 Roman Barinov <rbarinov@gmail.com>
// Licensed under the FSL-1.1-NC.

use serde::{Deserialize, Serialize};
use std::env;
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Config {
    pub server: ServerConfig,
    pub tls: TlsConfig,
    pub auth: AuthConfig,
    pub reliability: ReliabilityConfig,
    pub limits: LimitsConfig,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServerConfig {
    pub domain: String,
    #[serde(default = "default_http_port")]
    pub http_port: u16,
    #[serde(default = "default_https_port")]
    pub https_port: u16,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TlsConfig {
    #[serde(default = "default_tls_enabled")]
    pub enabled: bool,
    pub acme_email: Option<String>,
    #[serde(default = "default_certs_dir")]
    pub certs_dir: PathBuf,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuthConfig {
    pub api_key: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReliabilityConfig {
    #[serde(default = "default_grace_period")]
    pub grace_period: u64,
    #[serde(default = "default_request_timeout")]
    pub request_timeout: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LimitsConfig {
    #[serde(default = "default_max_workstations")]
    pub max_workstations: usize,
}

fn default_http_port() -> u16 {
    80
}

fn default_https_port() -> u16 {
    443
}

fn default_tls_enabled() -> bool {
    true
}

fn default_certs_dir() -> PathBuf {
    PathBuf::from("/var/lib/tunnel/certs")
}

fn default_grace_period() -> u64 {
    30
}

fn default_request_timeout() -> u64 {
    60
}

fn default_max_workstations() -> usize {
    100
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
        if let Ok(val) = env::var("SERVER_DOMAIN") {
            self.server.domain = val;
        }
        if let Ok(val) = env::var("SERVER_HTTP_PORT") {
            if let Ok(port) = val.parse() {
                self.server.http_port = port;
            }
        }
        if let Ok(val) = env::var("SERVER_HTTPS_PORT") {
            if let Ok(port) = val.parse() {
                self.server.https_port = port;
            }
        }
        if let Ok(val) = env::var("TLS_ENABLED") {
            if let Ok(enabled) = val.parse() {
                self.tls.enabled = enabled;
            }
        }
        if let Ok(val) = env::var("TLS_ACME_EMAIL") {
            self.tls.acme_email = Some(val);
        }
        if let Ok(val) = env::var("TLS_CERTS_DIR") {
            self.tls.certs_dir = PathBuf::from(val);
        }
        if let Ok(val) = env::var("AUTH_API_KEY") {
            self.auth.api_key = val;
        }
        if let Ok(val) = env::var("RELIABILITY_GRACE_PERIOD") {
            if let Ok(period) = val.parse() {
                self.reliability.grace_period = period;
            }
        }
        if let Ok(val) = env::var("RELIABILITY_REQUEST_TIMEOUT") {
            if let Ok(timeout) = val.parse() {
                self.reliability.request_timeout = timeout;
            }
        }
        if let Ok(val) = env::var("LIMITS_MAX_WORKSTATIONS") {
            if let Ok(max) = val.parse() {
                self.limits.max_workstations = max;
            }
        }
    }

    fn validate(&self) -> anyhow::Result<()> {
        if self.server.domain.is_empty() {
            anyhow::bail!("SERVER_DOMAIN is required");
        }
        if self.auth.api_key.len() < 32 {
            anyhow::bail!("AUTH_API_KEY must be at least 32 characters");
        }
        if self.tls.enabled && self.tls.acme_email.is_none() {
            anyhow::bail!("TLS_ACME_EMAIL is required when TLS is enabled");
        }
        Ok(())
    }
}

impl Default for Config {
    fn default() -> Self {
        Self {
            server: ServerConfig {
                domain: String::new(),
                http_port: default_http_port(),
                https_port: default_https_port(),
            },
            tls: TlsConfig {
                enabled: default_tls_enabled(),
                acme_email: None,
                certs_dir: default_certs_dir(),
            },
            auth: AuthConfig {
                api_key: String::new(),
            },
            reliability: ReliabilityConfig {
                grace_period: default_grace_period(),
                request_timeout: default_request_timeout(),
            },
            limits: LimitsConfig {
                max_workstations: default_max_workstations(),
            },
        }
    }
}
