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

// Minimal app interface to avoid FastifyInstance generic type conflicts
interface AppWithStatic {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  register: (plugin: any, options: { root: string; prefix: string; wildcard: boolean }) => PromiseLike<unknown>;
  addHook: (name: 'onSend', hook: (request: FastifyRequest, reply: FastifyReply, payload: unknown) => Promise<unknown>) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setNotFoundHandler: (handler: (request: FastifyRequest, reply: any) => Promise<unknown>) => void;
}

interface WebClientRouteOptions {
  webClientPath: string;
  logger: Logger;
}

// Security headers for web client
const SECURITY_HEADERS = {
  // Prevent MIME type sniffing
  'X-Content-Type-Options': 'nosniff',
  // Prevent clickjacking
  'X-Frame-Options': 'DENY',
  // XSS protection (legacy, but still useful for older browsers)
  'X-XSS-Protection': '1; mode=block',
  // Referrer policy
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  // Permissions policy (restrict sensitive APIs)
  'Permissions-Policy':
    'camera=(), microphone=(self), geolocation=(), payment=()',
  // Content Security Policy
  'Content-Security-Policy': [
    "default-src 'self'",
    // Allow wasm-unsafe-eval for WebAssembly (audio processing libraries)
    "script-src 'self' 'wasm-unsafe-eval'",
    "style-src 'self' 'unsafe-inline'", // unsafe-inline needed for Tailwind
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "connect-src 'self' ws: wss:",
    // Allow data: URIs for audio (TTS responses are base64-encoded)
    "media-src 'self' blob: data:",
    "worker-src 'self' blob:",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; '),
};

// Reply with sendFile method from @fastify/static
interface StaticReply extends FastifyReply {
  sendFile(filename: string): FastifyReply;
}

// Cache control settings
const CACHE_CONTROL = {
  // HTML files: no cache (SPA routing)
  html: 'no-cache, no-store, must-revalidate',
  // Hashed assets: long cache (1 year)
  assets: 'public, max-age=31536000, immutable',
  // Other static files: short cache (1 hour)
  default: 'public, max-age=3600',
};

/**
 * Determine cache control header based on file path
 */
function getCacheControl(url: string): string {
  if (url.endsWith('.html') || url === '/') {
    return CACHE_CONTROL.html;
  }
  // Vite adds hashes to asset filenames in /assets/
  if (url.includes('/assets/') || url.includes('.')) {
    const hasHash = /\.[a-f0-9]{8,}\./i.test(url);
    return hasHash ? CACHE_CONTROL.assets : CACHE_CONTROL.default;
  }
  return CACHE_CONTROL.default;
}

/**
 * Registers the web client static file serving route.
 * Serves the SPA from the specified directory.
 */
export async function registerWebClientRoute(
  app: AppWithStatic,
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

  // Add security headers hook for all web client requests
  app.addHook('onSend', async (request, reply, payload) => {
    const url = request.url;

    // Skip API and WebSocket paths
    if (
      url.startsWith('/api/') ||
      url.startsWith('/ws') ||
      url.startsWith('/health')
    ) {
      return payload;
    }

    // Apply security headers to all web client responses
    for (const [header, value] of Object.entries(SECURITY_HEADERS)) {
      reply.header(header, value);
    }

    // Apply cache control
    reply.header('Cache-Control', getCacheControl(url));

    return payload;
  });

  // Register static file serving
  await app.register(fastifyStatic, {
    root: absolutePath,
    prefix: '/',
    // Serve index.html for SPA routing
    wildcard: false,
  });

  // SPA fallback: serve index.html for all non-API routes
  // This must be registered after static files
  app.setNotFoundHandler(
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
