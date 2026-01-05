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
    // Always send to tunnel - it knows about all connected clients
    // The tunnel will forward to all clients registered with this workstation's tunnel_id
    this.deps.tunnelClient.send(message);
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
      this.deps.tunnelClient.send(message);
    }
  }

  /**
   * Sends a message to a specific client by device ID.
   *
   * Note: We always send to tunnel regardless of local registry state because:
   * 1. HTTP polling clients (watchOS) don't authenticate with the workstation
   *    - They only authenticate with the tunnel server
   *    - The tunnel handles message queuing for HTTP clients
   * 2. After workstation restart, WebSocket clients may still be connected to the tunnel
   *    but not yet re-authenticated with the workstation
   */
  sendToClient(deviceId: string, message: string): boolean {
    // Always forward to tunnel - it knows about both WebSocket and HTTP polling clients
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

    if (authenticatedSubscribers.length === 0) {
      return;
    }

    // Send to each subscribed client individually
    for (const client of authenticatedSubscribers) {
      this.deps.tunnelClient.sendToDevice(client.deviceId.value, message);
    }
  }
}
