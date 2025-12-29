/**
 * @file schemas.ts
 * @copyright 2025 Roman Barinov <rbarinov@gmail.com>
 * @license FSL-1.1-NC
 */

import { z } from 'zod';

// ============================================================================
// Authentication Schemas
// ============================================================================

export const AuthPayloadSchema = z.object({
  auth_key: z.string().min(16, 'Auth key must be at least 16 characters'),
  device_id: z.string().min(1, 'Device ID is required'),
});

export const AuthMessageSchema = z.object({
  type: z.literal('auth'),
  payload: AuthPayloadSchema,
});

// ============================================================================
// Heartbeat Schemas
// ============================================================================

export const PingSchema = z.object({
  type: z.literal('ping'),
  timestamp: z.number(),
});

export const PongSchema = z.object({
  type: z.literal('pong'),
  timestamp: z.number(),
});

export const HeartbeatSchema = z.object({
  type: z.literal('heartbeat'),
  id: z.string(),
  timestamp: z.number(),
  device_id: z.string().optional(), // Injected by tunnel
});

// ============================================================================
// Sync Schemas
// ============================================================================

export const SyncMessageSchema = z.object({
  type: z.literal('sync'),
  id: z.string(),
  device_id: z.string().optional(), // Injected by tunnel for tunnel connections
  lightweight: z.boolean().optional(), // If true, excludes message histories (for watchOS)
});

// ============================================================================
// History Request Schemas (for lazy loading chat history)
// ============================================================================

export const HistoryRequestPayloadSchema = z.object({
  session_id: z.string().nullable().optional(),
  before_sequence: z.number().int().optional(),
  limit: z.number().int().min(1).max(50).optional(),
});

export const HistoryRequestSchema = z.object({
  type: z.literal('history.request'),
  id: z.string(),
  device_id: z.string().optional(), // Injected by tunnel for tunnel connections
  payload: HistoryRequestPayloadSchema.optional(),
});

// ============================================================================
// Supervisor Schemas
// ============================================================================

export const ListSessionsSchema = z.object({
  type: z.literal('supervisor.list_sessions'),
  id: z.string(),
  device_id: z.string().optional(), // Injected by tunnel for tunnel connections
});

export const CreateSessionPayloadSchema = z.object({
  session_type: z.enum(['cursor', 'claude', 'opencode', 'terminal']),
  agent_name: z.string().optional(), // Custom alias name (e.g., 'zai' for claude with custom config)
  workspace: z.string().min(1, 'Workspace is required'),
  project: z.string().min(1, 'Project is required'),
  worktree: z.string().optional(),
});

export const CreateSessionSchema = z.object({
  type: z.literal('supervisor.create_session'),
  id: z.string(),
  device_id: z.string().optional(), // Injected by tunnel for tunnel connections
  payload: CreateSessionPayloadSchema,
});

export const TerminateSessionPayloadSchema = z.object({
  session_id: z.string().min(1, 'Session ID is required'),
});

export const TerminateSessionSchema = z.object({
  type: z.literal('supervisor.terminate_session'),
  id: z.string(),
  device_id: z.string().optional(), // Injected by tunnel for tunnel connections
  payload: TerminateSessionPayloadSchema,
});

export const SupervisorCommandPayloadSchema = z.object({
  command: z.string().optional(),
  audio: z.string().optional(),
  audio_format: z.enum(['m4a', 'wav', 'mp3', 'webm', 'opus']).optional(),
  message_id: z.string().optional(),
  language: z.string().optional(),
}).refine(
  (data) => data.command !== undefined || data.audio !== undefined,
  { message: 'Either command or audio must be provided' }
);

export const SupervisorCommandSchema = z.object({
  type: z.literal('supervisor.command'),
  id: z.string(),
  device_id: z.string().optional(), // Injected by tunnel for tunnel connections
  payload: SupervisorCommandPayloadSchema,
});

