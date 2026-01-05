/**
 * @file supervisor-agent.ts
 * @copyright 2025 Roman Barinov <rbarinov@gmail.com>
 * @license FSL-1.1-NC
 *
 * LangGraph-based Supervisor Agent for managing workstation resources.
 */

import { EventEmitter } from 'events';
import { ChatOpenAI } from '@langchain/openai';
import { createReactAgent } from '@langchain/langgraph/prebuilt';
import { HumanMessage, AIMessage, isAIMessage, type BaseMessage } from '@langchain/core/messages';
import type { Logger } from 'pino';
import type { StructuredToolInterface } from '@langchain/core/tools';
import type { SessionManager } from '../../../domain/ports/session-manager.js';
import type { AgentSessionManager } from '../agent-session-manager.js';
import type { WorkspaceDiscovery } from '../../../domain/ports/workspace-discovery.js';
import type { MessageBroadcaster } from '../../../domain/ports/message-broadcaster.js';
import type { ChatHistoryService } from '../../../application/services/chat-history-service.js';
import { createWorkspaceTools } from './tools/workspace-tools.js';
import { createWorktreeTools } from './tools/worktree-tools.js';
import { createSessionTools } from './tools/session-tools.js';
import { createFilesystemTools } from './tools/filesystem-tools.js';
import { createBacklogTools } from './tools/backlog-tools.js';
import { getEnv } from '../../../config/env.js';
import {
  createTextBlock,
  createToolBlock,
  createStatusBlock,
  createErrorBlock,
  accumulateBlocks,
  mergeToolBlocks,
  type ContentBlock,
} from '../../../domain/value-objects/content-block.js';

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
 * Conversation history entry.
 */
interface ConversationEntry {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * Events emitted by SupervisorAgent during streaming execution.
 */
export interface SupervisorAgentEvents {
  /** Emitted when content blocks are received during streaming
   * @param deviceId - The device ID that initiated the command
   * @param blocks - Content blocks to send to client
   * @param isComplete - Whether streaming is complete
   * @param finalOutput - The complete response text (only present when isComplete=true)
   * @param allBlocks - All accumulated blocks for persistence (only present when isComplete=true)
   */
  blocks: (deviceId: string, blocks: ContentBlock[], isComplete: boolean, finalOutput?: string, allBlocks?: ContentBlock[]) => void;
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
 */
export class SupervisorAgent extends EventEmitter {
  private readonly logger: Logger;
  private readonly agent: ReturnType<typeof createReactAgent>;
  private readonly getMessageBroadcaster?: () => MessageBroadcaster | null;
  private readonly getChatHistoryService?: () => ChatHistoryService | null;
  private conversationHistory: ConversationEntry[] = [];
  private abortController: AbortController | null = null;
  private isExecuting = false;
  private isCancelled = false;
  /** Tracks if we're processing a command (including STT, before LLM execution) */
  private isProcessingCommand = false;
  /** Timestamp when current execution started (for race condition protection) */
  private executionStartedAt = 0;

  constructor(config: SupervisorAgentConfig) {
    super();
    this.logger = config.logger.child({ component: 'SupervisorAgent' });
    this.getMessageBroadcaster = config.getMessageBroadcaster;
    this.getChatHistoryService = config.getChatHistoryService;

    // Create LLM
    const env = getEnv();
    const llm = this.createLLM(env);

    // Create terminate session callback wrapper
    const terminateSessionCallback = async (sessionId: string): Promise<boolean> => {
      const terminate = config.getTerminateSession?.();
      if (!terminate) {
        this.logger.warn('Terminate session callback not available');
        return false;
      }
      return terminate(sessionId);
    };

    // Create all tools
    const tools: StructuredToolInterface[] = [
      ...createWorkspaceTools(config.workspaceDiscovery),
      ...createWorktreeTools(config.workspaceDiscovery, config.agentSessionManager),
      ...createSessionTools(
        config.sessionManager,
        config.agentSessionManager,
        config.workspaceDiscovery,
        config.workspacesRoot,
        config.getMessageBroadcaster,
        config.getChatHistoryService,
        () => this.clearContext(),
        terminateSessionCallback
      ),
      ...createFilesystemTools(config.workspacesRoot),
      ...Object.values(createBacklogTools(
        config.sessionManager,
        config.agentSessionManager,
        config.sessionManager.getBacklogManagers?.() ?? new Map()
      )),
    ];

    this.logger.info({ toolCount: tools.length }, 'Creating Supervisor Agent with tools');

    // Create LangGraph ReAct agent
    this.agent = createReactAgent({
      llm,
      tools,
    });
  }

