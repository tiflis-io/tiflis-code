/**
 * @file app.ts
 * @copyright 2025 Roman Barinov <rbarinov@gmail.com>
 * @license FSL-1.1-NC
 */

import Fastify, { type FastifyError } from 'fastify';
import type { Logger } from 'pino';
import type { Env } from './config/env.js';

export interface AppConfig {
  env: Env;
  logger: Logger;
}

/**
 * Creates and configures the Fastify application.
 */
export function createApp(config: AppConfig) {
  const app = Fastify({
    loggerInstance: config.logger,
    // Disable request logging since we use pino directly
    disableRequestLogging: true,
  });

  // Request logging middleware
  app.addHook('onRequest', async (request, _reply) => {
    request.log.info(
      {
        method: request.method,
        url: request.url,
      },
      'Incoming request'
    );
  });

  // Response logging middleware
  app.addHook('onResponse', async (request, reply) => {
    request.log.info(
      {
        method: request.method,
        url: request.url,
        statusCode: reply.statusCode,
        responseTime: reply.elapsedTime,
      },
      'Request completed'
    );
  });

  // Error handler
  app.setErrorHandler((error: FastifyError, request, reply) => {
    request.log.error({ error }, 'Request error');
    const statusCode = error.statusCode ?? 500;
    const code = error.code || 'INTERNAL_ERROR';
    void reply.status(statusCode).send({
      error: error.message,
      code,
    });
  });

  // 404 handler
  app.setNotFoundHandler((request, reply) => {
    request.log.warn({ url: request.url }, 'Route not found');
    reply.status(404).send({
      error: 'Not Found',
      code: 'NOT_FOUND',
    });
  });

  return app;
}

