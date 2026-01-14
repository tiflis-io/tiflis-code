// Copyright (c) 2026 Roman Barinov <rbarinov@gmail.com>
// Licensed under the FSL-1.1-NC.

use crate::{Error, Message, Result};
use base64::Engine;
use bytes::{BufMut, BytesMut};

pub fn encode_message(msg: &Message) -> Result<Vec<u8>> {
    let json = serde_json::to_vec(msg)?;
    let len = json.len() as u32;

    let mut buf = BytesMut::with_capacity(4 + json.len());
    buf.put_u32(len);
    buf.put_slice(&json);

    Ok(buf.to_vec())
}

pub fn decode_message(data: &[u8]) -> Result<(Message, usize)> {
    if data.len() < 4 {
        return Err(Error::Other(
            "insufficient data for length prefix".to_string(),
        ));
    }

    let len = u32::from_be_bytes([data[0], data[1], data[2], data[3]]) as usize;

    if data.len() < 4 + len {
        return Err(Error::Other(format!(
            "insufficient data: need {}, have {}",
            4 + len,
            data.len()
        )));
    }

    let msg = serde_json::from_slice(&data[4..4 + len])?;
    Ok((msg, 4 + len))
}

pub fn encode_body(data: &[u8]) -> String {
    base64::engine::general_purpose::STANDARD.encode(data)
}

pub fn decode_body(encoded: &str) -> Result<Vec<u8>> {
    Ok(base64::engine::general_purpose::STANDARD.decode(encoded)?)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::protocol::PingMessage;

    #[test]
    fn test_encode_decode_message() {
        let msg = Message::Ping(PingMessage { timestamp: 12345 });
        let encoded = encode_message(&msg).unwrap();
        let (decoded, size) = decode_message(&encoded).unwrap();

        assert_eq!(size, encoded.len());
        match decoded {
            Message::Ping(ping) => assert_eq!(ping.timestamp, 12345),
            _ => panic!("wrong message type"),
        }
    }

    #[test]
    fn test_encode_decode_body() {
        let data = b"hello world";
        let encoded = encode_body(data);
        let decoded = decode_body(&encoded).unwrap();
        assert_eq!(decoded, data);
    }

    #[test]
    fn test_decode_insufficient_data() {
        let result = decode_message(&[0, 0, 0]);
        assert!(result.is_err());
    }
}
