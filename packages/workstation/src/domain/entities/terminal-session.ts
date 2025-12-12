/**
 * @file terminal-session.ts
 * @copyright 2025 Roman Barinov <rbarinov@gmail.com>
 * @license FSL-1.1-NC
 */

import { Session, type BaseSessionProps } from './session.js';
import type { IPty } from 'node-pty';
import { SESSION_CONFIG } from '../../config/constants.js';

/**
 * Terminal output message stored in buffer.
 */
export interface TerminalOutputMessage {
  content_type: 'terminal';
  content: string;
  timestamp: number;
  sequence: number;
}

/**
 * Options for retrieving output history.
 */
export interface GetOutputHistoryOptions {
  /** Only return messages after this sequence number */
  sinceSequence?: number;
  /** Only return messages after this timestamp */
  sinceTimestamp?: number;
  /** Maximum number of messages to return */
  limit?: number;
}

/**
 * Properties for creating a terminal session.
 */
export interface TerminalSessionProps extends Omit<BaseSessionProps, 'type'> {
  pty: IPty;
  cols: number;
  rows: number;
}

/**
 * Callback for terminal output data.
 */
export type TerminalOutputCallback = (data: string) => void;

/**
 * Result of a resize operation.
 */
export interface ResizeResult {
  success: boolean;
  reason?: 'not_master' | 'inactive';
  cols: number;
  rows: number;
}

/**
 * Entity representing a PTY terminal session.
 * Provides direct shell access to the workstation.
 *
 * Terminal size is controlled by the "master" client - the first device to subscribe.
 * Other clients receive the terminal output but cannot change its size.
 * This prevents resize storms when multiple devices are connected.
 */
export class TerminalSession extends Session {
  private _pty: IPty;
  private _cols: number;
  private _rows: number;
  private _outputCallbacks = new Set<TerminalOutputCallback>();
  private _outputBuffer: TerminalOutputMessage[] = [];
  private _bufferSize: number;
  private _bufferIndex = 0; // For circular buffer
  private _sequenceNumber = 0; // Monotonically increasing sequence counter
  private _masterDeviceId: string | null = null; // First subscriber becomes master

  constructor(props: TerminalSessionProps & { bufferSize?: number }) {
    super({ ...props, type: 'terminal' });
    this._pty = props.pty;
    this._cols = props.cols;
    this._rows = props.rows;
    this._bufferSize = props.bufferSize ?? 1000;
    this.setupPtyHandlers();
  }

  get pty(): IPty {
    return this._pty;
  }

  get cols(): number {
    return this._cols;
  }

  get rows(): number {
    return this._rows;
  }

  get pid(): number {
    return this._pty.pid;
  }

  /**
   * Returns the current sequence number (latest message sequence).
   */
  get currentSequence(): number {
    return this._sequenceNumber;
  }

  /**
   * Returns the device ID of the master client (first subscriber).
   */
  get masterDeviceId(): string | null {
    return this._masterDeviceId;
  }

  /**
   * Sets the master device ID. Only sets if not already set (first subscriber wins).
   * @returns true if this device became master, false if master was already set
   */
  setMaster(deviceId: string): boolean {
    if (this._masterDeviceId === null) {
      this._masterDeviceId = deviceId;
      return true;
    }
    return this._masterDeviceId === deviceId;
  }

  /**
   * Checks if the given device is the master for this session.
   */
  isMaster(deviceId: string): boolean {
    return this._masterDeviceId === deviceId;
  }

  /**
   * Clears the master if it matches the given device ID.
   * Called when the master device unsubscribes.
   */
  clearMasterIfMatch(deviceId: string): void {
    if (this._masterDeviceId === deviceId) {
      this._masterDeviceId = null;
    }
  }

  /**
   * Sets up handlers for the PTY process.
   */
  private setupPtyHandlers(): void {
    this._pty.onExit(() => {
      this.markTerminated();
    });

    // Forward output data to registered callbacks
    this._pty.onData((data: string) => {
      this.recordActivity();
      for (const callback of this._outputCallbacks) {
        try {
          callback(data);
        } catch {
          // Ignore callback errors
        }
      }
    });
  }

  /**
   * Registers a callback for terminal output.
   */
  onOutput(callback: TerminalOutputCallback): void {
    this._outputCallbacks.add(callback);
  }

  /**
   * Unregisters an output callback.
   */
  offOutput(callback: TerminalOutputCallback): void {
    this._outputCallbacks.delete(callback);
  }

  /**
   * Writes data to the terminal.
   */
  write(data: string): void {
    if (!this.isActive) {
      return;
    }
    this._pty.write(data);
    this.recordActivity();
  }

