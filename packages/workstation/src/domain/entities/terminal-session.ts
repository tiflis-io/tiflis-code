/**
 * @file terminal-session.ts
 * @copyright 2025 Roman Barinov <rbarinov@gmail.com>
 * @license MIT
 */

import { Session, type BaseSessionProps } from './session.js';
import type { IPty } from 'node-pty';

/**
 * Terminal output message stored in buffer.
 */
export interface TerminalOutputMessage {
  content_type: 'terminal';
  content: string;
  timestamp: number;
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
 * Entity representing a PTY terminal session.
 * Provides direct shell access to the workstation.
 */
export class TerminalSession extends Session {
  private _pty: IPty;
  private _cols: number;
  private _rows: number;
  private _outputCallbacks = new Set<TerminalOutputCallback>();
  private _outputBuffer: TerminalOutputMessage[] = [];
  private _bufferSize: number;
  private _bufferIndex = 0; // For circular buffer

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
   */
  resize(cols: number, rows: number): void {
    if (!this.isActive) {
      return;
    }
    this._cols = cols;
    this._rows = rows;
    this._pty.resize(cols, rows);
    this.recordActivity();
  }

  /**
   * Adds output message to in-memory buffer (circular buffer).
   * When buffer is full, oldest messages are evicted.
   */
  addOutputToBuffer(message: TerminalOutputMessage): void {
    if (this._outputBuffer.length < this._bufferSize) {
      // Buffer not full yet, append
      this._outputBuffer.push(message);
    } else {
      // Buffer is full, use circular buffer (overwrite oldest)
      this._outputBuffer[this._bufferIndex] = message;
      this._bufferIndex = (this._bufferIndex + 1) % this._bufferSize;
    }
  }

  /**
   * Gets output history from buffer.
   * @param sinceTimestamp Optional timestamp to filter messages (only return messages after this timestamp)
   * @param limit Optional limit on number of messages to return
   * @returns Array of terminal output messages, ordered by timestamp (oldest first)
   */
  getOutputHistory(sinceTimestamp?: number, limit?: number): TerminalOutputMessage[] {
    // Always sort by timestamp to ensure correct chronological order
    // This is critical for circular buffer where order may be disrupted
    let messages: TerminalOutputMessage[] = [...this._outputBuffer];

    // Sort by timestamp first to ensure chronological order
    // This is essential because circular buffer may not maintain order
    messages.sort((a, b) => a.timestamp - b.timestamp);

    // Filter by timestamp if provided
    // If sinceTimestamp is 0 or undefined, return all messages
    if (sinceTimestamp !== undefined && sinceTimestamp > 0) {
      messages = messages.filter((msg) => msg.timestamp >= sinceTimestamp);
    }

    // Apply limit if provided
    if (limit !== undefined && limit > 0) {
      messages = messages.slice(0, limit);
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

