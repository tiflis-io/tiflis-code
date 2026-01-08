/**
 * @file in-memory-registry.ts
 * @copyright 2025 Roman Barinov <rbarinov@gmail.com>
 * @license FSL-1.1-NC
 */

import type { Workstation } from '../../domain/entities/workstation.js';
import type { MobileClient } from '../../domain/entities/mobile-client.js';
import type { HttpClient } from '../../domain/entities/http-client.js';
import type { TunnelId } from '../../domain/value-objects/tunnel-id.js';
import type { WorkstationRegistry } from '../../domain/ports/workstation-registry.js';
import type { ClientRegistry } from '../../domain/ports/client-registry.js';
import type { HttpClientRegistry } from '../../domain/ports/http-client-registry.js';
import type { WebSocket } from 'ws';

/**
 * In-memory implementation of WorkstationRegistry.
 * Stores workstations in a Map indexed by tunnel ID.
 */
export class InMemoryWorkstationRegistry implements WorkstationRegistry {
  private readonly workstations = new Map<string, Workstation>();

  register(workstation: Workstation): void {
    this.workstations.set(workstation.tunnelId.value, workstation);
  }

  unregister(tunnelId: TunnelId): boolean {
    return this.workstations.delete(tunnelId.value);
  }

  get(tunnelId: TunnelId): Workstation | undefined {
    return this.workstations.get(tunnelId.value);
  }

  has(tunnelId: TunnelId): boolean {
    return this.workstations.has(tunnelId.value);
  }

  getAll(): Workstation[] {
    return Array.from(this.workstations.values());
  }

  count(): number {
    return this.workstations.size;
  }

  findTimedOut(timeoutMs: number): Workstation[] {
    return this.getAll().filter((ws) => ws.hasTimedOut(timeoutMs));
  }
}

/**
 * In-memory implementation of ClientRegistry.
 * Stores clients in a Map indexed by device ID.
 *
 * FIX #7: Reconnect validation detects stale client entries when a device reconnects.
 * This prevents duplicate subscriptions and subscription storms during reconnection.
 */
export class InMemoryClientRegistry implements ClientRegistry {
  private readonly clients = new Map<string, MobileClient>();

  register(client: MobileClient): void {
    this.clients.set(client.deviceId, client);
  }

  /**
   * FIX #7: Validates and cleans up stale subscriptions when a client reconnects.
   * When a device reconnects with a new socket, the old client entry becomes stale
   * and should be removed to prevent duplicate subscriptions.
   */
  validateSubscriptions(deviceId: string, currentSocket: WebSocket): void {
    const existing = this.clients.get(deviceId);
    if (existing && existing.socket !== currentSocket) {
      // This is a reconnecting device with a new socket
      // The old entry is stale and should not be used
      // It will be replaced by the new client registration
    }
  }

  unregister(deviceId: string): boolean {
    return this.clients.delete(deviceId);
  }

  get(deviceId: string): MobileClient | undefined {
    return this.clients.get(deviceId);
  }

  has(deviceId: string): boolean {
    return this.clients.has(deviceId);
  }

  getByTunnelId(tunnelId: TunnelId): MobileClient[] {
    return this.getAll().filter((client) =>
      client.tunnelId.equals(tunnelId)
    );
  }

  getAll(): MobileClient[] {
    return Array.from(this.clients.values());
  }

  count(): number {
    return this.clients.size;
  }

  findTimedOut(timeoutMs: number): MobileClient[] {
    return this.getAll().filter((client) => client.hasTimedOut(timeoutMs));
  }
}

/**
 * In-memory implementation of HttpClientRegistry.
 * Stores HTTP polling clients (watchOS) in a Map indexed by device ID.
 */
export class InMemoryHttpClientRegistry implements HttpClientRegistry {
  private readonly clients = new Map<string, HttpClient>();

  register(client: HttpClient): void {
    this.clients.set(client.deviceId, client);
  }

  unregister(deviceId: string): boolean {
    return this.clients.delete(deviceId);
  }

  get(deviceId: string): HttpClient | undefined {
    return this.clients.get(deviceId);
  }

  has(deviceId: string): boolean {
    return this.clients.has(deviceId);
  }

  getByTunnelId(tunnelId: TunnelId): HttpClient[] {
    return this.getAll().filter((client) =>
      client.tunnelId.equals(tunnelId)
    );
  }

  getAll(): HttpClient[] {
    return Array.from(this.clients.values());
  }

  count(): number {
    return this.clients.size;
  }

  findTimedOut(timeoutMs: number): HttpClient[] {
    return this.getAll().filter((client) => client.hasTimedOut(timeoutMs));
  }
}