  /**
   * Creates the LLM instance based on configuration.
   */
  private createLLM(env: ReturnType<typeof getEnv>): ChatOpenAI {
    const provider = env.AGENT_PROVIDER;
    const apiKey = env.AGENT_API_KEY;
    const modelName = env.AGENT_MODEL_NAME;
    const baseUrl = env.AGENT_BASE_URL;
    const temperature = env.AGENT_TEMPERATURE;

    if (!apiKey) {
      throw new Error('AGENT_API_KEY is required for Supervisor Agent');
    }

    this.logger.info({ provider, model: modelName }, 'Initializing LLM');

    // LangChain's ChatOpenAI works with OpenAI-compatible APIs
    return new ChatOpenAI({
      openAIApiKey: apiKey,
      modelName,
      temperature,
      configuration: baseUrl
        ? {
            baseURL: baseUrl,
          }
        : undefined,
    });
  }

  /**
   * Executes a command through the supervisor agent.
   * Note: deviceId is used for routing responses, not for history (history is global).
   */
  async execute(
    command: string,
    deviceId: string,
    currentSessionId?: string
  ): Promise<SupervisorResult> {
    this.logger.info({ command, deviceId, currentSessionId }, 'Executing supervisor command');

    try {
      // Get global conversation history
      const history = this.getConversationHistory();

      // Build messages from history
      const messages: BaseMessage[] = [
        ...this.buildSystemMessage(),
        ...this.buildHistoryMessages(history),
        new HumanMessage(command),
      ];

      // Execute the agent
      const result = await this.agent.invoke({
        messages,
      }) as { messages: BaseMessage[] };

      // Extract the final response
      const agentMessages = result.messages;
      const lastMessage = agentMessages[agentMessages.length - 1];
      const content = lastMessage?.content;
      const output =
        typeof content === 'string'
          ? content
          : JSON.stringify(content);

      // Update global conversation history
      this.addToHistory('user', command);
      this.addToHistory('assistant', output);

      this.logger.debug({ output: output.slice(0, 200) }, 'Supervisor command completed');

      return {
        output,
        sessionId: currentSessionId,
      };
    } catch (error) {
      this.logger.error({ error, command }, 'Supervisor command failed');
      const errorMessage =
        error instanceof Error ? error.message : 'An unexpected error occurred';
      return {
        output: `Error: ${errorMessage}`,
      };
    }
  }

