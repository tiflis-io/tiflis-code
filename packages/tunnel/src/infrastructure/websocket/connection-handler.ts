/**
 * @file connection-handler.ts
 * @copyright 2025 Roman Barinov <rbarinov@gmail.com>
 * @license MIT
 */

import type { WebSocket } from 'ws';
import type { Logger } from 'pino';
import type { RegisterWorkstationUseCase } from '../../application/register-workstation.js';
import type { ConnectClientUseCase } from '../../application/connect-client.js';
import type { ForwardMessageUseCase } from '../../application/forward-message.js';
import type { HandleDisconnectionUseCase } from '../../application/handle-disconnection.js';
import type { WorkstationRegistry } from '../../domain/ports/workstation-registry.js';
import type { ClientRegistry } from '../../domain/ports/client-registry.js';
import { TunnelId } from '../../domain/value-objects/tunnel-id.js';
import { DomainError } from '../../domain/errors/domain-errors.js';
import {
  WorkstationRegisterSchema,
  ConnectSchema,
  PingSchema,
  getMessageType,
} from '../../protocol/schemas.js';
import { ProtocolErrors } from '../../protocol/errors.js';
import type {
  WorkstationRegisteredMessage,
  ConnectedMessage,
  PongMessage,
  WorkstationOnlineMessage,
} from '../../protocol/messages.js';

/**
 * Type representing the role of a WebSocket connection.
 */
type ConnectionRole = 'unknown' | 'workstation' | 'client';

/**
 * Metadata attached to each WebSocket connection.
 */
interface ConnectionMeta {
  role: ConnectionRole;
  tunnelId?: string;
  deviceId?: string;
}

export interface ConnectionHandlerDeps {
  workstationRegistry: WorkstationRegistry;
  clientRegistry: ClientRegistry;
  registerWorkstation: RegisterWorkstationUseCase;
  connectClient: ConnectClientUseCase;
  forwardMessage: ForwardMessageUseCase;
  handleDisconnection: HandleDisconnectionUseCase;
  logger: Logger;
}

/**
 * Handles individual WebSocket connections.
 * Routes messages based on the connection role (workstation vs mobile client).
 */
export class ConnectionHandler {
  private readonly meta = new WeakMap<WebSocket, ConnectionMeta>();
  private readonly deps: ConnectionHandlerDeps;
  private readonly logger: Logger;

  constructor(deps: ConnectionHandlerDeps) {
    this.deps = deps;
    this.logger = deps.logger.child({ component: 'ConnectionHandler' });
  }

  /**
   * Sets up event handlers for a new WebSocket connection.
   */
  handleConnection(socket: WebSocket): void {
    // Initialize connection metadata
    this.meta.set(socket, { role: 'unknown' });

    socket.on('message', (data: Buffer | ArrayBuffer | Buffer[]) => {
      let message: string;
      if (Array.isArray(data)) {
        message = Buffer.concat(data).toString('utf8');
      } else if (data instanceof ArrayBuffer) {
        message = Buffer.from(new Uint8Array(data)).toString('utf8');
      } else {
        message = data.toString('utf8');
      }
      this.handleMessage(socket, message);
    });

    socket.on('close', () => {
      this.handleClose(socket);
    });

    socket.on('error', (error) => {
      this.logger.error({ error }, 'WebSocket error');
    });
  }

  /**
   * Processes an incoming message from a WebSocket connection.
   */
  private handleMessage(socket: WebSocket, data: string): void {
    let parsed: unknown;
    try {
      parsed = JSON.parse(data);
    } catch {
      this.sendError(socket, 'INVALID_PAYLOAD', 'Invalid JSON');
      return;
    }

    const messageType = getMessageType(parsed);
    if (!messageType) {
      this.sendError(socket, 'INVALID_PAYLOAD', 'Missing message type');
      return;
    }

    const meta = this.meta.get(socket);
    if (!meta) {
      this.logger.error('Connection metadata not found');
      socket.close(1011, 'Internal error');
      return;
    }

    try {
      switch (messageType) {
        case 'workstation.register':
          this.handleWorkstationRegister(socket, parsed, meta);
          break;

        case 'connect':
          this.handleClientConnect(socket, parsed, meta);
          break;

        case 'ping':
          this.handlePing(socket, parsed, meta);
          break;

        default:
          // Forward message based on role
          this.forwardMessage(socket, data, meta);
          break;
      }
    } catch (error) {
      this.handleError(socket, error);
    }
  }

  /**
   * Handles workstation registration request.
   */
  private handleWorkstationRegister(
    socket: WebSocket,
    data: unknown,
    meta: ConnectionMeta
  ): void {
    const parseResult = WorkstationRegisterSchema.safeParse(data);
    if (!parseResult.success) {
      this.sendError(
        socket,
        'INVALID_PAYLOAD',
        'Invalid registration payload',
        undefined,
        parseResult.error.flatten()
      );
      return;
    }

    const { payload } = parseResult.data;

    const result = this.deps.registerWorkstation.execute(socket, {
      apiKey: payload.api_key,
      name: payload.name,
      authKey: payload.auth_key,
      reconnect: payload.reconnect,
      previousTunnelId: payload.previous_tunnel_id,
    });

    // Update connection metadata
    meta.role = 'workstation';
    meta.tunnelId = result.tunnelId;

    // If this is a restored connection, notify clients
    if (result.restored) {
      const onlineMessage: WorkstationOnlineMessage = {
        type: 'connection.workstation_online',
        payload: {
          tunnel_id: result.tunnelId,
        },
      };
      this.deps.forwardMessage.broadcastToClients(
        TunnelId.create(result.tunnelId),
        onlineMessage
      );
    }

    // Send success response
    const response: WorkstationRegisteredMessage = {
      type: 'workstation.registered',
      payload: {
        tunnel_id: result.tunnelId,
        public_url: result.publicUrl,
        restored: result.restored || undefined,
      },
    };
    socket.send(JSON.stringify(response));

    this.logger.info(
      { tunnelId: result.tunnelId, restored: result.restored },
      'Workstation registered'
    );
  }

