/**
 * @file handle-disconnection.ts
 * @copyright 2025 Roman Barinov <rbarinov@gmail.com>
 * @license FSL-1.1-NC
 */

import type { Logger } from 'pino';
import type { WorkstationRegistry } from '../domain/ports/workstation-registry.js';
import type { ClientRegistry } from '../domain/ports/client-registry.js';
import type { HttpClientRegistry } from '../domain/ports/http-client-registry.js';
import type { TunnelId } from '../domain/value-objects/tunnel-id.js';
import type { ForwardMessageUseCase } from './forward-message.js';
import type { WorkstationOfflineMessage, ClientDisconnectedMessage } from '../protocol/messages.js';

export interface HandleDisconnectionDeps {
  workstationRegistry: WorkstationRegistry;
  clientRegistry: ClientRegistry;
  httpClientRegistry?: HttpClientRegistry;
  forwardMessage: ForwardMessageUseCase;
  logger: Logger;
}

/**
 * Use case for handling disconnections of workstations and clients.
 */
export class HandleDisconnectionUseCase {
  private readonly workstationRegistry: WorkstationRegistry;
  private readonly clientRegistry: ClientRegistry;
  private readonly httpClientRegistry?: HttpClientRegistry;
  private readonly forwardMessage: ForwardMessageUseCase;
  private readonly logger: Logger;

  constructor(deps: HandleDisconnectionDeps) {
    this.workstationRegistry = deps.workstationRegistry;
    this.clientRegistry = deps.clientRegistry;
    this.httpClientRegistry = deps.httpClientRegistry;
    this.forwardMessage = deps.forwardMessage;
    this.logger = deps.logger.child({ useCase: 'HandleDisconnection' });
  }

  /**
   * Handles workstation disconnection.
   * Marks the workstation as offline and notifies all connected clients.
   */
  handleWorkstationDisconnection(tunnelId: TunnelId): void {
    const workstation = this.workstationRegistry.get(tunnelId);
    if (!workstation) {
      this.logger.warn(
        { tunnelId: tunnelId.value },
        'Attempted to handle disconnection for unknown workstation'
      );
      return;
    }

    workstation.markOffline();

    // Notify all connected clients
    const offlineMessage: WorkstationOfflineMessage = {
      type: 'connection.workstation_offline',
      payload: {
        tunnel_id: tunnelId.value,
      },
    };

    const notifiedCount = this.forwardMessage.broadcastToClients(
      tunnelId,
      offlineMessage
    );

    this.logger.info(
      { tunnelId: tunnelId.value, notifiedClients: notifiedCount },
      'Workstation disconnected, clients notified'
    );
  }

  /**
   * Handles workstation removal.
   * Called when the workstation connection is completely closed
   * and we don't expect a reconnection.
   */
  handleWorkstationRemoval(tunnelId: TunnelId): void {
    // First handle disconnection to notify clients
    this.handleWorkstationDisconnection(tunnelId);

    // Then remove from registry
    const removed = this.workstationRegistry.unregister(tunnelId);
    if (removed) {
      this.logger.info(
        { tunnelId: tunnelId.value },
        'Workstation removed from registry'
      );
    }
  }

  /**
   * Handles client disconnection.
   * Removes the client from the registry and notifies the workstation.
   */
  handleClientDisconnection(deviceId: string): void {
    const client = this.clientRegistry.get(deviceId);
    if (!client) {
      this.logger.warn(
        { deviceId },
        'Attempted to handle disconnection for unknown client'
      );
      return;
    }

    const tunnelId = client.tunnelId;
    client.markDisconnected();
    this.clientRegistry.unregister(deviceId);

    // Notify workstation about client disconnection so it can clean up subscriptions
    const workstation = this.workstationRegistry.get(tunnelId);
    if (workstation?.isOnline) {
      const disconnectMessage: ClientDisconnectedMessage = {
        type: 'client.disconnected',
        payload: {
          device_id: deviceId,
          tunnel_id: tunnelId.value,
        },
      };
      try {
        workstation.send(JSON.stringify(disconnectMessage));
        this.logger.debug(
          { deviceId, tunnelId: tunnelId.value },
          'Sent client.disconnected notification to workstation'
        );
      } catch (error) {
        this.logger.warn(
          { deviceId, tunnelId: tunnelId.value, error },
          'Failed to send client.disconnected notification to workstation'
        );
      }
    }

    this.logger.info(
      { deviceId, tunnelId: tunnelId.value },
      'Client disconnected'
    );
  }

  /**
   * Handles timeout check for all connections.
   * Returns the number of connections that were closed due to timeout.
   */
  handleTimeoutCheck(timeoutMs: number): { workstations: number; clients: number; httpClients: number } {
    let workstationsClosed = 0;
    let clientsClosed = 0;
    let httpClientsClosed = 0;

    // Check workstations
    const timedOutWorkstations = this.workstationRegistry.findTimedOut(timeoutMs);
    for (const workstation of timedOutWorkstations) {
      // Close the socket to prevent zombie connections
      // The workstation will detect the closure and reconnect
      try {
        workstation.socket.close(1000, 'Connection timed out');
      } catch {
        // Ignore close errors
      }
      this.handleWorkstationDisconnection(workstation.tunnelId);
      workstationsClosed++;
    }

    // Check WebSocket clients
    const timedOutClients = this.clientRegistry.findTimedOut(timeoutMs);
    for (const client of timedOutClients) {
      this.handleClientDisconnection(client.deviceId);
      try {
        client.socket.close(1000, 'Connection timed out');
      } catch {
        // Ignore close errors
      }
      clientsClosed++;
    }

    // Check HTTP polling clients (watchOS)
    // Use a longer timeout for HTTP clients since they poll less frequently
    const httpTimeoutMs = timeoutMs * 4; // 4x the normal timeout (e.g., 3 minutes)
    if (this.httpClientRegistry) {
      const timedOutHttpClients = this.httpClientRegistry.findTimedOut(httpTimeoutMs);
      for (const httpClient of timedOutHttpClients) {
        httpClient.markInactive();
        this.httpClientRegistry.unregister(httpClient.deviceId);
        httpClientsClosed++;
        this.logger.info(
          { deviceId: httpClient.deviceId },
          'HTTP client timed out and removed'
        );
      }
    }

    if (workstationsClosed > 0 || clientsClosed > 0 || httpClientsClosed > 0) {
      this.logger.info(
        { workstationsClosed, clientsClosed, httpClientsClosed },
        'Timeout check completed'
      );
    }

    return { workstations: workstationsClosed, clients: clientsClosed, httpClients: httpClientsClosed };
  }
}

