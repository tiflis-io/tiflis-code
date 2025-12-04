/**
 * @file forward-message.ts
 * @copyright 2025 Roman Barinov <rbarinov@gmail.com>
 * @license MIT
 */

import type { Logger } from 'pino';
import type { WorkstationRegistry } from '../domain/ports/workstation-registry.js';
import type { ClientRegistry } from '../domain/ports/client-registry.js';
import type { TunnelId } from '../domain/value-objects/tunnel-id.js';
import {
  TunnelNotFoundError,
  WorkstationOfflineError,
} from '../domain/errors/domain-errors.js';

export interface ForwardMessageDeps {
  workstationRegistry: WorkstationRegistry;
  clientRegistry: ClientRegistry;
  logger: Logger;
}

/**
 * Use case for forwarding messages between mobile clients and workstations.
 */
export class ForwardMessageUseCase {
  private readonly workstationRegistry: WorkstationRegistry;
  private readonly clientRegistry: ClientRegistry;
  private readonly logger: Logger;

  constructor(deps: ForwardMessageDeps) {
    this.workstationRegistry = deps.workstationRegistry;
    this.clientRegistry = deps.clientRegistry;
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
   */
  forwardToClients(tunnelId: TunnelId, message: string): number {
    const clients = this.clientRegistry.getByTunnelId(tunnelId);
    let sentCount = 0;

    for (const client of clients) {
      if (client.send(message)) {
        sentCount++;
      }
    }

    if (clients.length > 0) {
      this.logger.debug(
        { tunnelId: tunnelId.value, totalClients: clients.length, sent: sentCount },
        'Forwarded message to clients'
      );
    }

    return sentCount;
  }

  /**
   * Broadcasts a message to all clients connected to a specific tunnel.
   * Used for system events like workstation_offline/online.
   */
  broadcastToClients(tunnelId: TunnelId, message: object): number {
    return this.forwardToClients(tunnelId, JSON.stringify(message));
  }
}

