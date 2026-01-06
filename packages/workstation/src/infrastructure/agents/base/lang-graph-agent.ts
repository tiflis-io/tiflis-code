/**
 * @file lang-graph-agent.ts
 * @copyright 2025 Roman Barinov <rbarinov@gmail.com>
 * @license FSL-1.1-NC
 *
 * Abstract base class for all LangGraph-based agents.
 * Provides unified streaming, state management, and event emission patterns.
 */

import { EventEmitter } from 'events';
import { ChatOpenAI } from '@langchain/openai';
import { createReactAgent } from '@langchain/langgraph/prebuilt';
import { HumanMessage, AIMessage, isAIMessage, type BaseMessage } from '@langchain/core/messages';
import type { Logger } from 'pino';
import type { StructuredToolInterface } from '@langchain/core/tools';
import {
  createTextBlock,
  createToolBlock,
  createStatusBlock,
  createErrorBlock,
  accumulateBlocks,
  mergeToolBlocks,
  type ContentBlock,
} from '../../../domain/value-objects/content-block.js';
import type { AgentStateManager, ConversationEntry } from '../../../domain/ports/agent-state-manager.js';
import { getEnv } from '../../../config/env.js';

/**
 * Events emitted by LangGraphAgent during streaming execution.
 */
export interface LangGraphAgentEvents {
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
 * Abstract base class for all LangGraph-based agents (Supervisor, BacklogAgent, etc).
 *
 * Provides:
 * - Unified streaming execution via `executeWithStream()`
 * - Pluggable state management via AgentStateManager interface
 * - Common LLM initialization and configuration
 * - Event emission for all clients (iOS, Android, Web)
 * - Conversation history management
 * - Cancellation support with AbortController
 */
export abstract class LangGraphAgent extends EventEmitter {
  protected readonly logger: Logger;
  protected agent: ReturnType<typeof createReactAgent> | null = null;
  protected conversationHistory: ConversationEntry[] = [];
  protected abortController: AbortController | null = null;
  protected isExecuting = false;
  protected isCancelled = false;
  /** Tracks if we're processing a command (including STT, before LLM execution) */
  protected isProcessingCommand = false;
  /** Timestamp when current execution started (for race condition protection) */
  protected executionStartedAt = 0;

  constructor(logger: Logger) {
    super();
    this.logger = logger.child({ component: this.constructor.name });
  }

  /**
   * Builds the system prompt for this agent (implementation-specific).
   */
  protected abstract buildSystemPrompt(): string;

  /**
   * Creates tools for this agent (implementation-specific).
   */
  protected abstract createTools(): StructuredToolInterface[];

  /**
   * Creates the state manager for this agent (implementation-specific).
   * Different agents can use different persistence strategies (DB vs files).
   */
  protected abstract createStateManager(): AgentStateManager;

  /**
   * Called after successful execution completion.
   * Subclasses can override to perform agent-specific post-execution logic.
   */
  protected async onExecutionComplete(blocks: ContentBlock[], finalOutput: string): Promise<void> {
    // Base implementation: do nothing
    // Subclasses override for custom behavior (e.g., BacklogAgent may persist to files)
  }

  /**
   * Initializes the LangGraph agent and state manager.
   * Called by subclasses during construction.
   */
  protected initializeAgent(): void {
    if (this.agent) {
      return; // Already initialized
    }

    try {
      // Create LLM
      const env = getEnv();
      const llm = this.createLLM(env);

      // Create tools
      const tools = this.createTools();

      this.logger.info({ toolCount: tools.length }, `Creating ${this.constructor.name} with tools`);

      // Create LangGraph ReAct agent
      this.agent = createReactAgent({
        llm,
        tools,
      });
    } catch (error) {
      this.logger.error({ error }, `Failed to initialize ${this.constructor.name}`);
      throw error;
    }
  }

