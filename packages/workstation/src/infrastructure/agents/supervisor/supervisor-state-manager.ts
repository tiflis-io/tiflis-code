/**
 * @file supervisor-state-manager.ts
 * @copyright 2025 Roman Barinov <rbarinov@gmail.com>
 * @license FSL-1.1-NC
 */

import type { ConversationEntry } from '../../../domain/ports/agent-state-manager.js';
import type { ChatHistoryService } from '../../../application/services/chat-history-service.js';
import { SessionConversationStateManager } from '../base/session-conversation-state-manager.js';

const SUPERVISOR_SESSION_ID = 'supervisor';

export class SupervisorStateManager extends SessionConversationStateManager {
  private readonly supervisorChatHistoryService: ChatHistoryService;

  constructor(chatHistoryService: ChatHistoryService) {
    super(chatHistoryService, SUPERVISOR_SESSION_ID);
    this.supervisorChatHistoryService = chatHistoryService;
  }

  override loadHistory(): ConversationEntry[] {
    const history = this.supervisorChatHistoryService.getSupervisorHistory();
    return history.map((entry) => ({
      role: entry.role as 'user' | 'assistant',
      content: entry.content,
      timestamp: new Date(entry.createdAt).getTime(),
    }));
  }

  override saveHistory(history: ConversationEntry[]): void {
    if (history.length === 0) return;

    const lastEntry = history[history.length - 1];
    if (!lastEntry || lastEntry.role === 'system') return;

    const storedHistory = this.supervisorChatHistoryService.getSupervisorHistory(1);
    const mostRecentStored = storedHistory[0];

    if (mostRecentStored?.content !== lastEntry.content) {
      this.supervisorChatHistoryService.saveSupervisorMessage(lastEntry.role, lastEntry.content);
    }
  }

  override clearHistory(): void {
    this.supervisorChatHistoryService.clearSupervisorHistory();
  }
}
