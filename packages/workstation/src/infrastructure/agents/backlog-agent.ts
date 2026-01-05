/**
 * @file backlog-agent.ts
 * @copyright 2025 Roman Barinov <rbarinov@gmail.com>
 * @license FSL-1.1-NC
 *
 * LangGraph-based Backlog Agent for executing backlog commands.
 */

import { ChatOpenAI } from '@langchain/openai';
import { createReactAgent } from '@langchain/langgraph/prebuilt';
import { HumanMessage, type BaseMessage } from '@langchain/core/messages';
import type { Logger } from 'pino';
import type { StructuredToolInterface } from '@langchain/core/tools';
import { getEnv } from '../../config/env.js';
import { createBacklogAgentTools, type BacklogToolsContext } from './backlog-agent-tools.js';
import type { ContentBlock } from '../../domain/value-objects/content-block.js';

/**
 * System prompt for the backlog agent.
 */
const BACKLOG_AGENT_SYSTEM_PROMPT = `You are a Backlog Agent responsible for managing development tasks in a backlog.

You have the following capabilities:
- View backlog status and task progress
- Start/stop/pause/resume harness execution
- List tasks in the backlog
- Add new tasks

When the user sends a message, interpret their intent and use the appropriate tool(s) to fulfill their request.

Guidelines:
- If the user asks about progress, status, or the current state → use get_backlog_status
- If the user wants to start execution → use start_backlog_harness
- If the user wants to stop, pause, or resume → use the appropriate harness tool
- If the user wants to see tasks → use list_backlog_tasks
- If the user describes something to do or wants to add a task → use add_backlog_task

You can call multiple tools in sequence if needed to fully satisfy the user's request (e.g., get status AND list tasks). After all tools have returned, provide a concise summary of what was accomplished.

Be helpful and informative. Always confirm actions and provide status updates.`;

/**
 * LangGraph-based Backlog Agent.
 */
export class BacklogAgent {
  private readonly logger: Logger;
  private agent: ReturnType<typeof createReactAgent> | null = null;
  private readonly toolsContext: BacklogToolsContext;
  private initializationError: Error | null = null;

  constructor(toolsContext: BacklogToolsContext, logger: Logger) {
    this.logger = logger.child({ component: 'BacklogAgent' });
    this.toolsContext = toolsContext;

    // Defer agent initialization to first use to avoid blocking session restoration
    this.initializeAgent();
  }

  /**
   * Initializes the agent lazily on first use.
   */
  private initializeAgent(): void {
    if (this.agent || this.initializationError) {
      return; // Already initialized or failed
    }

    try {
      // Create LLM
      const env = getEnv();
      const llm = this.createLLM(env);

      // Create tools
      const tools: StructuredToolInterface[] = createBacklogAgentTools(this.toolsContext);

      this.logger.info({ toolCount: tools.length }, 'Creating Backlog Agent with tools');

      // Create LangGraph ReAct agent with max iterations to prevent infinite loops
      this.agent = createReactAgent({
        llm,
        tools,
        maxIterations: 5,
      });
    } catch (error) {
      this.initializationError = error instanceof Error ? error : new Error(String(error));
      this.logger.error({ error: this.initializationError }, 'Failed to initialize BacklogAgent');
    }
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
      throw new Error('AGENT_API_KEY is required for Backlog Agent');
    }

    this.logger.info({ provider, model: modelName }, 'Initializing LLM for Backlog Agent');

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
   * Executes a command through the backlog agent.
   */
  async executeCommand(userMessage: string): Promise<ContentBlock[]> {
    // Ensure agent is initialized
    this.initializeAgent();

    // Check for initialization errors
    if (this.initializationError) {
      this.logger.error({ error: this.initializationError }, 'Cannot execute command - agent initialization failed');
      return [
        {
          id: 'backlog-error',
          block_type: 'error',
          content: `Failed to initialize backlog agent: ${this.initializationError.message}`,
        },
      ];
    }

    if (!this.agent) {
      this.logger.error('Agent is not initialized');
      return [
        {
          id: 'backlog-error',
          block_type: 'error',
          content: 'Backlog agent is not initialized',
        },
      ];
    }

    this.logger.info({ message: userMessage.slice(0, 100) }, 'Executing backlog command via LLM');

    try {
      // Build messages
      const messages: BaseMessage[] = [
        {
          type: 'system',
          content: BACKLOG_AGENT_SYSTEM_PROMPT,
        } as any,
        new HumanMessage(userMessage),
      ];

      // Execute the agent with timeout (30 seconds max)
      const timeoutPromise = new Promise<{ messages: BaseMessage[] }>((_, reject) =>
        setTimeout(() => reject(new Error('Backlog agent execution timeout (30s)')), 30000)
      );

      const result = (await Promise.race([
        this.agent.invoke({ messages }),
        timeoutPromise,
      ])) as { messages: BaseMessage[] };

      // Extract the final response
      const agentMessages = result.messages;
      const lastMessage = agentMessages[agentMessages.length - 1];
      const content = lastMessage?.content;
      const output =
        typeof content === 'string'
          ? content
          : JSON.stringify(content);

      this.logger.debug({ output: output.slice(0, 200) }, 'Backlog command completed via LLM');

      // Return as content block
      return [
        {
          id: 'backlog-response',
          block_type: 'text',
          content: output,
        },
      ];
    } catch (error) {
      this.logger.error({ error, message: userMessage }, 'Backlog command failed via LLM');
      const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred';
      return [
        {
          id: 'backlog-error',
          block_type: 'error',
          content: `Error: ${errorMessage}`,
        },
      ];
    }
  }
}
