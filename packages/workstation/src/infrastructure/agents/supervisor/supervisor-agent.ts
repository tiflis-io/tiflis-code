/**
 * @file supervisor-agent.ts
 * @copyright 2025 Roman Barinov <rbarinov@gmail.com>
 * @license FSL-1.1-NC
 *
 * LangGraph-based Supervisor Agent for managing workstation resources.
 * Extends LangGraphAgent base class for unified streaming and state management.
 */

import type { Logger } from 'pino';
import type { StructuredToolInterface } from '@langchain/core/tools';
import type { SessionManager } from '../../../domain/ports/session-manager.js';
import type { AgentSessionManager } from '../agent-session-manager.js';
import type { BacklogAgentManager } from '../backlog-agent-manager.js';
import type { WorkspaceDiscovery } from '../../../domain/ports/workspace-discovery.js';
import type { MessageBroadcaster } from '../../../domain/ports/message-broadcaster.js';
import type { ChatHistoryService } from '../../../application/services/chat-history-service.js';
import type { AgentStateManager } from '../../../domain/ports/agent-state-manager.js';
import type { ContentBlock } from '../../../domain/value-objects/content-block.js';
import { LangGraphAgent } from '../base/lang-graph-agent.js';
import { SupervisorStateManager } from './supervisor-state-manager.js';
import { loadSystemPrompt } from '../utils/prompt-loader.js';
import { createWorkspaceTools } from './tools/workspace-tools.js';
import { createWorktreeTools } from './tools/worktree-tools.js';
import { createSessionTools } from './tools/session-tools.js';
import { createFilesystemTools } from './tools/filesystem-tools.js';
import { createBacklogTools } from './tools/backlog-tools.js';

/**
 * Callback for terminating a session.
 * Returns true if session was found and terminated, false otherwise.
 */
export type TerminateSessionCallback = (sessionId: string) => Promise<boolean>;

/**
 * Configuration for SupervisorAgent.
 */
export interface SupervisorAgentConfig {
  sessionManager: SessionManager;
  agentSessionManager: AgentSessionManager;
  workspaceDiscovery: WorkspaceDiscovery;
  workspacesRoot: string;
  logger: Logger;
  /** Optional getter for message broadcaster (late-bound) */
  getMessageBroadcaster?: () => MessageBroadcaster | null;
  /** Optional getter for chat history service (late-bound) */
  getChatHistoryService?: () => ChatHistoryService | null;
  /** Optional callback for terminating sessions (late-bound) */
  getTerminateSession?: () => TerminateSessionCallback | null;
}

/**
 * Result from supervisor agent execution.
 */
export interface SupervisorResult {
  output: string;
  sessionId?: string;
}

/**
 * LangGraph-based Supervisor Agent.
 *
 * The Supervisor manages:
 * - Workspace and project discovery
 * - Git worktree management
 * - Session lifecycle (create, list, terminate)
 * - File system operations
 *
 * Note: Conversation history is global (shared across all devices connected to this workstation).
 *
 * Extends LangGraphAgent to inherit:
 * - Unified streaming execution via executeWithStream()
 * - Conversation history management
 * - Cancellation support
 * - Event emission to all clients
 */
export class SupervisorAgent extends LangGraphAgent {
  private readonly getMessageBroadcaster?: () => MessageBroadcaster | null;
  private readonly getChatHistoryService?: () => ChatHistoryService | null;
  private readonly sessionManager: SessionManager;
  private readonly agentSessionManager: AgentSessionManager;
  private readonly workspaceDiscovery: WorkspaceDiscovery;
  private readonly workspacesRoot: string;
  private readonly getTerminateSession?: () => TerminateSessionCallback | null;

