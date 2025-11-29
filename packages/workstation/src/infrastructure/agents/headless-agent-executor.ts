/**
 * @file headless-agent-executor.ts
 * @copyright 2025 Roman Barinov <rbarinov@gmail.com>
 * @license MIT
 *
 * Executes headless CLI agents (cursor-agent, claude, opencode) via subprocess.
 * Handles session persistence, output streaming, and graceful termination.
 */

import { spawn, type ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import { AGENT_COMMANDS, AGENT_EXECUTION_CONFIG } from '../../config/constants.js';
import type { AgentType } from '../../domain/entities/agent-session.js';

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
  /** Type of agent (cursor, claude, opencode) */
  agentType: AgentType;
  /** Execution timeout in seconds (0 = no timeout) */
  timeoutSeconds?: number;
  /** OpenCode daemon URL (required for opencode agent) */
  opencodeDaemonUrl?: string;
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
  private readonly timeoutSeconds: number;
  private readonly opencodeDaemonUrl: string;

  constructor(options: ExecutorOptions) {
    super();
    this.workingDir = options.workingDir;
    this.agentType = options.agentType;
    this.timeoutSeconds =
      options.timeoutSeconds ?? AGENT_EXECUTION_CONFIG.DEFAULT_TIMEOUT_SECONDS;
    this.opencodeDaemonUrl =
      options.opencodeDaemonUrl ?? AGENT_COMMANDS.opencode.defaultDaemonUrl;
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

    // Spawn subprocess
    this.subprocess = spawn(command, args, {
      cwd: this.workingDir,
      env: {
        ...process.env,
        // Ensure proper terminal environment
        TERM: 'xterm-256color',
        // Disable interactive prompts
        CI: 'true',
      },
      stdio: ['ignore', 'pipe', 'pipe'], // stdin ignored, stdout/stderr piped
    });

    // Setup stdout handler
    this.subprocess.stdout?.on('data', (data: Buffer) => {
      const text = data.toString();
      this.emit('stdout', text);
    });

    // Setup stderr handler
    this.subprocess.stderr?.on('data', (data: Buffer) => {
      const text = data.toString();
      this.emit('stderr', text);
    });

    // Setup exit handler
    this.subprocess.on('exit', (code: number | null) => {
      this.clearExecutionTimeout();
      this.emit('exit', code);
      this.subprocess = null;
    });

    // Setup error handler
    this.subprocess.on('error', (error: Error) => {
      this.clearExecutionTimeout();
      this.emit('error', error);
    });

    // Start execution timeout timer
    this.startExecutionTimeout();
  }

  /**
   * Build command and arguments for subprocess based on agent type.
   */
  private buildCommand(prompt: string): { command: string; args: string[] } {
    switch (this.agentType) {
      case 'cursor':
        return this.buildCursorCommand(prompt);
      case 'claude':
        return this.buildClaudeCommand(prompt);
      case 'opencode':
        return this.buildOpencodeCommand(prompt);
      default: {
        // This should never happen if AgentType is exhaustive
        const exhaustiveCheck: never = this.agentType;
        throw new Error(`Unsupported agent type: ${String(exhaustiveCheck)}`);
      }
    }
  }

  /**
   * Build cursor-agent command.
   * Format: cursor-agent --output-format stream-json --print [--resume <session_id>] "prompt"
   */
  private buildCursorCommand(prompt: string): { command: string; args: string[] } {
    const config = AGENT_COMMANDS.cursor;
    const args: string[] = [...config.baseArgs];

    if (this.cliSessionId) {
      args.push(config.resumeFlag, this.cliSessionId);
    }

    // Prompt as last argument
    args.push(prompt);

    return { command: config.command, args };
  }

  /**
   * Build claude CLI command.
   * Format: claude --verbose --print -p "prompt" --output-format stream-json [--resume <session_id>]
   *
   * NOTE: --verbose is REQUIRED when using --print with --output-format stream-json
   */
  private buildClaudeCommand(prompt: string): { command: string; args: string[] } {
    const config = AGENT_COMMANDS.claude;
    const args: string[] = [...config.baseArgs];

    // Add prompt via -p flag
    args.push(config.promptFlag, prompt);

    if (this.cliSessionId) {
      args.push(config.resumeFlag, this.cliSessionId);
    }

    return { command: config.command, args };
  }

  /**
   * Build opencode command.
   * Format: opencode run --attach <daemon_url>
   *
   * OpenCode uses a daemon architecture: a single `opencode serve` instance
   * runs on the workstation, and agents connect via `opencode run --attach`.
   */
  private buildOpencodeCommand(prompt: string): { command: string; args: string[] } {
    const config = AGENT_COMMANDS.opencode;
    const args = [...config.runArgs, this.opencodeDaemonUrl];

    // For opencode, prompt might be passed differently
    // TODO: Verify opencode CLI interface for headless mode
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
   * Kill the subprocess gracefully.
   */
  kill(): void {
    if (!this.subprocess || this.subprocess.killed) {
      this.subprocess = null;
      return;
    }

    this.isKilled = true;

    try {
      // Try graceful shutdown first (SIGTERM)
      this.subprocess.kill('SIGTERM');

      // Force kill after timeout
      setTimeout(() => {
        if (this.subprocess && !this.subprocess.killed && this.subprocess.pid) {
          try {
            this.subprocess.kill('SIGKILL');
          } catch {
            // Process may already be dead
          }
        }
      }, AGENT_EXECUTION_CONFIG.GRACEFUL_SHUTDOWN_TIMEOUT_MS);
    } catch {
      // Process may already be dead
    }

    this.subprocess = null;
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
      case 'claude':
        return AGENT_COMMANDS.claude.postTerminationWaitMs;
      case 'cursor':
        return AGENT_COMMANDS.cursor.postTerminationWaitMs;
      case 'opencode':
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
        this.emit('error', error);
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

