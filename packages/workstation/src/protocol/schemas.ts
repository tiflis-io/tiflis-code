/**
 * @file schemas.ts
 * @copyright 2025 Roman Barinov <rbarinov@gmail.com>
 * @license MIT
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

// ============================================================================
// Sync Schemas
// ============================================================================

export const SyncMessageSchema = z.object({
  type: z.literal('sync'),
  id: z.string(),
});

// ============================================================================
// Supervisor Schemas
// ============================================================================

export const ListSessionsSchema = z.object({
  type: z.literal('supervisor.list_sessions'),
  id: z.string(),
});

export const CreateSessionPayloadSchema = z.object({
  session_type: z.enum(['cursor', 'claude', 'opencode', 'terminal']),
  workspace: z.string().min(1, 'Workspace is required'),
  project: z.string().min(1, 'Project is required'),
  worktree: z.string().optional(),
});

export const CreateSessionSchema = z.object({
  type: z.literal('supervisor.create_session'),
  id: z.string(),
  payload: CreateSessionPayloadSchema,
});

export const TerminateSessionPayloadSchema = z.object({
  session_id: z.string().min(1, 'Session ID is required'),
});

export const TerminateSessionSchema = z.object({
  type: z.literal('supervisor.terminate_session'),
  id: z.string(),
  payload: TerminateSessionPayloadSchema,
});

// ============================================================================
// Session Subscription Schemas
// ============================================================================

export const SessionSubscribeSchema = z.object({
  type: z.literal('session.subscribe'),
  session_id: z.string(),
});

export const SessionUnsubscribeSchema = z.object({
  type: z.literal('session.unsubscribe'),
  session_id: z.string(),
});

// ============================================================================
// Session Command Schemas
// ============================================================================

export const SessionExecutePayloadSchema = z.object({
  text: z.string().optional(),
  audio: z.string().optional(),
  audio_format: z.enum(['m4a', 'wav', 'mp3']).optional(),
  language: z.string().optional(),
  tts_enabled: z.boolean().optional(),
}).refine(
  (data) => data.text !== undefined || data.audio !== undefined,
  { message: 'Either text or audio must be provided' }
);

export const SessionExecuteSchema = z.object({
  type: z.literal('session.execute'),
  id: z.string(),
  session_id: z.string(),
  payload: SessionExecutePayloadSchema,
});

export const SessionInputPayloadSchema = z.object({
  data: z.string(),
});

export const SessionInputSchema = z.object({
  type: z.literal('session.input'),
  session_id: z.string(),
  payload: SessionInputPayloadSchema,
});

export const SessionResizePayloadSchema = z.object({
  cols: z.number().int().min(1),
  rows: z.number().int().min(1),
});

export const SessionResizeSchema = z.object({
  type: z.literal('session.resize'),
  session_id: z.string(),
  payload: SessionResizePayloadSchema,
});

export const SessionReplayPayloadSchema = z.object({
  since_timestamp: z.number(),
  limit: z.number().int().min(1).max(1000).optional(),
});

export const SessionReplaySchema = z.object({
  type: z.literal('session.replay'),
  session_id: z.string(),
  payload: SessionReplayPayloadSchema,
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
  SyncMessageSchema,
  ListSessionsSchema,
  CreateSessionSchema,
  TerminateSessionSchema,
  SessionSubscribeSchema,
  SessionUnsubscribeSchema,
  SessionExecuteSchema,
  SessionInputSchema,
  SessionResizeSchema,
  SessionReplaySchema,
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

export const IncomingTunnelMessageSchema = z.discriminatedUnion('type', [
  WorkstationRegisteredSchema,
  PongSchema,
  TunnelErrorSchema,
]);

// ============================================================================
// Type Exports
// ============================================================================

export type AuthPayload = z.infer<typeof AuthPayloadSchema>;
export type CreateSessionPayload = z.infer<typeof CreateSessionPayloadSchema>;
export type TerminateSessionPayload = z.infer<typeof TerminateSessionPayloadSchema>;
export type SessionExecutePayload = z.infer<typeof SessionExecutePayloadSchema>;
export type SessionInputPayload = z.infer<typeof SessionInputPayloadSchema>;
export type SessionResizePayload = z.infer<typeof SessionResizePayloadSchema>;
export type SessionReplayPayload = z.infer<typeof SessionReplayPayloadSchema>;

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