  constructor(config: SupervisorAgentConfig) {
    super(config.logger);
    this.getMessageBroadcaster = config.getMessageBroadcaster;
    this.getChatHistoryService = config.getChatHistoryService;
    this.sessionManager = config.sessionManager;
    this.agentSessionManager = config.agentSessionManager;
    this.workspaceDiscovery = config.workspaceDiscovery;
    this.workspacesRoot = config.workspacesRoot;
    this.getTerminateSession = config.getTerminateSession;

    // Initialize the LangGraph agent with tools
    this.initializeAgent();
  }

  protected buildSystemPrompt(): string {
    return loadSystemPrompt('supervisor-system-prompt', 'SUPERVISOR_SYSTEM_PROMPT_PATH');
  }

  /**
   * Implements abstract method: create tools for Supervisor.
   */
  protected createTools(): StructuredToolInterface[] {
    // Create terminate session callback wrapper
    const terminateSessionCallback = async (sessionId: string): Promise<boolean> => {
      const terminate = this.getTerminateSession?.();
      if (!terminate) {
        this.logger.warn('Terminate session callback not available');
        return false;
      }
      return terminate(sessionId);
    };

    // Create all supervisor-specific tools
    return [
      ...createWorkspaceTools(this.workspaceDiscovery),
      ...createWorktreeTools(this.workspaceDiscovery, this.agentSessionManager),
      ...createSessionTools(
        this.sessionManager,
        this.agentSessionManager,
        this.workspaceDiscovery,
        this.workspacesRoot,
        this.getMessageBroadcaster,
        this.getChatHistoryService,
        () => this.clearContext(),
        terminateSessionCallback
      ),
      ...createFilesystemTools(this.workspacesRoot),
      ...Object.values(createBacklogTools(
        this.sessionManager,
        this.agentSessionManager,
        (this.sessionManager.getBacklogManagers?.() ?? new Map()) as Map<string, BacklogAgentManager>,
        this.workspacesRoot,
        this.getMessageBroadcaster,
        this.logger,
        this.getChatHistoryService
      )),
    ];
  }

  /**
   * Implements abstract method: create state manager for Supervisor.
   */
  protected createStateManager(): AgentStateManager {
    const chatHistoryService = this.getChatHistoryService?.();
    if (!chatHistoryService) {
      throw new Error('ChatHistoryService is required for SupervisorAgent');
    }
    return new SupervisorStateManager(chatHistoryService);
  }

  /**
   * Clears supervisor context completely:
   * - In-memory conversation history
   * - Persistent history in database
   * - Notifies all connected clients
   */
  clearContext(): void {
    this.conversationHistory = [];
    this.isCancelled = false;

    const chatHistoryService = this.getChatHistoryService?.();
    if (chatHistoryService) {
      chatHistoryService.clearSupervisorHistory();
    }

    const broadcaster = this.getMessageBroadcaster?.();
    if (broadcaster) {
      const clearNotification = JSON.stringify({
        type: 'supervisor.context_cleared',
        payload: { timestamp: Date.now() },
      });
      broadcaster.broadcastToAll(clearNotification);
    }

    this.logger.info('Supervisor context cleared (in-memory, persistent, and clients notified)');
  }

  /**
   * Synchronous execute method for ISupervisorAgent interface compatibility.
   * Internally calls executeWithStream and returns a result.
   */
  async execute(
    command: string,
    deviceId: string,
    _currentSessionId?: string
  ): Promise<SupervisorResult> {
    let output = '';

    const blockHandler = (_deviceId: string, _blocks: ContentBlock[], isComplete: boolean, finalOutput?: string) => {
      if (isComplete && finalOutput) {
        output = finalOutput;
      }
    };

    this.on('blocks', blockHandler);

    try {
      await this.executeWithStream(command, deviceId);
    } finally {
      this.removeListener('blocks', blockHandler);
    }

    return { output };
  }

  clearHistory(): void {
    this.clearContext();
  }

  /**
   * Records acknowledgment of context clear from a device.
   * Used for multi-device synchronization.
   */
  recordClearAck(_broadcastId: string, _deviceId: string): void {
    this.logger.debug({ _broadcastId, _deviceId }, 'Context clear acknowledgment received');
  }
}
