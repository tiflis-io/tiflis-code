/**
 * @file constants.ts
 * @copyright 2025 Roman Barinov <rbarinov@gmail.com>
 * @license FSL-1.1-NC
 */

/**
 * Protocol version for compatibility checking.
 * Format: major.minor.patch (semver)
 */
export const PROTOCOL_VERSION = {
  major: 1,
  minor: 0,
  patch: 0,
} as const;

/**
 * Gets protocol version as semver string (e.g., "1.0.0")
 */
export function getProtocolVersion(): string {
  return `${PROTOCOL_VERSION.major}.${PROTOCOL_VERSION.minor}.${PROTOCOL_VERSION.patch}`;
}

/**
 * Connection timing constants (in milliseconds).
 */
export const CONNECTION_TIMING = {
  /** How often to send ping to tunnel (15 seconds - keeps connection alive through proxies) */
  PING_INTERVAL_MS: 15_000,

  /** Max time to wait for pong before considering connection stale (30 seconds) */
  PONG_TIMEOUT_MS: 30_000,

  /** Max time to wait for registration response (15 seconds) */
  REGISTRATION_TIMEOUT_MS: 15_000,

  /** Minimum reconnect delay (1 second) */
  RECONNECT_DELAY_MIN_MS: 1_000,

  /** Maximum reconnect delay (30 seconds) */
  RECONNECT_DELAY_MAX_MS: 30_000,

  /** Interval for checking timed-out client connections (10 seconds) */
  CLIENT_TIMEOUT_CHECK_INTERVAL_MS: 10_000,
} as const;

/**
 * WebSocket configuration.
 */
export const WEBSOCKET_CONFIG = {
  /** Path for local WebSocket endpoint (for direct connections) */
  PATH: "/ws",
} as const;

/**
 * Session configuration.
 */
export const SESSION_CONFIG = {
  /** Maximum number of concurrent agent sessions */
  MAX_AGENT_SESSIONS: 10,

  /** Maximum number of concurrent terminal sessions */
  MAX_TERMINAL_SESSIONS: 5,

  /** Default terminal columns */
  DEFAULT_TERMINAL_COLS: 80,

  /** Default terminal rows */
  DEFAULT_TERMINAL_ROWS: 24,

  /** Minimum terminal rows (ensures proper display in TUI apps like htop, vim) */
  MIN_TERMINAL_ROWS: 24,

  /** Minimum terminal columns */
  MIN_TERMINAL_COLS: 40,

  /** Message history limit for replay */
  MESSAGE_HISTORY_LIMIT: 100,

  /** Data retention period for terminated sessions (30 days in ms) */
  DATA_RETENTION_MS: 30 * 24 * 60 * 60 * 1000,

  /** Default terminal output buffer size (number of messages) */
  DEFAULT_TERMINAL_OUTPUT_BUFFER_SIZE: 100,
} as const;

/**
 * Agent CLI commands for different agent types.
 *
 * Each agent has specific flags for headless operation:
 * - Cursor: Uses --output-format stream-json --print, --resume for session persistence
 * - Claude: Uses --verbose --print -p "prompt" --output-format stream-json, --resume for session persistence
 *   NOTE: --verbose is REQUIRED when using --print with --output-format stream-json
 * - OpenCode: Uses direct `run` command with JSON output
 *
 * Permission bypass flags (for headless/non-interactive mode):
 * - Cursor: --force (auto-approve tool use), --approve-mcps (auto-approve MCP servers)
 * - Claude: --dangerously-skip-permissions (bypass all permission checks)
 * - OpenCode: No flag needed - permissive by default in headless mode
 */
export const AGENT_COMMANDS = {
  cursor: {
    command: "cursor-agent",
    /**
     * Base args for cursor-agent (prompt is appended as last argument)
     * --force: Force allow commands unless explicitly denied (auto-approve tool use)
     * --approve-mcps: Automatically approve all MCP servers (headless mode only)
     */
    baseArgs: [
      "--output-format",
      "stream-json",
      "--print",
      "--force",
      "--approve-mcps",
    ],
    /** Flag to resume existing session */
    resumeFlag: "--resume",
    description: "Cursor AI Agent (headless mode)",
    /** Wait time after process termination (ms) */
    postTerminationWaitMs: 500,
  },
  claude: {
    command: "claude",
    /** Base args for claude CLI (prompt is passed via -p flag) */
    baseArgs: [
      "--verbose",
      "--print",
      "--output-format",
      "stream-json",
      "--dangerously-skip-permissions",
    ],
    /** Flag to resume existing session (NOT --session-id!) */
    resumeFlag: "--resume",
    /** Flag for passing prompt */
    promptFlag: "-p",
    description: "Claude Code Agent (headless mode)",
    /** Wait time after process termination (ms) - Claude needs more time to release session lock */
    postTerminationWaitMs: 1500,
  },
  opencode: {
    command: "opencode",
    /** Subcommand for running prompts */
    runSubcommand: "run",
    /** Flag for session continuation */
    sessionFlag: "--session",
    /** Flag for output format */
    formatFlag: "--format",
    /** Output format value */
    formatValue: "json",
    description: "OpenCode Agent (headless mode)",
    postTerminationWaitMs: 500,
  },
} as const;

