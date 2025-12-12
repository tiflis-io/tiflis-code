/**
 * @file authenticate-client.ts
 * @copyright 2025 Roman Barinov <rbarinov@gmail.com>
 * @license FSL-1.1-NC
 */

import type { WebSocket } from 'ws';
import type { Logger } from 'pino';
import type { ClientRegistry } from '../../domain/ports/client-registry.js';
import { DeviceId } from '../../domain/value-objects/device-id.js';
import { AuthKey } from '../../domain/value-objects/auth-key.js';
import { InvalidAuthKeyError } from '../../domain/errors/domain-errors.js';
import type { AuthSuccessMessage } from '../../protocol/messages.js';

export interface AuthenticateClientDeps {
  clientRegistry: ClientRegistry;
  expectedAuthKey: AuthKey;
  workstationName: string;
  workstationVersion: string;
  protocolVersion: string;
  workspacesRoot: string;
  logger: Logger;
}

export interface AuthenticateClientParams {
  socket?: WebSocket; // Optional for tunnel connections
  authKey: string;
  deviceId: string;
}

/**
 * Use case for authenticating mobile clients.
 */
export class AuthenticateClientUseCase {
  private readonly deps: AuthenticateClientDeps;
  private readonly logger: Logger;

  constructor(deps: AuthenticateClientDeps) {
    this.deps = deps;
    this.logger = deps.logger.child({ useCase: 'authenticate-client' });
  }

  /**
   * Authenticates a client and registers them.
   */
  execute(params: AuthenticateClientParams): AuthSuccessMessage {
    const deviceId = new DeviceId(params.deviceId);
    const authKey = new AuthKey(params.authKey);

    // Validate auth key
    if (!this.deps.expectedAuthKey.secureEquals(authKey)) {
      this.logger.warn({ deviceId: deviceId.value }, 'Invalid auth key');
      throw new InvalidAuthKeyError();
    }

    // Register or update client
    // For tunnel connections, socket is undefined
    const client = params.socket
      ? this.deps.clientRegistry.register(deviceId, params.socket)
      : this.deps.clientRegistry.registerTunnel(deviceId);
    client.markAuthenticated();

    // Get restored subscriptions
    const restoredSubscriptions = client.getSubscriptions();

    // Log all clients in registry for debugging
    const allClients = this.deps.clientRegistry.getAll();
    this.logger.info(
      {
        deviceId: deviceId.value,
        restoredSubscriptions,
        clientStatus: client.status,
        allClientsCount: allClients.length,
        allClients: allClients.map((c) => ({
          deviceId: c.deviceId.value,
          status: c.status,
          isAuthenticated: c.isAuthenticated,
          subscriptions: c.getSubscriptions(),
        })),
      },
      'Client authenticated'
    );

    return {
      type: 'auth.success',
      payload: {
        device_id: deviceId.value,
        workstation_name: this.deps.workstationName,
        workstation_version: this.deps.workstationVersion,
        protocol_version: this.deps.protocolVersion,
        workspaces_root: this.deps.workspacesRoot,
        restored_subscriptions: restoredSubscriptions.length > 0 ? restoredSubscriptions : undefined,
      },
    };
  }
}

