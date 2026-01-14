// Copyright (c) 2026 Roman Barinov <rbarinov@gmail.com>
// Licensed under the FSL-1.1-NC.

use thiserror::Error;

pub type Result<T> = std::result::Result<T, Error>;

#[derive(Error, Debug)]
pub enum Error {
    #[error("serialization error: {0}")]
    Serialization(#[from] serde_json::Error),

    #[error("base64 decode error: {0}")]
    Base64Decode(#[from] base64::DecodeError),

    #[error("invalid message type: {0}")]
    InvalidMessageType(String),

    #[error("missing required field: {0}")]
    MissingField(String),

    #[error("authentication failed")]
    AuthenticationFailed,

    #[error("workstation not found: {0}")]
    WorkstationNotFound(String),

    #[error("workstation already registered: {0}")]
    WorkstationAlreadyRegistered(String),

    #[error("request timeout")]
    RequestTimeout,

    #[error("connection error: {0}")]
    Connection(String),

    #[error("io error: {0}")]
    Io(#[from] std::io::Error),

    #[error("other error: {0}")]
    Other(String),
}
