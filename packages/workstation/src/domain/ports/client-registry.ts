/**
 * @file client-registry.ts
 * @copyright 2025 Roman Barinov <rbarinov@gmail.com>
 * @license MIT
 */

import type { WebSocket } from 'ws';
import type { Client } from '../entities/client.js';
import type { DeviceId } from '../value-objects/device-id.js';
import type { SessionId } from '../value-objects/session-id.js';

/**
 * Port for client registry operations.
 */
export interface ClientRegistry {
  /**
   * Registers a new client.
   */
  register(deviceId: DeviceId, socket: WebSocket): Client;

  /**
   * Gets a client by device ID.
   */
  getByDeviceId(deviceId: DeviceId): Client | undefined;

  /**
   * Gets a client by WebSocket connection.
   */
  getBySocket(socket: WebSocket): Client | undefined;

  /**
   * Removes a client.
   */
  remove(deviceId: DeviceId): boolean;

  /**
   * Gets all connected clients.
   */
  getAll(): Client[];

  /**
   * Gets all clients subscribed to a session.
   */
  getSubscribers(sessionId: SessionId): Client[];

  /**
   * Gets the total count of connected clients.
   */
  count(): number;

  /**
   * Gets the count of authenticated clients.
   */
  countAuthenticated(): number;
}

