// Copyright (c) 2026 Roman Barinov <rbarinov@gmail.com>
// Licensed under the FSL-1.1-NC.

use std::collections::HashMap;
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::sync::RwLock;

#[derive(Debug, Clone)]
pub struct WorkstationInfo {
    pub id: String,
    pub connection: quinn::Connection,
    pub registered_at: Instant,
    pub state: WorkstationState,
}

#[derive(Debug, Clone, PartialEq)]
pub enum WorkstationState {
    Active,
    Reconnecting { since: Instant },
}

pub struct WorkstationRegistry {
    workstations: Arc<RwLock<HashMap<String, WorkstationInfo>>>,
    grace_period: Duration,
}

impl WorkstationRegistry {
    pub fn new(grace_period: Duration) -> Self {
        Self {
            workstations: Arc::new(RwLock::new(HashMap::new())),
            grace_period,
        }
    }

    pub async fn register(&self, id: String, connection: quinn::Connection) -> Result<(), String> {
        let mut workstations = self.workstations.write().await;

        if workstations.contains_key(&id) {
            return Err(format!("workstation {} already registered", id));
        }

        workstations.insert(
            id.clone(),
            WorkstationInfo {
                id,
                connection,
                registered_at: Instant::now(),
                state: WorkstationState::Active,
            },
        );

        Ok(())
    }

    pub async fn get(&self, id: &str) -> Option<WorkstationInfo> {
        let workstations = self.workstations.read().await;
        workstations.get(id).cloned()
    }

    pub async fn mark_reconnecting(&self, id: &str) {
        let mut workstations = self.workstations.write().await;
        if let Some(info) = workstations.get_mut(id) {
            info.state = WorkstationState::Reconnecting {
                since: Instant::now(),
            };
        }
    }

    pub async fn reconnect(&self, id: &str, connection: quinn::Connection) -> Result<(), String> {
        let mut workstations = self.workstations.write().await;

        match workstations.get_mut(id) {
            Some(info) => {
                if let WorkstationState::Reconnecting { since } = info.state {
                    if since.elapsed() > self.grace_period {
                        return Err("grace period expired".to_string());
                    }
                }
                info.connection = connection;
                info.state = WorkstationState::Active;
                Ok(())
            }
            None => Err(format!("workstation {} not found", id)),
        }
    }

    pub async fn unregister(&self, id: &str) {
        let mut workstations = self.workstations.write().await;
        workstations.remove(id);
    }

    pub async fn count(&self) -> usize {
        let workstations = self.workstations.read().await;
        workstations.len()
    }

    pub async fn cleanup_expired(&self) {
        let mut workstations = self.workstations.write().await;
        let now = Instant::now();

        workstations.retain(|_id, info| {
            if let WorkstationState::Reconnecting { since } = info.state {
                now.duration_since(since) <= self.grace_period
            } else {
                true
            }
        });
    }
}
