/**
 * @file connection-info-route.ts
 * @copyright 2025 Roman Barinov <rbarinov@gmail.com>
 * @license FSL-1.1-NC
 */

import type { FastifyRequest, FastifyReply } from 'fastify';


export interface ConnectionInfoRouteConfig {
  authKey: string;
  version: string;
}

export interface ConnectionInfoRouteDeps {
  getTunnelId: () => string | null;
  getPublicUrl: () => string | null;
  isTunnelConnected: () => boolean;
}

interface ConnectionInfoResponse {
  connected: boolean;
  tunnelId: string | null;
  publicUrl: string | null;
  magicLink: string | null;
  version: string;
}

interface AppWithRoutes {
  get: (path: string, handler: (request: FastifyRequest, reply: FastifyReply) => Promise<unknown>) => unknown;
}

/**
 * Generates magic link from connection info.
 */
function generateMagicLink(tunnelId: string, publicUrl: string, authKey: string): string {
  // Strip tunnel_id query parameter from URL if present
  const urlObj = new URL(publicUrl);
  urlObj.searchParams.delete('tunnel_id');
  const cleanUrl = urlObj.toString();

  const payload = {
    tunnel_id: tunnelId,
    url: cleanUrl,
    key: authKey,
  };
  const jsonPayload = JSON.stringify(payload);
  const base64Payload = Buffer.from(jsonPayload, 'utf-8').toString('base64');
  return `tiflis://connect?data=${encodeURIComponent(base64Payload)}`;
}


/**
 * Registers connection info routes on the Fastify server.
 *
 * Routes:
 * - GET /connection-info - Returns JSON with magic link and connection status
 */
export function registerConnectionInfoRoute(
  app: AppWithRoutes,
  config: ConnectionInfoRouteConfig,
  deps: ConnectionInfoRouteDeps
): void {
  // JSON endpoint with connection info
  app.get('/connection-info', async (_request: FastifyRequest, reply: FastifyReply) => {
    const tunnelId = deps.getTunnelId();
    const publicUrl = deps.getPublicUrl();
    const connected = deps.isTunnelConnected();

    let magicLink: string | null = null;
    if (tunnelId && publicUrl) {
      magicLink = generateMagicLink(tunnelId, publicUrl, config.authKey);
    }

    const response: ConnectionInfoResponse = {
      connected,
      tunnelId,
      publicUrl,
      magicLink,
      version: config.version,
    };

    return reply.status(200).send(response);
  });
}
