/**
 * @file backlog-state-manager.ts
 * @copyright 2025 Roman Barinov <rbarinov@gmail.com>
 * @license FSL-1.1-NC
 *
 * AgentStateManager implementation for backlog persistence.
 * Persists both conversation history and backlog state to files and database.
 */

import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import type { Logger } from 'pino';
import type { AgentStateManager, ConversationEntry } from '../../../domain/ports/agent-state-manager.js';
import type { Backlog } from '../../../domain/value-objects/backlog.js';

/**
 * Implements state persistence for BacklogAgent.
 * Saves conversation history and backlog state to files (and optionally database for future integration).
 */
export class BacklogStateManager implements AgentStateManager {
  constructor(
    private readonly workingDir: string,
    private readonly logger: Logger
  ) {}

  /**
   * Conversation history file path.
   */
  private getHistoryPath(): string {
    return join(this.workingDir, 'conversation-history.json');
  }

  /**
   * Load conversation history from file.
   */
  async loadHistory(): Promise<ConversationEntry[]> {
    const historyPath = this.getHistoryPath();

    if (!existsSync(historyPath)) {
      return [];
    }

    try {
      const content = readFileSync(historyPath, 'utf-8');
      const data = JSON.parse(content) as ConversationEntry[];
      this.logger.debug({ messageCount: data.length }, 'Loaded conversation history from file');
      return data;
    } catch (error) {
      this.logger.error({ error }, 'Failed to load conversation history from file');
      return [];
    }
  }

  /**
   * Save conversation history to file.
   */
  async saveHistory(history: ConversationEntry[]): Promise<void> {
    const historyPath = this.getHistoryPath();

    try {
      writeFileSync(historyPath, JSON.stringify(history, null, 2), 'utf-8');
      this.logger.debug({ messageCount: history.length }, 'Saved conversation history to file');
    } catch (error) {
      this.logger.error({ error }, 'Failed to save conversation history to file');
    }
  }

  /**
   * Clear conversation history.
   */
  async clearHistory(): Promise<void> {
    const historyPath = this.getHistoryPath();

    try {
      if (existsSync(historyPath)) {
        writeFileSync(historyPath, JSON.stringify([], null, 2), 'utf-8');
      }
      this.logger.info('Cleared conversation history');
    } catch (error) {
      this.logger.error({ error }, 'Failed to clear conversation history');
    }
  }

  /**
   * Load additional agent-specific state (backlog).
   * @param key - State key ('backlog' for backlog state)
   */
  async loadAdditionalState<T>(key: string): Promise<T | null> {
    if (key !== 'backlog') {
      return null;
    }

    const backlogPath = join(this.workingDir, 'backlog.json');

    if (!existsSync(backlogPath)) {
      return null;
    }

    try {
      const content = readFileSync(backlogPath, 'utf-8');
      const data = JSON.parse(content) as T;
      this.logger.debug('Loaded backlog state from file');
      return data;
    } catch (error) {
      this.logger.error({ error }, 'Failed to load backlog state from file');
      return null;
    }
  }

  /**
   * Save additional agent-specific state (backlog).
   * @param key - State key ('backlog' for backlog state)
   * @param state - State to save
   */
  async saveAdditionalState<T>(key: string, state: T): Promise<void> {
    if (key !== 'backlog') {
      return;
    }

    const backlogPath = join(this.workingDir, 'backlog.json');

    try {
      writeFileSync(backlogPath, JSON.stringify(state, null, 2), 'utf-8');
      this.logger.debug('Saved backlog state to file');
    } catch (error) {
      this.logger.error({ error }, 'Failed to save backlog state to file');
    }
  }

  /**
   * Cleanup resources.
   */
  async close(): Promise<void> {
    // No resources to clean up
  }
}
