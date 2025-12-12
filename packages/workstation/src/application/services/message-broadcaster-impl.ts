/**
 * @file message-broadcaster-impl.ts
 * @copyright 2025 Roman Barinov <rbarinov@gmail.com>
 * @license FSL-1.1-NC
 */

import type { Logger } from "pino";
import type { ClientRegistry } from "../../domain/ports/client-registry.js";
import type { MessageBroadcaster } from "../../domain/ports/message-broadcaster.js";
import type { TunnelClient } from "../../infrastructure/websocket/tunnel-client.js";
import type { SessionId } from "../../domain/value-objects/session-id.js";
import { DeviceId } from "../../domain/value-objects/device-id.js";
import { SessionId as SessionIdClass } from "../../domain/value-objects/session-id.js";

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
    this.logger = deps.logger.child({ service: "broadcaster" });
  }

  /**
   * Broadcasts a message to all connected clients via tunnel.
   * The tunnel handles client filtering and delivery.
   *
   * Note: We always send to tunnel regardless of workstation's client registry state,
   * because after workstation restart the registry is empty but clients may still be
   * connected to the tunnel and will re-authenticate soon.
   */
  broadcastToAll(message: string): void {
    const clients = this.deps.clientRegistry.getAll();
    const authenticatedCount = clients.filter((c) => c.isAuthenticated).length;

    this.logger.info(
      {
        totalClients: clients.length,
        authenticatedClients: authenticatedCount,
        messagePreview: message.slice(0, 100),
      },
      "broadcastToAll called"
    );

    // Always send to tunnel - it knows about all connected clients
    // The tunnel will forward to all clients registered with this workstation's tunnel_id
    const sent = this.deps.tunnelClient.send(message);
    this.logger.info(
      { sent, authenticatedClients: authenticatedCount },
      "Broadcast to all - message sent to tunnel"
    );
  }

  /**
   * Broadcasts a message to all clients subscribed to a session.
   * Note: This method is currently unused. Use broadcastToSubscribers instead.
   */
  broadcastToSession(sessionId: SessionId, message: string): void {
    const subscribers = this.deps.clientRegistry.getSubscribers(sessionId);
    const authenticatedCount = subscribers.filter(
      (c) => c.isAuthenticated
    ).length;

    if (authenticatedCount > 0) {
      // Send once to tunnel - it will forward to all connected clients
      // Note: This sends to ALL clients, not just session subscribers.
      // For proper session routing, use broadcastToSubscribers instead.
      const sent = this.deps.tunnelClient.send(message);
      this.logger.debug(
        {
          sessionId: sessionId.value,
          sent,
          authenticatedSubscribers: authenticatedCount,
        },
        "Broadcast to session"
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

    return this.deps.tunnelClient.sendToDevice(deviceId, message);
  }

  /**
   * Broadcasts a message to all clients subscribed to a session (by session ID string).
   * Sends targeted messages to each subscriber individually via forward.to_device.
   */
  broadcastToSubscribers(sessionId: string, message: string): void {
    const session = new SessionIdClass(sessionId);
    const subscribers = this.deps.clientRegistry.getSubscribers(session);
    const authenticatedSubscribers = subscribers.filter(
      (c) => c.isAuthenticated
    );

    // Log all clients and their subscriptions for debugging
    const allClients = this.deps.clientRegistry.getAll();
    this.logger.info(
      {
        sessionId,
        totalClients: allClients.length,
        totalSubscribers: subscribers.length,
        authenticatedSubscribers: authenticatedSubscribers.length,
        clientsInfo: allClients.map((c) => ({
          deviceId: c.deviceId.value,
          isAuthenticated: c.isAuthenticated,
          isConnected: c.isConnected,
          status: c.status,
          subscriptions: c.getSubscriptions(),
        })),
      },
      "broadcastToSubscribers - client state"
    );

    if (authenticatedSubscribers.length === 0) {
      this.logger.warn(
        { sessionId, totalClients: allClients.length },
        "broadcastToSubscribers - no authenticated subscribers found"
      );
      return;
    }

    // Send to each subscribed client individually
    for (const client of authenticatedSubscribers) {
      this.deps.tunnelClient.sendToDevice(client.deviceId.value, message);
    }

    this.logger.debug(
      { sessionId, subscriberCount: authenticatedSubscribers.length },
      "Broadcast to subscribers - messages sent"
    );
  }
}
