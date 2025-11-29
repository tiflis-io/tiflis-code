/**
 * @file constants.ts
 * @copyright 2025 Roman Barinov <rbarinov@gmail.com>
 * @license MIT
 */

/**
 * Protocol version for compatibility checking.
 */
export const PROTOCOL_VERSION = {
  major: 1,
  minor: 0,
} as const;

/**
 * Connection timing constants (in milliseconds).
 */
export const CONNECTION_TIMING = {
  /** How often to send ping (20 seconds) */
  PING_INTERVAL_MS: 20_000,

  /** Max time to wait for pong before considering connection stale (30 seconds) */
  PONG_TIMEOUT_MS: 30_000,

  /** Interval for checking timed-out connections (10 seconds) */
  TIMEOUT_CHECK_INTERVAL_MS: 10_000,

  /** Minimum reconnect delay (1 second) */
  RECONNECT_DELAY_MIN_MS: 1_000,

  /** Maximum reconnect delay (30 seconds) */
  RECONNECT_DELAY_MAX_MS: 30_000,
} as const;

/**
 * WebSocket configuration.
 */
export const WEBSOCKET_CONFIG = {
  /** Path for WebSocket endpoint */
  PATH: '/ws',
} as const;

/**
 * Server version (will be replaced during build).
 */
export const SERVER_VERSION = '0.1.0';

