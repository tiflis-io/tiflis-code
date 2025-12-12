/**
 * @file health-route.ts
 * @copyright 2025 Roman Barinov <rbarinov@gmail.com>
 * @license FSL-1.1-NC
 */

import type { FastifyRequest, FastifyReply } from 'fastify';
import type { SessionManager } from '../../domain/ports/session-manager.js';
import type { ClientRegistry } from '../../domain/ports/client-registry.js';

export interface HealthRouteConfig {
  version: string;
}

export interface HealthRouteDeps {
  sessionManager: SessionManager;
  clientRegistry: ClientRegistry;
  isTunnelConnected: () => boolean;
}

interface HealthResponse {
  status: 'healthy' | 'degraded' | 'unhealthy';
  version: string;
  uptime: number;
  tunnel: {
    connected: boolean;
  };
  sessions: {
    total: number;
    supervisor: number;
    agents: number;
    terminals: number;
  };
  clients: {
    total: number;
    authenticated: number;
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
    const isTunnelConnected = deps.isTunnelConnected();
    const totalSessions = deps.sessionManager.count();
    const supervisorCount = deps.sessionManager.countByType('supervisor');
    const agentCount =
      deps.sessionManager.countByType('cursor') +
      deps.sessionManager.countByType('claude') +
      deps.sessionManager.countByType('opencode');
    const terminalCount = deps.sessionManager.countByType('terminal');

    const response: HealthResponse = {
      status: isTunnelConnected ? 'healthy' : 'degraded',
      version: config.version,
      uptime: Math.floor((Date.now() - startTime) / 1000),
      tunnel: {
        connected: isTunnelConnected,
      },
      sessions: {
        total: totalSessions,
        supervisor: supervisorCount,
        agents: agentCount,
        terminals: terminalCount,
      },
      clients: {
        total: deps.clientRegistry.count(),
        authenticated: deps.clientRegistry.countAuthenticated(),
      },
      timestamp: new Date().toISOString(),
    };

    return reply.status(200).send(response);
  });

  // Simple liveness probe
  app.get('/healthz', async (_request: FastifyRequest, reply: FastifyReply) => {
    return reply.status(200).send({ status: 'ok' });
  });

  // Readiness probe - checks if connected to tunnel
  app.get('/readyz', async (_request: FastifyRequest, reply: FastifyReply) => {
    const isTunnelConnected = deps.isTunnelConnected();
    if (isTunnelConnected) {
      return reply.status(200).send({ status: 'ready' });
    }
    return reply.status(503).send({ status: 'not ready', reason: 'tunnel not connected' });
  });
}

