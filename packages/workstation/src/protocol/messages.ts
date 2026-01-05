/**
 * @file messages.ts
 * @copyright 2025 Roman Barinov <rbarinov@gmail.com>
 * @license FSL-1.1-NC
 */

import type { ErrorCode } from './errors.js';
import type { SessionType, SessionStatus } from '../domain/entities/session.js';
import type { ContentBlock } from '../domain/value-objects/content-block.js';

// ============================================================================
// Tunnel Messages (Workstation ↔ Tunnel)
// ============================================================================

/**
 * Workstation → Tunnel: Registration request
 */
export interface WorkstationRegisterMessage {
  type: 'workstation.register';
  payload: {
    api_key: string;
    name: string;
    auth_key: string;
    reconnect?: boolean;
    previous_tunnel_id?: string;
  };
}

/**
 * Tunnel → Workstation: Registration success
 */
export interface WorkstationRegisteredMessage {
  type: 'workstation.registered';
  payload: {
    tunnel_id: string;
    public_url: string;
    restored?: boolean;
  };
}

// ============================================================================
// Client Lifecycle Messages
// ============================================================================

/**
 * Tunnel → Workstation: Client disconnected notification
 * Sent when a mobile client disconnects so workstation can clean up subscriptions
 */
export interface ClientDisconnectedMessage {
  type: 'client.disconnected';
  payload: {
    device_id: string;
    tunnel_id: string;
  };
}

// ============================================================================
// Heartbeat Messages
// ============================================================================

/**
 * Ping message for connection health monitoring
 */
export interface PingMessage {
  type: 'ping';
  timestamp: number;
}

/**
 * Pong message for connection health monitoring
 */
export interface PongMessage {
  type: 'pong';
  timestamp: number;
}

/**
 * Mobile → Workstation: Application-level heartbeat request
 * Verifies end-to-end connectivity (Mobile → Tunnel → Workstation)
 */
export interface HeartbeatMessage {
  type: 'heartbeat';
  id: string;
  timestamp: number;
}

/**
 * Workstation → Mobile: Heartbeat acknowledgment
 */
export interface HeartbeatAckMessage {
  type: 'heartbeat.ack';
  id: string;
  timestamp: number;
  workstation_uptime_ms: number;
}

// ============================================================================
// Authentication Messages
// ============================================================================

/**
 * Mobile → Workstation: Authentication request
 */
export interface AuthMessage {
  type: 'auth';
  payload: {
    auth_key: string;
    device_id: string;
  };
}

/**
 * Workstation → Mobile: Authentication success
 */
export interface AuthSuccessMessage {
  type: 'auth.success';
  payload: {
    device_id: string;
    workstation_name?: string;
    workstation_version?: string;
    protocol_version?: string;
    workspaces_root?: string;
    restored_subscriptions?: string[];
  };
}

/**
 * Workstation → Mobile: Authentication error
 */
export interface AuthErrorMessage {
  type: 'auth.error';
  payload: {
    code: 'INVALID_AUTH_KEY';
    message: string;
  };
}

// ============================================================================
// Sync Messages
// ============================================================================

/**
 * Mobile → Workstation: Sync request (after reconnect)
 */
export interface SyncMessage {
  type: 'sync';
  id: string;
  lightweight?: boolean; // If true, excludes message histories (for performance)
}

/**
 * Workstation → Mobile: Sync state response
 */
export interface SyncStateMessage {
  type: 'sync.state';
  id: string;
  payload: {
    sessions: SessionInfo[];
    subscriptions: string[];
  };
}

// ============================================================================
// Supervisor Messages
// ============================================================================

/**
 * Mobile → Workstation: List sessions
 */
export interface ListSessionsMessage {
  type: 'supervisor.list_sessions';
  id: string;
}

/**
 * Mobile → Workstation: Create session
 */
export interface CreateSessionMessage {
  type: 'supervisor.create_session';
  id: string;
  payload: {
    session_type: 'cursor' | 'claude' | 'opencode' | 'terminal';
    workspace: string;
    project: string;
    worktree?: string;
  };
}

/**
 * Mobile → Workstation: Terminate session
 */
export interface TerminateSessionMessage {
  type: 'supervisor.terminate_session';
  id: string;
  payload: {
    session_id: string;
  };
}

