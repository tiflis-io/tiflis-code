/**
 * @file watch-api-route.ts
 * @copyright 2025 Roman Barinov <rbarinov@gmail.com>
 * @license FSL-1.1-NC
 */

import type { FastifyRequest, FastifyReply } from 'fastify';
import type { Logger } from 'pino';
import type { HttpClientOperationsUseCase } from '../../application/http-client-operations.js';
import {
  TunnelNotFoundError,
  WorkstationOfflineError,
  InvalidAuthKeyError,
} from '../../domain/errors/domain-errors.js';

export interface WatchApiRouteDeps {
  httpClientOperations: HttpClientOperationsUseCase;
  logger: Logger;
}

// Request body schemas
interface ConnectBody {
  tunnel_id: string;
  auth_key: string;
  device_id: string;
}

interface CommandBody {
  tunnel_id: string;
  auth_key: string;
  device_id: string;
  message: Record<string, unknown>;
}

interface PollQuery {
  tunnel_id: string;
  auth_key: string;
  device_id: string;
  since?: string;
  ack?: string;
}

interface StateQuery {
  tunnel_id: string;
  auth_key: string;
  device_id: string;
}

interface DisconnectBody {
  tunnel_id: string;
  auth_key: string;
  device_id: string;
}

// Generic app interface with route methods
interface AppWithRoutes {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  get: (path: string, handler: (request: any, reply: FastifyReply) => Promise<unknown>) => unknown;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  post: (path: string, handler: (request: any, reply: FastifyReply) => Promise<unknown>) => unknown;
}

/**
 * Registers the Watch HTTP API routes on the Fastify server.
 * These routes enable watchOS to communicate via HTTP polling
 * instead of WebSocket (which is blocked by Apple on watchOS 9+).
 */