export const SupervisorClearContextSchema = z.object({
  type: z.literal('supervisor.clear_context'),
  id: z.string(),
  device_id: z.string().optional(), // Injected by tunnel for tunnel connections
});

export const SupervisorCancelSchema = z.object({
  type: z.literal('supervisor.cancel'),
  id: z.string(),
  device_id: z.string().optional(), // Injected by tunnel for tunnel connections
});

// ============================================================================
// Session Subscription Schemas
// ============================================================================

export const SessionSubscribeSchema = z.object({
  type: z.literal('session.subscribe'),
  session_id: z.string(),
  device_id: z.string().optional(), // Injected by tunnel for tunnel connections
});

export const SessionUnsubscribeSchema = z.object({
  type: z.literal('session.unsubscribe'),
  session_id: z.string(),
  device_id: z.string().optional(), // Injected by tunnel for tunnel connections
});

// ============================================================================
// Session Command Schemas
// ============================================================================

export const SessionExecutePayloadSchema = z.object({
  content: z.string().optional(), // Primary field for text content
  text: z.string().optional(),    // Alias for content (backward compat)
  audio: z.string().optional(),
  audio_format: z.enum(['m4a', 'wav', 'mp3', 'webm', 'opus']).optional(),
  message_id: z.string().optional(), // For linking transcription back to voice message
  language: z.string().optional(),
  tts_enabled: z.boolean().optional(),
}).refine(
  (data) => data.content !== undefined || data.text !== undefined || data.audio !== undefined,
  { message: 'Either content, text, or audio must be provided' }
);

export const SessionExecuteSchema = z.object({
  type: z.literal('session.execute'),
  id: z.string(),
  session_id: z.string(),
  device_id: z.string().optional(), // Injected by tunnel for tunnel connections
  payload: SessionExecutePayloadSchema,
});

export const SessionCancelSchema = z.object({
  type: z.literal('session.cancel'),
  id: z.string(),
  session_id: z.string(),
  device_id: z.string().optional(), // Injected by tunnel for tunnel connections
});

export const SessionInputPayloadSchema = z.object({
  data: z.string(),
});

export const SessionInputSchema = z.object({
  type: z.literal('session.input'),
  session_id: z.string(),
  device_id: z.string().optional(), // Injected by tunnel for tunnel connections
  payload: SessionInputPayloadSchema,
});

export const SessionResizePayloadSchema = z.object({
  cols: z.number().int().min(1),
  rows: z.number().int().min(1),
});

export const SessionResizeSchema = z.object({
  type: z.literal('session.resize'),
  session_id: z.string(),
  device_id: z.string().optional(), // Injected by tunnel for tunnel connections
  payload: SessionResizePayloadSchema,
});

export const SessionReplayPayloadSchema = z.object({
  since_timestamp: z.number().optional(),
  since_sequence: z.number().int().optional(),
  limit: z.number().int().min(1).max(1000).optional(),
});

export const SessionReplaySchema = z.object({
  type: z.literal('session.replay'),
  session_id: z.string(),
  device_id: z.string().optional(), // Injected by tunnel for tunnel connections
  payload: SessionReplayPayloadSchema,
});

// ============================================================================
// Audio Request Schemas
// ============================================================================

export const AudioRequestPayloadSchema = z.object({
  message_id: z.string().min(1, 'Message ID is required'),
  type: z.enum(['input', 'output']).optional(), // Default: 'output'
});

export const AudioRequestSchema = z.object({
  type: z.literal('audio.request'),
  id: z.string(),
  device_id: z.string().optional(), // Injected by tunnel for tunnel connections
  payload: AudioRequestPayloadSchema,
});

// ============================================================================
// Base Message Schema
// ============================================================================

export const BaseMessageSchema = z.object({
  type: z.string(),
});

// ============================================================================
// Combined Schemas
// ============================================================================