/**
 * Mobile → Workstation: Execute supervisor command
 */
export interface SupervisorCommandMessage {
  type: 'supervisor.command';
  id: string;
  payload: {
    command?: string;
    audio?: string;
    audio_format?: 'm4a' | 'wav' | 'mp3' | 'webm' | 'opus';
    message_id?: string;
    language?: string;
  };
}

// ============================================================================
// Session Subscription Messages
// ============================================================================

/**
 * Mobile → Workstation: Subscribe to session
 */
export interface SessionSubscribeMessage {
  type: 'session.subscribe';
  session_id: string;
}

/**
 * Workstation → Mobile: Subscription confirmed
 */
export interface SessionSubscribedMessage {
  type: 'session.subscribed';
  session_id: string;
  payload?: {
    /** Whether this client is the master (controls terminal size) */
    is_master?: boolean;
    /** Current terminal size (for terminal sessions) */
    cols?: number;
    rows?: number;
  };
}

/**
 * Mobile → Workstation: Unsubscribe from session
 */
export interface SessionUnsubscribeMessage {
  type: 'session.unsubscribe';
  session_id: string;
}

/**
 * Workstation → Mobile: Unsubscription confirmed
 */
export interface SessionUnsubscribedMessage {
  type: 'session.unsubscribed';
  session_id: string;
}

// ============================================================================
// Session Command Messages
// ============================================================================

/**
 * Mobile → Workstation: Execute command
 */
export interface SessionExecuteMessage {
  type: 'session.execute';
  id: string;
  session_id: string;
  payload: {
    text?: string;
    audio?: string;
    audio_format?: 'm4a' | 'wav' | 'mp3' | 'webm' | 'opus';
    language?: string;
    tts_enabled?: boolean;
  };
}

/**
 * Mobile → Workstation: Terminal input (PTY only)
 */
export interface SessionInputMessage {
  type: 'session.input';
  session_id: string;
  payload: {
    data: string;
  };
}

/**
 * Mobile → Workstation: Terminal resize (PTY only)
 */
export interface SessionResizeMessage {
  type: 'session.resize';
  session_id: string;
  payload: {
    cols: number;
    rows: number;
  };
}

/**
 * Workstation → Mobile: Terminal resize result
 */
export interface SessionResizedMessage {
  type: 'session.resized';
  session_id: string;
  payload: {
    success: boolean;
    /** Actual terminal size after resize (may differ from requested due to min constraints) */
    cols: number;
    rows: number;
    /** Reason for rejection if not successful */
    reason?: 'not_master' | 'inactive';
  };
}

/**
 * Mobile → Workstation: Message replay request
 */
export interface SessionReplayMessage {
  type: 'session.replay';
  session_id: string;
  payload: {
    since_timestamp: number;
    limit?: number;
  };
}

/**
 * Mobile → Workstation: Cancel agent command execution
 */
export interface SessionCancelMessage {
  type: 'session.cancel';
  id: string;
  session_id: string;
  device_id?: string;
}

/**
 * Mobile → Workstation: Cancel supervisor command execution
 */
export interface SupervisorCancelMessage {
  type: 'supervisor.cancel';
  id: string;
  device_id?: string;
}

// ============================================================================
// Session Event Messages
// ============================================================================

/**
 * Workstation → Mobile: Session created
 */
export interface SessionCreatedMessage {
  type: 'session.created';
  session_id: string;
  payload: {
    session_type: SessionType;
    /** Agent name (alias) if different from session_type (e.g., 'zai' for a claude alias) */
    agent_name?: string;
    workspace?: string;
    project?: string;
    worktree?: string;
    working_dir: string;
    terminal_config?: {
      buffer_size: number;
    };
  };
}

/**
 * Workstation → Mobile: Session terminated
 */
export interface SessionTerminatedMessage {
  type: 'session.terminated';
  session_id: string;
}

/**
 * Output content type
 */
export type ContentType = 'agent' | 'terminal' | 'transcription';

/**
 * Workstation → Mobile: Session output
 *
 * For agent output, content_blocks provides structured typed blocks for rich UI.
 * The content field remains for backward compatibility and terminal output.
 */
