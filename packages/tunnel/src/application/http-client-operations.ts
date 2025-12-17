/**
 * @file http-client-operations.ts
 * @copyright 2025 Roman Barinov <rbarinov@gmail.com>
 * @license FSL-1.1-NC
 */

import type { Logger } from 'pino';
import type { WorkstationRegistry } from '../domain/ports/workstation-registry.js';
import type { HttpClientRegistry } from '../domain/ports/http-client-registry.js';
import { HttpClient, type QueuedMessage } from '../domain/entities/http-client.js';
import { TunnelId } from '../domain/value-objects/tunnel-id.js';
import { AuthKey } from '../domain/value-objects/auth-key.js';
import {
  TunnelNotFoundError,
  WorkstationOfflineError,
  InvalidAuthKeyError,
} from '../domain/errors/domain-errors.js';

export interface HttpClientOperationsDeps {
  workstationRegistry: WorkstationRegistry;
  httpClientRegistry: HttpClientRegistry;
  logger: Logger;
}

export interface ConnectHttpClientInput {
  tunnelId: string;
  authKey: string;
  deviceId: string;
}

export interface ConnectHttpClientResult {
  success: boolean;
  tunnelId: string;
  workstationOnline: boolean;
  workstationName?: string;
}

export interface SendCommandInput {
  deviceId: string;
  message: Record<string, unknown>;
}

export interface SendCommandWithAuthInput {
  tunnelId: string;
  authKey: string;
  deviceId: string;
  message: Record<string, unknown>;
}

export interface PollMessagesInput {
  deviceId: string;
  sinceSequence: number;
  acknowledgeSequence?: number;
}

export interface PollMessagesWithAuthInput {
  tunnelId: string;
  authKey: string;
  deviceId: string;
  sinceSequence: number;
  acknowledgeSequence?: number;
}

export interface PollMessagesResult {
  messages: QueuedMessage[];
  currentSequence: number;
  workstationOnline: boolean;
}

export interface GetStateInput {
  deviceId: string;
}

export interface GetStateWithAuthInput {
  tunnelId: string;
  authKey: string;
  deviceId: string;
}

export interface GetStateResult {
  connected: boolean;
  workstationOnline: boolean;
  workstationName?: string;
  queueSize: number;
  currentSequence: number;
}

export interface DisconnectWithAuthInput {
  tunnelId: string;
  authKey: string;
  deviceId: string;
}

/**
 * Use case for HTTP client operations (watchOS polling).
 * Handles connection, command sending, and message polling.
 */
export class HttpClientOperationsUseCase {
  private readonly workstationRegistry: WorkstationRegistry;
  private readonly httpClientRegistry: HttpClientRegistry;
  private readonly logger: Logger;

  constructor(deps: HttpClientOperationsDeps) {
    this.workstationRegistry = deps.workstationRegistry;
    this.httpClientRegistry = deps.httpClientRegistry;
    this.logger = deps.logger.child({ useCase: 'HttpClientOperations' });
  }

