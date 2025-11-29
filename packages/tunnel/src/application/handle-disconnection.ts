/**
 * @file handle-disconnection.ts
 * @copyright 2025 Roman Barinov <rbarinov@gmail.com>
 * @license MIT
 */

import type { Logger } from 'pino';
import type { WorkstationRegistry } from '../domain/ports/workstation-registry.js';
import type { ClientRegistry } from '../domain/ports/client-registry.js';
import type { TunnelId } from '../domain/value-objects/tunnel-id.js';
import type { ForwardMessageUseCase } from './forward-message.js';
import type { WorkstationOfflineMessage } from '../protocol/messages.js';

export interface HandleDisconnectionDeps {
  workstationRegistry: WorkstationRegistry;
  clientRegistry: ClientRegistry;
  forwardMessage: ForwardMessageUseCase;
  logger: Logger;
}

/**
 * Use case for handling disconnections of workstations and clients.
 */
export class HandleDisconnectionUseCase {
  private readonly workstationRegistry: WorkstationRegistry;
  private readonly clientRegistry: ClientRegistry;
  private readonly forwardMessage: ForwardMessageUseCase;
  private readonly logger: Logger;

  constructor(deps: HandleDisconnectionDeps) {
    this.workstationRegistry = deps.workstationRegistry;
    this.clientRegistry = deps.clientRegistry;
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
   * Removes the client from the registry.
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

    client.markDisconnected();
    this.clientRegistry.unregister(deviceId);

    this.logger.info(
      { deviceId, tunnelId: client.tunnelId.value },
      'Client disconnected'
    );
  }

  /**
   * Handles timeout check for all connections.
   * Returns the number of connections that were closed due to timeout.
   */
  handleTimeoutCheck(timeoutMs: number): { workstations: number; clients: number } {
    let workstationsClosed = 0;
    let clientsClosed = 0;

    // Check workstations
    const timedOutWorkstations = this.workstationRegistry.findTimedOut(timeoutMs);
    for (const workstation of timedOutWorkstations) {
      this.handleWorkstationDisconnection(workstation.tunnelId);
      workstationsClosed++;
    }

    // Check clients
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

    if (workstationsClosed > 0 || clientsClosed > 0) {
      this.logger.info(
        { workstationsClosed, clientsClosed },
        'Timeout check completed'
      );
    }

    return { workstations: workstationsClosed, clients: clientsClosed };
  }
}

