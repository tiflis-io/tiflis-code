/**
 * @file agent-session-manager.ts
 * @copyright 2025 Roman Barinov <rbarinov@gmail.com>
 * @license MIT
 *
 * Manages headless agent sessions with executor and output parsing integration.
 */

import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';
import type { Logger } from 'pino';
import { HeadlessAgentExecutor } from './headless-agent-executor.js';
import type { ExecutorOptions } from './headless-agent-executor.js';
import { AgentOutputParser, type ParseResult } from './agent-output-parser.js';
import {
  type ChatMessage,
  createUserMessage,
  createErrorMessage,
  createCompletionMessage,
  createCancellationMessage,
} from '../../domain/value-objects/chat-message.js';
import type { AgentType } from '../../domain/entities/agent-session.js';
import { getEnv } from '../../config/env.js';

/**
 * State of an active agent session.
 */
export interface AgentSessionState {
  /** Unique session ID */
  sessionId: string;
  /** Agent type */
  agentType: AgentType;
  /** Working directory */
  workingDir: string;
  /** CLI session ID (for --resume flag) */
  cliSessionId: string | null;
  /** Whether a command is currently executing */
  isExecuting: boolean;
  /** Chat message history */
  messages: ChatMessage[];
  /** Session creation timestamp */
  createdAt: number;
  /** Last activity timestamp */
  lastActivityAt: number;
}

/**
 * Events emitted by AgentSessionManager.
 */
export interface AgentSessionManagerEvents {
  /** Emitted when a new chat message is received */
  message: (sessionId: string, message: ChatMessage, isComplete: boolean) => void;
  /** Emitted when a session is created */
  sessionCreated: (state: AgentSessionState) => void;
  /** Emitted when a session is terminated */
  sessionTerminated: (sessionId: string) => void;
  /** Emitted when CLI session ID is discovered */
  cliSessionIdDiscovered: (sessionId: string, cliSessionId: string) => void;
}

/**
 * Manages headless agent sessions with integrated output parsing.
 *
 * Features:
 * - Creates and manages HeadlessAgentExecutor instances
 * - Parses JSON output stream to ChatMessage objects
 * - Tracks CLI session IDs for context preservation
 * - Handles command execution lifecycle
 * - Maintains chat message history
 */
export class AgentSessionManager extends EventEmitter {
  private sessions = new Map<string, AgentSessionState>();
  private executors = new Map<string, HeadlessAgentExecutor>();
  private parsers = new Map<string, AgentOutputParser>();
  private buffers = new Map<string, string>();
  private logger: Logger;

  constructor(logger: Logger) {
    super();
    this.logger = logger.child({ component: 'AgentSessionManager' });
  }

  /**
   * Create a new agent session.
   */
  createSession(
    agentType: AgentType,
    workingDir: string,
    sessionId?: string
  ): AgentSessionState {
    const id = sessionId ?? `agent-${randomUUID()}`;
    const env = getEnv();

    // Create executor
    const executorOptions: ExecutorOptions = {
      workingDir,
      agentType,
      timeoutSeconds: env.AGENT_EXECUTION_TIMEOUT,
      opencodeDaemonUrl: env.OPENCODE_DAEMON_URL,
    };

    const executor = new HeadlessAgentExecutor(executorOptions);
    const parser = new AgentOutputParser();

    // Initialize session state
    const state: AgentSessionState = {
      sessionId: id,
      agentType,
      workingDir,
      cliSessionId: null,
      isExecuting: false,
      messages: [],
      createdAt: Date.now(),
      lastActivityAt: Date.now(),
    };

    // Setup executor event handlers
    this.setupExecutorHandlers(id, executor, parser);

    // Store references
    this.sessions.set(id, state);
    this.executors.set(id, executor);
    this.parsers.set(id, parser);
    this.buffers.set(id, '');

    this.logger.info({ sessionId: id, agentType, workingDir }, 'Agent session created');
    this.emit('sessionCreated', state);

    return state;
  }

  /**
   * Execute a command in an agent session.
   */
  async executeCommand(sessionId: string, prompt: string): Promise<void> {
    const state = this.sessions.get(sessionId);
    const executor = this.executors.get(sessionId);

    if (!state || !executor) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    if (state.isExecuting) {
      this.logger.warn({ sessionId }, 'Cancelling existing command before new execution');
      this.cancelCommand(sessionId);
    }

    // Update state
    state.isExecuting = true;
    state.lastActivityAt = Date.now();

    // Create and add user message
    const userMessage = createUserMessage(prompt);
    state.messages.push(userMessage);
    this.emit('message', sessionId, userMessage, false);

    // Set CLI session ID for context preservation
    if (state.cliSessionId) {
      executor.setCliSessionId(state.cliSessionId);
    }

    // Clear output buffer
    this.buffers.set(sessionId, '');

    try {
      await executor.execute(prompt);
      this.logger.debug({ sessionId, prompt: prompt.substring(0, 100) }, 'Command execution started');
    } catch (error) {
      state.isExecuting = false;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errMsg = createErrorMessage(`Failed to execute: ${errorMessage}`);
      state.messages.push(errMsg);
      this.emit('message', sessionId, errMsg, true);
      throw error;
    }
  }

  /**
   * Cancel the current command execution.
   */
  cancelCommand(sessionId: string): void {
    const state = this.sessions.get(sessionId);
    const executor = this.executors.get(sessionId);

    if (!state || !executor) {
      return;
    }

    if (!state.isExecuting) {
      return;
    }

    this.logger.info({ sessionId }, 'Cancelling command execution');

    // Kill the process
    executor.kill();
    state.isExecuting = false;
    state.lastActivityAt = Date.now();

    // Add cancellation message
    const cancelMsg = createCancellationMessage();
    state.messages.push(cancelMsg);
    this.emit('message', sessionId, cancelMsg, true);
  }

