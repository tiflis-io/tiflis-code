/**
 * @file message-broadcaster.ts
 * @copyright 2025 Roman Barinov <rbarinov@gmail.com>
 * @license FSL-1.1-NC
 */

import type { SessionId } from '../value-objects/session-id.js';

/**
 * Port for broadcasting messages to clients.
 */
export interface MessageBroadcaster {
  /**
   * Broadcasts a message to all connected and authenticated clients.
   */
  broadcastToAll(message: string): void;

  /**
   * Broadcasts a message to all clients subscribed to a session.
   */
  broadcastToSession(sessionId: SessionId, message: string): void;

  /**
   * Broadcasts a message to all subscribers of a session by session ID string.
   * Uses parallel sends with timeout to prevent slow clients from blocking others.
   */
  broadcastToSubscribers(sessionId: string, message: string): Promise<void>;

  /**
   * Sends a message to a specific client by device ID.
   */
  sendToClient(deviceId: string, message: string): boolean;
}

