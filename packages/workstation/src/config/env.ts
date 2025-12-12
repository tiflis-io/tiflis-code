/**
 * @file env.ts
 * @copyright 2025 Roman Barinov <rbarinov@gmail.com>
 * @license FSL-1.1-NC
 */

import { z } from "zod";
import { config } from "dotenv";
import { homedir } from "os";
import { join } from "path";

// Load environment variables from .env files
config({ path: ".env.local" });
config({ path: ".env" });

/**
 * Default data directory path.
 */
function getDefaultDataDir(): string {
  return join(homedir(), ".tiflis-code");
}

/**
 * Schema for environment variables validation.
 */
const EnvSchema = z.object({
  // Server
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  PORT: z.coerce.number().default(3002),
  HOST: z.string().default("0.0.0.0"),
  LOG_LEVEL: z
    .enum(["trace", "debug", "info", "warn", "error", "fatal"])
    .default("info"),

  // Tunnel Connection
  TUNNEL_URL: z.string().url("Tunnel URL must be a valid WebSocket URL"),
  TUNNEL_API_KEY: z
    .string()
    .min(32, "Tunnel API key must be at least 32 characters"),

  // Workstation Configuration
  WORKSTATION_NAME: z.string().default("Workstation"),
  WORKSTATION_AUTH_KEY: z
    .string()
    .min(16, "Auth key must be at least 16 characters"),

  // Workspaces Configuration
  WORKSPACES_ROOT: z
    .string()
    .min(1, "Workspaces root directory is required")
    .default(join(homedir(), "work")),

  // Data Storage
  DATA_DIR: z
    .string()
    .optional()
    .transform((val) => {
      const trimmed = val?.trim();
      return trimmed && trimmed.length > 0 ? trimmed : getDefaultDataDir();
    }),

  // ─────────────────────────────────────────────────────────────
  // Supervisor Agent (LLM) Configuration
  // ─────────────────────────────────────────────────────────────
  AGENT_PROVIDER: z
    .enum(["openai", "cerebras", "anthropic", "groq", "together"])
    .default("openai"),
  AGENT_API_KEY: z.string().optional(),
  AGENT_MODEL_NAME: z.string().default("gpt-4o-mini"),
  AGENT_BASE_URL: z.string().url().optional(),
  AGENT_TEMPERATURE: z.coerce.number().min(0).max(2).default(0),

  // ─────────────────────────────────────────────────────────────
  // Speech-to-Text (STT) Configuration
  // ─────────────────────────────────────────────────────────────
  STT_PROVIDER: z.enum(["openai", "elevenlabs", "deepgram"]).default("openai"),
  STT_API_KEY: z.string().optional(),
  STT_MODEL: z.string().default("whisper-1"),
  STT_BASE_URL: z.string().url().optional(),
  STT_LANGUAGE: z.string().default("en"),

  // ─────────────────────────────────────────────────────────────
  // Text-to-Speech (TTS) Configuration
  // ─────────────────────────────────────────────────────────────
  TTS_PROVIDER: z.enum(["openai", "elevenlabs"]).default("openai"),
  TTS_API_KEY: z.string().optional(),
  TTS_MODEL: z.string().default("tts-1"),
  TTS_VOICE: z.string().default("alloy"),
  TTS_BASE_URL: z.string().url().optional(),

  // ─────────────────────────────────────────────────────────────
  // Headless Agents Configuration
  // ─────────────────────────────────────────────────────────────
  /** Timeout for agent command execution in seconds (default: 15 minutes) */
  AGENT_EXECUTION_TIMEOUT: z.coerce.number().default(900),
  CLAUDE_SESSION_LOCK_WAIT_MS: z.coerce.number().default(1500),

  // ─────────────────────────────────────────────────────────────
  // Terminal Configuration
  // ─────────────────────────────────────────────────────────────
  /** Terminal output buffer size (number of messages, in-memory only, does not survive restarts) */
  TERMINAL_OUTPUT_BUFFER_SIZE: z.coerce.number().default(100),

  // Legacy (fallback for STT/TTS if specific keys not set)
  OPENAI_API_KEY: z.string().optional(),
});