  /**
   * Executes a command with streaming output.
   * Emits 'blocks' events as content is generated.
   * Note: deviceId is used for routing responses, history is global.
   */
  async executeWithStream(
    command: string,
    deviceId: string
  ): Promise<void> {
    this.logger.info({ command, deviceId, wasCancelledBefore: this.isCancelled }, 'Executing supervisor command with streaming');

    // Set up abort controller for cancellation
    this.abortController = new AbortController();
    this.isExecuting = true;
    this.isCancelled = false;
    // Track when execution started to prevent race conditions with late cancel requests
    this.executionStartedAt = Date.now();

    this.logger.debug({ isCancelled: this.isCancelled, isExecuting: this.isExecuting }, 'Flags reset for new execution');

    try {
      // Get global conversation history
      const history = this.getConversationHistory();

      // Build messages from history
      const messages: BaseMessage[] = [
        ...this.buildSystemMessage(),
        ...this.buildHistoryMessages(history),
        new HumanMessage(command),
      ];

      // Emit status block to show processing (only if still executing)
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      if (this.isExecuting && !this.isCancelled) {
        const statusBlock = createStatusBlock('Processing...');
        this.logger.debug({ deviceId, blockType: 'status' }, 'Emitting status block');
        this.emit('blocks', deviceId, [statusBlock], false);
      }

      this.logger.info({ deviceId }, 'Starting LangGraph agent stream');
      // Stream the agent execution
      const stream = await this.agent.stream(
        { messages },
        {
          streamMode: 'values',
          signal: this.abortController.signal,
        }
      );

      let finalOutput = '';
      const allBlocks: ContentBlock[] = [];

      for await (const chunk of stream) {
        // Check if cancelled or not executing - stop processing immediately
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        if (this.isCancelled || !this.isExecuting) {
          this.logger.info({ deviceId, isCancelled: this.isCancelled, isExecuting: this.isExecuting }, 'Supervisor execution cancelled, stopping stream processing');
          return;
        }
        // LangGraph stream chunks contain the full state
        const chunkData = chunk as { messages?: BaseMessage[] };
        const chunkMessages = chunkData.messages;
        if (!chunkMessages || chunkMessages.length === 0) continue;

        const lastMessage = chunkMessages[chunkMessages.length - 1];
        if (!lastMessage) continue;

        // Check if this is an AI message with content
        if (isAIMessage(lastMessage)) {
          const content = lastMessage.content;

          if (typeof content === 'string' && content.length > 0) {
            finalOutput = content;
            // Emit text block for the current content (only if still executing)
            // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
            if (this.isExecuting && !this.isCancelled) {
              const textBlock = createTextBlock(content);
              this.emit('blocks', deviceId, [textBlock], false);
              // Use accumulateBlocks which handles text block replacement
              accumulateBlocks(allBlocks, [textBlock]);
            }
          } else if (Array.isArray(content)) {
            // Handle structured content (tool calls, etc.)
            for (const item of content) {
              // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
              if (typeof item === 'object' && this.isExecuting && !this.isCancelled) {
                const block = this.parseContentItem(item as Record<string, unknown>);
                if (block) {
                  this.emit('blocks', deviceId, [block], false);
                  // Use accumulateBlocks to merge tool blocks in-place
                  accumulateBlocks(allBlocks, [block]);
                }
              }
            }
          }
        }

        // Check for tool messages (tool results)
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        if (lastMessage.getType() === 'tool' && this.isExecuting && !this.isCancelled) {
          const toolContent = lastMessage.content;
          const toolName = (lastMessage as unknown as { name?: string }).name ?? 'tool';
          // Extract tool_call_id from ToolMessage for proper merging with tool_use block
          const toolCallId = (lastMessage as unknown as { tool_call_id?: string }).tool_call_id;
          const toolBlock = createToolBlock(
            toolName,
            'completed',
            undefined,
            typeof toolContent === 'string' ? toolContent : JSON.stringify(toolContent),
            toolCallId
          );
          this.emit('blocks', deviceId, [toolBlock], false);
          // Use accumulateBlocks to merge with existing tool_use block
          accumulateBlocks(allBlocks, [toolBlock]);
        }
      }

      // Only emit completion if still executing and not cancelled
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      if (this.isExecuting && !this.isCancelled) {
        // Update global conversation history
        this.addToHistory('user', command);
        this.addToHistory('assistant', finalOutput);

        // Merge tool blocks before sending completion
        const finalBlocks = mergeToolBlocks(allBlocks);

        // Emit completion with final output and all blocks for persistence
        const completionBlock = createStatusBlock('Complete');
        this.emit('blocks', deviceId, [completionBlock], true, finalOutput, finalBlocks);

        this.logger.debug({ output: finalOutput.slice(0, 200) }, 'Supervisor streaming completed');
      } else {
        this.logger.info({ deviceId, isCancelled: this.isCancelled, isExecuting: this.isExecuting }, 'Supervisor streaming ended due to cancellation');
      }
    } catch (error) {
      // Check if this was a cancellation (either flag indicates cancelled)
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      if (this.isCancelled || !this.isExecuting) {
        this.logger.info({ deviceId }, 'Supervisor execution cancelled (caught in error handler)');
        return;
      }

      this.logger.error({ error, command }, 'Supervisor streaming failed');
      const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred';
      const errorBlock = createErrorBlock(errorMessage);
      this.emit('blocks', deviceId, [errorBlock], true);
    } finally {
      // Clean up execution state
      // NOTE: Don't reset isCancelled here - it's reset at the START of next execution
      // This allows wasCancelled() to return true for late-arriving blocks
      this.isExecuting = false;
      this.abortController = null;
    }
  }

