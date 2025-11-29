/**
 * @file message-router.ts
 * @copyright 2025 Roman Barinov <rbarinov@gmail.com>
 * @license MIT
 */

import type { Logger } from 'pino';
import type { WebSocket } from 'ws';
import { parseClientMessage, getMessageType } from '../../protocol/schemas.js';
import type { ErrorMessage, PongMessage, ResponseMessage } from '../../protocol/messages.js';
import type { DomainError } from '../../domain/errors/domain-errors.js';

/**
 * Message handler function type.
 */
export type MessageHandler<T = unknown> = (
  socket: WebSocket,
  message: T
) => Promise<void>;

/**
 * Message handlers registry.
 */
export interface MessageHandlers {
  auth: MessageHandler;
  ping: MessageHandler;
  sync: MessageHandler;
  'supervisor.list_sessions': MessageHandler;
  'supervisor.create_session': MessageHandler;
  'supervisor.terminate_session': MessageHandler;
  'supervisor.command': MessageHandler;
  'supervisor.clear_context': MessageHandler;
  'session.subscribe': MessageHandler;
  'session.unsubscribe': MessageHandler;
  'session.execute': MessageHandler;
  'session.input': MessageHandler;
  'session.resize': MessageHandler;
  'session.replay': MessageHandler;
}

export interface MessageRouterConfig {
  logger: Logger;
  handlers: MessageHandlers;
}

/**
 * Routes incoming WebSocket messages to appropriate handlers.
 */
export class MessageRouter {
  private readonly logger: Logger;
  private readonly handlers: MessageHandlers;

  constructor(config: MessageRouterConfig) {
    this.logger = config.logger.child({ component: 'message-router' });
    this.handlers = config.handlers;
  }

  /**
   * Routes an incoming message to the appropriate handler.
   */
  async route(socket: WebSocket, raw: string): Promise<void> {
    let data: unknown;
    try {
      data = JSON.parse(raw);
    } catch {
      this.logger.warn({ raw: raw.slice(0, 100) }, 'Failed to parse message');
      this.sendError(socket, undefined, 'INVALID_PAYLOAD', 'Invalid JSON');
      return;
    }

    const messageType = getMessageType(data);
    if (!messageType) {
      this.sendError(socket, undefined, 'INVALID_PAYLOAD', 'Missing message type');
      return;
    }

    const message = parseClientMessage(data);
    if (!message) {
      this.logger.warn({ type: messageType }, 'Invalid message payload');
      this.sendError(socket, undefined, 'INVALID_PAYLOAD', 'Invalid message format');
      return;
    }

    this.logger.debug({ type: messageType }, 'Routing message');

    try {
      const handler = this.handlers[messageType as keyof MessageHandlers] as MessageHandler | undefined;
      if (handler) {
        await handler(socket, message);
      } else {
        this.logger.warn({ type: messageType }, 'Unknown message type');
        this.sendError(socket, undefined, 'INVALID_PAYLOAD', `Unknown message type: ${messageType}`);
      }
    } catch (error) {
      this.handleError(socket, error, message);
    }
  }

  /**
   * Handles errors from message handlers.
   */
  private handleError(socket: WebSocket, error: unknown, message: unknown): void {
    const requestId = this.getRequestId(message);

    if (this.isDomainError(error)) {
      this.logger.warn({ error: error.toJSON(), requestId }, 'Domain error');
      this.sendError(socket, requestId, error.code, error.message);
    } else {
      this.logger.error({ error, requestId }, 'Unexpected error');
      this.sendError(socket, requestId, 'INTERNAL_ERROR', 'An unexpected error occurred');
    }
  }

  /**
   * Sends an error response.
   */
  sendError(
    socket: WebSocket,
    requestId: string | undefined,
    code: string,
    message: string
  ): void {
    const errorMessage: ErrorMessage = {
      type: 'error',
      id: requestId,
      payload: { code: code as ErrorMessage['payload']['code'], message },
    };
    this.sendToSocket(socket, errorMessage);
  }

  /**
   * Sends a response message.
   */
  sendResponse(
    socket: WebSocket,
    requestId: string,
    payload: Record<string, unknown>
  ): void {
    const response: ResponseMessage = {
      type: 'response',
      id: requestId,
      payload,
    };
    this.sendToSocket(socket, response);
  }

  /**
   * Sends a pong response.
   */
  sendPong(socket: WebSocket, timestamp: number): void {
    const pong: PongMessage = {
      type: 'pong',
      timestamp,
    };
    this.sendToSocket(socket, pong);
  }

  /**
   * Sends a message to a socket.
   */
  private sendToSocket(socket: WebSocket, message: unknown): void {
    if (socket.readyState === 1) {
      socket.send(JSON.stringify(message));
    }
  }

  /**
   * Extracts request ID from a message if present.
   */
  private getRequestId(message: unknown): string | undefined {
    if (typeof message === 'object' && message !== null && 'id' in message) {
      return (message as { id?: string }).id;
    }
    return undefined;
  }

  /**
   * Type guard for domain errors.
   */
  private isDomainError(error: unknown): error is DomainError {
    return (
      error instanceof Error &&
      'code' in error &&
      'statusCode' in error &&
      typeof (error as DomainError).toJSON === 'function'
    );
  }
}

