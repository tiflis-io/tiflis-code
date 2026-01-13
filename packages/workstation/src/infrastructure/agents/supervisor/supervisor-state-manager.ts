/**
 * @file supervisor-state-manager.ts
 * @copyright 2025 Roman Barinov <rbarinov@gmail.com>
 * @license FSL-1.1-NC
 *
 * AgentStateManager implementation for SupervisorAgent database persistence.
 */

import type { AgentStateManager, ConversationEntry } from '../../../domain/ports/agent-state-manager.js';
import type { ChatHistoryService } from '../../../application/services/chat-history-service.js';

export class SupervisorStateManager implements AgentStateManager {
  constructor(private readonly chatHistoryService: ChatHistoryService) {}

  loadHistory(): Promise<ConversationEntry[]> {
    const history = this.chatHistoryService.getSupervisorHistory();
    const entries: ConversationEntry[] = history.map((entry) => ({
      role: entry.role as 'user' | 'assistant',
      content: entry.content,
      timestamp: new Date(entry.createdAt).getTime(),
    }));
    return Promise.resolve(entries);
  }

  saveHistory(history: ConversationEntry[]): Promise<void> {
    if (history.length === 0) return Promise.resolve();

    const lastEntry = history[history.length - 1];
    if (!lastEntry) return Promise.resolve();

    // Skip system messages as they're not supported by saveSupervisorMessage
    if (lastEntry.role === 'system') return Promise.resolve();

    const storedHistory = this.chatHistoryService.getSupervisorHistory(1);
    const mostRecentStored = storedHistory[0];

    if (!mostRecentStored || mostRecentStored.content !== lastEntry.content) {
      this.chatHistoryService.saveSupervisorMessage(lastEntry.role, lastEntry.content);
    }
    return Promise.resolve();
  }

  clearHistory(): Promise<void> {
    this.chatHistoryService.clearSupervisorHistory();
    return Promise.resolve();
  }

  loadAdditionalState<T>(_key: string): Promise<T | null> {
    return Promise.resolve(null);
  }

  saveAdditionalState(_key: string, _state: unknown): Promise<void> {
    return Promise.resolve();
  }

  close(): Promise<void> {
    return Promise.resolve();
  }
}