  /**
   * Resizes the terminal.
   * Only the master device can resize. Minimum constraints are enforced.
   * @param cols Requested columns
   * @param rows Requested rows
   * @param deviceId Device requesting the resize
   * @returns Result indicating success/failure and actual size
   */
  resize(cols: number, rows: number, deviceId?: string): ResizeResult {
    if (!this.isActive) {
      return { success: false, reason: 'inactive', cols: this._cols, rows: this._rows };
    }

    // If deviceId is provided, check if it's the master
    // If no master is set yet, any device can resize (backward compatibility)
    if (deviceId && this._masterDeviceId && !this.isMaster(deviceId)) {
      return { success: false, reason: 'not_master', cols: this._cols, rows: this._rows };
    }

    // Apply minimum constraints to ensure proper TUI app display
    const actualCols = Math.max(cols, SESSION_CONFIG.MIN_TERMINAL_COLS);
    const actualRows = Math.max(rows, SESSION_CONFIG.MIN_TERMINAL_ROWS);

    this._cols = actualCols;
    this._rows = actualRows;
    this._pty.resize(actualCols, actualRows);
    this.recordActivity();

    return { success: true, cols: actualCols, rows: actualRows };
  }

  /**
   * Detects if content contains a clear screen escape sequence.
   * Clears the output buffer when detected to prevent replay issues.
   *
   * Clear sequences detected:
   * - ESC[2J - Erase Display (clear entire screen)
   * - ESC[3J - Erase Scrollback (clear scrollback buffer)
   * - ESC c  - Full Reset (RIS)
   */
  private detectAndHandleClearScreen(content: string): void {
    // Check for clear screen sequences
    // \x1b[2J - Erase Display
    // \x1b[3J - Erase Scrollback
    // \x1bc   - Full Reset (RIS)
    const hasClearSequence =
      content.includes('\x1b[2J') ||
      content.includes('\x1b[3J') ||
      content.includes('\x1bc');

    if (hasClearSequence) {
      this.clearOutputBuffer();
    }
  }

  /**
   * Clears the output buffer.
   * Called when clear screen sequence is detected to prevent replay of cleared content.
   */
  clearOutputBuffer(): void {
    this._outputBuffer = [];
    this._bufferIndex = 0;
    // Note: We don't reset _sequenceNumber to maintain monotonic ordering
  }

  /**
   * Adds output to in-memory buffer (circular buffer) with auto-assigned sequence number.
   * When buffer is full, oldest messages are evicted.
   * Automatically clears buffer when clear screen sequence is detected.
   * @param content The raw terminal output content
   * @returns The created message with assigned sequence number
   */
  addOutputToBuffer(content: string): TerminalOutputMessage {
    // Detect clear screen and reset buffer if needed
    this.detectAndHandleClearScreen(content);

    const message: TerminalOutputMessage = {
      content_type: 'terminal',
      content,
      timestamp: Date.now(),
      sequence: ++this._sequenceNumber,
    };

    if (this._outputBuffer.length < this._bufferSize) {
      // Buffer not full yet, append
      this._outputBuffer.push(message);
    } else {
      // Buffer is full, use circular buffer (overwrite oldest)
      this._outputBuffer[this._bufferIndex] = message;
      this._bufferIndex = (this._bufferIndex + 1) % this._bufferSize;
    }

    return message;
  }

  /**
   * Gets output history from buffer.
   * @param options Optional filtering options (sinceSequence, sinceTimestamp, limit)
   * @returns Array of terminal output messages, ordered by sequence (oldest first)
   */
  getOutputHistory(options?: GetOutputHistoryOptions): TerminalOutputMessage[] {
    // Always sort by sequence to ensure correct chronological order
    // This is critical for circular buffer where order may be disrupted
    let messages: TerminalOutputMessage[] = [...this._outputBuffer];

    // Sort by sequence first to ensure chronological order
    // Sequence is more reliable than timestamp for ordering
    messages.sort((a, b) => a.sequence - b.sequence);

    // Filter by sequence if provided (takes priority over timestamp)
    const sinceSeq = options?.sinceSequence;
    const sinceTs = options?.sinceTimestamp;
    if (sinceSeq !== undefined && sinceSeq > 0) {
      messages = messages.filter((msg) => msg.sequence > sinceSeq);
    } else if (sinceTs !== undefined && sinceTs > 0) {
      // Fall back to timestamp filtering if no sequence provided
      messages = messages.filter((msg) => msg.timestamp >= sinceTs);
    }

    // Apply limit if provided
    if (options?.limit !== undefined && options.limit > 0) {
      messages = messages.slice(0, options.limit);
    }

    return messages;
  }

  /**
   * Terminates the terminal session and cleans up resources.
   */
  override async terminate(): Promise<void> {
    if (this._status === 'terminated') {
      return;
    }

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        // Force kill if graceful shutdown fails
        this._pty.kill('SIGKILL');
        this.markTerminated();
        resolve();
      }, 2000);

      // Wait for exit
      const exitHandler = () => {
        clearTimeout(timeout);
        this.markTerminated();
        resolve();
      };

      this._pty.onExit(exitHandler);

      // Try graceful shutdown
      this._pty.kill('SIGTERM');
    });
  }
}

/**
 * Type guard to check if a session is a terminal session.
 */
export function isTerminalSession(session: Session): session is TerminalSession {
  return session.type === 'terminal';
}

