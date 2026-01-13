/**
 * AgentStateManager - Pluggable state persistence for LangGraph agents
 * Different agents can have different state storage strategies (DB vs files)
 */

export interface ConversationEntry {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp?: number;
}

/**
 * Interface for managing agent state persistence
 * Implementations can use database, files, or hybrid approaches
 */
export interface AgentStateManager {
  /**
   * Load conversation history
   */
  loadHistory(): Promise<ConversationEntry[]>;

  /**
   * Save conversation history
   */
  saveHistory(history: ConversationEntry[]): Promise<void>;

  /**
   * Clear conversation history
   */
  clearHistory(): Promise<void>;

  /**
   * Load additional agent-specific state (backlog, tasks, etc)
   * @param key - State key identifier
   */
  loadAdditionalState<T>(key: string): Promise<T | null>;

  saveAdditionalState(key: string, state: unknown): Promise<void>;

  /**
   * Called when state manager is no longer needed (cleanup)
   */
  close?(): Promise<void>;
}