  /**
   * Connects an HTTP polling client (watchOS).
   * Validates auth key and registers the client.
   */
  connect(input: ConnectHttpClientInput): ConnectHttpClientResult {
    const { tunnelId: tunnelIdStr, authKey: authKeyStr, deviceId } = input;

    this.logger.info({ tunnelId: tunnelIdStr, deviceId }, 'HTTP client connect request');

    // Create value objects
    const tunnelId = TunnelId.create(tunnelIdStr);
    const authKey = AuthKey.create(authKeyStr);

    // Find workstation
    const workstation = this.workstationRegistry.get(tunnelId);
    if (!workstation) {
      this.logger.warn({ tunnelId: tunnelIdStr, deviceId }, 'Tunnel not found for HTTP client');
      throw new TunnelNotFoundError(tunnelIdStr);
    }

    // Validate auth key
    if (!workstation.validateAuthKey(authKey)) {
      this.logger.warn({ tunnelId: tunnelIdStr, deviceId }, 'Invalid auth key for HTTP client');
      throw new InvalidAuthKeyError();
    }

    // Check if client already exists
    let client = this.httpClientRegistry.get(deviceId);
    const isNewClient = !client;

    if (client) {
      // Update existing client's poll time
      client.recordPoll();
      this.logger.info({ deviceId, tunnelId: tunnelIdStr }, 'HTTP client reconnected');
    } else {
      // Create new HTTP client
      client = new HttpClient({
        deviceId,
        tunnelId,
      });
      this.httpClientRegistry.register(client);
      this.logger.info({ deviceId, tunnelId: tunnelIdStr }, 'HTTP client registered');
    }

    // Forward auth to workstation so it registers the device_id
    // This is needed for the workstation to accept commands from this device
    // We send auth on every connect (not just new clients) in case workstation restarted
    if (workstation.isOnline) {
      const authMessage = {
        type: 'auth',
        payload: {
          auth_key: authKeyStr,
          device_id: deviceId,
        },
      };
      const sent = workstation.send(JSON.stringify(authMessage));
      if (sent) {
        this.logger.debug({ deviceId, isNewClient }, 'Forwarded auth to workstation for HTTP client');
      } else {
        this.logger.warn({ deviceId }, 'Failed to forward auth to workstation');
      }
    }

    return {
      success: true,
      tunnelId: tunnelIdStr,
      workstationOnline: workstation.isOnline,
      workstationName: workstation.name,
    };
  }

  /**
   * Sends a command from HTTP client to workstation.
   */
  sendCommand(input: SendCommandInput): boolean {
    const { deviceId, message } = input;

    this.logger.info({ deviceId, messageType: message.type }, 'HTTP client sending command');

    const client = this.httpClientRegistry.get(deviceId);
    if (!client) {
      this.logger.warn({ deviceId }, 'HTTP client not found for command');
      return false;
    }

    // Update poll time
    client.recordPoll();

    const workstation = this.workstationRegistry.get(client.tunnelId);
    if (!workstation) {
      this.logger.warn({ deviceId, tunnelId: client.tunnelId.value }, 'Workstation not found');
      throw new TunnelNotFoundError(client.tunnelId.value);
    }

    if (!workstation.isOnline) {
      this.logger.warn({ deviceId, tunnelId: client.tunnelId.value }, 'Workstation offline');
      throw new WorkstationOfflineError(client.tunnelId.value);
    }

    // Inject device_id into message
    const enrichedMessage = {
      ...message,
      device_id: deviceId,
    };

    const sent = workstation.send(JSON.stringify(enrichedMessage));
    if (!sent) {
      this.logger.warn({ deviceId }, 'Failed to send command to workstation');
    }

    return sent;
  }

  /**
   * Sends a command from HTTP client to workstation with auth validation.
   * This method validates auth on every request and forwards auth to workstation
   * to ensure the device_id is registered.
   */
  sendCommandWithAuth(input: SendCommandWithAuthInput): boolean {
    const { tunnelId: tunnelIdStr, authKey: authKeyStr, deviceId, message } = input;

    this.logger.info({ deviceId, tunnelId: tunnelIdStr, messageType: message.type }, 'HTTP client sending command with auth');

    // Create value objects
    const tunnelId = TunnelId.create(tunnelIdStr);
    const authKey = AuthKey.create(authKeyStr);

    // Find workstation
    const workstation = this.workstationRegistry.get(tunnelId);
    if (!workstation) {
      this.logger.warn({ tunnelId: tunnelIdStr, deviceId }, 'Workstation not found for command');
      throw new TunnelNotFoundError(tunnelIdStr);
    }

    // Validate auth key
    if (!workstation.validateAuthKey(authKey)) {
      this.logger.warn({ tunnelId: tunnelIdStr, deviceId }, 'Invalid auth key for command');
      throw new InvalidAuthKeyError();
    }

    if (!workstation.isOnline) {
      this.logger.warn({ deviceId, tunnelId: tunnelIdStr }, 'Workstation offline');
      throw new WorkstationOfflineError(tunnelIdStr);
    }

    // Ensure HTTP client is registered (or re-register if needed)
    let client = this.httpClientRegistry.get(deviceId);
    if (!client) {
      client = new HttpClient({
        deviceId,
        tunnelId,
      });
      this.httpClientRegistry.register(client);
      this.logger.info({ deviceId, tunnelId: tunnelIdStr }, 'HTTP client registered on command');
    }
    client.recordPoll();

    // Forward auth to workstation to ensure device_id is registered
    const authMessage = {
      type: 'auth',
      payload: {
        auth_key: authKeyStr,
        device_id: deviceId,
      },
    };
    workstation.send(JSON.stringify(authMessage));

    // Inject device_id into message and send
    const enrichedMessage = {
      ...message,
      device_id: deviceId,
    };

    const sent = workstation.send(JSON.stringify(enrichedMessage));
    if (!sent) {
      this.logger.warn({ deviceId }, 'Failed to send command to workstation');
    }

    return sent;
  }

