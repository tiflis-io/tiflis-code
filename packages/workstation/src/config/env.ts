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
  STT_PROVIDER: z.enum(["openai", "elevenlabs", "deepgram", "local"]).default("openai"),
  STT_API_KEY: z.string().optional(),
  STT_MODEL: z.string().default("whisper-1"),
  STT_BASE_URL: z.string().url().optional(),
  STT_LANGUAGE: z.string().default("en"),

  // ─────────────────────────────────────────────────────────────
  // Text-to-Speech (TTS) Configuration
  // ─────────────────────────────────────────────────────────────
  TTS_PROVIDER: z.enum(["openai", "elevenlabs", "local"]).default("openai"),
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
  // Agent Visibility Configuration
  // Hide base agent options in mobile apps (only show aliases)
  // ─────────────────────────────────────────────────────────────
  /** Hide base Cursor agent option (only show aliases) */
  HIDE_BASE_CURSOR: z
    .string()
    .transform((val) => val.toLowerCase() === "true")
    .default("false"),
  /** Hide base Claude agent option (only show aliases) */
  HIDE_BASE_CLAUDE: z
    .string()
    .transform((val) => val.toLowerCase() === "true")
    .default("false"),
  /** Hide base OpenCode agent option (only show aliases) */
  HIDE_BASE_OPENCODE: z
    .string()
    .transform((val) => val.toLowerCase() === "true")
    .default("false"),

  // ─────────────────────────────────────────────────────────────
  // Terminal Configuration
  // ─────────────────────────────────────────────────────────────
  /** Terminal output buffer size (number of messages, in-memory only, does not survive restarts) */
  TERMINAL_OUTPUT_BUFFER_SIZE: z.coerce.number().default(10000),
  /** Terminal output batch interval in milliseconds (how long to wait before flushing) */
  TERMINAL_BATCH_INTERVAL_MS: z.coerce.number().default(64),
  /** Terminal output batch max size in bytes (flush immediately when exceeded) */
  TERMINAL_BATCH_MAX_SIZE: z.coerce.number().default(4096),

  // Legacy (fallback for STT/TTS if specific keys not set)
  OPENAI_API_KEY: z.string().optional(),

  // ─────────────────────────────────────────────────────────────
  // Mock Mode Configuration (for screenshot automation)
  // ─────────────────────────────────────────────────────────────
  /** Enable mock mode for screenshot automation tests */
  MOCK_MODE: z
    .string()
    .transform((val) => val.toLowerCase() === "true")
    .default("false"),
  /** Path to mock fixtures directory (defaults to built-in fixtures) */
  MOCK_FIXTURES_PATH: z.string().optional(),
});

export type Env = z.infer<typeof EnvSchema>;

/**
 * Parsed agent alias configuration.
 * Example: AGENT_ALIAS_ZAI="claude --settings ~/.zai/settings.json"
 * Results in: { name: 'zai', baseCommand: 'claude', additionalArgs: ['--settings', '~/.zai/settings.json'], envVars: {} }
 *
 * Example with env vars: AGENT_ALIAS_CUSTOM="CLAUDE_CONFIG_DIR=/path claude"
 * Results in: { name: 'custom', baseCommand: 'claude', additionalArgs: [], envVars: { CLAUDE_CONFIG_DIR: '/path' } }
 */
export interface AgentAlias {
  /** Alias name (lowercase, derived from env var name after AGENT_ALIAS_) */
  name: string;
  /** Base command (first word after env vars: 'claude', 'cursor-agent', 'opencode') */
  baseCommand: string;
  /** Additional arguments to prepend before standard flags */
  additionalArgs: string[];
  /** Environment variables to set when spawning the agent */
  envVars: Record<string, string>;
  /** Original raw command string for debugging */
  rawCommand: string;
}

/**
 * Parses agent aliases from environment variables.
 * Looks for variables matching pattern: AGENT_ALIAS_<NAME>=[ENV=val...] <command> [args...]
 *
 * Example env vars:
 *   AGENT_ALIAS_ZAI=claude --settings ~/.zai/settings.json
 *   AGENT_ALIAS_CLAUDE_OPUS=claude --model opus
 *   AGENT_ALIAS_CURSOR_PRO=cursor-agent --pro-mode
 *   AGENT_ALIAS_CUSTOM=CLAUDE_CONFIG_DIR=/path/to/config claude
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

    // Parse command: handle env var prefixes, then base command, then args
    // Handle quoted strings properly
    const parts = parseCommandString(value);
    if (parts.length === 0) {
      console.warn(`Invalid agent alias ${key}: empty command`);
      continue;
    }

    // Extract env var assignments from the beginning (format: VAR=value)
    const envVars: Record<string, string> = {};
    let commandStartIndex = 0;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (!part) break;
      // Check if this part is an env var assignment (contains = but doesn't start with -)
      const eqIndex = part.indexOf("=");
      if (eqIndex > 0 && !part.startsWith("-")) {
        const varName = part.slice(0, eqIndex);
        const varValue = part.slice(eqIndex + 1);
        // Validate it looks like an env var name (uppercase letters, numbers, underscores)
        if (/^[A-Z_][A-Z0-9_]*$/.test(varName)) {
          envVars[varName] = varValue;
          commandStartIndex = i + 1;
          continue;
        }
      }
      // Not an env var assignment, stop looking
      break;
    }

    // Get remaining parts after env vars
    const commandParts = parts.slice(commandStartIndex);
    if (commandParts.length === 0) {
      console.warn(`Invalid agent alias ${key}: no command after env vars`);
      continue;
    }

    const baseCommand = commandParts[0];
    if (!baseCommand) {
      console.warn(`Invalid agent alias ${key}: empty base command`);
      continue;
    }
    const additionalArgs = commandParts.slice(1);

    aliases.set(aliasName, {
      name: aliasName,
      baseCommand,
      additionalArgs,
      envVars,
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
  // Strip surrounding quotes if present (handles dotenv quirks)
  let cmd = command.trim();
  if (
    (cmd.startsWith('"') && cmd.endsWith('"')) ||
    (cmd.startsWith("'") && cmd.endsWith("'"))
  ) {
    cmd = cmd.slice(1, -1);
  }

  const parts: string[] = [];
  let current = "";
  let inQuote = false;
  let quoteChar = "";

  for (const char of cmd) {
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