export function registerWatchApiRoute(
  app: AppWithRoutes,
  deps: WatchApiRouteDeps
): void {
  const { httpClientOperations, logger } = deps;
  const log = logger.child({ route: 'watch-api' });

  /**
   * POST /api/v1/watch/connect
   * Connects a Watch client to the tunnel.
   */
  app.post('/api/v1/watch/connect', async (
    request: FastifyRequest<{ Body: ConnectBody }>,
    reply: FastifyReply
  ) => {
    try {
      const { tunnel_id, auth_key, device_id } = request.body;

      if (!tunnel_id || !auth_key || !device_id) {
        return await reply.status(400).send({
          error: 'missing_parameters',
          message: 'tunnel_id, auth_key, and device_id are required',
        });
      }

      const result = httpClientOperations.connect({
        tunnelId: tunnel_id,
        authKey: auth_key,
        deviceId: device_id,
      });

      log.info({ deviceId: device_id, tunnelId: tunnel_id }, 'Watch connected via HTTP');

      return await reply.status(200).send({
        success: true,
        tunnel_id: result.tunnelId,
        workstation_online: result.workstationOnline,
        workstation_name: result.workstationName,
      });
    } catch (error) {
      return await handleError(error, reply, log);
    }
  });

  /**
   * POST /api/v1/watch/command
   * Sends a command from Watch to the workstation.
   * Includes auth credentials for validation and workstation device registration.
   */
  app.post('/api/v1/watch/command', async (
    request: FastifyRequest<{ Body: CommandBody }>,
    reply: FastifyReply
  ) => {
    try {
      const { tunnel_id, auth_key, device_id, message } = request.body;

      if (!tunnel_id || !auth_key || !device_id) {
        return await reply.status(400).send({
          error: 'missing_parameters',
          message: 'tunnel_id, auth_key, device_id, and message are required',
        });
      }

      const sent = httpClientOperations.sendCommandWithAuth({
        tunnelId: tunnel_id,
        authKey: auth_key,
        deviceId: device_id,
        message,
      });

      if (!sent) {
        return await reply.status(503).send({
          error: 'send_failed',
          message: 'Failed to send command to workstation',
        });
      }

      return await reply.status(200).send({
        success: true,
      });
    } catch (error) {
      return await handleError(error, reply, log);
    }
  });

  /**
   * GET /api/v1/watch/messages
   * Polls for new messages from the workstation.
   * Stateless: auth validated on every request.
   * Query params:
   *   - tunnel_id, auth_key, device_id: Auth credentials (required)
   *   - since: Sequence number to get messages after (default: 0)
   *   - ack: Acknowledge messages up to this sequence (optional)
   */
  app.get('/api/v1/watch/messages', async (
    request: FastifyRequest<{ Querystring: PollQuery }>,
    reply: FastifyReply
  ) => {
    try {
      const { tunnel_id, auth_key, device_id, since, ack } = request.query;

      if (!tunnel_id || !auth_key || !device_id) {
        return await reply.status(400).send({
          error: 'missing_parameters',
          message: 'tunnel_id, auth_key, and device_id are required',
        });
      }

      const sinceSequence = since ? parseInt(since, 10) : 0;
      const ackSequence = ack ? parseInt(ack, 10) : undefined;

      const result = httpClientOperations.pollMessagesWithAuth({
        tunnelId: tunnel_id,
        authKey: auth_key,
        deviceId: device_id,
        sinceSequence,
        acknowledgeSequence: ackSequence,
      });

      // Transform messages for response
      const messages = result.messages.map((msg) => ({
        sequence: msg.sequence,
        timestamp: msg.timestamp.toISOString(),
        data: JSON.parse(msg.data) as unknown,
      }));

      return await reply.status(200).send({
        messages,
        current_sequence: result.currentSequence,
        workstation_online: result.workstationOnline,
      });
    } catch (error) {
      return await handleError(error, reply, log);
    }
  });

  /**
   * GET /api/v1/watch/state
   * Gets the current connection state for a Watch client.
   * Stateless: auth validated on every request.
   */
  app.get('/api/v1/watch/state', async (
    request: FastifyRequest<{ Querystring: StateQuery }>,
    reply: FastifyReply
  ) => {
    try {
      const { tunnel_id, auth_key, device_id } = request.query;

      if (!tunnel_id || !auth_key || !device_id) {
        return await reply.status(400).send({
          error: 'missing_parameters',
          message: 'tunnel_id, auth_key, and device_id are required',
        });
      }

      const result = httpClientOperations.getStateWithAuth({
        tunnelId: tunnel_id,
        authKey: auth_key,
        deviceId: device_id,
      });

      return await reply.status(200).send({
        connected: result.connected,
        workstation_online: result.workstationOnline,
        workstation_name: result.workstationName,
        queue_size: result.queueSize,
        current_sequence: result.currentSequence,
      });
    } catch (error) {
      return await handleError(error, reply, log);
    }
  });

  /**
   * POST /api/v1/watch/disconnect
   * Disconnects a Watch client (clears message queue).
   * Stateless: auth validated on every request.
   */
  app.post('/api/v1/watch/disconnect', async (
    request: FastifyRequest<{ Body: DisconnectBody }>,
    reply: FastifyReply
  ) => {
    try {
      const { tunnel_id, auth_key, device_id } = request.body;

      if (!tunnel_id || !auth_key || !device_id) {
        return await reply.status(400).send({
          error: 'missing_parameters',
          message: 'tunnel_id, auth_key, and device_id are required',
        });
      }

      const disconnected = httpClientOperations.disconnectWithAuth({
        tunnelId: tunnel_id,
        authKey: auth_key,
        deviceId: device_id,
      });

      log.info({ deviceId: device_id }, 'Watch disconnected via HTTP');

      return await reply.status(200).send({
        success: disconnected,
      });
    } catch (error) {
      return await handleError(error, reply, log);
    }
  });
}

/**
 * Handles domain errors and returns appropriate HTTP responses.
 */
async function handleError(error: unknown, reply: FastifyReply, log: Logger): Promise<FastifyReply> {
  if (error instanceof TunnelNotFoundError) {
    return await reply.status(404).send({
      error: 'tunnel_not_found',
      message: error.message,
    });
  }

  if (error instanceof InvalidAuthKeyError) {
    return await reply.status(401).send({
      error: 'invalid_auth_key',
      message: 'Invalid authentication key',
    });
  }

  if (error instanceof WorkstationOfflineError) {
    return await reply.status(503).send({
      error: 'workstation_offline',
      message: 'Workstation is offline',
    });
  }

  // Unexpected error
  log.error({ error }, 'Unexpected error in Watch API');
  return await reply.status(500).send({
    error: 'internal_error',
    message: 'An unexpected error occurred',
  });
}
