/**
 * @file health-route.ts
 * @copyright 2025 Roman Barinov <rbarinov@gmail.com>
 * @license MIT
 */

import type { FastifyRequest, FastifyReply } from 'fastify';
import type { WorkstationRegistry } from '../../domain/ports/workstation-registry.js';
import type { ClientRegistry } from '../../domain/ports/client-registry.js';

export interface HealthRouteConfig {
  version: string;
}

export interface HealthRouteDeps {
  workstationRegistry: WorkstationRegistry;
  clientRegistry: ClientRegistry;
}

interface HealthResponse {
  status: 'healthy' | 'degraded' | 'unhealthy';
  version: string;
  uptime: number;
  connections: {
    workstations: number;
    clients: number;
  };
  timestamp: string;
}

interface AppWithGet {
  get: (path: string, handler: (request: FastifyRequest, reply: FastifyReply) => Promise<unknown>) => unknown;
}

/**
 * Registers the health check route on the Fastify server.
 */
export function registerHealthRoute(
  app: AppWithGet,
  config: HealthRouteConfig,
  deps: HealthRouteDeps
): void {
  const startTime = Date.now();

  app.get('/health', async (_request: FastifyRequest, reply: FastifyReply) => {
    const workstationCount = deps.workstationRegistry.count();
    const clientCount = deps.clientRegistry.count();

    const response: HealthResponse = {
      status: 'healthy',
      version: config.version,
      uptime: Math.floor((Date.now() - startTime) / 1000),
      connections: {
        workstations: workstationCount,
        clients: clientCount,
      },
      timestamp: new Date().toISOString(),
    };

    return reply.status(200).send(response);
  });

  // Simple liveness probe
  app.get('/healthz', async (_request: FastifyRequest, reply: FastifyReply) => {
    return reply.status(200).send({ status: 'ok' });
  });

  // Readiness probe - checks if the server can accept connections
  app.get('/readyz', async (_request: FastifyRequest, reply: FastifyReply) => {
    return reply.status(200).send({ status: 'ready' });
  });
}