  /**
   * Parses a content item from LangGraph into a ContentBlock.
   */
  private parseContentItem(item: Record<string, unknown>): ContentBlock | null {
    const type = item.type as string | undefined;

    if (type === 'text' && typeof item.text === 'string' && item.text.trim()) {
      return createTextBlock(item.text);
    }

    if (type === 'tool_use') {
      const name = typeof item.name === 'string' ? item.name : 'tool';
      const input = item.input;
      // Extract id from tool_use block for proper merging with tool result
      const toolUseId = typeof item.id === 'string' ? item.id : undefined;
      return createToolBlock(name, 'running', input, undefined, toolUseId);
    }

    return null;
  }

  /**
   * Cancels the current execution if running.
   * Returns true if cancellation was initiated.
   */
  cancel(): boolean {
    // Check if we're processing a command (STT) or executing LLM
    if (!this.isProcessingCommand && !this.isExecuting) {
      this.logger.debug(
        { isProcessingCommand: this.isProcessingCommand, isExecuting: this.isExecuting },
        'No active execution to cancel'
      );
      return false;
    }

    // Protect against race conditions: ignore cancel if execution just started
    // This prevents late-arriving cancel requests from cancelling a new execution
    const timeSinceStart = Date.now() - this.executionStartedAt;
    if (this.isExecuting && timeSinceStart < 500) {
      this.logger.info(
        { timeSinceStart, isProcessingCommand: this.isProcessingCommand },
        'Ignoring cancel - execution just started (race condition protection)'
      );
      return false;
    }

    this.logger.info(
      { isProcessingCommand: this.isProcessingCommand, isExecuting: this.isExecuting, timeSinceStart },
      'Cancelling supervisor execution'
    );

    // CRITICAL: Set all flags immediately to stop all processing
    this.isCancelled = true;
    this.isExecuting = false;  // Mark as not executing to prevent any emits
    this.isProcessingCommand = false;  // Mark as not processing

    if (this.abortController) {
      this.abortController.abort();
    }
    return true;
  }

  /**
   * Check if execution was cancelled.
   * Used by main.ts to filter out any late-arriving blocks.
   */
  wasCancelled(): boolean {
    return this.isCancelled;
  }

  /**
   * Starts command processing (before STT/LLM execution).
   * Returns an AbortController that can be used to cancel STT and other operations.
   */
  startProcessing(): AbortController {
    this.abortController = new AbortController();
    this.isProcessingCommand = true;
    this.isCancelled = false;
    this.logger.debug('Started command processing');
    return this.abortController;
  }

  /**
   * Checks if command processing is active (STT or LLM execution).
   */
  isProcessing(): boolean {
    return this.isProcessingCommand || this.isExecuting;
  }

  /**
   * Ends command processing (called after completion or error, not after cancel).
   */
  endProcessing(): void {
    this.isProcessingCommand = false;
    // Note: Don't clear abortController here - it may still be used
    this.logger.debug('Ended command processing');
  }

  /**
   * Clears global conversation history (in-memory only).
   * Also resets cancellation state to allow new commands.
   * @deprecated Use clearContext() for full context clearing with persistence and broadcast.
   */
  clearHistory(): void {
    this.conversationHistory = [];
    // Reset cancellation state so new commands can execute
    this.isCancelled = false;
    this.logger.info('Global conversation history cleared');
  }

