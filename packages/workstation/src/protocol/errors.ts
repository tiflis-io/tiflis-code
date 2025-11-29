/**
 * @file errors.ts
 * @copyright 2025 Roman Barinov <rbarinov@gmail.com>
 * @license MIT
 */

/**
 * Protocol error codes.
 */
export type ErrorCode =
  | 'INVALID_AUTH_KEY'
  | 'SESSION_NOT_FOUND'
  | 'SESSION_BUSY'
  | 'INVALID_PAYLOAD'
  | 'INTERNAL_ERROR'
  | 'WORKSPACE_NOT_FOUND'
  | 'PROJECT_NOT_FOUND'
  | 'SESSION_LIMIT_REACHED'
  | 'SESSION_CREATION_FAILED'
  | 'AGENT_COMMAND_FAILED'
  | 'NOT_SUBSCRIBED'
  | 'TUNNEL_NOT_CONNECTED';

