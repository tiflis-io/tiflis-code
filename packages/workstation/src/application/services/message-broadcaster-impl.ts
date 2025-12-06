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
   * Sends the message once to the tunnel, which forwards it to all clients.
   */
  broadcastToAll(message: string): void {
    const clients = this.deps.clientRegistry.getAll();
    const authenticatedCount = clients.filter((c) => c.isAuthenticated).length;

    this.logger.info(
      { totalClients: clients.length, authenticatedClients: authenticatedCount, messagePreview: message.slice(0, 100) },
      'broadcastToAll called'
    );

    if (authenticatedCount > 0) {
      // Send once to tunnel - it will forward to all connected clients
      const sent = this.deps.tunnelClient.send(message);
      this.logger.info({ sent, authenticatedClients: authenticatedCount }, 'Broadcast to all - message sent');
    } else {
      this.logger.warn({ totalClients: clients.length }, 'broadcastToAll - no authenticated clients, message not sent');
    }
  }

  /**
   * Broadcasts a message to all clients subscribed to a session.
   * Note: This method is currently unused. Use broadcastToSubscribers instead.
   */
  broadcastToSession(sessionId: SessionId, message: string): void {
    const subscribers = this.deps.clientRegistry.getSubscribers(sessionId);
    const authenticatedCount = subscribers.filter((c) => c.isAuthenticated).length;

    if (authenticatedCount > 0) {
      // Send once to tunnel - it will forward to all connected clients
      // Note: This sends to ALL clients, not just session subscribers.
      // For proper session routing, use broadcastToSubscribers instead.
      const sent = this.deps.tunnelClient.send(message);
      this.logger.debug(
        { sessionId: sessionId.value, sent, authenticatedSubscribers: authenticatedCount },
        'Broadcast to session'
      );
    }
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

