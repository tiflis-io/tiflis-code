/**
 * @file schemas.ts
 * @copyright 2025 Roman Barinov <rbarinov@gmail.com>
 * @license FSL-1.1-NC
 */

import { z } from 'zod';

// ============================================================================
// Workstation Schemas
// ============================================================================

export const WorkstationRegisterPayloadSchema = z.object({
  api_key: z.string().min(32, 'API key must be at least 32 characters'),
  name: z.string().min(1, 'Workstation name is required'),
  auth_key: z.string().min(16, 'Auth key must be at least 16 characters'),
  reconnect: z.boolean().optional(),
  previous_tunnel_id: z.string().optional(),
});

export const WorkstationRegisterSchema = z.object({
  type: z.literal('workstation.register'),
  payload: WorkstationRegisterPayloadSchema,
});

// ============================================================================
// Mobile Client Schemas
// ============================================================================

export const ConnectPayloadSchema = z.object({
  tunnel_id: z.string().min(1, 'Tunnel ID is required'),
  auth_key: z.string().min(16, 'Auth key must be at least 16 characters'),
  device_id: z.string().min(1, 'Device ID is required'),
  reconnect: z.boolean().optional(),
});

export const ConnectSchema = z.object({
  type: z.literal('connect'),
  payload: ConnectPayloadSchema,
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
// Targeted Forwarding Schemas
// ============================================================================

export const ForwardToDeviceSchema = z.object({
  type: z.literal('forward.to_device'),
  device_id: z.string().min(1, 'Device ID is required'),
  payload: z.string(),
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

export const IncomingMessageSchema = z.discriminatedUnion('type', [
  WorkstationRegisterSchema,
  ConnectSchema,
  PingSchema,
]);

// ============================================================================
// Type Exports
// ============================================================================

export type WorkstationRegisterPayload = z.infer<typeof WorkstationRegisterPayloadSchema>;
export type ConnectPayload = z.infer<typeof ConnectPayloadSchema>;

// ============================================================================
// Validation Helper
// ============================================================================

/**
 * Safely parses a message and returns the result.
 * Returns undefined if parsing fails.
 */
export function parseMessage(data: unknown): z.infer<typeof IncomingMessageSchema> | undefined {
  const result = IncomingMessageSchema.safeParse(data);
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

