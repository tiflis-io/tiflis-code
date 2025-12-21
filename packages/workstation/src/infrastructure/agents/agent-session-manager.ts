/**
 * @file agent-session-manager.ts
 * @copyright 2025 Roman Barinov <rbarinov@gmail.com>
 * @license FSL-1.1-NC
 *
 * Manages headless agent sessions with executor and output parsing integration.
 */

import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';
import type { Logger } from 'pino';
import { HeadlessAgentExecutor } from './headless-agent-executor.js';
import type { ExecutorOptions } from './headless-agent-executor.js';
import { AgentOutputParser, type ParseResult } from './agent-output-parser.js';
import type { ContentBlock } from '../../domain/value-objects/content-block.js';
import {
  createTextBlock,
  createErrorBlock,
  createStatusBlock,
} from '../../domain/value-objects/content-block.js';
import type { AgentType } from '../../domain/entities/agent-session.js';
import { getEnv } from '../../config/env.js';

/**
 * A stored message with its content blocks.
 */
export interface StoredMessage {
  id: string;
  timestamp: number;
  role: 'user' | 'assistant' | 'system';
  blocks: ContentBlock[];
}

/**
 * State of an active agent session.
 */
export interface AgentSessionState {
  /** Unique session ID */
  sessionId: string;
  /** Base agent type (cursor, claude, opencode) */
  agentType: AgentType;
  /** Agent name (can be alias like 'zai' or base type like 'claude') */
  agentName: string;
  /** Working directory */
  workingDir: string;
  /** CLI session ID (for --resume flag) */
  cliSessionId: string | null;
  /** Whether a command is currently executing */
  isExecuting: boolean;
  /** Whether the session was cancelled - prevents any further output */
  isCancelled: boolean;
  /** Chat message history */
  messages: StoredMessage[];
  /** Session creation timestamp */
  createdAt: number;
  /** Last activity timestamp */
  lastActivityAt: number;
}

/**
 * Events emitted by AgentSessionManager.
 */