export const IncomingClientMessageSchema = z.discriminatedUnion('type', [
  AuthMessageSchema,
  PingSchema,
  HeartbeatSchema,
  SyncMessageSchema,
  HistoryRequestSchema,
  ListSessionsSchema,
  CreateSessionSchema,
  TerminateSessionSchema,
  SupervisorCommandSchema,
  SupervisorCancelSchema,
  SupervisorClearContextSchema,
  SessionSubscribeSchema,
  SessionUnsubscribeSchema,
  SessionExecuteSchema,
  SessionCancelSchema,
  SessionInputSchema,
  SessionResizeSchema,
  SessionReplaySchema,
  AudioRequestSchema,
]);

// ============================================================================
// Tunnel Message Schemas
// ============================================================================

export const WorkstationRegisteredPayloadSchema = z.object({
  tunnel_id: z.string(),
  public_url: z.string(),
  restored: z.boolean().optional(),
});

export const WorkstationRegisteredSchema = z.object({
  type: z.literal('workstation.registered'),
  payload: WorkstationRegisteredPayloadSchema,
});

export const TunnelErrorPayloadSchema = z.object({
  code: z.string(),
  message: z.string(),
  details: z.unknown().optional(),
});

export const TunnelErrorSchema = z.object({
  type: z.literal('error'),
  id: z.string().optional(),
  payload: TunnelErrorPayloadSchema,
});

export const ClientDisconnectedPayloadSchema = z.object({
  device_id: z.string(),
  tunnel_id: z.string(),
});

export const ClientDisconnectedSchema = z.object({
  type: z.literal('client.disconnected'),
  payload: ClientDisconnectedPayloadSchema,
});

export const IncomingTunnelMessageSchema = z.discriminatedUnion('type', [
  WorkstationRegisteredSchema,
  PongSchema,
  TunnelErrorSchema,
  ClientDisconnectedSchema,
]);

// ============================================================================
// Type Exports
// ============================================================================

export type AuthPayload = z.infer<typeof AuthPayloadSchema>;
export type CreateSessionPayload = z.infer<typeof CreateSessionPayloadSchema>;
export type TerminateSessionPayload = z.infer<typeof TerminateSessionPayloadSchema>;
export type SupervisorCommandPayload = z.infer<typeof SupervisorCommandPayloadSchema>;
export type SessionExecutePayload = z.infer<typeof SessionExecutePayloadSchema>;
export type SessionInputPayload = z.infer<typeof SessionInputPayloadSchema>;
export type SessionResizePayload = z.infer<typeof SessionResizePayloadSchema>;
export type SessionReplayPayload = z.infer<typeof SessionReplayPayloadSchema>;
export type AudioRequestPayload = z.infer<typeof AudioRequestPayloadSchema>;
export type HistoryRequestPayload = z.infer<typeof HistoryRequestPayloadSchema>;

// ============================================================================
// Validation Helpers
// ============================================================================

/**
 * Safely parses a client message and returns the result.
 * Returns undefined if parsing fails.
 */
export function parseClientMessage(data: unknown) {
  const result = IncomingClientMessageSchema.safeParse(data);
  if (result.success) {
    return result.data;
  }
  return undefined;
}

export type ParseClientMessageResult =
  | { success: true; data: z.infer<typeof IncomingClientMessageSchema> }
  | { success: false; errors: z.ZodIssue[] };

export function parseClientMessageWithErrors(data: unknown): ParseClientMessageResult {
  const result = IncomingClientMessageSchema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, errors: result.error.issues };
}

/**
 * Safely parses a tunnel message and returns the result.
 * Returns undefined if parsing fails.
 */
export function parseTunnelMessage(data: unknown) {
  const result = IncomingTunnelMessageSchema.safeParse(data);
  if (result.success) {
    return result.data;
  }
  return undefined;
}

/**
 * Checks if the message is a known type without full validation.
 * Useful for routing messages before detailed parsing.
 */
export function getMessageType(data: unknown): string | undefined {
  const result = BaseMessageSchema.safeParse(data);
  if (result.success) {
    return result.data.type;
  }
  return undefined;
}

