/**
 * @file agent-state-manager.ts
 * @copyright 2025 Roman Barinov <rbarinov@gmail.com>
 * @license FSL-1.1-NC
 */

export interface ConversationEntry {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp?: number;
}

export interface AgentStateManager {
  loadHistory(): ConversationEntry[];
  saveHistory(history: ConversationEntry[]): void;
  clearHistory(): void;
  loadAdditionalState(key: string): unknown;
  saveAdditionalState(key: string, state: unknown): void;
  close?(): void;
}