  /**
   * Handles mobile client connection request.
   */
  private handleClientConnect(
    socket: WebSocket,
    data: unknown,
    meta: ConnectionMeta
  ): void {
    const parseResult = ConnectSchema.safeParse(data);
    if (!parseResult.success) {
      this.sendError(
        socket,
        'INVALID_PAYLOAD',
        'Invalid connection payload',
        undefined,
        parseResult.error.flatten()
      );
      return;
    }

    const { payload } = parseResult.data;

    const result = this.deps.connectClient.execute(socket, {
      tunnelId: payload.tunnel_id,
      authKey: payload.auth_key,
      deviceId: payload.device_id,
      reconnect: payload.reconnect,
    });

    // Update connection metadata
    meta.role = 'client';
    meta.tunnelId = result.tunnelId;
    meta.deviceId = payload.device_id;

    // Send success response
    const response: ConnectedMessage = {
      type: 'connected',
      payload: {
        tunnel_id: result.tunnelId,
        restored: result.restored || undefined,
      },
    };
    socket.send(JSON.stringify(response));

    this.logger.info(
      { tunnelId: result.tunnelId, deviceId: payload.device_id, restored: result.restored },
      'Client connected'
    );
  }

  /**
   * Handles ping message.
   */
  private handlePing(socket: WebSocket, data: unknown, meta: ConnectionMeta): void {
    const parseResult = PingSchema.safeParse(data);
    if (!parseResult.success) {
      return;
    }

    // Update last ping time based on role
    if (meta.role === 'workstation' && meta.tunnelId) {
      const workstation = this.deps.workstationRegistry.get(
        TunnelId.create(meta.tunnelId)
      );
      workstation?.recordPing();
    } else if (meta.role === 'client' && meta.deviceId) {
      const client = this.deps.clientRegistry.get(meta.deviceId);
      client?.recordPing();
    }

    // Send pong response
    const pong: PongMessage = {
      type: 'pong',
      timestamp: parseResult.data.timestamp,
    };
    socket.send(JSON.stringify(pong));
  }

  /**
   * Forwards a message based on the connection role.
   */
  private forwardMessage(socket: WebSocket, data: string, meta: ConnectionMeta): void {
    if (meta.role === 'workstation' && meta.tunnelId) {
      // Forward from workstation to all connected clients
      this.deps.forwardMessage.forwardToClients(
        TunnelId.create(meta.tunnelId),
        data
      );
    } else if (meta.role === 'client' && meta.deviceId) {
      // Forward from client to workstation
      try {
        this.deps.forwardMessage.forwardToWorkstation(meta.deviceId, data);
      } catch (error) {
        this.handleError(socket, error);
      }
    } else {
      // Unknown role, can't forward
      this.sendError(socket, 'INVALID_PAYLOAD', 'Not authenticated');
    }
  }

  /**
   * Handles WebSocket connection close.
   */
  private handleClose(socket: WebSocket): void {
    const meta = this.meta.get(socket);
    if (!meta) return;

    if (meta.role === 'workstation' && meta.tunnelId) {
      this.deps.handleDisconnection.handleWorkstationDisconnection(
        TunnelId.create(meta.tunnelId)
      );
    } else if (meta.role === 'client' && meta.deviceId) {
      this.deps.handleDisconnection.handleClientDisconnection(meta.deviceId);
    }

    this.meta.delete(socket);
  }

  /**
   * Handles errors and sends appropriate error responses.
   */
  private handleError(socket: WebSocket, error: unknown): void {
    if (error instanceof DomainError) {
      const errorMessage = ProtocolErrors.invalidPayload(error.message);
      errorMessage.payload.code = error.code as typeof errorMessage.payload.code;
      socket.send(JSON.stringify(errorMessage));
    } else {
      this.logger.error({ error }, 'Unexpected error');
      socket.send(JSON.stringify(ProtocolErrors.internalError()));
    }
  }

  /**
   * Sends an error message to the socket.
   */
  private sendError(
    socket: WebSocket,
    code: string,
    message: string,
    requestId?: string,
    details?: unknown
  ): void {
    const payload: { code: string; message: string; details?: unknown } = {
      code,
      message,
    };

    if (details !== undefined) {
      payload.details = details;
    }

    const errorMessage: { type: string; id?: string; payload: typeof payload } = {
      type: 'error',
      payload,
    };

    if (requestId) {
      errorMessage.id = requestId;
    }

    socket.send(JSON.stringify(errorMessage));
  }
}

