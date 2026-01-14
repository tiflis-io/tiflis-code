// Copyright (c) 2026 Roman Barinov <rbarinov@gmail.com>
// Licensed under the FSL-1.1-NC.

use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::{oneshot, RwLock};
use tunnel_core::Message;
use uuid::Uuid;

pub type ResponseSender = oneshot::Sender<Message>;

pub struct PendingRequests {
    requests: Arc<RwLock<HashMap<Uuid, ResponseSender>>>,
}

impl PendingRequests {
    pub fn new() -> Self {
        Self {
            requests: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    pub async fn register(&self, stream_id: Uuid, sender: ResponseSender) {
        let mut requests = self.requests.write().await;
        requests.insert(stream_id, sender);
    }

    pub async fn complete(&self, stream_id: Uuid, response: Message) -> bool {
        let mut requests = self.requests.write().await;
        if let Some(sender) = requests.remove(&stream_id) {
            sender.send(response).is_ok()
        } else {
            false
        }
    }

    pub async fn cancel(&self, stream_id: Uuid) {
        let mut requests = self.requests.write().await;
        requests.remove(&stream_id);
    }

    pub async fn count(&self) -> usize {
        let requests = self.requests.read().await;
        requests.len()
    }
}

impl Default for PendingRequests {
    fn default() -> Self {
        Self::new()
    }
}
