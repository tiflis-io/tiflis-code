/**
 * @file pty-manager.ts
 * @copyright 2025 Roman Barinov <rbarinov@gmail.com>
 * @license FSL-1.1-NC
 */

import * as pty from 'node-pty';
import { nanoid } from 'nanoid';
import type { Logger } from 'pino';
import type { TerminalManager } from '../../domain/ports/session-manager.js';
import { TerminalSession, type ResizeResult } from '../../domain/entities/terminal-session.js';
import { SessionId } from '../../domain/value-objects/session-id.js';
import { getEnv } from '../../config/env.js';
import { getShellEnv } from '../shell/shell-env.js';

/**
 * Default shell to use for terminal sessions.
 */
function getDefaultShell(): string {
  return process.env.SHELL ?? '/bin/bash';
}

export interface PtyManagerConfig {
  logger: Logger;
}

/**
 * Implementation of terminal management using node-pty.
 */
export class PtyManager implements TerminalManager {
  private readonly logger: Logger;
  private readonly bufferSize: number;

  constructor(config: PtyManagerConfig) {
    this.logger = config.logger.child({ component: 'pty-manager' });
    // Get buffer size from environment, fallback to default
    const env = getEnv();
    this.bufferSize = env.TERMINAL_OUTPUT_BUFFER_SIZE;
  }

  /**
   * Creates a new terminal session.
   */
  create(workingDir: string, cols: number, rows: number): Promise<TerminalSession> {
    const sessionId = new SessionId(nanoid(12));
    const shell = getDefaultShell();

    this.logger.debug(
      { sessionId: sessionId.value, workingDir, shell, cols, rows },
      'Creating terminal session'
    );

    // Get environment from interactive login shell to include PATH from .zshrc/.bashrc
    const shellEnv = getShellEnv();

    const ptyProcess = pty.spawn(shell, [], {
      name: 'xterm-256color',
      cols,
      rows,
      cwd: workingDir,
      env: {
        ...shellEnv,
        TERM: 'xterm-256color',
        // Disable zsh partial line marker (inverse % sign on startup)
        PROMPT_EOL_MARK: '',
      },
    });

    const session = new TerminalSession({
      id: sessionId,
      pty: ptyProcess,
      cols,
      rows,
      workingDir,
      bufferSize: this.bufferSize,
    });

    this.logger.info(
      { sessionId: sessionId.value, pid: ptyProcess.pid },
      'Terminal session created'
    );

    return Promise.resolve(session);
  }

  /**
   * Writes data to a terminal session.
   */
  write(session: TerminalSession, data: string): void {
    session.write(data);
  }

  /**
   * Resizes a terminal session.
   * @param session Terminal session to resize
   * @param cols Requested columns
   * @param rows Requested rows
   * @param deviceId Device requesting the resize (for master check)
   * @returns Result indicating success/failure and actual size
   */
  resize(session: TerminalSession, cols: number, rows: number, deviceId?: string): ResizeResult {
    const result = session.resize(cols, rows, deviceId);
    if (result.success) {
      this.logger.debug(
        { sessionId: session.id.value, cols: result.cols, rows: result.rows, deviceId },
        'Terminal resized'
      );
    } else {
      this.logger.debug(
        { sessionId: session.id.value, reason: result.reason, deviceId, master: session.masterDeviceId },
        'Terminal resize rejected'
      );
    }
    return result;
  }
}

