/**
 * @file headless-agent-executor.ts
 * @copyright 2025 Roman Barinov <rbarinov@gmail.com>
 * @license FSL-1.1-NC
 *
 * Executes headless CLI agents (cursor-agent, claude, opencode) via subprocess.
 * Handles session persistence, output streaming, and graceful termination.
 */

import { spawn, type ChildProcess } from "child_process";
import { EventEmitter } from "events";
import {
  AGENT_COMMANDS,
  AGENT_EXECUTION_CONFIG,
  getAgentConfig,
  type AgentCommandConfig,
} from "../../config/constants.js";
import type { AgentType } from "../../domain/entities/agent-session.js";
import { getShellEnv } from "../shell/shell-env.js";

/**
 * Events emitted by HeadlessAgentExecutor.
 */
export interface ExecutorEvents {
  stdout: (data: string) => void;
  stderr: (data: string) => void;
  exit: (code: number | null) => void;
  error: (error: Error) => void;
}

/**
 * Options for creating a HeadlessAgentExecutor.
 */
export interface ExecutorOptions {
  /** Working directory for command execution */
  workingDir: string;
  /** Base type of agent (cursor, claude, opencode) - used for command building logic */
  agentType: AgentType;
  /** Agent name (can be alias like 'zai' or base type like 'claude') */
  agentName?: string;
  /** Execution timeout in seconds (0 = no timeout) */
  timeoutSeconds?: number;
}

/**
 * Executes headless terminal commands via direct subprocess (no PTY).
 *
 * Supports:
 * - cursor-agent: Cursor AI Agent
 * - claude: Claude Code CLI
 * - opencode: OpenCode agent (attach mode)
 *
 * Features:
 * - Session ID persistence across commands (--resume flag)
 * - JSON stream output parsing
 * - Execution timeout handling
 * - Graceful process termination
 */
export class HeadlessAgentExecutor extends EventEmitter {
  private subprocess: ChildProcess | null = null;
  private cliSessionId: string | null = null;
  private executionTimeoutTimer: NodeJS.Timeout | null = null;
  private isKilled = false;

  private readonly workingDir: string;
  private readonly agentType: AgentType;
  private readonly agentName: string;
  private readonly agentConfig: AgentCommandConfig | null;
  private readonly timeoutSeconds: number;

  constructor(options: ExecutorOptions) {
    super();
    this.workingDir = options.workingDir;
    this.agentType = options.agentType;
    this.agentName = options.agentName ?? options.agentType;
    this.agentConfig = getAgentConfig(this.agentName);
    this.timeoutSeconds =
      options.timeoutSeconds ?? AGENT_EXECUTION_CONFIG.DEFAULT_TIMEOUT_SECONDS;
  }

  /**
   * Execute a command/prompt via the agent CLI.
   *
   * @param prompt - The user prompt/command to execute
   * @throws Error if already running or spawn fails
   */
  async execute(prompt: string): Promise<void> {
    // Clear any existing timeout
    this.clearExecutionTimeout();
    this.isKilled = false;

    // Kill existing subprocess and wait for cleanup
    if (this.subprocess) {
      await this.killAndWait();
    }

    // Build command and arguments
    const { command, args } = this.buildCommand(prompt);

    // Get alias environment variables (if any)
    const aliasEnvVars = this.getAliasEnvVars();

    // Get environment from interactive login shell to include PATH from .zshrc/.bashrc
    const shellEnv = getShellEnv();

    // Spawn subprocess in its own process group (detached)
    // This allows killing the entire process tree with process.kill(-pid)
    this.subprocess = spawn(command, args, {
      cwd: this.workingDir,
      env: {
        ...shellEnv,
        // Apply alias env vars (e.g., CLAUDE_CONFIG_DIR)
        ...aliasEnvVars,
        // Ensure proper terminal environment
        TERM: "xterm-256color",
        // Disable interactive prompts
        CI: "true",
      },
      stdio: ["ignore", "pipe", "pipe"], // stdin ignored, stdout/stderr piped
      detached: true, // Create new process group for clean termination
    });

    // Setup stdout handler - ignore data after kill
    this.subprocess.stdout?.on("data", (data: Buffer) => {
      if (this.isKilled) return;
      const text = data.toString();
      this.emit("stdout", text);
    });

    // Setup stderr handler - ignore data after kill
    this.subprocess.stderr?.on("data", (data: Buffer) => {
      if (this.isKilled) return;
      const text = data.toString();
      this.emit("stderr", text);
    });

    // Setup exit handler
    this.subprocess.on("exit", (code: number | null) => {
      this.clearExecutionTimeout();
      if (!this.isKilled) {
        this.emit("exit", code);
      }
      this.subprocess = null;
    });

    // Setup error handler
    this.subprocess.on("error", (error: Error) => {
      this.clearExecutionTimeout();
      if (!this.isKilled) {
        this.emit("error", error);
      }
    });

    // Start execution timeout timer
    this.startExecutionTimeout();
  }

