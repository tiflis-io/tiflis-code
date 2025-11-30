/**
 * @file message-broadcaster-impl.ts
 * @copyright 2025 Roman Barinov <rbarinov@gmail.com>
 * @license MIT
 */

import type { Logger } from 'pino';
import type { ClientRegistry } from '../../domain/ports/client-registry.js';
import type { MessageBroadcaster } from '../../domain/ports/message-broadcaster.js';
import type { TunnelClient } from '../../infrastructure/websocket/tunnel-client.js';
import type { SessionId } from '../../domain/value-objects/session-id.js';
import { DeviceId } from '../../domain/value-objects/device-id.js';

export interface MessageBroadcasterImplDeps {
  clientRegistry: ClientRegistry;
  tunnelClient: TunnelClient;
  logger: Logger;
}

/**
 * Implementation of message broadcaster using tunnel client.
 */
export class MessageBroadcasterImpl implements MessageBroadcaster {
  private readonly deps: MessageBroadcasterImplDeps;
  private readonly logger: Logger;

  constructor(deps: MessageBroadcasterImplDeps) {
    this.deps = deps;
    this.logger = deps.logger.child({ service: 'broadcaster' });
  }

  /**
   * Broadcasts a message to all connected and authenticated clients.
   */
  broadcastToAll(message: string): void {
    const clients = this.deps.clientRegistry.getAll();
    let sent = 0;

    for (const client of clients) {
      if (client.isAuthenticated) {
        if (this.deps.tunnelClient.send(message)) {
          sent++;
        }
      }
    }

    this.logger.debug({ sent, total: clients.length }, 'Broadcast to all');
  }

  /**
   * Broadcasts a message to all clients subscribed to a session.
   */
  broadcastToSession(sessionId: SessionId, message: string): void {
    const subscribers = this.deps.clientRegistry.getSubscribers(sessionId);
    let sent = 0;

    for (const client of subscribers) {
      if (client.isAuthenticated) {
        if (this.deps.tunnelClient.send(message)) {
          sent++;
        }
      }
    }

    this.logger.debug(
      { sessionId: sessionId.value, sent, subscribers: subscribers.length },
      'Broadcast to session'
    );
  }

  /**
   * Sends a message to a specific client by device ID.
   */
  sendToClient(deviceId: string, message: string): boolean {
    const device = new DeviceId(deviceId);
    const client = this.deps.clientRegistry.getByDeviceId(device);

    if (!client?.isAuthenticated) {
      return false;
    }

    return this.deps.tunnelClient.send(message);
  }

  /**
   * Broadcasts a message to all clients subscribed to a session (by session ID string).
   */
  broadcastToSubscribers(sessionId: string, message: string): void {
    // Send through tunnel client for remote clients
    // The tunnel server will route to appropriate mobile clients
    this.deps.tunnelClient.sendSessionOutput(sessionId, message);
  }
}

