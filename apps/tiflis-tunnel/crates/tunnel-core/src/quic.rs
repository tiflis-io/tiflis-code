// Copyright (c) 2026 Roman Barinov <rbarinov@gmail.com>
// Licensed under the FSL-1.1-NC.

use crate::{codec, Error, Message, Result};

pub async fn send_message(send_stream: &mut quinn::SendStream, msg: &Message) -> Result<()> {
    let data = codec::encode_message(msg)?;
    send_stream
        .write_all(&data)
        .await
        .map_err(|e| Error::Connection(e.to_string()))?;
    Ok(())
}

pub async fn recv_message(recv_stream: &mut quinn::RecvStream) -> Result<Message> {
    let mut len_buf = [0u8; 4];
    recv_stream
        .read_exact(&mut len_buf)
        .await
        .map_err(|e| match e {
            quinn::ReadExactError::FinishedEarly(_) => {
                Error::Connection("stream closed".to_string())
            }
            quinn::ReadExactError::ReadError(e) => Error::Connection(e.to_string()),
        })?;

    let len = u32::from_be_bytes(len_buf) as usize;
    if len > 10_000_000 {
        return Err(Error::Other(format!("message too large: {} bytes", len)));
    }

    let mut data = vec![0u8; len];
    recv_stream
        .read_exact(&mut data)
        .await
        .map_err(|e| match e {
            quinn::ReadExactError::FinishedEarly(_) => {
                Error::Connection("stream closed".to_string())
            }
            quinn::ReadExactError::ReadError(e) => Error::Connection(e.to_string()),
        })?;

    let msg = serde_json::from_slice(&data)?;
    Ok(msg)
}

pub async fn send_bidirectional_message(
    connection: &quinn::Connection,
    msg: &Message,
) -> Result<()> {
    let (mut send, _recv) = connection
        .open_bi()
        .await
        .map_err(|e| Error::Connection(e.to_string()))?;
    send_message(&mut send, msg).await?;
    send.finish()
        .map_err(|e| Error::Connection(e.to_string()))?;
    Ok(())
}

pub async fn send_and_receive(connection: &quinn::Connection, msg: &Message) -> Result<Message> {
    let (mut send, mut recv) = connection
        .open_bi()
        .await
        .map_err(|e| Error::Connection(e.to_string()))?;

    send_message(&mut send, msg).await?;
    send.finish()
        .map_err(|e| Error::Connection(e.to_string()))?;

    recv_message(&mut recv).await
}
