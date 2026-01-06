// Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
// Licensed under the FSL-1.1-NC.

import type { SessionType, SessionStatus } from './session';

// Server-side content block format (uses snake_case)
export interface ServerContentBlock {
  id: string;
  block_type: string;
  content: string;
  metadata?: Record<string, unknown>;
}

// Outgoing message types (client → server)
export type OutgoingMessageType =
  | 'connect'
  | 'auth'
  | 'ping'
  | 'heartbeat'
  | 'sync'
  | 'history.request'
  | 'supervisor.command'
  | 'supervisor.cancel'
  | 'supervisor.clear_context'
  | 'supervisor.list_sessions'
  | 'supervisor.create_session'
  | 'supervisor.terminate_session'
  | 'session.subscribe'
  | 'session.unsubscribe'
  | 'session.execute'
  | 'session.input'
  | 'session.resize'
  | 'session.replay'
  | 'session.cancel'
  | 'audio.request';

// Incoming message types (server → client)
export type IncomingMessageType =
  | 'connected'
  | 'auth.success'
  | 'auth.error'
  | 'pong'
  | 'heartbeat.ack'
  | 'sync.state'
  | 'history.response'
  | 'response'
  | 'error'
  | 'supervisor.output'
  | 'supervisor.user_message'
  | 'supervisor.context_cleared'
  | 'supervisor.transcription'
  | 'supervisor.voice_output'
  | 'session.created'
  | 'session.terminated'
  | 'session.subscribed'
  | 'session.output'
  | 'session.user_message'
  | 'session.transcription'
  | 'session.voice_output'
  | 'session.resized'
  | 'session.replay.data'
  | 'audio.response'
  | 'message.ack'
  | 'connection.workstation_offline'
  | 'connection.workstation_online';

export interface BaseMessage {
  type: string;
  id?: string;
}

// Connect messages
export interface ConnectMessage extends BaseMessage {
  type: 'connect';
  payload: {
    tunnel_id: string;
    auth_key: string;
    device_id: string;
    reconnect?: boolean;
  };
}

export interface ConnectedMessage extends BaseMessage {
  type: 'connected';
  payload: {
    tunnel_id: string;
    tunnel_version?: string;
    protocol_version?: string;
    restored?: boolean;
  };
}

// Auth messages
export interface AuthMessage extends BaseMessage {
  type: 'auth';
  payload: {
    auth_key: string;
    device_id: string;
  };
}

