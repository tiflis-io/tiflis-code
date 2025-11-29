/**
 * @file pty-manager.ts
 * @copyright 2025 Roman Barinov <rbarinov@gmail.com>
 * @license MIT
 */

import * as pty from 'node-pty';
import { nanoid } from 'nanoid';
import type { Logger } from 'pino';
import type { TerminalManager } from '../../domain/ports/session-manager.js';
import { TerminalSession } from '../../domain/entities/terminal-session.js';
import { SessionId } from '../../domain/value-objects/session-id.js';

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

  constructor(config: PtyManagerConfig) {
    this.logger = config.logger.child({ component: 'pty-manager' });
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

    const ptyProcess = pty.spawn(shell, [], {
      name: 'xterm-256color',
      cols,
      rows,
      cwd: workingDir,
      env: {
        ...process.env,
        TERM: 'xterm-256color',
      },
    });

    const session = new TerminalSession({
      id: sessionId,
      pty: ptyProcess,
      cols,
      rows,
      workingDir,
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
   */
  resize(session: TerminalSession, cols: number, rows: number): void {
    session.resize(cols, rows);
    this.logger.debug(
      { sessionId: session.id.value, cols, rows },
      'Terminal resized'
    );
  }
}