  /**
   * Creates the LLM instance based on environment configuration.
   */
  protected createLLM(env: ReturnType<typeof getEnv>): ChatOpenAI {
    const provider = env.AGENT_PROVIDER;
    const apiKey = env.AGENT_API_KEY;
    const modelName = env.AGENT_MODEL_NAME;
    const baseUrl = env.AGENT_BASE_URL;
    const temperature = env.AGENT_TEMPERATURE;

    if (!apiKey) {
      throw new Error(`AGENT_API_KEY is required for ${this.constructor.name}`);
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
   * Executes a command with streaming output.
   * Emits 'blocks' events as content is generated.
   *
   * This is the unified streaming method used by all agents.
   * Subclasses should NOT override this unless they have very specific requirements.
   */
  async executeWithStream(
    command: string,
    deviceId: string
  ): Promise<void> {
    this.logger.info(
      { command, deviceId, wasCancelledBefore: this.isCancelled },
      `Executing ${this.constructor.name} with streaming`
    );

    // Set up abort controller for cancellation
    this.abortController = new AbortController();
    this.isExecuting = true;
    this.isCancelled = false;
    // Track when execution started to prevent race conditions with late cancel requests
    this.executionStartedAt = Date.now();

    this.logger.debug({ isCancelled: this.isCancelled, isExecuting: this.isExecuting }, 'Flags reset for new execution');

    try {
      // Get conversation history from state manager
      const stateManager = this.createStateManager();
      const history = await stateManager.loadHistory();
      this.conversationHistory = history;

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

      this.logger.info({ deviceId }, `Starting LangGraph agent stream for ${this.constructor.name}`);
      // Stream the agent execution
      const stream = await this.agent!.stream(
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
          this.logger.info(
            { deviceId, isCancelled: this.isCancelled, isExecuting: this.isExecuting },
            `${this.constructor.name} execution cancelled, stopping stream processing`
          );
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
        // Update conversation history
        this.addToHistory('user', command);
        this.addToHistory('assistant', finalOutput);

        // Merge tool blocks before sending completion
        const finalBlocks = mergeToolBlocks(allBlocks);

        // Persist state
        const stateManager = this.createStateManager();
        await stateManager.saveHistory(this.conversationHistory);

        // Call agent-specific post-execution logic
        await this.onExecutionComplete(finalBlocks, finalOutput);

        // Emit completion with final output and all blocks for persistence
        const completionBlock = createStatusBlock('Complete');
        this.emit('blocks', deviceId, [completionBlock], true, finalOutput, finalBlocks);

        this.logger.debug({ output: finalOutput.slice(0, 200) }, `${this.constructor.name} streaming completed`);
      } else {
        this.logger.info(
          { deviceId, isCancelled: this.isCancelled, isExecuting: this.isExecuting },
          `${this.constructor.name} streaming ended due to cancellation`
        );
      }
    } catch (error) {
      // Check if this was a cancellation (either flag indicates cancelled)
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      if (this.isCancelled || !this.isExecuting) {
        this.logger.info({ deviceId }, `${this.constructor.name} execution cancelled (caught in error handler)`);
        return;
      }

      this.logger.error({ error, command }, `${this.constructor.name} streaming failed`);
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
  protected parseContentItem(item: Record<string, unknown>): ContentBlock | null {
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
      `Cancelling ${this.constructor.name} execution`
    );

    // CRITICAL: Set all flags immediately to stop all processing
    this.isCancelled = true;
    this.isExecuting = false; // Mark as not executing to prevent any emits
    this.isProcessingCommand = false; // Mark as not processing

    if (this.abortController) {
      this.abortController.abort();
    }
    return true;
  }

  /**
   * Check if execution was cancelled.
   * Used by clients to filter out any late-arriving blocks.
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
   * Gets conversation history.
   */
  getConversationHistory(): ConversationEntry[] {
    return this.conversationHistory;
  }

  /**
   * Resets the cancellation state.
   * Call this before starting a new command to ensure previous cancellation doesn't affect it.
   */
  resetCancellationState(): void {
    this.isCancelled = false;
  }

  /**
   * Restores conversation history from persistent storage.
   * Called on startup to sync in-memory cache with database.
   */
  restoreHistory(history: ConversationEntry[]): void {
    if (history.length === 0) return;

    // Keep only last 20 messages
    this.conversationHistory = history.slice(-20);
    this.logger.debug({ messageCount: this.conversationHistory.length }, 'Conversation history restored');
  }

  /**
   * Builds the system message for the agent.
   */
  protected buildSystemMessage(): BaseMessage[] {
    const systemPrompt = this.buildSystemPrompt();
    // Return as HumanMessage since some models don't support SystemMessage well
    return [new HumanMessage(`[System Instructions]\n${systemPrompt}\n[End Instructions]`)];
  }

  /**
   * Builds messages from conversation history.
   */
  protected buildHistoryMessages(history: ConversationEntry[]): BaseMessage[] {
    return history.map((entry) =>
      entry.role === 'user' ? new HumanMessage(entry.content) : new AIMessage(entry.content)
    );
  }

  /**
   * Adds an entry to conversation history.
   */
  protected addToHistory(role: 'user' | 'assistant', content: string): void {
    this.conversationHistory.push({ role, content });

    // Keep only last 20 messages to avoid context overflow
    if (this.conversationHistory.length > 20) {
      this.conversationHistory.splice(0, this.conversationHistory.length - 20);
    }
  }
}