  /**
   * Build command and arguments for subprocess based on agent type.
   */
  private buildCommand(prompt: string): { command: string; args: string[] } {
    switch (this.agentType) {
      case "cursor":
        return this.buildCursorCommand(prompt);
      case "claude":
        return this.buildClaudeCommand(prompt);
      case "opencode":
        return this.buildOpencodeCommand(prompt);
      default: {
        // This should never happen if AgentType is exhaustive
        const exhaustiveCheck: never = this.agentType;
        throw new Error(`Unsupported agent type: ${String(exhaustiveCheck)}`);
      }
    }
  }

  /**
   * Get alias arguments from agent config.
   * Returns empty array if no alias configured.
   */
  private getAliasArgs(): string[] {
    return this.agentConfig?.aliasArgs ?? [];
  }

  /**
   * Get alias environment variables from agent config.
   * Returns empty object if no alias configured.
   */
  private getAliasEnvVars(): Record<string, string> {
    return this.agentConfig?.aliasEnvVars ?? {};
  }

  /**
   * Build cursor-agent command.
   * Format: cursor-agent [alias-args] --output-format stream-json --print [--resume <session_id>] "prompt"
   */
  private buildCursorCommand(prompt: string): {
    command: string;
    args: string[];
  } {
    const config = AGENT_COMMANDS.cursor;
    const aliasArgs = this.getAliasArgs();

    // Alias args come first, then base args
    const args: string[] = [...aliasArgs, ...config.baseArgs];

    if (this.cliSessionId) {
      args.push(config.resumeFlag, this.cliSessionId);
    }

    // Prompt as last argument
    args.push(prompt);

    return { command: config.command, args };
  }

  /**
   * Build claude CLI command.
   * Format: claude [alias-args] --verbose --print -p "prompt" --output-format stream-json [--resume <session_id>]
   *
   * NOTE: --verbose is REQUIRED when using --print with --output-format stream-json
   * Alias args (like --settings ~/.zai/settings.json) are placed FIRST before base args.
   */
  private buildClaudeCommand(prompt: string): {
    command: string;
    args: string[];
  } {
    const config = AGENT_COMMANDS.claude;
    const aliasArgs = this.getAliasArgs();

    // Alias args come first (e.g., --settings), then base args
    const args: string[] = [...aliasArgs, ...config.baseArgs];

    // Add prompt via -p flag
    args.push(config.promptFlag, prompt);

    if (this.cliSessionId) {
      args.push(config.resumeFlag, this.cliSessionId);
    }

    return { command: config.command, args };
  }