export interface AgentSessionManagerEvents {
  /** Emitted when content blocks are received */
  blocks: (sessionId: string, blocks: ContentBlock[], isComplete: boolean) => void;
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
   *
   * @param agentType - Base agent type (cursor, claude, opencode)
   * @param workingDir - Working directory for the agent
   * @param sessionId - Optional custom session ID
   * @param agentName - Optional agent name (alias like 'zai' or base type)
   */
  createSession(
    agentType: AgentType,
    workingDir: string,
    sessionId?: string,
    agentName?: string
  ): AgentSessionState {
    const id = sessionId ?? `agent-${randomUUID()}`;
    const resolvedAgentName = agentName ?? agentType;
    const env = getEnv();

    // Create executor with agent name for alias support
    const executorOptions: ExecutorOptions = {
      workingDir,
      agentType,
      agentName: resolvedAgentName,
      timeoutSeconds: env.AGENT_EXECUTION_TIMEOUT,
    };

    const executor = new HeadlessAgentExecutor(executorOptions);
    const parser = new AgentOutputParser();

    // Initialize session state
    const state: AgentSessionState = {
      sessionId: id,
      agentType,
      agentName: resolvedAgentName,
      workingDir,
      cliSessionId: null,
      isExecuting: false,
      isCancelled: false,
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

    this.logger.info({ sessionId: id, agentType, agentName: resolvedAgentName, workingDir }, 'Agent session created');
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

    // Update state - reset cancelled flag for new execution
    state.isExecuting = true;
    state.isCancelled = false;
    state.lastActivityAt = Date.now();

    // Create and add user message to in-memory history
    // Note: We don't emit 'blocks' for user messages - iOS adds them locally
    // and workstation saves them via chatHistoryService in session.execute handler
    const userBlocks = [createTextBlock(prompt)];
    const userMessage: StoredMessage = {
      id: randomUUID(),
      timestamp: Date.now(),
      role: 'user',
      blocks: userBlocks,
    };
    state.messages.push(userMessage);

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
      const errorBlocks = [createErrorBlock(`Failed to execute: ${errorMessage}`)];
      const errMsg: StoredMessage = {
        id: randomUUID(),
        timestamp: Date.now(),
        role: 'system',
        blocks: errorBlocks,
      };
      state.messages.push(errMsg);
      this.emit('blocks', sessionId, errorBlocks, true);
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
      this.logger.debug({ sessionId, hasState: !!state, hasExecutor: !!executor }, 'cancelCommand: session or executor not found');
      return;
    }

    if (!state.isExecuting) {
      this.logger.debug({ sessionId }, 'cancelCommand: session is not executing');
      return;
    }

    this.logger.info({ sessionId }, 'Cancelling command execution');

    // CRITICAL: Set BOTH flags immediately to prevent ANY further output processing
    state.isExecuting = false;
    state.isCancelled = true;
    state.lastActivityAt = Date.now();

    // Clear the output buffer to prevent processing of any pending data
    this.buffers.set(sessionId, '');

    // Kill the process (SIGKILL for immediate termination)
    // This removes all event listeners from the subprocess and kills the process group
    executor.kill();

    // Note: We don't emit 'blocks' here - the session.cancel handler in main.ts
    // broadcasts the "Cancelled by user" message to all subscribers.
    // This prevents duplicate messages and ensures proper ordering.
    this.logger.info({ sessionId }, 'Command cancelled, process killed');
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
  getMessages(sessionId: string): StoredMessage[] {
    return this.sessions.get(sessionId)?.messages ?? [];
  }

  /**
   * Check if a session is executing a command.
   */
  isExecuting(sessionId: string): boolean {
    return this.sessions.get(sessionId)?.isExecuting ?? false;
  }

  /**
   * Check if a session was cancelled.
   * Used by main.ts to filter out late-arriving blocks.
   */
  wasCancelled(sessionId: string): boolean {
    return this.sessions.get(sessionId)?.isCancelled ?? false;
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
   * Terminates sessions that are running in a specific worktree.
   * Returns the list of terminated session IDs.
   */
  terminateWorktreeSessions(workspace: string, project: string, branch: string): string[] {
    const worktreePath = `/${workspace}/${project}--${branch}`;
    const terminatedSessions: string[] = [];

    for (const [sessionId, state] of this.sessions) {
      // Check if session is related to this worktree
      const isInWorktree = state.workingDir.includes(worktreePath) || 
                          state.cliSessionId?.includes(`${project}--${branch}`) ||
                          state.workingDir.endsWith(`${project}--${branch}`);

      if (isInWorktree) {
        try {
          // Cancel any executing command first
          if (state.isExecuting) {
            this.cancelCommand(sessionId);
          }
          
          // Terminate the session
          this.terminateSession(sessionId);
          terminatedSessions.push(sessionId);
          
          this.logger.info({ sessionId, workspace, project, branch }, 'Terminated worktree session');
        } catch (error) {
          this.logger.error({ sessionId, error }, 'Failed to terminate worktree session');
        }
      }
    }

    return terminatedSessions;
  }

  /**
   * Gets session summary for a specific worktree.
   */
  getWorktreeSessionSummary(workspace: string, project: string, branch: string): {
    activeSessions: AgentSessionState[];
    sessionCount: number;
    sessionTypes: string[];
    executingCount: number;
  } {
    const worktreePath = `/${workspace}/${project}--${branch}`;
    
    const activeSessions = Array.from(this.sessions.values()).filter(session => 
      session.workingDir.includes(worktreePath) || 
      session.cliSessionId?.includes(`${project}--${branch}`) ||
      session.workingDir.endsWith(`${project}--${branch}`)
    );

    const sessionTypes = [...new Set(activeSessions.map(s => s.agentType))];
    const executingCount = activeSessions.filter(s => s.isExecuting).length;

    return {
      activeSessions,
      sessionCount: activeSessions.length,
      sessionTypes,
      executingCount,
    };
  }

  /**
   * Lists all sessions with their worktree information.
   */
  listSessionsWithWorktreeInfo(): {
    sessionId: string;
    agentType: string;
    agentName: string;
    workingDir: string;
    isExecuting: boolean;
    worktreeInfo?: {
      workspace?: string;
      project?: string;
      branch?: string;
      isWorktree: boolean;
    };
  }[] {
    return Array.from(this.sessions.values()).map(session => {
      // Parse worktree information from working directory
      const worktreeInfo = this.parseWorktreeInfo(session.workingDir);
      
      return {
        sessionId: session.sessionId,
        agentType: session.agentType,
        agentName: session.agentName,
        workingDir: session.workingDir,
        isExecuting: session.isExecuting,
        worktreeInfo,
      };
    });
  }

  /**
   * Parse worktree information from a working directory path.
   */
  private parseWorktreeInfo(workingDir: string): {
    workspace?: string;
    project?: string;
    branch?: string;
    isWorktree: boolean;
  } {
    // Pattern: /workspaces/workspace/project--branch or /workspaces/workspace/project
    const parts = workingDir.split('/');
    
    if (parts.length < 3) {
      return { isWorktree: false };
    }

    // Find the workspaces root and parse from there
    const workspacesIndex = parts.findIndex(part => part === 'workspaces' || part.includes('workspace'));
    if (workspacesIndex === -1 || workspacesIndex + 2 >= parts.length) {
      return { isWorktree: false };
    }

    const workspace = parts[workspacesIndex + 1];
    const projectPart = parts[workspacesIndex + 2];
    
    if (!projectPart) {
      return { isWorktree: false };
    }

    // Check if it's a worktree (contains --) or main project
    if (projectPart.includes('--')) {
      const [project, branch] = projectPart.split('--');
      return { workspace, project, branch, isWorktree: true };
    } else {
      return { workspace, project: projectPart, isWorktree: false };
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
      const state = this.sessions.get(sessionId);
      // Don't process stderr after cancellation - check BOTH flags
      if (!state || !state.isExecuting || state.isCancelled) {
        this.logger.debug({ sessionId }, 'Ignoring stderr - session cancelled');
        return;
      }

      this.logger.warn({ sessionId, stderr: data }, 'Agent stderr output');

      const errorBlocks = [createErrorBlock(data.trim())];
      const errMsg: StoredMessage = {
        id: randomUUID(),
        timestamp: Date.now(),
        role: 'system',
        blocks: errorBlocks,
      };
      state.messages.push(errMsg);
      this.emit('blocks', sessionId, errorBlocks, false);
    });

    // Handle exit
    executor.on('exit', (code: number | null) => {
      const state = this.sessions.get(sessionId);
      if (!state) {
        this.logger.debug({ sessionId, exitCode: code }, 'Agent process exited (no state)');
        return;
      }

      // If cancelled, don't do anything - cancellation handler already handled it
      if (state.isCancelled) {
        this.logger.debug({ sessionId, exitCode: code }, 'Agent process exited (was cancelled, ignoring)');
        return;
      }

      // If already not executing, don't send completion
      const wasExecuting = state.isExecuting;
      state.isExecuting = false;
      state.lastActivityAt = Date.now();

      this.logger.debug({ sessionId, exitCode: code, wasExecuting }, 'Agent process exited');

      if (!wasExecuting) {
        // Session was not executing, don't send completion
        return;
      }

      // Flush remaining buffer (only if was executing)
      const buffer = this.buffers.get(sessionId) ?? '';
      if (buffer.trim()) {
        this.handleOutput(sessionId, '\n', parser);
      }

      // Send completion if not already sent
      if (code !== null) {
        const completionBlocks = [createStatusBlock('Command completed')];
        const completionMsg: StoredMessage = {
          id: randomUUID(),
          timestamp: Date.now(),
          role: 'system',
          blocks: completionBlocks,
        };
        state.messages.push(completionMsg);
        this.emit('blocks', sessionId, completionBlocks, true);
      }
    });

    // Handle errors
    executor.on('error', (error: Error) => {
      const state = this.sessions.get(sessionId);

      // If session was cancelled, don't report errors from the killed process
      if (!state || !state.isExecuting || state.isCancelled) {
        this.logger.debug({ sessionId, error: error.message }, 'Ignoring error - session cancelled');
        return;
      }

      this.logger.error({ sessionId, error }, 'Agent executor error');

      state.isExecuting = false;
      const errorBlocks = [createErrorBlock(error.message)];
      const errMsg: StoredMessage = {
        id: randomUUID(),
        timestamp: Date.now(),
        role: 'system',
        blocks: errorBlocks,
      };
      state.messages.push(errMsg);
      this.emit('blocks', sessionId, errorBlocks, true);
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

    // CRITICAL: Don't process any output after cancellation
    // This prevents buffered data from being emitted after kill
    // Check BOTH flags - isCancelled is the primary cancel indicator
    if (!state.isExecuting || state.isCancelled) {
      this.logger.debug({ sessionId, isExecuting: state.isExecuting, isCancelled: state.isCancelled }, 'Ignoring output - session cancelled');
      return;
    }

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

      const completionBlocks = [createStatusBlock('Command completed')];
      const completionMsg: StoredMessage = {
        id: randomUUID(),
        timestamp: Date.now(),
        role: 'system',
        blocks: completionBlocks,
      };
      state.messages.push(completionMsg);
      this.emit('blocks', sessionId, completionBlocks, true);
      return;
    }

    // Handle content blocks
    if (result.blocks.length > 0) {
      const msg: StoredMessage = {
        id: randomUUID(),
        timestamp: Date.now(),
        role: 'assistant',
        blocks: result.blocks,
      };
      state.messages.push(msg);
      state.lastActivityAt = Date.now();
      this.emit('blocks', sessionId, result.blocks, false);
    }
  }
}

