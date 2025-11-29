/**
 * @file register-workstation.ts
 * @copyright 2025 Roman Barinov <rbarinov@gmail.com>
 * @license MIT
 */

import type { WebSocket } from 'ws';
import type { Logger } from 'pino';
import { Workstation } from '../domain/entities/workstation.js';
import { TunnelId } from '../domain/value-objects/tunnel-id.js';
import { AuthKey } from '../domain/value-objects/auth-key.js';
import type { WorkstationRegistry } from '../domain/ports/workstation-registry.js';
import { InvalidApiKeyError } from '../domain/errors/domain-errors.js';

export interface RegisterWorkstationParams {
  apiKey: string;
  name: string;
  authKey: string;
  reconnect?: boolean;
  previousTunnelId?: string;
}

export interface RegisterWorkstationResult {
  tunnelId: string;
  publicUrl: string;
  restored: boolean;
}

export interface RegisterWorkstationDeps {
  workstationRegistry: WorkstationRegistry;
  generateTunnelId: () => string;
  getPublicUrl: (tunnelId: string) => string;
  expectedApiKey: string;
  logger: Logger;
}

/**
 * Use case for registering a workstation with the tunnel server.
 */
export class RegisterWorkstationUseCase {
  private readonly workstationRegistry: WorkstationRegistry;
  private readonly generateTunnelId: () => string;
  private readonly getPublicUrl: (tunnelId: string) => string;
  private readonly expectedApiKey: string;
  private readonly logger: Logger;

  constructor(deps: RegisterWorkstationDeps) {
    this.workstationRegistry = deps.workstationRegistry;
    this.generateTunnelId = deps.generateTunnelId;
    this.getPublicUrl = deps.getPublicUrl;
    this.expectedApiKey = deps.expectedApiKey;
    this.logger = deps.logger.child({ useCase: 'RegisterWorkstation' });
  }

  execute(
    socket: WebSocket,
    params: RegisterWorkstationParams
  ): RegisterWorkstationResult {
    // Validate API key
    if (params.apiKey !== this.expectedApiKey) {
      this.logger.warn('Invalid API key attempted');
      throw new InvalidApiKeyError();
    }

    let tunnelId: TunnelId;
    let restored = false;

    // Handle reconnection with previous tunnel ID
    if (params.reconnect && params.previousTunnelId) {
      const existing = this.workstationRegistry.get(
        TunnelId.create(params.previousTunnelId)
      );

      if (existing) {
        // Restore the previous tunnel ID
        tunnelId = existing.tunnelId;
        existing.updateSocket(socket);
        restored = true;
        this.logger.info(
          { tunnelId: tunnelId.value, name: params.name },
          'Workstation reconnected with restored tunnel ID'
        );
      } else {
        // Previous tunnel not found, generate new one
        tunnelId = TunnelId.generate(this.generateTunnelId);
        this.logger.info(
          { tunnelId: tunnelId.value, previousTunnelId: params.previousTunnelId },
          'Previous tunnel not found, generated new tunnel ID'
        );
      }
    } else {
      // Generate new tunnel ID
      tunnelId = TunnelId.generate(this.generateTunnelId);
    }

    if (!restored) {
      // Create and register new workstation
      const workstation = new Workstation({
        tunnelId,
        name: params.name,
        authKey: AuthKey.create(params.authKey),
        socket,
        publicUrl: this.getPublicUrl(tunnelId.value),
      });

      this.workstationRegistry.register(workstation);
      this.logger.info(
        { tunnelId: tunnelId.value, name: params.name },
        'Workstation registered'
      );
    }

    return {
      tunnelId: tunnelId.value,
      publicUrl: this.getPublicUrl(tunnelId.value),
      restored,
    };
  }
}