  /**
   * Build opencode command.
   * Format: opencode run [--session <session_id>] --format json [alias-args] "prompt"
   *
   * Example: opencode run --session ses_xxx --format json "what is the number?"
   *
   * OpenCode runs directly without daemon, reading config from ~/.config/opencode/opencode.json
   */
  private buildOpencodeCommand(prompt: string): {
    command: string;
    args: string[];
  } {
    const config = AGENT_COMMANDS.opencode;
    const aliasArgs = this.getAliasArgs();

    // Start with 'run' subcommand
    const args: string[] = [config.runSubcommand];

    // Add session continuation flag if we have a session ID
    if (this.cliSessionId) {
      args.push(config.sessionFlag, this.cliSessionId);
    }

    // Add format flag
    args.push(config.formatFlag, config.formatValue);

    // Add alias args (e.g., --model anthropic/claude-sonnet-4-5)
    args.push(...aliasArgs);

    // Add prompt as last argument
    args.push(prompt);

    return { command: config.command, args };
  }

  /**
   * Set CLI session ID for context preservation.
   */
  setCliSessionId(sessionId: string | null): void {
    this.cliSessionId = sessionId;
  }

  /**
   * Get current CLI session ID.
   */
  getCliSessionId(): string | null {
    return this.cliSessionId;
  }

  /**
   * Check if subprocess is currently running.
   */
  isRunning(): boolean {
    if (!this.subprocess) return false;
    if (this.subprocess.killed) return false;
    if (!this.subprocess.pid) return false;
    return true;
  }

  /**
   * Kill the subprocess and all its children immediately with SIGKILL.
   * No graceful shutdown - we want the process dead NOW.
   */
  kill(): void {
    // Set killed flag FIRST to stop all event handlers
    this.isKilled = true;

    // Clear any execution timeout
    this.clearExecutionTimeout();

    if (!this.subprocess) {
      return;
    }

    const pid = this.subprocess.pid;
    const proc = this.subprocess;

    // Clear reference BEFORE killing - this prevents any race conditions
    this.subprocess = null;

    // Remove all listeners from subprocess to stop callbacks
    proc.stdout?.removeAllListeners("data");
    proc.stderr?.removeAllListeners("data");
    proc.removeAllListeners("exit");
    proc.removeAllListeners("error");

    // Destroy streams to stop any pending data
    proc.stdout?.destroy();
    proc.stderr?.destroy();

    if (!pid) {
      return;
    }

    // Kill the process group with SIGKILL
    try {
      process.kill(-pid, "SIGKILL");
    } catch {
      // Process group kill failed, try direct kill
      try {
        process.kill(pid, "SIGKILL");
      } catch {
        // Process already dead - that's fine
      }
    }
  }

  /**
   * Kill subprocess and wait for post-termination delay.
   * Claude CLI needs extra time to release session lock.
   */
  private async killAndWait(): Promise<void> {
    const waitTime = this.getPostTerminationWaitTime();

    this.kill();

    // Wait for agent to release session lock
    await new Promise((resolve) => setTimeout(resolve, waitTime));
  }

  /**
   * Get post-termination wait time based on agent type.
   */
  private getPostTerminationWaitTime(): number {
    switch (this.agentType) {
      case "claude":
        return AGENT_COMMANDS.claude.postTerminationWaitMs;
      case "cursor":
        return AGENT_COMMANDS.cursor.postTerminationWaitMs;
      case "opencode":
        return AGENT_COMMANDS.opencode.postTerminationWaitMs;
      default:
        return 500;
    }
  }

  /**
   * Start execution timeout timer.
   */
  private startExecutionTimeout(): void {
    if (this.timeoutSeconds <= 0) return; // No timeout

    const timeoutMs = this.timeoutSeconds * 1000;

    this.executionTimeoutTimer = setTimeout(() => {
      if (this.isRunning() && !this.isKilled) {
        const error = new Error(
          `Execution timeout (${this.timeoutSeconds}s exceeded)`
        );
        this.emit("error", error);
        this.kill();
      }
    }, timeoutMs);
  }

  /**
   * Clear execution timeout timer.
   */
  clearExecutionTimeout(): void {
    if (this.executionTimeoutTimer) {
      clearTimeout(this.executionTimeoutTimer);
      this.executionTimeoutTimer = null;
    }
  }

  /**
   * Cleanup resources.
   */
  cleanup(): void {
    this.clearExecutionTimeout();
    this.kill();
    this.removeAllListeners();
  }
}
