/**
 * @file forward-message.ts
 * @copyright 2025 Roman Barinov <rbarinov@gmail.com>
 * @license FSL-1.1-NC
 */

import type { Logger } from 'pino';
import type { WorkstationRegistry } from '../domain/ports/workstation-registry.js';
import type { ClientRegistry } from '../domain/ports/client-registry.js';
import type { HttpClientRegistry } from '../domain/ports/http-client-registry.js';
import type { TunnelId } from '../domain/value-objects/tunnel-id.js';
import {
  TunnelNotFoundError,
  WorkstationOfflineError,
} from '../domain/errors/domain-errors.js';

export interface ForwardMessageDeps {
  workstationRegistry: WorkstationRegistry;
  clientRegistry: ClientRegistry;
  httpClientRegistry?: HttpClientRegistry;
  logger: Logger;
}

/**
 * Use case for forwarding messages between mobile clients and workstations.
 */
export class ForwardMessageUseCase {
  private readonly workstationRegistry: WorkstationRegistry;
  private readonly clientRegistry: ClientRegistry;
  private readonly httpClientRegistry?: HttpClientRegistry;
  private readonly logger: Logger;

  constructor(deps: ForwardMessageDeps) {
    this.workstationRegistry = deps.workstationRegistry;
    this.clientRegistry = deps.clientRegistry;
    this.httpClientRegistry = deps.httpClientRegistry;
    this.logger = deps.logger.child({ useCase: 'ForwardMessage' });
  }

  /**
   * Forwards a message from a mobile client to the workstation.
   * Injects device_id into the message so workstation can identify the sender.
   */
  forwardToWorkstation(deviceId: string, message: string): boolean {
    this.logger.info({ deviceId, messageLength: message.length }, 'forwardToWorkstation called');

    const client = this.clientRegistry.get(deviceId);
    if (!client) {
      this.logger.warn({ deviceId }, 'Client not found for forwarding');
      return false;
    }

    const workstation = this.workstationRegistry.get(client.tunnelId);
    if (!workstation) {
      this.logger.warn(
        { tunnelId: client.tunnelId.value, deviceId },
        'Workstation not found for forwarding'
      );
      throw new TunnelNotFoundError(client.tunnelId.value);
    }

    if (!workstation.isOnline) {
      this.logger.warn(
        { tunnelId: client.tunnelId.value, deviceId },
        'Workstation offline, cannot forward'
      );
      throw new WorkstationOfflineError(client.tunnelId.value);
    }

    // Inject device_id into the message so workstation knows which client sent it
    let enrichedMessage = message;
    try {
      const parsed = JSON.parse(message) as Record<string, unknown>;
      parsed.device_id = deviceId;
      enrichedMessage = JSON.stringify(parsed);
      this.logger.info({ deviceId, messageType: parsed.type, enrichedLength: enrichedMessage.length }, 'Injected device_id into message');
    } catch {
      // If message is not valid JSON, forward as-is
      this.logger.warn({ deviceId, message: message.slice(0, 100) }, 'Could not inject device_id, message is not JSON');
    }

    const sent = workstation.send(enrichedMessage);
    if (!sent) {
      this.logger.warn(
        { tunnelId: client.tunnelId.value, deviceId },
        'Failed to send message to workstation'
      );
    }

    return sent;
  }

  /**
   * Forwards a message from a workstation to all connected clients.
   * Also queues the message for HTTP polling clients (watchOS).
   */
  forwardToClients(tunnelId: TunnelId, message: string): number {
    const clients = this.clientRegistry.getByTunnelId(tunnelId);
    let sentCount = 0;

    // Parse message type for logging
    let messageType = 'unknown';
    try {
      const parsed = JSON.parse(message) as { type?: string };
      messageType = parsed.type ?? 'unknown';
    } catch {
      // ignore
    }

    // Send to WebSocket clients
    const clientsToRemove: string[] = [];
    for (const client of clients) {
      if (client.send(message)) {
        sentCount++;
      } else {
        // Log failed sends and mark for removal
        this.logger.warn(
          {
            tunnelId: tunnelId.value,
            deviceId: client.deviceId,
            clientStatus: client.status,
            socketReadyState: client.socket.readyState,
            isConnected: client.isConnected,
            messageType,
          },
          'forwardToClients - send failed, marking client for removal'
        );
        // Mark client as disconnected and schedule removal
        client.markDisconnected();
        clientsToRemove.push(client.deviceId);
      }
    }
    // Remove zombie clients from registry
    for (const deviceId of clientsToRemove) {
      this.clientRegistry.unregister(deviceId);
      this.logger.info({ deviceId, tunnelId: tunnelId.value }, 'Removed zombie client from registry');
    }

    // Queue for HTTP polling clients (watchOS)
    let httpQueuedCount = 0;
    if (this.httpClientRegistry) {
      const httpClients = this.httpClientRegistry.getByTunnelId(tunnelId);
      for (const httpClient of httpClients) {
        if (httpClient.isActive) {
          httpClient.queueMessage(message);
          httpQueuedCount++;
        }
      }
    }

    this.logger.info(
      {
        tunnelId: tunnelId.value,
        wsClients: clients.length,
        wsSent: sentCount,
        httpClients: httpQueuedCount,
        messageType,
      },
      'forwardToClients'
    );

    return sentCount + httpQueuedCount;
  }

  /**
   * Broadcasts a message to all clients connected to a specific tunnel.
   * Used for system events like workstation_offline/online.
   */
  broadcastToClients(tunnelId: TunnelId, message: object): number {
    return this.forwardToClients(tunnelId, JSON.stringify(message));
  }

  /**
   * Forwards a message to a specific device by device_id.
   * Used for targeted delivery (e.g., session output to subscribed clients only).
   */
  forwardToDevice(tunnelId: TunnelId, deviceId: string, payload: string): boolean {
    // Try WebSocket client first
    const wsClient = this.clientRegistry.get(deviceId);
    if (wsClient && wsClient.tunnelId.value === tunnelId.value) {
      const sent = wsClient.send(payload);
      if (sent) {
        this.logger.debug({ tunnelId: tunnelId.value, deviceId }, 'forwardToDevice via WebSocket');
        return true;
      } else {
        // Log why send failed and remove zombie client
        this.logger.warn(
          {
            tunnelId: tunnelId.value,
            deviceId,
            clientStatus: wsClient.status,
            socketReadyState: wsClient.socket.readyState,
            isConnected: wsClient.isConnected,
          },
          'forwardToDevice - WebSocket send failed, removing zombie client'
        );
        // Remove the zombie client so it doesn't block future sends
        wsClient.markDisconnected();
        this.clientRegistry.unregister(deviceId);
        // Don't return yet - try HTTP client as fallback
      }
    }

    // Try HTTP polling client
    if (this.httpClientRegistry) {
      const httpClient = this.httpClientRegistry.get(deviceId);
      if (httpClient && httpClient.tunnelId.value === tunnelId.value && httpClient.isActive) {
        httpClient.queueMessage(payload);
        this.logger.debug({ tunnelId: tunnelId.value, deviceId }, 'forwardToDevice via HTTP queue');
        return true;
      }
    }

    // Log details about why client wasn't found
    const allClients = this.clientRegistry.getByTunnelId(tunnelId);
    this.logger.warn(
      {
        tunnelId: tunnelId.value,
        deviceId,
        registeredClients: allClients.map(c => ({
          deviceId: c.deviceId,
          status: c.status,
          socketState: c.socket.readyState,
        })),
      },
      'forwardToDevice - client not found or not deliverable'
    );
    return false;
  }
}

