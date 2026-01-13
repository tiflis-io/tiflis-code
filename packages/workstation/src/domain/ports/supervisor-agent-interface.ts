/**
 * @file supervisor-agent-interface.ts
 * @copyright 2025 Roman Barinov <rbarinov@gmail.com>
 * @license FSL-1.1-NC
 *
 * Interface for Supervisor Agent implementations.
 */

import type { EventEmitter } from 'events';
import type { ContentBlock } from '../value-objects/content-block.js';

/**
 * Result from supervisor agent execution.
 */
export interface SupervisorResult {
  output: string;
  sessionId?: string;
}

/**
 * Events emitted by SupervisorAgent during streaming execution.
 */
export interface SupervisorAgentEvents {
  /**
   * Emitted when content blocks are received during streaming
   * @param deviceId - The device ID that initiated the command
   * @param blocks - Content blocks to send to client
   * @param isComplete - Whether streaming is complete
   * @param finalOutput - The complete response text (only present when isComplete=true)
   * @param allBlocks - All accumulated blocks for persistence (only present when isComplete=true)
   */
  blocks: (
    deviceId: string,
    blocks: ContentBlock[],
    isComplete: boolean,
    finalOutput?: string,
    allBlocks?: ContentBlock[]
  ) => void;
}

/**
 * Interface for Supervisor Agent implementations.
 * Both real SupervisorAgent and MockSupervisorAgent implement this.
 */
export interface ISupervisorAgent extends EventEmitter {
  // Execution
  execute(
    command: string,
    deviceId: string,
    currentSessionId?: string
  ): SupervisorResult | Promise<SupervisorResult>;
  executeWithStream(command: string, deviceId: string): Promise<void>;

  // Cancellation
  cancel(): boolean;
  wasCancelled(): boolean;

  // Processing state
  startProcessing(): AbortController;
  isProcessing(): boolean;
  endProcessing(): void;

  // History management
  clearHistory(): void;
  resetCancellationState(): void;
  restoreHistory(
    history: { role: 'user' | 'assistant'; content: string }[]
  ): void;

  clearContext(): void;
  recordClearAck(broadcastId: string, deviceId: string): void;
}