  /**
   * Clears supervisor context completely:
   * - In-memory conversation history
   * - Persistent history in database
   * - Notifies all connected clients
   */
  clearContext(): void {
    // Clear in-memory history
    this.conversationHistory = [];
    this.isCancelled = false;

    // Clear persistent history
    const chatHistoryService = this.getChatHistoryService?.();
    if (chatHistoryService) {
      chatHistoryService.clearSupervisorHistory();
    }

    // Notify all clients that context was cleared
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
   * Resets the cancellation state.
   * Call this before starting a new command to ensure previous cancellation doesn't affect it.
   */
  resetCancellationState(): void {
    this.isCancelled = false;
  }

  /**
   * Restores global conversation history from persistent storage.
   * Called on startup to sync in-memory cache with database.
   */
  restoreHistory(history: { role: 'user' | 'assistant'; content: string }[]): void {
    if (history.length === 0) return;

    // Only keep last 20 messages
    this.conversationHistory = history.slice(-20);
    this.logger.debug({ messageCount: this.conversationHistory.length }, 'Global conversation history restored');
  }

  /**
   * Builds the system message for the agent.
   */
  private buildSystemMessage(): BaseMessage[] {
    // GLM-4.6 optimized prompt structure:
    // - Rule #1: Front-load critical instructions at the start
    // - Rule #2: Use strong directives (MUST, STRICTLY, NEVER)
    // - Rule #3: Explicit language control
    // - Rule #4: Clear persona/role definition
    // - Rule #5: Break tasks into explicit steps
    const systemPrompt = `## MANDATORY RULES (STRICTLY ENFORCED)

You MUST always respond in English.

You MUST ALWAYS call tools to execute user requests. You MUST NEVER skip actions based on memory or previous context.

### Tool Usage Requirements:

1. You MUST call tools for fresh data on EVERY request:
   - ALWAYS call list_workspaces, list_projects, list_sessions, etc. when asked
   - NEVER respond from memory or previous conversation context
   - System state changes constantly - previous data is stale

2. You MUST execute requested actions immediately:
   - ALWAYS call the tool to perform the action, even if you think it was done before
   - If user asks to create a session and one already exists, CREATE ANOTHER ONE
   - If user asks to list projects, LIST THEM NOW with a tool call
   - NEVER refuse a direct request because "it was already done"

3. User intent is paramount:
   - Execute requests immediately without questioning
   - Do NOT assume user made a mistake
   - Multiple sessions in the same project is valid
   - Refreshing information is always valid

4. Required tool calls:
   - Call list_workspaces/list_projects EVERY time user asks about workspaces/projects
   - Call list_sessions EVERY time user asks about active sessions
   - Call list_available_agents BEFORE creating any agent session - NEVER skip this step
   - Call create_agent_session/create_terminal_session EVERY time user asks to create a session
   - NEVER say "based on our previous conversation" for factual data

5. Agent selection (CRITICAL):
   - You MUST call list_available_agents BEFORE creating any agent session
   - Match user's requested agent name EXACTLY to available agents/aliases
   - If user says "open zai", use "zai" - do NOT substitute with base type like "claude"
   - If user request is ambiguous, show available agents and ask for clarification
   - NEVER assume which agent to use without checking list_available_agents first

---

## YOUR ROLE

You are the Supervisor Agent for Tiflis Code, a workstation management system.

Your responsibilities:
1. Discover workspaces and projects - List available workspaces and projects
2. Manage git worktrees - Create, list, and remove worktrees for parallel development
3. Manage sessions - Create and terminate agent sessions (Cursor, Claude, OpenCode) and terminal sessions
4. Navigate the file system - List directories and read files
5. Complete feature workflows - Merge branches, clean up worktrees, and manage related sessions

---

## FEATURE COMPLETION WORKFLOW

When users ask to "complete the feature", "finish the work", or "merge and clean up":

Step 1: Check branch status with \`branch_status\` - Look for uncommitted changes
Step 2: List active sessions with \`get_worktree_session_summary\` - Find sessions in the worktree
Step 3: Ask for confirmation if there are uncommitted changes or active sessions

### Complete Workflow Tool:
Use \`complete_feature\` for one-command solution:
- Merges feature branch into main with automatic push
- Cleans up the worktree and removes the branch if merged

### Step-by-Step Alternative:
Step 1: Handle uncommitted changes - Commit, stash, or get user confirmation
Step 2: Terminate sessions - Use \`terminate_worktree_sessions\` to clean up active sessions
Step 3: Merge branch - Use \`merge_branch\` with pushAfter=true
Step 4: Cleanup worktree - Use \`cleanup_worktree\` to remove worktree directory

### Available Merge Tools:
- branch_status: Check current branch state and uncommitted changes
- merge_branch: Safe merge with conflict detection and push
- complete_feature: Full workflow (merge + cleanup + push)
- cleanup_worktree: Remove worktree and delete merged branch
- list_mergeable_branches: Show all branches and their cleanup eligibility
- get_worktree_session_summary: List sessions in a specific worktree
- terminate_worktree_sessions: End all sessions in a worktree

### Error Handling:
- Merge conflicts: Report conflicting files and suggest manual resolution
- Uncommitted changes: Offer to commit, stash, or force cleanup
- Active sessions: List sessions and ask for termination confirmation
- Failed pushes: Continue with local merge, warn about remote sync

---

## AGENT SELECTION (CRITICAL - FOLLOW STRICTLY)

When user asks to "open an agent", "start an agent", "create a session", or mentions any agent by name:

Step 1: You MUST call \`list_available_agents\` FIRST to get the current list of available agents and aliases
Step 2: Match user intent to the correct agent from the list
Step 3: Call \`create_agent_session\` with the exact agent name from the list

### Agent Matching Rules:

1. If user mentions a specific name (e.g., "open zai", "start claude", "use cursor"):
   - Find the EXACT match in the available agents list
   - If "zai" is an alias, use "zai" - do NOT substitute with the base type
   - If no exact match, suggest available options

2. If user asks generically (e.g., "open an agent", "start a coding agent"):
   - Call \`list_available_agents\` and present the options
   - Ask user which agent they want to use
   - Do NOT pick the first one or make assumptions

3. If user mentions a capability (e.g., "I need help with code review"):
   - Call \`list_available_agents\` to see descriptions
   - Match the capability to the agent description
   - If multiple agents match, ask user to choose

4. NEVER skip \`list_available_agents\`:
   - Agent aliases are configured via environment variables
   - The list changes based on workstation configuration
   - You MUST always check what's actually available

### Example Flow:
User: "open zai on tiflis-code"
Step 1: Call list_available_agents -> Returns: claude, cursor, opencode, zai (alias for claude)
Step 2: User said "zai" -> Match found: "zai"
Step 3: Call create_agent_session with agentName="zai"

---

## SESSION TYPES

Base agent types:
- cursor: Cursor AI agent for code assistance
- claude: Claude Code CLI for AI coding
- opencode: OpenCode AI agent
- terminal: Shell terminal for direct commands

Custom aliases: Configured via AGENT_ALIAS_* environment variables. Always call \`list_available_agents\` to see current aliases.

### Creating Agent Sessions:
Default: Omit the \`worktree\` parameter to create session on the main/master branch (project root directory)
Specific worktree: Only specify \`worktree\` when user explicitly asks for a feature branch worktree (NOT the main branch)
IMPORTANT: When \`list_worktrees\` shows a worktree named "main" with \`isMain: true\`, this represents the project root directory. Do NOT pass \`worktree: "main"\` - omit the worktree parameter entirely.

---

## WORKTREE MANAGEMENT

Worktrees allow working on multiple branches simultaneously in separate directories.

Branch naming: Use conventional format \`<type>/<name>\` where \`<name>\` is lower-kebab-case
Types: feature, fix, refactor, docs, chore
Examples: feature/user-auth, fix/keyboard-layout, refactor/websocket-handler

Directory pattern: project--branch-name (slashes replaced with dashes, e.g., my-app--feature-user-auth)

Creating worktrees with \`create_worktree\`:
- createNewBranch: true - Creates a NEW branch and worktree (most common for new features)
- createNewBranch: false - Checks out an EXISTING branch into a worktree
- baseBranch: Optional starting point for new branches (defaults to HEAD, commonly "main")

---

## OUTPUT GUIDELINES

- Be concise and helpful
- Use tools to gather information before responding
- When creating sessions, confirm the workspace and project first
- For ambiguous requests, ask clarifying questions
- Format responses for terminal display (avoid markdown links)
- NEVER use tables - they display poorly on mobile devices
- ALWAYS use bullet lists or numbered lists instead of tables
- Keep list items short and scannable for mobile reading
- ALWAYS prioritize safety - check before deleting/merging`

    // Return as HumanMessage since some models don't support SystemMessage well
    return [new HumanMessage(`[System Instructions]\n${systemPrompt}\n[End Instructions]`)];
  }

  /**
   * Builds messages from conversation history.
   */
  private buildHistoryMessages(history: ConversationEntry[]): BaseMessage[] {
    return history.map((entry) =>
      entry.role === 'user' ? new HumanMessage(entry.content) : new AIMessage(entry.content)
    );
  }

  /**
   * Gets global conversation history.
   */
  private getConversationHistory(): ConversationEntry[] {
    return this.conversationHistory;
  }

  /**
   * Adds an entry to global conversation history.
   */
  private addToHistory(role: 'user' | 'assistant', content: string): void {
    this.conversationHistory.push({ role, content });

    // Keep only last 20 messages to avoid context overflow
    if (this.conversationHistory.length > 20) {
      this.conversationHistory.splice(0, this.conversationHistory.length - 20);
    }
  }
}
