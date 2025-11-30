/**
 * @file connect-client.ts
 * @copyright 2025 Roman Barinov <rbarinov@gmail.com>
 * @license MIT
 */

import type { WebSocket } from 'ws';
import type { Logger } from 'pino';
import { MobileClient } from '../domain/entities/mobile-client.js';
import { TunnelId } from '../domain/value-objects/tunnel-id.js';
import { AuthKey } from '../domain/value-objects/auth-key.js';
import type { WorkstationRegistry } from '../domain/ports/workstation-registry.js';
import type { ClientRegistry } from '../domain/ports/client-registry.js';
import {
  TunnelNotFoundError,
  WorkstationOfflineError,
  InvalidAuthKeyError,
} from '../domain/errors/domain-errors.js';

export interface ConnectClientParams {
  tunnelId: string;
  authKey: string;
  deviceId: string;
  reconnect?: boolean;
}

export interface ConnectClientResult {
  tunnelId: string;
  restored: boolean;
}

export interface ConnectClientDeps {
  workstationRegistry: WorkstationRegistry;
  clientRegistry: ClientRegistry;
  logger: Logger;
}

/**
 * Use case for connecting a mobile client to a workstation through the tunnel.
 */
export class ConnectClientUseCase {
  private readonly workstationRegistry: WorkstationRegistry;
  private readonly clientRegistry: ClientRegistry;
  private readonly logger: Logger;

  constructor(deps: ConnectClientDeps) {
    this.workstationRegistry = deps.workstationRegistry;
    this.clientRegistry = deps.clientRegistry;
    this.logger = deps.logger.child({ useCase: 'ConnectClient' });
  }

  execute(
    socket: WebSocket,
    params: ConnectClientParams
  ): ConnectClientResult {
    const tunnelId = TunnelId.create(params.tunnelId);

    // Find the workstation
    const workstation = this.workstationRegistry.get(tunnelId);
    if (!workstation) {
      this.logger.warn(
        { tunnelId: params.tunnelId, deviceId: params.deviceId },
        'Tunnel not found'
      );
      throw new TunnelNotFoundError(params.tunnelId);
    }

    // Check if workstation is online
    if (!workstation.isOnline) {
      this.logger.warn(
        { tunnelId: params.tunnelId, deviceId: params.deviceId },
        'Workstation is offline'
      );
      throw new WorkstationOfflineError(params.tunnelId);
    }

    // Validate auth key
    const authKey = AuthKey.fromTrusted(params.authKey);
    if (!workstation.validateAuthKey(authKey)) {
      this.logger.warn(
        { tunnelId: params.tunnelId, deviceId: params.deviceId },
        'Invalid auth key'
      );
      throw new InvalidAuthKeyError();
    }

    let restored = false;

    // Handle reconnection
    if (params.reconnect) {
      const existingClient = this.clientRegistry.get(params.deviceId);
      if (existingClient?.tunnelId.equals(tunnelId)) {
        existingClient.updateSocket(socket);
        restored = true;
        this.logger.info(
          { tunnelId: params.tunnelId, deviceId: params.deviceId },
          'Client reconnected'
        );
      }
    }

    if (!restored) {
      // Remove any existing connection for this device
      this.clientRegistry.unregister(params.deviceId);

      // Create and register new client
      const client = new MobileClient({
        deviceId: params.deviceId,
        tunnelId,
        socket,
      });

      this.clientRegistry.register(client);
      this.logger.info(
        { tunnelId: params.tunnelId, deviceId: params.deviceId },
        'Client connected'
      );
    }

    return {
      tunnelId: tunnelId.value,
      restored,
    };
  }
}

