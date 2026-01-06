/**
 * @file supervisor-state-manager.ts
 * @copyright 2025 Roman Barinov <rbarinov@gmail.com>
 * @license FSL-1.1-NC
 *
 * AgentStateManager implementation for SupervisorAgent database persistence.
 */

import type { AgentStateManager, ConversationEntry } from '../../../domain/ports/agent-state-manager.js';
import type { ChatHistoryService } from '../../../application/services/chat-history-service.js';

/**
 * Implements state persistence for SupervisorAgent.
 * Conversation history is persisted through ChatHistoryService.
 */
export class SupervisorStateManager implements AgentStateManager {
  constructor(private readonly chatHistoryService: ChatHistoryService) {}

  /**
   * Load conversation history from database.
   */
  async loadHistory(): Promise<ConversationEntry[]> {
    const history = this.chatHistoryService.getSupervisorHistory();
    return history.map((entry) => ({
      role: entry.role as 'user' | 'assistant',
      content: entry.content,
      timestamp: entry.createdAt ? new Date(entry.createdAt).getTime() : undefined,
    }));
  }

  /**
   * Save conversation history to database.
   * Note: Individual messages are saved one at a time via saveSupervisorMessage.
   * For efficiency, only the last message in the history (most recent) is persisted
   * if it's not already in the database.
   */
  async saveHistory(history: ConversationEntry[]): Promise<void> {
    // Only save the most recent message if history was updated
    if (history.length === 0) return;

    const lastEntry = history[history.length - 1];
    // Check if this message is already in the database by comparing with most recent stored message
    const storedHistory = this.chatHistoryService.getSupervisorHistory(1);
    const mostRecentStored = storedHistory[0];

    // Only save if content differs (new message)
    if (!mostRecentStored || mostRecentStored.content !== lastEntry.content) {
      this.chatHistoryService.saveSupervisorMessage(lastEntry.role, lastEntry.content);
    }
  }

  /**
   * Clear conversation history from database.
   */
  async clearHistory(): Promise<void> {
    await this.chatHistoryService.clearSupervisorHistory();
  }

  /**
   * Load additional agent-specific state (not used for Supervisor).
   */
  async loadAdditionalState<T>(_key: string): Promise<T | null> {
    // Supervisor doesn't use additional state
    return null;
  }

  /**
   * Save additional agent-specific state (not used for Supervisor).
   */
  async saveAdditionalState<T>(_key: string, _state: T): Promise<void> {
    // Supervisor doesn't use additional state
  }

  /**
   * Cleanup resources.
   */
  async close(): Promise<void> {
    // No resources to clean up
  }
}