  /**
   * Clear chat history for a session (reset context).
   */
  clearHistory(sessionId: string): void {
    const state = this.sessions.get(sessionId);
    const executor = this.executors.get(sessionId);

    if (!state) {
      return;
    }

    state.messages = [];
    state.cliSessionId = null;

    if (executor) {
      executor.setCliSessionId(null);
    }

    this.logger.info({ sessionId }, 'Session history cleared');
  }

  /**
   * Terminate an agent session.
   */
  terminateSession(sessionId: string): void {
    const executor = this.executors.get(sessionId);

    if (executor) {
      executor.cleanup();
    }

    this.sessions.delete(sessionId);
    this.executors.delete(sessionId);
    this.parsers.delete(sessionId);
    this.buffers.delete(sessionId);

    this.logger.info({ sessionId }, 'Agent session terminated');
    this.emit('sessionTerminated', sessionId);
  }

  /**
   * Get session state.
   */
  getSession(sessionId: string): AgentSessionState | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * List all active sessions.
   */
  listSessions(): AgentSessionState[] {
    return Array.from(this.sessions.values());
  }

  /**
   * Get chat history for a session.
   */
  getMessages(sessionId: string): ChatMessage[] {
    return this.sessions.get(sessionId)?.messages ?? [];
  }

  /**
   * Check if a session is executing a command.
   */
  isExecuting(sessionId: string): boolean {
    return this.sessions.get(sessionId)?.isExecuting ?? false;
  }

  /**
   * Cleanup all sessions.
   */
  cleanup(): void {
    const sessionIds = Array.from(this.sessions.keys());
    for (const id of sessionIds) {
      this.terminateSession(id);
    }
  }

  /**
   * Setup event handlers for an executor.
   */
  private setupExecutorHandlers(
    sessionId: string,
    executor: HeadlessAgentExecutor,
    parser: AgentOutputParser
  ): void {
    // Handle stdout (JSON stream)
    executor.on('stdout', (data: string) => {
      this.handleOutput(sessionId, data, parser);
    });

    // Handle stderr
    executor.on('stderr', (data: string) => {
      this.logger.warn({ sessionId, stderr: data }, 'Agent stderr output');

      const state = this.sessions.get(sessionId);
      if (state) {
        const errMsg = createErrorMessage(data.trim());
        state.messages.push(errMsg);
        this.emit('message', sessionId, errMsg, false);
      }
    });

    // Handle exit
    executor.on('exit', (code: number | null) => {
      const state = this.sessions.get(sessionId);
      if (state) {
        state.isExecuting = false;
        state.lastActivityAt = Date.now();

        // Flush remaining buffer
        const buffer = this.buffers.get(sessionId) ?? '';
        if (buffer.trim()) {
          this.handleOutput(sessionId, '\n', parser);
        }

        // Send completion if not already sent
        if (code !== null) {
          const completionMsg = createCompletionMessage();
          state.messages.push(completionMsg);
          this.emit('message', sessionId, completionMsg, true);
        }
      }

      this.logger.debug({ sessionId, exitCode: code }, 'Agent process exited');
    });

    // Handle errors
    executor.on('error', (error: Error) => {
      this.logger.error({ sessionId, error }, 'Agent executor error');

      const state = this.sessions.get(sessionId);
      if (state) {
        state.isExecuting = false;
        const errMsg = createErrorMessage(error.message);
        state.messages.push(errMsg);
        this.emit('message', sessionId, errMsg, true);
      }
    });
  }

  /**
   * Handle output data from executor.
   */
  private handleOutput(
    sessionId: string,
    data: string,
    parser: AgentOutputParser
  ): void {
    const state = this.sessions.get(sessionId);
    const executor = this.executors.get(sessionId);
    if (!state) return;

    // Append to buffer
    const buffer = (this.buffers.get(sessionId) ?? '') + data;

    // Parse complete lines
    const { results, remaining } = parser.parseBuffer(buffer);
    this.buffers.set(sessionId, remaining);

    // Process parsed results
    for (const result of results) {
      this.processParseResult(sessionId, result, state, executor);
    }
  }

  /**
   * Process a single parse result.
   */
  private processParseResult(
    sessionId: string,
    result: ParseResult,
    state: AgentSessionState,
    executor: HeadlessAgentExecutor | undefined
  ): void {
    // Update CLI session ID if discovered
    if (result.sessionId && result.sessionId !== state.cliSessionId) {
      state.cliSessionId = result.sessionId;
      if (executor) {
        executor.setCliSessionId(result.sessionId);
      }
      this.logger.debug({ sessionId, cliSessionId: result.sessionId }, 'CLI session ID discovered');
      this.emit('cliSessionIdDiscovered', sessionId, result.sessionId);
    }

    // Handle completion
    if (result.isComplete) {
      state.isExecuting = false;
      state.lastActivityAt = Date.now();

      // Clear timeout since command completed
      if (executor) {
        executor.clearExecutionTimeout();
      }

      const completionMsg = createCompletionMessage();
      state.messages.push(completionMsg);
      this.emit('message', sessionId, completionMsg, true);
      return;
    }

    // Handle chat message
    if (result.message) {
      state.messages.push(result.message);
      state.lastActivityAt = Date.now();
      this.emit('message', sessionId, result.message, false);
    }
  }
}

