/**
 * @file connection-info-route.ts
 * @copyright 2025 Roman Barinov <rbarinov@gmail.com>
 * @license MIT
 */

import type { FastifyRequest, FastifyReply } from 'fastify';
import QRCodeStyling from 'qr-code-styling';
import { JSDOM } from 'jsdom';
import * as nodeCanvas from 'canvas';

// Type for QR code styling options (library types are incomplete for Node.js usage)
interface QRCodeInstance {
  getRawData(format: 'png' | 'svg'): Promise<Buffer | null>;
}

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
 * Generates a branded QR code with tiflis-code styling.
 * Uses gradient colors matching the brand (#2E5AA6 blue to #6F4ABF purple).
 */
async function generateBrandedQRCode(magicLink: string, size = 300): Promise<Buffer> {
  // Cast to QRCodeInstance since library types are incomplete for Node.js
  const qrCode = new QRCodeStyling({
    jsdom: JSDOM,
    nodeCanvas,
    width: size,
    height: size,
    type: 'canvas',
    data: magicLink,
    margin: 10,
    qrOptions: {
      errorCorrectionLevel: 'H', // High error correction for logo overlay
    },
    dotsOptions: {
      type: 'rounded',
      gradient: {
        type: 'linear',
        rotation: Math.PI / 4, // 45 degrees
        colorStops: [
          { offset: 0, color: '#2E5AA6' },   // Brand blue
          { offset: 1, color: '#6F4ABF' },   // Brand purple
        ],
      },
    },
    cornersSquareOptions: {
      type: 'extra-rounded',
      gradient: {
        type: 'linear',
        rotation: Math.PI / 4,
        colorStops: [
          { offset: 0, color: '#2E5AA6' },
          { offset: 1, color: '#6F4ABF' },
        ],
      },
    },
    cornersDotOptions: {
      type: 'dot',
      gradient: {
        type: 'linear',
        rotation: Math.PI / 4,
        colorStops: [
          { offset: 0, color: '#2E5AA6' },
          { offset: 1, color: '#6F4ABF' },
        ],
      },
    },
    backgroundOptions: {
      color: '#111111', // Dark background matching logo
    },
    // Logo embedded in center (SVG with explicit width/height for canvas compatibility)
    image: 'data:image/svg+xml;base64,' + Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
  <defs>
    <linearGradient id="accent" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#2E5AA6"/>
      <stop offset="100%" stop-color="#6F4ABF"/>
    </linearGradient>
  </defs>
  <rect width="64" height="64" rx="12" fill="#111"/>
  <path d="M 14 20 L 10 26 L 10 42 L 14 48" fill="none" stroke="#2E5AA6" stroke-width="2.6" stroke-linecap="round"/>
  <path d="M 50 20 L 54 26 L 54 42 L 50 48" fill="none" stroke="#6F4ABF" stroke-width="2.6" stroke-linecap="round"/>
  <text x="14" y="46" font-family="monospace" font-size="23" fill="url(#accent)">›</text>
  <text x="32" y="47" text-anchor="middle" font-family="system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif" font-size="47" font-weight="500" fill="#fff">t</text>
</svg>`).toString('base64'),
    imageOptions: {
      hideBackgroundDots: true,
      imageSize: 0.35,
      margin: 5,
    },
  }) as QRCodeInstance;

  const buffer = await qrCode.getRawData('png');
  if (!buffer) {
    throw new Error('Failed to generate QR code');
  }
  return Buffer.from(buffer);
}

/**
 * Registers connection info routes on the Fastify server.
 *
 * Routes:
 * - GET /connection-info - Returns JSON with magic link and connection status
 * - GET /connection-info/qr - Returns branded QR code as PNG image
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

  // QR code image endpoint
  app.get('/connection-info/qr', async (request: FastifyRequest, reply: FastifyReply) => {
    const tunnelId = deps.getTunnelId();
    const publicUrl = deps.getPublicUrl();

    if (!tunnelId || !publicUrl) {
      return reply.status(503).send({
        error: 'Not connected to tunnel',
        message: 'QR code unavailable until workstation connects to tunnel',
      });
    }

    const magicLink = generateMagicLink(tunnelId, publicUrl, config.authKey);

    // Parse size from query string (default 300, max 1000)
    const query = request.query as { size?: string };
    let size = 300;
    if (query.size) {
      const parsed = parseInt(query.size, 10);
      if (!isNaN(parsed) && parsed >= 100 && parsed <= 1000) {
        size = parsed;
      }
    }

    try {
      const qrBuffer = await generateBrandedQRCode(magicLink, size);
      return await reply
        .status(200)
        .header('Content-Type', 'image/png')
        .header('Cache-Control', 'no-cache, no-store, must-revalidate')
        .send(qrBuffer);
    } catch (error) {
      return reply.status(500).send({
        error: 'QR generation failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });
}
