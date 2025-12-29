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
    trustProxy: config.env.TRUST_PROXY,
    // Disable request logging since we use pino directly
    disableRequestLogging: true,
  });

  // Request logging middleware
  app.addHook('onRequest', async (request, _reply) => {
    request.log.info(
      {
        method: request.method,
        url: request.url,
        // Include forwarded headers if behind proxy
        ...(config.env.TRUST_PROXY && {
          forwardedFor: request.headers['x-forwarded-for'],
          forwardedProto: request.headers['x-forwarded-proto'],
        }),
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

  // Note: 404 handler is set later, either by web-client-route (for SPA fallback)
  // or by setDefaultNotFoundHandler() if web client is not configured

  return app;
}

/**
 * Sets the default 404 handler for API-only mode (no web client).
 * Call this only if web client is NOT configured.
 */
export function setDefaultNotFoundHandler(app: ReturnType<typeof createApp>): void {
  app.setNotFoundHandler((request, reply) => {
    request.log.warn({ url: request.url }, 'Route not found');
    reply.status(404).send({
      error: 'Not Found',
      code: 'NOT_FOUND',
    });
  });
}

