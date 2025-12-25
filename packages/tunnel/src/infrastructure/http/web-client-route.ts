/**
 * @file web-client-route.ts
 * @copyright 2025 Roman Barinov <rbarinov@gmail.com>
 * @license FSL-1.1-NC
 */

import fastifyStatic from '@fastify/static';
import { existsSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';
import type { Logger } from 'pino';
import type { FastifyRequest, FastifyReply } from 'fastify';

interface WebClientRouteOptions {
  webClientPath: string;
  logger: Logger;
}

// Reply with sendFile method from @fastify/static
interface StaticReply extends FastifyReply {
  sendFile(filename: string): FastifyReply;
}

// Generic app interface for static file serving
interface AppWithStatic {
  register(
    plugin: typeof fastifyStatic,
    options: { root: string; prefix: string; wildcard: boolean }
  ): Promise<unknown>;
  setNotFoundHandler(
    handler: (request: FastifyRequest, reply: StaticReply) => Promise<unknown>
  ): unknown;
}

/**
 * Registers the web client static file serving route.
 * Serves the SPA from the specified directory.
 */
export async function registerWebClientRoute(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  app: any,
  options: WebClientRouteOptions
): Promise<void> {
  const { webClientPath, logger } = options;

  // Resolve the absolute path
  const absolutePath = resolve(webClientPath);

  // Verify the directory exists
  if (!existsSync(absolutePath)) {
    logger.error(
      { path: absolutePath },
      'Web client path does not exist, skipping web client registration'
    );
    return;
  }

  // Verify it's a directory
  const stats = statSync(absolutePath);
  if (!stats.isDirectory()) {
    logger.error(
      { path: absolutePath },
      'Web client path is not a directory, skipping web client registration'
    );
    return;
  }

  // Check for index.html
  const indexPath = join(absolutePath, 'index.html');
  if (!existsSync(indexPath)) {
    logger.error(
      { path: indexPath },
      'Web client index.html not found, skipping web client registration'
    );
    return;
  }

  logger.info({ path: absolutePath }, 'Registering web client static files');

  // Cast to typed interface for safer usage
  const typedApp = app as AppWithStatic;

  // Register static file serving
  await typedApp.register(fastifyStatic, {
    root: absolutePath,
    prefix: '/',
    // Serve index.html for SPA routing
    wildcard: false,
  });

  // SPA fallback: serve index.html for all non-API routes
  // This must be registered after static files
  typedApp.setNotFoundHandler(
    async (request: FastifyRequest, reply: StaticReply) => {
      // Skip API and WebSocket paths
      const url = request.url;
      if (
        url.startsWith('/api/') ||
        url.startsWith('/ws') ||
        url.startsWith('/health')
      ) {
        return reply.status(404).send({
          error: 'Not Found',
          code: 'NOT_FOUND',
        });
      }

      // Serve index.html for SPA routes
      return reply.sendFile('index.html');
    }
  );

  logger.info('Web client registered successfully');
}
