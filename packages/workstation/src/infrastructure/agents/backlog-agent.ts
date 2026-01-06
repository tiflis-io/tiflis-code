/**
 * @file backlog-agent.ts
 * @copyright 2025 Roman Barinov <rbarinov@gmail.com>
 * @license FSL-1.1-NC
 *
 * LangGraph-based Backlog Agent for executing backlog commands.
 * Extends LangGraphAgent base class for unified streaming and state management.
 */

import type { Logger } from 'pino';
import type { StructuredToolInterface } from '@langchain/core/tools';
import type { AgentStateManager } from '../../domain/ports/agent-state-manager.js';
import { LangGraphAgent } from './base/lang-graph-agent.js';
import { BacklogStateManager } from './base/backlog-state-manager.js';
import { createBacklogAgentTools, type BacklogToolsContext } from './backlog-agent-tools.js';

/**
 * System prompt for the backlog agent.
 */
const BACKLOG_AGENT_SYSTEM_PROMPT = `You are a Backlog Agent responsible for managing development tasks in a backlog.

You have the following capabilities:
- View backlog status and task progress
- Start/stop/pause/resume harness execution
- List tasks in the backlog
- Add new tasks
- Show available coding agents
- Parse agent selection from user responses

When the user sends a message, interpret their intent and use the appropriate tool(s) to fulfill their request.

Guidelines:
- If the user asks about progress, status, or the current state → use get_backlog_status
- If the user wants to start execution → use start_backlog_harness
- If the user wants to stop, pause, or resume → use the appropriate harness tool
- If the user wants to see tasks → use list_backlog_tasks
- If the user describes something to do or wants to add a task → use add_backlog_task

SPECIAL CASE - Agent Selection for Harness Execution:
When start_backlog_harness tool returns a message asking which agent to use:
1. Acknowledge that we're waiting for agent selection
2. DO NOT call any other tools until the user provides an agent selection
3. When the user responds with an agent name (e.g., "I want to use claude" or "use cursor"):
   - Call parse_agent_selection with their response to validate and extract the agent name
   - Report the results to the user
   - The agent will then proceed with harness creation

You can call multiple tools in sequence if needed to fully satisfy the user's request (e.g., get status AND list tasks). After all tools have returned, provide a concise summary of what was accomplished.

Be helpful and informative. Always confirm actions and provide status updates.`;

/**
 * LangGraph-based Backlog Agent.
 *
 * Extends LangGraphAgent to inherit:
 * - Unified streaming execution via executeWithStream()
 * - Conversation history management
 * - Cancellation support
 * - Event emission to all clients
 *
 * Provides streaming execution for autonomous backlog task completion
 * with real-time progress updates to all connected clients.
 */
export class BacklogAgent extends LangGraphAgent {
  private readonly toolsContext: BacklogToolsContext;
  private readonly workingDir: string;

  constructor(toolsContext: BacklogToolsContext, workingDir: string, logger: Logger) {
    super(logger);
    this.toolsContext = toolsContext;
    this.workingDir = workingDir;

    // Initialize the LangGraph agent with tools
    this.initializeAgent();
  }

  /**
   * Implements abstract method: build system prompt for Backlog Agent.
   */
  protected buildSystemPrompt(): string {
    return BACKLOG_AGENT_SYSTEM_PROMPT;
  }

  /**
   * Implements abstract method: create tools for Backlog Agent.
   */
  protected createTools(): StructuredToolInterface[] {
    return createBacklogAgentTools(this.toolsContext);
  }

  /**
   * Implements abstract method: create state manager for Backlog Agent.
   * Uses file-backed persistence for backlog state and conversation history.
   */
  protected createStateManager(): AgentStateManager {
    return new BacklogStateManager(this.workingDir, this.logger);
  }
}
