/**
 * @file backlog-agent.ts
 * @copyright 2025 Roman Barinov <rbarinov@gmail.com>
 * @license FSL-1.1-NC
 */

import type { Logger } from 'pino';
import type { StructuredToolInterface } from '@langchain/core/tools';
import type { AgentStateManager } from '../../domain/ports/agent-state-manager.js';
import type { ChatHistoryService } from '../../application/services/chat-history-service.js';
import { LangGraphAgent } from './base/lang-graph-agent.js';
import { BacklogStateManager } from './base/backlog-state-manager.js';
import { SessionConversationStateManager } from './base/session-conversation-state-manager.js';
import { loadSystemPrompt } from './utils/prompt-loader.js';
import { createBacklogAgentTools, type BacklogToolsContext } from './backlog-agent-tools.js';

export class BacklogAgent extends LangGraphAgent {
  private readonly toolsContext: BacklogToolsContext;
  private readonly workingDir: string;
  private readonly sessionId: string;
  private readonly chatHistoryService?: ChatHistoryService;

  constructor(
    toolsContext: BacklogToolsContext,
    workingDir: string,
    sessionId: string,
    logger: Logger,
    chatHistoryService?: ChatHistoryService
  ) {
    super(logger);
    this.toolsContext = toolsContext;
    this.workingDir = workingDir;
    this.sessionId = sessionId;
    this.chatHistoryService = chatHistoryService;

    this.initializeAgent();
  }

  protected buildSystemPrompt(): string {
    return loadSystemPrompt('backlog-agent-system-prompt', 'BACKLOG_AGENT_SYSTEM_PROMPT_PATH');
  }

  protected createTools(): StructuredToolInterface[] {
    return createBacklogAgentTools(this.toolsContext);
  }

  protected createStateManager(): AgentStateManager {
    if (this.chatHistoryService) {
      return new SessionConversationStateManager(this.chatHistoryService, this.sessionId);
    }
    return new BacklogStateManager(this.workingDir, this.logger);
  }
}