export interface SessionOutputMessage {
  type: 'session.output';
  session_id: string;
  payload: {
    content_type: ContentType;
    /** Plain text content (for terminal) or stringified agent output (backward compat) */
    content: string;
    /** Structured content blocks for rich UI rendering (agent output) */
    content_blocks?: ContentBlock[];
    timestamp: number;
    is_complete?: boolean;
    /** Base64 encoded TTS audio (only when is_complete=true && tts_enabled) */
    audio?: string;
  };
}

/**
 * Workstation → Mobile: Session error
 */
export interface SessionErrorMessage {
  type: 'session.error';
  session_id: string;
  payload: {
    code: string;
    message: string;
  };
}

/**
 * Workstation → Mobile: Replay data response
 */
export interface ReplayedMessage {
  content_type: ContentType;
  content: string;
  timestamp: number;
}

export interface SessionReplayDataMessage {
  type: 'session.replay.data';
  session_id: string;
  payload: {
    messages: ReplayedMessage[];
    has_more: boolean;
  };
}

// ============================================================================
// Message Acknowledgment
// ============================================================================

/**
 * Workstation → Mobile: Message acknowledgment
 * Sent when a user message (supervisor.send or session.execute) is received and queued for processing.
 * Allows clients to show "Sending..." → "Sent" status for user messages.
 */
export interface MessageAckMessage {
  type: 'message.ack';
  payload: {
    /** The message ID that was acknowledged */
    message_id: string;
    /** Session ID if this was a session command (undefined for supervisor) */
    session_id?: string;
    /** Status of the message */
    status: 'received' | 'processing' | 'queued';
  };
}

// ============================================================================
// Response Messages
// ============================================================================

/**
 * Generic response message
 */
export interface ResponseMessage {
  type: 'response';
  id: string;
  payload: Record<string, unknown>;
}

/**
 * Error response message
 */
export interface ErrorMessage {
  type: 'error';
  id?: string;
  payload: {
    code: ErrorCode;
    message: string;
    details?: unknown;
  };
}

// ============================================================================
// Session Info Type
// ============================================================================

/**
 * Session information for protocol messages
 */
export interface SessionInfo {
  session_id: string;
  session_type: SessionType;
  status: SessionStatus;
  workspace?: string;
  project?: string;
  worktree?: string;
  working_dir?: string;
  created_at: number;
  /** Agent name (alias) if different from session_type (e.g., 'zai' for a claude alias) */
  agent_name?: string;
  /** Backlog-specific: backlog session ID for session_type='backlog-agent' */
  backlog_id?: string;
  /** Backlog-specific: whether harness is currently running */
  harness_running?: boolean;
  /** Backlog-specific: summary of backlog task status */
  backlog_summary?: {
    total: number;
    completed: number;
    failed: number;
    in_progress: number;
    pending: number;
  };
}

// ============================================================================
// Union Types
// ============================================================================

/**
 * All incoming messages that the workstation can receive from clients
 */
export type IncomingClientMessage =
  | AuthMessage
  | PingMessage
  | HeartbeatMessage
  | SyncMessage
  | ListSessionsMessage
  | CreateSessionMessage
  | TerminateSessionMessage
  | SupervisorCommandMessage
  | SupervisorCancelMessage
  | SessionSubscribeMessage
  | SessionUnsubscribeMessage
  | SessionExecuteMessage
  | SessionInputMessage
  | SessionResizeMessage
  | SessionReplayMessage
  | SessionCancelMessage;

/**
 * All incoming messages from tunnel
 */
export type IncomingTunnelMessage =
  | WorkstationRegisteredMessage
  | PongMessage
  | ErrorMessage;

/**
 * All outgoing messages to clients
 */
export type OutgoingClientMessage =
  | AuthSuccessMessage
  | AuthErrorMessage
  | PongMessage
  | HeartbeatAckMessage
  | SyncStateMessage
  | ResponseMessage
  | ErrorMessage
  | MessageAckMessage
  | SessionCreatedMessage
  | SessionTerminatedMessage
  | SessionSubscribedMessage
  | SessionUnsubscribedMessage
  | SessionResizedMessage
  | SessionOutputMessage
  | SessionErrorMessage
  | SessionReplayDataMessage;

/**
 * All outgoing messages to tunnel
 */
export type OutgoingTunnelMessage = WorkstationRegisterMessage | PingMessage;

