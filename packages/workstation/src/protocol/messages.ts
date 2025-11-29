/**
 * @file messages.ts
 * @copyright 2025 Roman Barinov <rbarinov@gmail.com>
 * @license MIT
 */

import type { ErrorCode } from './errors.js';
import type { SessionType, SessionStatus } from '../domain/entities/session.js';

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
    audio_format?: 'm4a' | 'wav' | 'mp3';
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
    workspace?: string;
    project?: string;
    worktree?: string;
    working_dir: string;
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
 */
export interface SessionOutputMessage {
  type: 'session.output';
  session_id: string;
  payload: {
    content_type: ContentType;
    content: string;
    timestamp: number;
    is_complete?: boolean;
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
  | SyncMessage
  | ListSessionsMessage
  | CreateSessionMessage
  | TerminateSessionMessage
  | SessionSubscribeMessage
  | SessionUnsubscribeMessage
  | SessionExecuteMessage
  | SessionInputMessage
  | SessionResizeMessage
  | SessionReplayMessage;

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
  | SyncStateMessage
  | ResponseMessage
  | ErrorMessage
  | SessionCreatedMessage
  | SessionTerminatedMessage
  | SessionSubscribedMessage
  | SessionUnsubscribedMessage
  | SessionOutputMessage
  | SessionErrorMessage
  | SessionReplayDataMessage;

/**
 * All outgoing messages to tunnel
 */
export type OutgoingTunnelMessage = WorkstationRegisterMessage | PingMessage;

