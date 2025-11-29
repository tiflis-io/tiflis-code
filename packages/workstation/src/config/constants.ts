/**
 * @file constants.ts
 * @copyright 2025 Roman Barinov <rbarinov@gmail.com>
 * @license MIT
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
 */
export const CONNECTION_TIMING = {
  /** How often to send ping to tunnel (20 seconds) */
  PING_INTERVAL_MS: 20_000,

  /** Max time to wait for pong before considering connection stale (30 seconds) */
  PONG_TIMEOUT_MS: 30_000,

  /** Minimum reconnect delay (1 second) */
  RECONNECT_DELAY_MIN_MS: 1_000,

  /** Maximum reconnect delay (30 seconds) */
  RECONNECT_DELAY_MAX_MS: 30_000,

  /** Interval for checking timed-out client connections (10 seconds) */
  CLIENT_TIMEOUT_CHECK_INTERVAL_MS: 10_000,
} as const;

/**
 * WebSocket configuration.
 */
export const WEBSOCKET_CONFIG = {
  /** Path for local WebSocket endpoint (for direct connections) */
  PATH: '/ws',
} as const;

/**
 * Session configuration.
 */
export const SESSION_CONFIG = {
  /** Maximum number of concurrent agent sessions */
  MAX_AGENT_SESSIONS: 10,

  /** Maximum number of concurrent terminal sessions */
  MAX_TERMINAL_SESSIONS: 5,

  /** Default terminal columns */
  DEFAULT_TERMINAL_COLS: 80,

  /** Default terminal rows */
  DEFAULT_TERMINAL_ROWS: 24,

  /** Message history limit for replay */
  MESSAGE_HISTORY_LIMIT: 100,

  /** Data retention period for terminated sessions (30 days in ms) */
  DATA_RETENTION_MS: 30 * 24 * 60 * 60 * 1000,
} as const;

/**
 * Agent CLI commands for different agent types.
 *
 * Each agent has specific flags for headless operation:
 * - Cursor: Uses --output-format stream-json --print, --resume for session persistence
 * - Claude: Uses --verbose --print -p "prompt" --output-format stream-json, --resume for session persistence
 *   NOTE: --verbose is REQUIRED when using --print with --output-format stream-json
 * - OpenCode: Uses daemon architecture with `serve` + `run --attach`
 */
export const AGENT_COMMANDS = {
  cursor: {
    command: 'cursor-agent',
    /** Base args for cursor-agent (prompt is appended as last argument) */
    baseArgs: ['--output-format', 'stream-json', '--print'],
    /** Flag to resume existing session */
    resumeFlag: '--resume',
    description: 'Cursor AI Agent (headless mode)',
    /** Wait time after process termination (ms) */
    postTerminationWaitMs: 500,
  },
  claude: {
    command: 'claude',
    /** Base args for claude CLI (prompt is passed via -p flag) */
    baseArgs: ['--verbose', '--print', '--output-format', 'stream-json'],
    /** Flag to resume existing session (NOT --session-id!) */
    resumeFlag: '--resume',
    /** Flag for passing prompt */
    promptFlag: '-p',
    description: 'Claude Code Agent (headless mode)',
    /** Wait time after process termination (ms) - Claude needs more time to release session lock */
    postTerminationWaitMs: 1500,
  },
  opencode: {
    command: 'opencode',
    /** Args for running headless agent that attaches to daemon */
    runArgs: ['run', '--attach'],
    /** Args for starting the daemon */
    serveArgs: ['serve'],
    description: 'OpenCode Agent (attach mode)',
    /** Default daemon URL */
    defaultDaemonUrl: 'http://localhost:4200',
    /** Wait time after process termination (ms) */
    postTerminationWaitMs: 500,
  },
} as const;

/**
 * Agent execution configuration.
 */
export const AGENT_EXECUTION_CONFIG = {
  /** Default execution timeout (seconds) - 15 minutes for complex tasks */
  DEFAULT_TIMEOUT_SECONDS: 900,

  /** Timeout for waiting on process termination during graceful shutdown (ms) */
  GRACEFUL_SHUTDOWN_TIMEOUT_MS: 2000,

  /** Maximum buffer size for JSON line parsing (bytes) */
  MAX_BUFFER_SIZE: 1024 * 1024, // 1MB

  /** Completion message types that indicate command finished */
  COMPLETION_TYPES: ['result', 'session_end'] as const,
} as const;

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

/**
 * Gets workstation server version from package.json
 */
export function getWorkstationVersion(): string {
  try {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    const packageJsonPath = join(__dirname, '../../package.json');
    const packageJsonContent = readFileSync(packageJsonPath, 'utf-8');
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
    const packageJson = JSON.parse(packageJsonContent) as { version?: string };
    const version = packageJson.version;
    if (typeof version === 'string' && version.length > 0) {
      return version;
    }
    return '0.0.0';
  } catch {
    // Fallback if package.json cannot be read
    return '0.0.0';
  }
}

