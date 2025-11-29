/**
 * @file client-registry.ts
 * @copyright 2025 Roman Barinov <rbarinov@gmail.com>
 * @license MIT
 */

import type { MobileClient } from '../entities/mobile-client.js';
import type { TunnelId } from '../value-objects/tunnel-id.js';

/**
 * Port (interface) for mobile client registry.
 * Manages the collection of connected mobile clients.
 */
export interface ClientRegistry {
  /**
   * Registers a new mobile client.
   */
  register(client: MobileClient): void;

  /**
   * Removes a client from the registry by device ID.
   */
  unregister(deviceId: string): boolean;

  /**
   * Retrieves a client by device ID.
   */
  get(deviceId: string): MobileClient | undefined;

  /**
   * Checks if a device ID is already registered.
   */
  has(deviceId: string): boolean;

  /**
   * Returns all clients connected to a specific tunnel.
   */
  getByTunnelId(tunnelId: TunnelId): MobileClient[];

  /**
   * Returns all connected clients.
   */
  getAll(): MobileClient[];

  /**
   * Returns the count of connected clients.
   */
  count(): number;

  /**
   * Finds clients that have timed out.
   */
  findTimedOut(timeoutMs: number): MobileClient[];
}

