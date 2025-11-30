/**
 * @file env.ts
 * @copyright 2025 Roman Barinov <rbarinov@gmail.com>
 * @license MIT
 */

import { z } from 'zod';
import { config } from 'dotenv';
import { homedir } from 'os';
import { join } from 'path';

// Load environment variables from .env files
config({ path: '.env.local' });
config({ path: '.env' });

/**
 * Default data directory path.
 */
function getDefaultDataDir(): string {
  return join(homedir(), '.tiflis-code');
}

/**
 * Schema for environment variables validation.
 */
const EnvSchema = z.object({
  // Server
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3002),
  HOST: z.string().default('0.0.0.0'),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),

  // Tunnel Connection
  TUNNEL_URL: z.string().url('Tunnel URL must be a valid WebSocket URL'),
  TUNNEL_API_KEY: z.string().min(32, 'Tunnel API key must be at least 32 characters'),

  // Workstation Configuration
  WORKSTATION_NAME: z.string().default('Workstation'),
  WORKSTATION_AUTH_KEY: z.string().min(16, 'Auth key must be at least 16 characters'),

  // Workspaces Configuration
  WORKSPACES_ROOT: z
    .string()
    .min(1, 'Workspaces root directory is required')
    .default(join(homedir(), 'work')),

  // Data Storage
  DATA_DIR: z
    .string()
    .optional()
    .transform((val) => (val?.trim() || getDefaultDataDir())),

  // ─────────────────────────────────────────────────────────────
  // Supervisor Agent (LLM) Configuration
  // ─────────────────────────────────────────────────────────────
  AGENT_PROVIDER: z
    .enum(['openai', 'cerebras', 'anthropic', 'groq', 'together'])
    .default('openai'),
  AGENT_API_KEY: z.string().optional(),
  AGENT_MODEL_NAME: z.string().default('gpt-4o-mini'),
  AGENT_BASE_URL: z.string().url().optional(),
  AGENT_TEMPERATURE: z.coerce.number().min(0).max(2).default(0),

  // ─────────────────────────────────────────────────────────────
  // Speech-to-Text (STT) Configuration
  // ─────────────────────────────────────────────────────────────
  STT_PROVIDER: z.enum(['openai', 'elevenlabs', 'deepgram']).default('openai'),
  STT_API_KEY: z.string().optional(),
  STT_MODEL: z.string().default('whisper-1'),
  STT_BASE_URL: z.string().url().optional(),
  STT_LANGUAGE: z.string().default('en'),

  // ─────────────────────────────────────────────────────────────
  // Text-to-Speech (TTS) Configuration
  // ─────────────────────────────────────────────────────────────
  TTS_PROVIDER: z.enum(['openai', 'elevenlabs']).default('openai'),
  TTS_API_KEY: z.string().optional(),
  TTS_MODEL: z.string().default('tts-1'),
  TTS_VOICE: z.string().default('alloy'),
  TTS_BASE_URL: z.string().url().optional(),

  // ─────────────────────────────────────────────────────────────
  // Headless Agents Configuration
  // ─────────────────────────────────────────────────────────────
  /** Timeout for agent command execution in seconds (default: 15 minutes) */
  AGENT_EXECUTION_TIMEOUT: z.coerce.number().default(900),
  CLAUDE_SESSION_LOCK_WAIT_MS: z.coerce.number().default(1500),
  OPENCODE_DAEMON_URL: z.string().url().optional(),

  // ─────────────────────────────────────────────────────────────
  // Terminal Configuration
  // ─────────────────────────────────────────────────────────────
  /** Terminal output buffer size (number of messages, in-memory only, does not survive restarts) */
  TERMINAL_OUTPUT_BUFFER_SIZE: z.coerce.number().default(1000),

  // Legacy (fallback for STT/TTS if specific keys not set)
  OPENAI_API_KEY: z.string().optional(),
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

// Singleton env instance
let envInstance: Env | null = null;

/**
 * Gets the environment configuration singleton.
 */
export function getEnv(): Env {
  envInstance ??= loadEnv();
  return envInstance;
}