export interface AuthSuccessMessage extends BaseMessage {
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

export interface AuthErrorMessage extends BaseMessage {
  type: 'auth.error';
  payload: {
    code: string;
    message: string;
  };
}

// Heartbeat messages
export interface HeartbeatMessage extends BaseMessage {
  type: 'heartbeat';
  id: string;
  timestamp: number;
}

export interface HeartbeatAckMessage extends BaseMessage {
  type: 'heartbeat.ack';
  id: string;
  timestamp: number;
  workstation_uptime_ms: number;
}

// Sync messages
export interface SyncMessage extends BaseMessage {
  type: 'sync';
  id: string;
  lightweight?: boolean;
}

export interface SyncAvailableAgent {
  name: string;
  base_type: string;
  description?: string;
  is_alias: boolean;
}

export interface SyncWorkspace {
  name: string;
  projects: {
    name: string;
    is_git_repo?: boolean;
    default_branch?: string;
  }[];
}

export interface SyncStateMessage extends BaseMessage {
  type: 'sync.state';
  id: string;
  payload: {
    sessions: SyncSession[];
    subscriptions: string[];
    supervisorHistory?: HistoryEntry[];
    supervisorIsExecuting?: boolean;
    executingStates?: Record<string, boolean>;
    currentStreamingBlocks?: ServerContentBlock[];
    availableAgents?: SyncAvailableAgent[];
    hiddenBaseTypes?: string[];
    workspaces?: SyncWorkspace[];
  };
}

export interface SyncSession {
  session_id: string;
  session_type: SessionType;
  status: SessionStatus;
  workspace?: string;
  project?: string;
  worktree?: string;
  working_dir?: string;
  agent_name?: string;
  created_at?: string | number;
}

export interface HistoryEntry {
  message_id?: string; // Unique message ID for deduplication
  sequence: number;
  role: 'user' | 'assistant';
  content: string;
  content_blocks?: ServerContentBlock[];
  createdAt: string;
}

// Supervisor messages
export interface SupervisorCommandMessage extends BaseMessage {
  type: 'supervisor.command';
  id: string;
  payload: {
    command?: string;
    audio?: string;
    audio_format?: 'm4a' | 'wav' | 'mp3' | 'webm' | 'opus';
    message_id?: string;
  };
}

export interface SupervisorOutputMessage extends BaseMessage {
  type: 'supervisor.output';
  streaming_message_id?: string; // Stable ID for deduplication across clients
  sequence?: number; // Message sequence number for gap detection
  payload: {
    content_type: 'supervisor';
    content: string;
    content_blocks: ServerContentBlock[];
    timestamp: number;
    is_complete: boolean;
  };
}

export interface SupervisorUserMessage extends BaseMessage {
  type: 'supervisor.user_message';
  payload: {
    content: string;
    timestamp: number;
    from_device_id: string;
  };
}

// Session messages
export interface CreateSessionMessage extends BaseMessage {
  type: 'supervisor.create_session';
  id: string;
  payload: {
    session_type: SessionType;
    agent_name?: string;
    workspace: string;
    project: string;
    worktree?: string;
  };
}

export interface SessionCreatedMessage extends BaseMessage {
  type: 'session.created';
  session_id: string;
  payload: {
    session_type: SessionType;
    agent_name?: string;
    workspace?: string;
    project?: string;
    worktree?: string;
    working_dir: string;
    created_at?: string | number;
    terminal_config?: {
      buffer_size: number;
    };
  };
}

export interface SessionSubscribeMessage extends BaseMessage {
  type: 'session.subscribe';
  session_id: string;
}

export interface SessionSubscribedMessage extends BaseMessage {
  type: 'session.subscribed';
  session_id: string;
  // Fields are at root level, not in payload
  is_master?: boolean;
  cols?: number;
  rows?: number;
  is_executing?: boolean;
  history?: HistoryEntry[];
  current_streaming_blocks?: ServerContentBlock[];
  streaming_message_id?: string; // Stable ID for deduplication across clients
}

export interface SessionExecuteMessage extends BaseMessage {
  type: 'session.execute';
  id: string;
  session_id: string;
  payload: {
    content?: string;
    text?: string;
    audio?: string;
    audio_format?: 'm4a' | 'wav' | 'mp3' | 'webm' | 'opus';
    message_id?: string;
    language?: string;
    tts_enabled?: boolean;
  };
}

export interface SessionOutputMessage extends BaseMessage {
  type: 'session.output';
  session_id: string;
  streaming_message_id?: string; // Stable ID for deduplication across clients
  sequence?: number; // Message sequence number for gap detection
  payload: {
    content_type: 'agent' | 'terminal' | 'transcription';
    content: string;
    content_blocks?: ServerContentBlock[];
    timestamp: number;
    is_complete?: boolean;
    audio?: string;
  };
}

export interface SessionInputMessage extends BaseMessage {
  type: 'session.input';
  session_id: string;
  payload: {
    data: string;
  };
}

export interface SessionResizeMessage extends BaseMessage {
  type: 'session.resize';
  session_id: string;
  payload: {
    cols: number;
    rows: number;
  };
}

export interface SessionResizedMessage extends BaseMessage {
  type: 'session.resized';
  session_id: string;
  payload: {
    success: boolean;
    cols: number;
    rows: number;
    reason?: 'not_master' | 'inactive';
  };
}

export interface SessionReplayMessage extends BaseMessage {
  type: 'session.replay';
  session_id: string;
  payload: {
    since_timestamp?: number;
    since_sequence?: number;
    limit?: number;
  };
}

export interface ReplayedTerminalMessage {
  content_type: 'terminal';
  content: string;
  timestamp: number;
  sequence: number;
}

export interface SessionReplayDataMessage extends BaseMessage {
  type: 'session.replay.data';
  session_id: string;
  payload: {
    messages: ReplayedTerminalMessage[];
    has_more: boolean;
    first_sequence: number;
    last_sequence: number;
    current_sequence: number;
  };
}

// Error messages
export interface ErrorMessage extends BaseMessage {
  type: 'error';
  payload: {
    code: string;
    message: string;
    details?: unknown;
  };
}

// Message acknowledgment
export interface MessageAckMessage extends BaseMessage {
  type: 'message.ack';
  payload: {
    message_id: string;
    session_id?: string;
    status: 'received';
  };
}

// Voice output messages
export interface SupervisorVoiceOutputMessage extends BaseMessage {
  type: 'supervisor.voice_output';
  payload: {
    message_id: string;
    audio_base64: string;
    duration?: number;
    from_device_id?: string;
  };
}

export interface SessionVoiceOutputMessage extends BaseMessage {
  type: 'session.voice_output';
  session_id: string;
  payload: {
    message_id: string;
    audio_base64: string;
    duration?: number;
    from_device_id?: string;
  };
}

// Transcription messages
export interface SupervisorTranscriptionMessage extends BaseMessage {
  type: 'supervisor.transcription';
  payload: {
    message_id: string;
    transcription: string;
    from_device_id?: string;
  };
}

export interface SessionTranscriptionMessage extends BaseMessage {
  type: 'session.transcription';
  session_id: string;
  payload: {
    message_id: string;
    transcription: string;
    from_device_id?: string;
  };
}

// History request/response (v1.13 - lazy load chat history)
export interface HistoryRequestMessage extends BaseMessage {
  type: 'history.request';
  id: string;
  payload: {
    session_id?: string | null; // null or omit for supervisor
    before_sequence?: number; // For pagination - load messages before this sequence
    limit?: number; // Max messages to return (default: 20, max: 50)
  };
}

export interface HistoryResponseMessage extends BaseMessage {
  type: 'history.response';
  id: string;
  payload: {
    session_id: string | null; // null = supervisor
    history: HistoryEntry[];
    has_more: boolean; // Are there older messages?
    oldest_sequence?: number; // Sequence of oldest message in response
    newest_sequence?: number; // Sequence of newest message in response
    is_executing?: boolean; // Is currently processing?
    current_streaming_blocks?: ServerContentBlock[]; // In-progress blocks
    streaming_message_id?: string; // Stable ID for deduplication across clients
    error?: string; // Error message if failed
  };
}

// Audio request (to fetch TTS audio)
export interface AudioRequestMessage extends BaseMessage {
  type: 'audio.request';
  id: string;
  payload: {
    message_id: string;
  };
}

// Audio response (for requested TTS)
export interface AudioResponseMessage extends BaseMessage {
  type: 'audio.response';
  payload: {
    message_id: string;
    audio_base64: string;
    duration?: number;
  };
}

// Connection status
export interface WorkstationOfflineMessage extends BaseMessage {
  type: 'connection.workstation_offline';
  payload: {
    tunnel_id: string;
  };
}

export interface WorkstationOnlineMessage extends BaseMessage {
  type: 'connection.workstation_online';
  payload: {
    tunnel_id: string;
  };
}