  /**
   * Polls for messages for an HTTP client.
   */
  pollMessages(input: PollMessagesInput): PollMessagesResult {
    const { deviceId, sinceSequence, acknowledgeSequence } = input;

    const client = this.httpClientRegistry.get(deviceId);
    if (!client) {
      this.logger.warn({ deviceId }, 'HTTP client not found for poll');
      return {
        messages: [],
        currentSequence: 0,
        workstationOnline: false,
      };
    }

    // Update poll time
    client.recordPoll();

    // Acknowledge messages if requested
    if (acknowledgeSequence !== undefined && acknowledgeSequence > 0) {
      client.acknowledgeMessages(acknowledgeSequence);
    }

    // Get messages since sequence
    const messages = client.getMessagesSince(sinceSequence);

    // Check workstation status
    const workstation = this.workstationRegistry.get(client.tunnelId);
    const workstationOnline = workstation?.isOnline ?? false;

    this.logger.debug(
      { deviceId, sinceSequence, messageCount: messages.length, currentSequence: client.currentSequence },
      'HTTP client poll'
    );

    return {
      messages,
      currentSequence: client.currentSequence,
      workstationOnline,
    };
  }

  /**
   * Gets current state for an HTTP client.
   */
  getState(input: GetStateInput): GetStateResult {
    const { deviceId } = input;

    const client = this.httpClientRegistry.get(deviceId);
    if (!client) {
      return {
        connected: false,
        workstationOnline: false,
        queueSize: 0,
        currentSequence: 0,
      };
    }

    // Update poll time
    client.recordPoll();

    const workstation = this.workstationRegistry.get(client.tunnelId);

    return {
      connected: true,
      workstationOnline: workstation?.isOnline ?? false,
      workstationName: workstation?.name,
      queueSize: client.queueSize,
      currentSequence: client.currentSequence,
    };
  }

  /**
   * Disconnects an HTTP client.
   */
  disconnect(deviceId: string): boolean {
    const client = this.httpClientRegistry.get(deviceId);
    if (!client) {
      return false;
    }

    client.markInactive();
    this.httpClientRegistry.unregister(deviceId);
    this.logger.info({ deviceId }, 'HTTP client disconnected');
    return true;
  }

