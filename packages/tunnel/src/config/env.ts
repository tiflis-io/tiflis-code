/**
 * @file env.ts
 * @copyright 2025 Roman Barinov <rbarinov@gmail.com>
 * @license FSL-1.1-NC
 */

import { z } from 'zod';
import { config } from 'dotenv';

// Load environment variables from .env files
config({ path: '.env.local' });
config({ path: '.env' });

/**
 * Schema for environment variables validation.
 */
const EnvSchema = z.object({
  // Server
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3001),
  HOST: z.string().default('0.0.0.0'),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),

  // Security
  TUNNEL_REGISTRATION_API_KEY: z.string().min(32, 'API key must be at least 32 characters'),

  // Reverse Proxy Configuration
  /**
   * Whether the server is running behind a reverse proxy.
   * When true, the server will trust X-Forwarded-* headers.
   */
  TRUST_PROXY: z.coerce.boolean().default(false),

  /**
   * Public base URL for the tunnel server (used to generate public_url in registration response).
   * Example: "wss://tunnel.example.com" or "ws://localhost:3001"
   * If not set, will be auto-generated based on HOST and PORT.
   */
  PUBLIC_BASE_URL: z.string().url().optional(),

  /**
   * Custom WebSocket path (defaults to /ws).
   */
  WS_PATH: z.string().default('/ws'),

  /**
   * Optional path to web client static files directory.
   * When set, the tunnel server will serve the web client at the root path.
   * Example: "./node_modules/@tiflis-io/tiflis-code-web/dist"
   */
  WEB_CLIENT_PATH: z.string().optional(),
});

export type Env = z.infer<typeof EnvSchema>;

/**
 * Loads and validates environment variables.
 * Exits the process if validation fails.
 */
export function loadEnv(): Env {
  const result = EnvSchema.safeParse(process.env);

  if (!result.success) {
    console.error('❌ Invalid environment variables:');
    console.error(result.error.format());
    process.exit(1);
  }

  return result.data;
}

/**
 * Generates the public URL for the tunnel server.
 * Returns only the base WebSocket URL without any query parameters.
 */
export function generatePublicUrl(env: Env): string {
  if (env.PUBLIC_BASE_URL) {
    // Use configured public URL
    const baseUrl = env.PUBLIC_BASE_URL.replace(/\/$/, '');
    return `${baseUrl}${env.WS_PATH}`;
  }

  // Auto-generate based on host and port
  const protocol = env.NODE_ENV === 'production' ? 'wss' : 'ws';
  const host = env.HOST === '0.0.0.0' ? 'localhost' : env.HOST;
  return `${protocol}://${host}:${env.PORT}${env.WS_PATH}`;
}

// Singleton env instance
let envInstance: Env | null = null;

/**
 * Gets the environment configuration singleton.
 */
export function getEnv(): Env {
  envInstance ??= loadEnv();
  return envInstance;
}

