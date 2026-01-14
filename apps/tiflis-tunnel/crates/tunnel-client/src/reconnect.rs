// Copyright (c) 2026 Roman Barinov <rbarinov@gmail.com>
// Licensed under the FSL-1.1-NC.

use std::time::Duration;
use tokio::time::sleep;

pub struct ReconnectStrategy {
    max_delay: Duration,
    pub attempt: u32,
}

impl ReconnectStrategy {
    pub fn new(max_delay_secs: u64) -> Self {
        Self {
            max_delay: Duration::from_secs(max_delay_secs),
            attempt: 0,
        }
    }

    pub fn reset(&mut self) {
        self.attempt = 0;
    }

    pub async fn wait_before_retry(&mut self) {
        self.attempt += 1;
        let delay = self.calculate_delay();
        tracing::info!(
            "Reconnect attempt {} - waiting {:?}",
            self.attempt,
            delay
        );
        sleep(delay).await;
    }

    pub fn calculate_delay(&self) -> Duration {
        let base_delay = Duration::from_millis(100);
        let exponential_delay = base_delay * 2u32.pow(self.attempt.saturating_sub(1).min(7));
        exponential_delay.min(self.max_delay)
    }
}
