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
import { getEnv } from '../../../config/env.js';
import type { ContentBlock } from '../../../domain/value-objects/content-block.js';
import {
  createTextBlock,
  createToolBlock,
  createErrorBlock,
  createStatusBlock,
} from '../../../domain/value-objects/content-block.js';

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

    // Create LLM
    const env = getEnv();
    const llm = this.createLLM(env);

    // Create all tools
    const tools: StructuredToolInterface[] = [
      ...createWorkspaceTools(config.workspaceDiscovery),
      ...createWorktreeTools(config.workspaceDiscovery),
      ...createSessionTools(
        config.sessionManager,
        config.agentSessionManager,
        config.workspaceDiscovery,
        config.workspacesRoot,
        config.getMessageBroadcaster,
        config.getChatHistoryService
      ),
      ...createFilesystemTools(config.workspacesRoot),
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
              // Replace last text block (LangGraph sends full state each time)
              const lastTextIndex = allBlocks.findLastIndex((b) => b.block_type === 'text');
              if (lastTextIndex >= 0) {
                allBlocks[lastTextIndex] = textBlock;
              } else {
                allBlocks.push(textBlock);
              }
            }
          } else if (Array.isArray(content)) {
            // Handle structured content (tool calls, etc.)
            for (const item of content) {
              // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
              if (typeof item === 'object' && this.isExecuting && !this.isCancelled) {
                const block = this.parseContentItem(item as Record<string, unknown>);
                if (block) {
                  this.emit('blocks', deviceId, [block], false);
                  allBlocks.push(block);
                }
              }
            }
          }
        }

        // Check for tool messages
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        if (lastMessage.getType() === 'tool' && this.isExecuting && !this.isCancelled) {
          const toolContent = lastMessage.content;
          const toolName = (lastMessage as unknown as { name?: string }).name ?? 'tool';
          const toolBlock = createToolBlock(
            toolName,
            'completed',
            undefined,
            typeof toolContent === 'string' ? toolContent : JSON.stringify(toolContent)
          );
          this.emit('blocks', deviceId, [toolBlock], false);
          allBlocks.push(toolBlock);
        }
      }

      // Only emit completion if still executing and not cancelled
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      if (this.isExecuting && !this.isCancelled) {
        // Update global conversation history
        this.addToHistory('user', command);
        this.addToHistory('assistant', finalOutput);

        // Emit completion with final output and all blocks for persistence
        const completionBlock = createStatusBlock('Complete');
        this.emit('blocks', deviceId, [completionBlock], true, finalOutput, allBlocks);

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
      return createToolBlock(name, 'running', input);
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
   * Clears global conversation history.
   * Also resets cancellation state to allow new commands.
   */
  clearHistory(): void {
    this.conversationHistory = [];
    // Reset cancellation state so new commands can execute
    this.isCancelled = false;
    this.logger.info('Global conversation history cleared');
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
    const systemPrompt = `You are the Supervisor Agent for Tiflis Code, a workstation management system.

Your role is to help users:
1. **Discover workspaces and projects** - List available workspaces and projects
2. **Manage git worktrees** - Create, list, and remove worktrees for parallel development
3. **Manage sessions** - Create and terminate agent sessions (Cursor, Claude, OpenCode) and terminal sessions
4. **Navigate the file system** - List directories and read files

## CRITICAL: Always Use Tools - Never Be Lazy

**YOU MUST ALWAYS call tools to execute user requests. NEVER be lazy or skip actions based on memory or previous context.**

### Mandatory Tool Usage Rules:

1. **ALWAYS call tools for fresh data** - When user asks about workspaces, projects, sessions, or any system state:
   - ALWAYS call the appropriate tool (list_workspaces, list_projects, list_sessions, etc.)
   - NEVER respond from memory or previous conversation context
   - System state changes constantly - what was true before may not be true now

2. **ALWAYS execute requested actions** - When user asks to create, terminate, or modify something:
   - ALWAYS call the tool to perform the action, even if you think it was done before
   - If user asks to create a session and one already exists, CREATE ANOTHER ONE (user knows what they want)
   - If user asks to list projects, LIST THEM NOW with a tool call (don't say "I already showed you")
   - NEVER refuse a direct request because "it was already done" or "nothing changed"

3. **User intent is paramount** - When user explicitly requests an action:
   - Execute it immediately without questioning or suggesting alternatives
   - Don't assume user made a mistake - they know what they need
   - Multiple sessions in the same project is a valid use case
   - Refreshing information is always valid

4. **No shortcuts** - You must:
   - Call list_workspaces/list_projects EVERY time user asks what workspaces/projects exist
   - Call list_sessions EVERY time user asks about active sessions
   - Call create_agent_session/create_terminal_session EVERY time user asks to create a session
   - Never say "based on our previous conversation" or "as I mentioned earlier" for factual data

## Guidelines:
- Be concise and helpful
- Use tools to gather information before responding
- When creating sessions, always confirm the workspace and project first
- For ambiguous requests, ask clarifying questions
- Format responses for terminal display (avoid markdown links)

## Session Types:
- **cursor** - Cursor AI agent for code assistance
- **claude** - Claude Code CLI for AI coding
- **opencode** - OpenCode AI agent
- **terminal** - Shell terminal for direct commands

## Creating Agent Sessions:
When creating agent sessions, by default use the main project directory (main or master branch) unless the user explicitly requests a specific worktree or branch:
- **Default behavior**: Omit the \`worktree\` parameter to create session on the main/master branch (project root directory)
- **Specific worktree**: Only specify \`worktree\` when the user explicitly asks for a feature branch worktree (NOT the main branch)
- **IMPORTANT**: When \`list_worktrees\` shows a worktree named "main" with \`isMain: true\`, this represents the project root directory. Do NOT pass \`worktree: "main"\` - instead, omit the worktree parameter entirely to use the project root.
- **Example**: If user says "start claude on tiflis-code", create session WITHOUT worktree parameter (uses project root on main branch)
- **Example**: If user says "start claude on tiflis-code feature/auth branch", list worktrees, find the feature worktree name (e.g., "feature-auth"), and pass that as worktree

## Worktree Management:
Worktrees allow working on multiple branches simultaneously in separate directories.
- **Branch naming**: Use conventional format \`<type>/<name>\` where \`<name>\` is lower-kebab-case. Types: \`feature\`, \`fix\`, \`refactor\`, \`docs\`, \`chore\`. Examples: \`feature/user-auth\`, \`fix/keyboard-layout\`, \`refactor/websocket-handler\`
- **Directory pattern**: \`project--branch-name\` (slashes replaced with dashes, e.g., \`my-app--feature-user-auth\`)
- **Creating worktrees**: Use \`create_worktree\` tool with:
  - \`createNewBranch: true\` — Creates a NEW branch and worktree (most common for new features)
  - \`createNewBranch: false\` — Checks out an EXISTING branch into a worktree
  - \`baseBranch\` — Optional starting point for new branches (defaults to HEAD, commonly "main")
- **Example**: To start work on a new feature, create worktree with \`createNewBranch: true\`, \`branch: "feature/new-keyboard"\`, \`baseBranch: "main"\``;

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
