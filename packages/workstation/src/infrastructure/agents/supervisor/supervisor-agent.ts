/**
 * @file supervisor-agent.ts
 * @copyright 2025 Roman Barinov <rbarinov@gmail.com>
 * @license MIT
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
   */
  blocks: (deviceId: string, blocks: ContentBlock[], isComplete: boolean, finalOutput?: string) => void;
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
        config.workspaceDiscovery
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
    this.logger.info({ command, deviceId }, 'Executing supervisor command with streaming');

    try {
      // Get global conversation history
      const history = this.getConversationHistory();

      // Build messages from history
      const messages: BaseMessage[] = [
        ...this.buildSystemMessage(),
        ...this.buildHistoryMessages(history),
        new HumanMessage(command),
      ];

      // Emit status block to show processing
      const statusBlock = createStatusBlock('Processing...');
      this.logger.debug({ deviceId, blockType: 'status' }, 'Emitting status block');
      this.emit('blocks', deviceId, [statusBlock], false);

      this.logger.info({ deviceId }, 'Starting LangGraph agent stream');
      // Stream the agent execution
      const stream = await this.agent.stream(
        { messages },
        { streamMode: 'values' }
      );

      let finalOutput = '';

      for await (const chunk of stream) {
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
            // Emit text block for the current content
            const textBlock = createTextBlock(content);
            this.emit('blocks', deviceId, [textBlock], false);
          } else if (Array.isArray(content)) {
            // Handle structured content (tool calls, etc.)
            for (const item of content) {
              if (typeof item === 'object') {
                const block = this.parseContentItem(item as Record<string, unknown>);
                if (block) {
                  this.emit('blocks', deviceId, [block], false);
                }
              }
            }
          }
        }

        // Check for tool messages
        if (lastMessage.getType() === 'tool') {
          const toolContent = lastMessage.content;
          const toolName = (lastMessage as unknown as { name?: string }).name ?? 'tool';
          const toolBlock = createToolBlock(
            toolName,
            'completed',
            undefined,
            typeof toolContent === 'string' ? toolContent : JSON.stringify(toolContent)
          );
          this.emit('blocks', deviceId, [toolBlock], false);
        }
      }

      // Update global conversation history
      this.addToHistory('user', command);
      this.addToHistory('assistant', finalOutput);

      // Emit completion with final output for persistence
      const completionBlock = createStatusBlock('Complete');
      this.emit('blocks', deviceId, [completionBlock], true, finalOutput);

      this.logger.debug({ output: finalOutput.slice(0, 200) }, 'Supervisor streaming completed');
    } catch (error) {
      this.logger.error({ error, command }, 'Supervisor streaming failed');
      const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred';
      const errorBlock = createErrorBlock(errorMessage);
      this.emit('blocks', deviceId, [errorBlock], true);
    }
  }

  /**
   * Parses a content item from LangGraph into a ContentBlock.
   */
  private parseContentItem(item: Record<string, unknown>): ContentBlock | null {
    const type = item.type as string | undefined;

    if (type === 'text' && typeof item.text === 'string') {
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
   * Clears global conversation history.
   */
  clearHistory(): void {
    this.conversationHistory = [];
    this.logger.info('Global conversation history cleared');
  }

  /**
   * Restores global conversation history from persistent storage.
   * Called on startup to sync in-memory cache with database.
   */
  restoreHistory(history: Array<{ role: 'user' | 'assistant'; content: string }>): void {
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

## Worktree Naming:
Worktrees follow the pattern: \`project--branch-name\`
Example: \`my-app--feature-auth\` is a worktree of \`my-app\` for the \`feature/auth\` branch.`;

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
