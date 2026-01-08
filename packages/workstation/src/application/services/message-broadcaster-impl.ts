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
import { SessionId as SessionIdClass } from "../../domain/value-objects/session-id.js";

export interface MessageBroadcasterImplDeps {
  clientRegistry: ClientRegistry;
  tunnelClient: TunnelClient;
  logger: Logger;
}

/**
 * Implementation of message broadcaster using tunnel client.
 *
 * FIX #4: Subscription restoration buffer
 * Buffers messages for devices during auth flow (workstation_online → auth_complete window)
 * to prevent message loss when subscriptions are being restored.
 */
export class MessageBroadcasterImpl implements MessageBroadcaster {
  private readonly deps: MessageBroadcasterImplDeps;
  private readonly logger: Logger;

  /** FIX #4: Buffer messages for devices during auth flow */
  private authBuffers = new Map<string, {
    sessionId: string;
    message: string;
    timestamp: number;
  }[]>();
  private static readonly AUTH_BUFFER_TTL_MS = 5000; // 5 second buffer TTL

  constructor(deps: MessageBroadcasterImplDeps) {
    this.deps = deps;
    this.logger = deps.logger.child({ service: "broadcaster" });
  }

  /**
   * FIX #4: Buffers a message for a device during auth flow.
   * Called when subscribing clients are not yet authenticated.
   * Messages are buffered with TTL and flushed when auth completes.
   */
  private bufferMessageForAuth(deviceId: string, sessionId: string, message: string): void {
    if (!this.authBuffers.has(deviceId)) {
      this.authBuffers.set(deviceId, []);
    }

    const buffer = this.authBuffers.get(deviceId) ?? [];
    buffer.push({ sessionId, message, timestamp: Date.now() });

    const now = Date.now();
    const filtered = buffer.filter(
      item => now - item.timestamp < MessageBroadcasterImpl.AUTH_BUFFER_TTL_MS
    );
    this.authBuffers.set(deviceId, filtered);

    this.logger.debug(
      { deviceId, bufferSize: filtered.length },
      'Buffered message for authenticating device'
    );
  }

  /**
   * FIX #4: Flushes buffered messages for a device after authentication.
   * Called from main.ts after subscription restore completes.
   * Returns buffered messages so they can be sent to subscribed sessions.
   */
  flushAuthBuffer(deviceId: string): { sessionId: string; message: string }[] {
    const buffer = this.authBuffers.get(deviceId) ?? [];
    this.authBuffers.delete(deviceId);

    // Remove expired messages before returning
    const now = Date.now();
    const validMessages = buffer.filter(
      item => now - item.timestamp < MessageBroadcasterImpl.AUTH_BUFFER_TTL_MS
    );

    if (validMessages.length > 0) {
      this.logger.info(
        { deviceId, messageCount: validMessages.length },
        'Flushing auth buffer - delivering buffered messages'
      );
    }

    return validMessages;
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
   * Sends targeted messages to each subscriber in parallel with timeout.
   * Prevents slow clients from blocking others.
   *
   * FIX #4: Also buffers messages for unauthenticated subscribers during auth flow.
   */
  async broadcastToSubscribers(sessionId: string, message: string): Promise<void> {
    const session = new SessionIdClass(sessionId);
    const subscribers = this.deps.clientRegistry.getSubscribers(session);
    const authenticatedSubscribers = subscribers.filter(
      (c) => c.isAuthenticated
    );

    if (authenticatedSubscribers.length === 0) {
      // FIX #4: Check for unauthenticated subscribers (might be in auth flow)
      const unauthenticatedCount = subscribers.length - authenticatedSubscribers.length;
      if (unauthenticatedCount > 0) {
        this.logger.debug(
          { sessionId, unauthenticatedCount },
          "Subscribers are authenticating - buffering message for delivery after auth"
        );

        // Buffer message for each unauthenticated subscriber
        for (const client of subscribers) {
          if (!client.isAuthenticated) {
            this.bufferMessageForAuth(client.deviceId.value, sessionId, message);
          }
        }
      } else {
        // Parse message to get type for better debugging
        let messageType = 'unknown';
        try {
          const parsed = JSON.parse(message) as { type?: string };
          messageType = parsed.type ?? 'unknown';
        } catch {
          // Ignore parse errors
        }
        this.logger.debug(
          { sessionId, messageType },
          "No subscribers found for session"
        );
      }
      return;
    }

    const SEND_TIMEOUT_MS = 2000; // 2 seconds per client

    this.logger.debug(
      { sessionId, subscriberCount: authenticatedSubscribers.length },
      "Broadcasting message to subscribers"
    );

    // Send to all clients in parallel with timeout
    const sendPromises = authenticatedSubscribers.map(async (client) => {
      try {
        // Race between actual send and timeout
        await Promise.race([
          new Promise<void>((resolve, reject) => {
            const sent = this.deps.tunnelClient.sendToDevice(
              client.deviceId.value,
              message
            );
            if (sent) {
              resolve();
            } else {
              reject(new Error(`sendToDevice returned false for ${client.deviceId.value}`));
            }
          }),
          new Promise<never>((_, reject) =>
            setTimeout(
              () => reject(new Error(`Send timeout for ${client.deviceId.value}`)),
              SEND_TIMEOUT_MS
            )
          ),
        ]);

        this.logger.debug(
          { deviceId: client.deviceId.value, sessionId },
          "Message sent to subscriber"
        );
      } catch (error) {
        this.logger.warn(
          {
            deviceId: client.deviceId.value,
            sessionId,
            error: error instanceof Error ? error.message : String(error)
          },
          "Failed to send to subscriber (timeout or error)"
        );
        // Don't throw - let other sends complete
      }
    });

    // Wait for all sends to complete or timeout (don't fail on individual errors)
    const results = await Promise.allSettled(sendPromises);
    const failedCount = results.filter(r => r.status === 'rejected').length;
    if (failedCount > 0) {
      this.logger.warn(
        { sessionId, totalSubscribers: authenticatedSubscribers.length, failedCount },
        "Some subscribers failed to receive message"
      );
    }
  }

  getAuthenticatedDeviceIds(): string[] {
    const clients = this.deps.clientRegistry.getAll();
    return clients
      .filter(c => c.isAuthenticated)
      .map(c => c.deviceId.value);
  }
}