  /**
   * Polls for messages with auth validation (stateless).
   * Validates auth on every request.
   */
  pollMessagesWithAuth(input: PollMessagesWithAuthInput): PollMessagesResult {
    const { tunnelId: tunnelIdStr, authKey: authKeyStr, deviceId, sinceSequence, acknowledgeSequence } = input;

    // Validate auth
    const tunnelId = TunnelId.create(tunnelIdStr);
    const authKey = AuthKey.create(authKeyStr);

    const workstation = this.workstationRegistry.get(tunnelId);
    if (!workstation) {
      throw new TunnelNotFoundError(tunnelIdStr);
    }

    if (!workstation.validateAuthKey(authKey)) {
      throw new InvalidAuthKeyError();
    }

    // Ensure client is registered
    let client = this.httpClientRegistry.get(deviceId);
    if (!client) {
      client = new HttpClient({
        deviceId,
        tunnelId,
      });
      this.httpClientRegistry.register(client);
    }

    // Update poll time
    client.recordPoll();

    // Acknowledge messages if requested
    if (acknowledgeSequence !== undefined && acknowledgeSequence > 0) {
      client.acknowledgeMessages(acknowledgeSequence);
    }

    // Get messages since sequence
    const messages = client.getMessagesSince(sinceSequence);

    this.logger.debug(
      { deviceId, sinceSequence, messageCount: messages.length, currentSequence: client.currentSequence },
      'HTTP client poll with auth'
    );

    return {
      messages,
      currentSequence: client.currentSequence,
      workstationOnline: workstation.isOnline,
    };
  }

  /**
   * Gets current state with auth validation (stateless).
   */
  getStateWithAuth(input: GetStateWithAuthInput): GetStateResult {
    const { tunnelId: tunnelIdStr, authKey: authKeyStr, deviceId } = input;

    // Validate auth
    const tunnelId = TunnelId.create(tunnelIdStr);
    const authKey = AuthKey.create(authKeyStr);

    const workstation = this.workstationRegistry.get(tunnelId);
    if (!workstation) {
      throw new TunnelNotFoundError(tunnelIdStr);
    }

    if (!workstation.validateAuthKey(authKey)) {
      throw new InvalidAuthKeyError();
    }

    // Ensure client is registered
    let client = this.httpClientRegistry.get(deviceId);
    if (!client) {
      client = new HttpClient({
        deviceId,
        tunnelId,
      });
      this.httpClientRegistry.register(client);
    }

    client.recordPoll();

    return {
      connected: true,
      workstationOnline: workstation.isOnline,
      workstationName: workstation.name,
      queueSize: client.queueSize,
      currentSequence: client.currentSequence,
    };
  }

  /**
   * Disconnects an HTTP client with auth validation (stateless).
   */
  disconnectWithAuth(input: DisconnectWithAuthInput): boolean {
    const { tunnelId: tunnelIdStr, authKey: authKeyStr, deviceId } = input;

    // Validate auth
    const tunnelId = TunnelId.create(tunnelIdStr);
    const authKey = AuthKey.create(authKeyStr);

    const workstation = this.workstationRegistry.get(tunnelId);
    if (!workstation) {
      throw new TunnelNotFoundError(tunnelIdStr);
    }

    if (!workstation.validateAuthKey(authKey)) {
      throw new InvalidAuthKeyError();
    }

    const client = this.httpClientRegistry.get(deviceId);
    if (!client) {
      return false;
    }

    client.markInactive();
    this.httpClientRegistry.unregister(deviceId);
    this.logger.info({ deviceId }, 'HTTP client disconnected with auth');
    return true;
  }

  /**
   * Queues a message for all HTTP clients connected to a tunnel.
   * Called when workstation sends a message.
   */
  queueMessageForTunnel(tunnelId: TunnelId, message: string): number {
    const clients = this.httpClientRegistry.getByTunnelId(tunnelId);
    let queuedCount = 0;

    for (const client of clients) {
      if (client.isActive) {
        client.queueMessage(message);
        queuedCount++;
      }
    }

    if (queuedCount > 0) {
      this.logger.debug(
        { tunnelId: tunnelId.value, queuedCount, totalClients: clients.length },
        'Message queued for HTTP clients'
      );
    }

    return queuedCount;
  }

  /**
   * Cleans up timed-out HTTP clients.
   */
  cleanupTimedOut(timeoutMs: number): number {
    const timedOut = this.httpClientRegistry.findTimedOut(timeoutMs);
    let cleanedCount = 0;

    for (const client of timedOut) {
      client.markInactive();
      this.httpClientRegistry.unregister(client.deviceId);
      cleanedCount++;
      this.logger.info({ deviceId: client.deviceId }, 'HTTP client timed out and removed');
    }

    return cleanedCount;
  }
}