export type Env = z.infer<typeof EnvSchema>;

/**
 * Parsed agent alias configuration.
 * Example: AGENT_ALIAS_ZAI="claude --settings ~/.zai/settings.json"
 * Results in: { name: 'zai', baseCommand: 'claude', additionalArgs: ['--settings', '~/.zai/settings.json'] }
 */
export interface AgentAlias {
  /** Alias name (lowercase, derived from env var name after AGENT_ALIAS_) */
  name: string;
  /** Base command (first word: 'claude', 'cursor-agent', 'opencode') */
  baseCommand: string;
  /** Additional arguments to prepend before standard flags */
  additionalArgs: string[];
  /** Original raw command string for debugging */
  rawCommand: string;
}

/**
 * Parses agent aliases from environment variables.
 * Looks for variables matching pattern: AGENT_ALIAS_<NAME>=<command> [args...]
 *
 * Example env vars:
 *   AGENT_ALIAS_ZAI=claude --settings ~/.zai/settings.json
 *   AGENT_ALIAS_CLAUDE_OPUS=claude --model opus
 *   AGENT_ALIAS_CURSOR_PRO=cursor-agent --pro-mode
 *
 * @returns Map of alias name (lowercase) to AgentAlias config
 */
export function parseAgentAliases(): Map<string, AgentAlias> {
  const aliases = new Map<string, AgentAlias>();
  const aliasPrefix = "AGENT_ALIAS_";

  for (const [key, value] of Object.entries(process.env)) {
    if (!key.startsWith(aliasPrefix) || !value) {
      continue;
    }

    // Extract alias name from env var (e.g., AGENT_ALIAS_ZAI -> zai)
    const aliasName = key
      .slice(aliasPrefix.length)
      .toLowerCase()
      .replace(/_/g, "-");

    // Parse command: first word is base command, rest are additional args
    // Handle quoted strings properly
    const parts = parseCommandString(value);
    if (parts.length === 0) {
      console.warn(`Invalid agent alias ${key}: empty command`);
      continue;
    }

    // parts[0] is guaranteed to exist after length check above
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const baseCommand = parts[0]!;
    const additionalArgs = parts.slice(1);

    aliases.set(aliasName, {
      name: aliasName,
      baseCommand,
      additionalArgs,
      rawCommand: value,
    });
  }

  return aliases;
}

/**
 * Parses a command string into parts, handling quoted strings.
 * Example: 'claude --settings "~/.zai/settings.json"' -> ['claude', '--settings', '~/.zai/settings.json']
 */
function parseCommandString(command: string): string[] {
  const parts: string[] = [];
  let current = "";
  let inQuote = false;
  let quoteChar = "";

  for (const char of command) {
    if (!inQuote && (char === '"' || char === "'")) {
      inQuote = true;
      quoteChar = char;
    } else if (inQuote && char === quoteChar) {
      inQuote = false;
      quoteChar = "";
    } else if (!inQuote && char === " ") {
      if (current.length > 0) {
        parts.push(current);
        current = "";
      }
    } else {
      current += char;
    }
  }

  if (current.length > 0) {
    parts.push(current);
  }

  return parts;
}

// Singleton for parsed aliases
let agentAliasesInstance: Map<string, AgentAlias> | null = null;

/**
 * Gets the agent aliases singleton.
 */
export function getAgentAliases(): Map<string, AgentAlias> {
  agentAliasesInstance ??= parseAgentAliases();
  return agentAliasesInstance;
}

/**
 * Loads and validates environment variables.
 * Exits the process if validation fails.
 */
export function loadEnv(): Env {
  const result = EnvSchema.safeParse(process.env);

  if (!result.success) {
    console.error("❌ Invalid environment variables:");
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
