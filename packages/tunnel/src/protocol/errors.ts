/**
 * @file errors.ts
 * @copyright 2025 Roman Barinov <rbarinov@gmail.com>
 * @license MIT
 */

import type { ErrorCode, ErrorMessage } from './messages.js';

/**
 * Creates an error message in the protocol format.
 */
export function createErrorMessage(
  code: ErrorCode,
  message: string,
  requestId?: string,
  details?: unknown
): ErrorMessage {
  const result: ErrorMessage = {
    type: 'error',
    payload: {
      code,
      message,
    },
  };

  if (requestId) {
    result.id = requestId;
  }

  if (details !== undefined) {
    result.payload.details = details;
  }

  return result;
}

/**
 * Predefined error message factories for common error scenarios.
 */
export const ProtocolErrors = {
  invalidApiKey: (requestId?: string) =>
    createErrorMessage('INVALID_API_KEY', 'Invalid API key for workstation registration', requestId),

  invalidAuthKey: (requestId?: string) =>
    createErrorMessage('INVALID_AUTH_KEY', 'Invalid authentication key', requestId),

  tunnelNotFound: (tunnelId: string, requestId?: string) =>
    createErrorMessage('TUNNEL_NOT_FOUND', `Tunnel not found: ${tunnelId}`, requestId),

  workstationOffline: (tunnelId: string, requestId?: string) =>
    createErrorMessage('WORKSTATION_OFFLINE', `Workstation is offline: ${tunnelId}`, requestId),

  registrationFailed: (reason: string, requestId?: string) =>
    createErrorMessage('REGISTRATION_FAILED', `Workstation registration failed: ${reason}`, requestId),

  invalidPayload: (message: string, requestId?: string, details?: unknown) =>
    createErrorMessage('INVALID_PAYLOAD', message, requestId, details),

  internalError: (message = 'An internal error occurred', requestId?: string) =>
    createErrorMessage('INTERNAL_ERROR', message, requestId),
} as const;

