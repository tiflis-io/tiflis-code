/**
 * @file terminal-session.ts
 * @copyright 2025 Roman Barinov <rbarinov@gmail.com>
 * @license MIT
 */

import { Session, type BaseSessionProps } from './session.js';
import type { IPty } from 'node-pty';

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

  constructor(props: TerminalSessionProps) {
    super({ ...props, type: 'terminal' });
    this._pty = props.pty;
    this._cols = props.cols;
    this._rows = props.rows;
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

