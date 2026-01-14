/**
 * @file session-conversation-state-manager.ts
 * @copyright 2025 Roman Barinov <rbarinov@gmail.com>
 * @license FSL-1.1-NC
 */

import type { AgentStateManager, ConversationEntry } from '../../../domain/ports/agent-state-manager.js';
import type { ChatHistoryService } from '../../../application/services/chat-history-service.js';

export class SessionConversationStateManager implements AgentStateManager {
  constructor(
    private readonly chatHistoryService: ChatHistoryService,
    private readonly sessionId: string
  ) {}

  loadHistory(): ConversationEntry[] {
    const history = this.chatHistoryService.getAgentHistory(this.sessionId);
    return history.map((entry) => ({
      role: entry.role,
      content: entry.content,
      timestamp: entry.createdAt.getTime(),
    }));
  }

  saveHistory(history: ConversationEntry[]): void {
    if (history.length === 0) return;

    const lastEntry = history[history.length - 1];
    if (!lastEntry || lastEntry.role === 'system') return;

    const storedHistory = this.chatHistoryService.getAgentHistory(this.sessionId, 1);
    const mostRecentStored = storedHistory[storedHistory.length - 1];

    if (mostRecentStored?.content !== lastEntry.content) {
      this.chatHistoryService.saveAgentMessage(
        this.sessionId,
        lastEntry.role,
        lastEntry.content
      );
    }
  }

  clearHistory(): void {
    this.chatHistoryService.clearAgentHistory(this.sessionId);
  }

  loadAdditionalState(_key: string): unknown {
    return null;
  }

  saveAdditionalState(_key: string, _state: unknown): void {
    return;
  }
}
