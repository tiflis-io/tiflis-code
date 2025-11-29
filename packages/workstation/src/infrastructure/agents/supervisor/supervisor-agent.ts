/**
 * @file supervisor-agent.ts
 * @copyright 2025 Roman Barinov <rbarinov@gmail.com>
 * @license MIT
 *
 * LangGraph-based Supervisor Agent for managing workstation resources.
 */

import { ChatOpenAI } from '@langchain/openai';
import { createReactAgent } from '@langchain/langgraph/prebuilt';
import { HumanMessage, AIMessage, type BaseMessage } from '@langchain/core/messages';
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
 * LangGraph-based Supervisor Agent.
 *
 * The Supervisor manages:
 * - Workspace and project discovery
 * - Git worktree management
 * - Session lifecycle (create, list, terminate)
 * - File system operations
 */
export class SupervisorAgent {
  private readonly logger: Logger;
  private readonly agent: ReturnType<typeof createReactAgent>;
  private readonly conversationHistory = new Map<string, ConversationEntry[]>();

  constructor(config: SupervisorAgentConfig) {
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
   */
  async execute(
    command: string,
    deviceId: string,
    currentSessionId?: string
  ): Promise<SupervisorResult> {
    this.logger.info({ command, deviceId, currentSessionId }, 'Executing supervisor command');

    try {
      // Get conversation history for this device
      const history = this.getConversationHistory(deviceId);

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

      // Update conversation history
      this.addToHistory(deviceId, 'user', command);
      this.addToHistory(deviceId, 'assistant', output);

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
   * Clears conversation history for a device.
   */
  clearHistory(deviceId: string): void {
    this.conversationHistory.delete(deviceId);
    this.logger.info({ deviceId }, 'Conversation history cleared');
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
   * Gets conversation history for a device.
   */
  private getConversationHistory(deviceId: string): ConversationEntry[] {
    return this.conversationHistory.get(deviceId) ?? [];
  }

  /**
   * Adds an entry to conversation history.
   */
  private addToHistory(deviceId: string, role: 'user' | 'assistant', content: string): void {
    const history = this.getConversationHistory(deviceId);
    history.push({ role, content });

    // Keep only last 20 messages to avoid context overflow
    if (history.length > 20) {
      history.splice(0, history.length - 20);
    }

    this.conversationHistory.set(deviceId, history);
  }
}
