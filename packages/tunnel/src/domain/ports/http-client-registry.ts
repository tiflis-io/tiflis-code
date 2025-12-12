/**
 * @file http-client-registry.ts
 * @copyright 2025 Roman Barinov <rbarinov@gmail.com>
 * @license FSL-1.1-NC
 */

import type { HttpClient } from '../entities/http-client.js';
import type { TunnelId } from '../value-objects/tunnel-id.js';

/**
 * Port (interface) for HTTP polling client registry.
 * Manages the collection of HTTP polling clients (watchOS).
 */
export interface HttpClientRegistry {
  /**
   * Registers a new HTTP client.
   */
  register(client: HttpClient): void;

  /**
   * Removes a client from the registry by device ID.
   */
  unregister(deviceId: string): boolean;

  /**
   * Retrieves a client by device ID.
   */
  get(deviceId: string): HttpClient | undefined;

  /**
   * Checks if a device ID is already registered.
   */
  has(deviceId: string): boolean;

  /**
   * Returns all clients connected to a specific tunnel.
   */
  getByTunnelId(tunnelId: TunnelId): HttpClient[];

  /**
   * Returns all connected clients.
   */
  getAll(): HttpClient[];

  /**
   * Returns the count of connected clients.
   */
  count(): number;

  /**
   * Finds clients that have timed out.
   */
  findTimedOut(timeoutMs: number): HttpClient[];
}
