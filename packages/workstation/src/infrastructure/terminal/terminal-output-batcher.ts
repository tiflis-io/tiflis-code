/**
 * @file terminal-output-batcher.ts
 * @copyright 2025 Roman Barinov <rbarinov@gmail.com>
 * @license FSL-1.1-NC
 *
 * Batches terminal output chunks to reduce message frequency and improve performance.
 * Uses adaptive batching based on output rate for optimal responsiveness.
 */

/**
 * Configuration for the terminal output batcher.
 */
export interface TerminalOutputBatcherConfig {
  /**
   * Maximum milliseconds to wait before flushing the buffer.
   * Lower values = more responsive but more messages.
   * Default: 64ms (~15fps for reduced message frequency)
   */
  batchIntervalMs: number;

  /**
   * Maximum bytes to accumulate before forcing an immediate flush.
   * Prevents large chunks from being delayed.
   * Default: 4096 bytes
   */
  maxBatchSize: number;

  /**
   * Callback invoked when batch is flushed.
   */
  onFlush: (data: string) => void;
}

/**
 * Batches terminal output to reduce WebSocket message frequency.
 *
 * Problem:
 * PTY output arrives in small chunks (10-100 bytes each), and sending
 * each chunk as a separate WebSocket message causes:
 * - 100+ messages/second during active output
 * - Client-side flickering from excessive re-renders
 * - High overhead from JSON encoding small payloads
 *
 * Solution:
 * Accumulate chunks and flush either:
 * - When maxBatchSize is reached (immediate flush for large outputs)
 * - After batchIntervalMs timeout (responsive feel for interactive use)
 *
 * Adaptive behavior:
 * - Low throughput (<1KB/s): Flush quickly (8ms) for responsive typing
 * - High throughput (>1KB/s): Use full batch interval (32ms) for smooth rendering
 */
export class TerminalOutputBatcher {
  private buffer = '';
  private timeout: ReturnType<typeof setTimeout> | null = null;
  private lastActivityTime = Date.now();
  private outputRate = 0; // Bytes/second estimate (exponential moving average)

  private readonly batchIntervalMs: number;
  private readonly maxBatchSize: number;
  private readonly onFlush: (data: string) => void;

  constructor(config: TerminalOutputBatcherConfig) {
    this.batchIntervalMs = config.batchIntervalMs;
    this.maxBatchSize = config.maxBatchSize;
    this.onFlush = config.onFlush;
  }

  /**
   * Appends data to the batch buffer.
   * Triggers flush based on size threshold or adaptive timeout.
   */
  append(chunk: string): void {
    this.buffer += chunk;
    const now = Date.now();
    const elapsed = Math.max(now - this.lastActivityTime, 1);

    // Update output rate estimate using exponential moving average
    // Weight: 70% previous, 30% current sample
    const instantRate = (chunk.length / elapsed) * 1000;
    this.outputRate = this.outputRate * 0.7 + instantRate * 0.3;
    this.lastActivityTime = now;

    // Immediate flush if buffer exceeds max size
    if (this.buffer.length >= this.maxBatchSize) {
      this.flush();
      return;
    }

    // Schedule flush with adaptive interval if not already scheduled
    if (this.timeout === null) {
      // Adaptive batch interval:
      // - High throughput (>1KB/s): Use full interval for smoother batching
      // - Low throughput (<1KB/s): Use shorter interval for responsiveness
      const adaptiveInterval =
        this.outputRate > 1000
          ? this.batchIntervalMs
          : Math.min(8, this.batchIntervalMs);

      this.timeout = setTimeout(() => this.flush(), adaptiveInterval);
      // Allow process to exit even if batcher timeout is pending
      this.timeout.unref();
    }
  }

  /**
   * Immediately flushes the buffer, invoking the onFlush callback.
   */
  flush(): void {
    if (this.timeout !== null) {
      clearTimeout(this.timeout);
      this.timeout = null;
    }

    if (this.buffer.length > 0) {
      const data = this.buffer;
      this.buffer = '';
      this.onFlush(data);
    }
  }

  /**
   * Disposes the batcher, flushing any pending data.
   */
  dispose(): void {
    this.flush();
  }

  /**
   * Returns current buffer size (for debugging/monitoring).
   */
  get pendingSize(): number {
    return this.buffer.length;
  }

  /**
   * Returns estimated output rate in bytes/second.
   */
  get currentOutputRate(): number {
    return this.outputRate;
  }
}
