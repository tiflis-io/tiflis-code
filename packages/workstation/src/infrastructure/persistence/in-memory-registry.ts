/**
 * @file in-memory-registry.ts
 * @copyright 2025 Roman Barinov <rbarinov@gmail.com>
 * @license MIT
 */

import type { WebSocket } from 'ws';
import type { ClientRegistry } from '../../domain/ports/client-registry.js';
import { Client } from '../../domain/entities/client.js';
import type { DeviceId } from '../../domain/value-objects/device-id.js';
import type { SessionId } from '../../domain/value-objects/session-id.js';

/**
 * In-memory implementation of the client registry.
 */
export class InMemoryClientRegistry implements ClientRegistry {
  private readonly clients = new Map<string, Client>();
  private readonly socketToDevice = new Map<WebSocket, string>();

  register(deviceId: DeviceId, socket: WebSocket): Client {
    // Check if client already exists (reconnection)
    const existing = this.clients.get(deviceId.value);
    if (existing) {
      if (existing.isTunnelConnection) {
        // Cannot convert tunnel connection to direct connection
        throw new Error('Cannot update tunnel connection with direct socket');
      }
      existing.updateSocket(socket);
      this.socketToDevice.set(socket, deviceId.value);
      return existing;
    }

    const client = new Client({ deviceId, socket });
    this.clients.set(deviceId.value, client);
    this.socketToDevice.set(socket, deviceId.value);
    return client;
  }

  registerTunnel(deviceId: DeviceId): Client {
    // Check if client already exists (reconnection)
    const existing = this.clients.get(deviceId.value);
    if (existing) {
      // For tunnel connections, we just return the existing client
      // (no socket to update)
      return existing;
    }

    const client = new Client({ deviceId }); // No socket for tunnel connections
    this.clients.set(deviceId.value, client);
    return client;
  }

  getByDeviceId(deviceId: DeviceId): Client | undefined {
    return this.clients.get(deviceId.value);
  }

  getBySocket(socket: WebSocket): Client | undefined {
    const deviceId = this.socketToDevice.get(socket);
    if (!deviceId) {
      return undefined;
    }
    return this.clients.get(deviceId);
  }

  remove(deviceId: DeviceId): boolean {
    const client = this.clients.get(deviceId.value);
    if (!client) {
      return false;
    }

    // Only delete from socket map if it's a direct connection
    if (client.socket) {
      this.socketToDevice.delete(client.socket);
    }
    this.clients.delete(deviceId.value);
    return true;
  }

  getAll(): Client[] {
    return Array.from(this.clients.values());
  }

  getSubscribers(sessionId: SessionId): Client[] {
    return Array.from(this.clients.values()).filter((client) =>
      client.isSubscribedTo(sessionId)
    );
  }

  count(): number {
    return this.clients.size;
  }

  countAuthenticated(): number {
    return Array.from(this.clients.values()).filter((c) => c.isAuthenticated).length;
  }
}

