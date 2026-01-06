/**
 * @file database-state-manager.ts
 * @copyright 2025 Roman Barinov <rbarinov@gmail.com>
 * @license FSL-1.1-NC
 *
 * AgentStateManager implementation for database persistence.
 * Used by SupervisorAgent to persist conversation history to database.
 */

import type { AgentStateManager, ConversationEntry } from '../../../domain/ports/agent-state-manager.js';
import type { ChatHistoryService } from '../../../application/services/chat-history-service.js';

/**
 * Implements state persistence for agents that use database storage.
 * Conversation history is persisted through ChatHistoryService.
 */
export class DatabaseStateManager implements AgentStateManager {
  constructor(private readonly chatHistoryService: ChatHistoryService) {}

  /**
   * Load conversation history from database.
   */
  async loadHistory(): Promise<ConversationEntry[]> {
    const history = await this.chatHistoryService.getSupervisorHistory();
    return history.map((entry) => ({
      role: entry.role as 'user' | 'assistant',
      content: entry.content,
      timestamp: entry.timestamp ? new Date(entry.timestamp).getTime() : undefined,
    }));
  }

  /**
   * Save conversation history to database.
   */
  async saveHistory(history: ConversationEntry[]): Promise<void> {
    await this.chatHistoryService.saveSupervisorHistory(
      history.map((entry) => ({
        role: entry.role,
        content: entry.content,
        timestamp: entry.timestamp,
      }))
    );
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