/**
 * Agent execution configuration.
 */
export const AGENT_EXECUTION_CONFIG = {
  /** Default execution timeout (seconds) - 15 minutes for complex tasks */
  DEFAULT_TIMEOUT_SECONDS: 900,

  /** Timeout for waiting on process termination during graceful shutdown (ms) */
  GRACEFUL_SHUTDOWN_TIMEOUT_MS: 2000,

  /** Maximum buffer size for JSON line parsing (bytes) */
  MAX_BUFFER_SIZE: 1024 * 1024, // 1MB

  /** Completion message types that indicate command finished */
  COMPLETION_TYPES: [
    "result",
    "session_end",
    // OpenCode completion types
    "session.complete",
    "session.done",
    "session.finished",
    "done",
    "complete",
  ] as const,
} as const;

import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { getAgentAliases } from "./env.js";

/**
 * Base agent types (built-in).
 */
export const BASE_AGENT_TYPES = ["cursor", "claude", "opencode"] as const;
export type BaseAgentType = (typeof BASE_AGENT_TYPES)[number];

/**
 * Checks if a string is a base agent type.
 */
export function isBaseAgentType(type: string): type is BaseAgentType {
  return BASE_AGENT_TYPES.includes(type as BaseAgentType);
}

/**
 * Unified agent command configuration.
 * Used for both base agents and aliases.
 */
export interface AgentCommandConfig {
  /** Agent identifier (e.g., 'claude', 'zai', 'claude-opus') */
  name: string;
  /** CLI command to execute (e.g., 'claude', 'cursor-agent') */
  command: string;
  /** Additional arguments from alias (prepended before base args) */
  aliasArgs: string[];
  /** Environment variables from alias (set when spawning) */
  aliasEnvVars: Record<string, string>;
  /** Base agent type this is derived from */
  baseType: BaseAgentType;
  /** Human-readable description */
  description: string;
  /** Whether this is a custom alias */
  isAlias: boolean;
}

/**
 * Gets the base agent type from a command string.
 * Maps CLI commands to base types.
 */
function getBaseTypeFromCommand(command: string): BaseAgentType | null {
  const commandMap: Record<string, BaseAgentType> = {
    claude: "claude",
    "cursor-agent": "cursor",
    opencode: "opencode",
  };
  return commandMap[command] ?? null;
}

/**
 * Gets all available agent types (base + aliases).
 * Returns a map of agent name to command configuration.
 */
export function getAvailableAgents(): Map<string, AgentCommandConfig> {
  const agents = new Map<string, AgentCommandConfig>();

  // Add base agents
  agents.set("cursor", {
    name: "cursor",
    command: AGENT_COMMANDS.cursor.command,
    aliasArgs: [],
    aliasEnvVars: {},
    baseType: "cursor",
    description: AGENT_COMMANDS.cursor.description,
    isAlias: false,
  });

  agents.set("claude", {
    name: "claude",
    command: AGENT_COMMANDS.claude.command,
    aliasArgs: [],
    aliasEnvVars: {},
    baseType: "claude",
    description: AGENT_COMMANDS.claude.description,
    isAlias: false,
  });

  agents.set("opencode", {
    name: "opencode",
    command: AGENT_COMMANDS.opencode.command,
    aliasArgs: [],
    aliasEnvVars: {},
    baseType: "opencode",
    description: AGENT_COMMANDS.opencode.description,
    isAlias: false,
  });

  // Add aliases from environment
  const aliases = getAgentAliases();
  for (const [name, alias] of aliases) {
    const baseType = getBaseTypeFromCommand(alias.baseCommand);
    if (!baseType) {
      console.warn(
        `Unknown base command '${alias.baseCommand}' for alias '${name}'. ` +
          `Supported: claude, cursor-agent, opencode`
      );
      continue;
    }

    agents.set(name, {
      name,
      command: alias.baseCommand,
      aliasArgs: alias.additionalArgs,
      aliasEnvVars: alias.envVars,
      baseType,
      description: `${name} (alias for ${baseType} with custom config)`,
      isAlias: true,
    });
  }

  return agents;
}

/**
 * Gets agent command configuration by name.
 * Returns null if agent not found.
 */
export function getAgentConfig(agentName: string): AgentCommandConfig | null {
  const agents = getAvailableAgents();
  return agents.get(agentName) ?? null;
}

/**
 * Gets list of all available agent names.
 */
export function getAvailableAgentNames(): string[] {
  return Array.from(getAvailableAgents().keys());
}

/**
 * Gets workstation server version from package.json
 */
export function getWorkstationVersion(): string {
  try {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    const packageJsonPath = join(__dirname, "../../package.json");
    const packageJsonContent = readFileSync(packageJsonPath, "utf-8");
    const packageJson = JSON.parse(packageJsonContent) as { version?: string };
    const version = packageJson.version;
    if (typeof version === "string" && version.length > 0) {
      return version;
    }
    return "0.0.0";
  } catch {
    // Fallback if package.json cannot be read
    return "0.0.0";
  }
}
