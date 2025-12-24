/**
 * @file constants.ts
 * @copyright 2025 Roman Barinov <rbarinov@gmail.com>
 * @license FSL-1.1-NC
 */

/**
 * Protocol version for compatibility checking.
 * Format: major.minor.patch (semver)
 */
export const PROTOCOL_VERSION = {
  major: 1,
  minor: 0,
  patch: 0,
} as const;

/**
 * Gets protocol version as semver string (e.g., "1.0.0")
 */
export function getProtocolVersion(): string {
  return `${PROTOCOL_VERSION.major}.${PROTOCOL_VERSION.minor}.${PROTOCOL_VERSION.patch}`;
}

/**
 * Connection timing constants (in milliseconds).
 * Optimized for fast disconnect detection (~5-8s) while maintaining connection stability.
 */
export const CONNECTION_TIMING = {
  /** How often clients should send ping (5 seconds - fast liveness detection) */
  PING_INTERVAL_MS: 5_000,

  /** Max time to wait for ping before considering connection stale (15 seconds = 3 missed pings) */
  PONG_TIMEOUT_MS: 15_000,

  /** Interval for checking timed-out connections (5 seconds - faster cleanup) */
  TIMEOUT_CHECK_INTERVAL_MS: 5_000,

  /** Minimum reconnect delay (500ms - fast first retry) */
  RECONNECT_DELAY_MIN_MS: 500,

  /** Maximum reconnect delay (5 seconds - don't wait too long) */
  RECONNECT_DELAY_MAX_MS: 5_000,
} as const;

/**
 * WebSocket configuration.
 */
export const WEBSOCKET_CONFIG = {
  /** Path for WebSocket endpoint */
  PATH: '/ws',
} as const;


