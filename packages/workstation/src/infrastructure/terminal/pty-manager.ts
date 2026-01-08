/**
 * @file pty-manager.ts
 * @copyright 2025 Roman Barinov <rbarinov@gmail.com>
 * @license FSL-1.1-NC
 */

import * as pty from 'node-pty';
import { nanoid } from 'nanoid';
import type { Logger } from 'pino';
import { existsSync } from 'fs';
import { execSync } from 'child_process';
import type { TerminalManager } from '../../domain/ports/session-manager.js';
import { TerminalSession, type ResizeResult } from '../../domain/entities/terminal-session.js';
import { SessionId } from '../../domain/value-objects/session-id.js';
import { getEnv } from '../../config/env.js';
import { getShellEnv } from '../shell/shell-env.js';

/**
 * Resolves the shell to use, validating it exists.
 * Falls back through alternatives if primary shell is not available.
 */
function resolveShell(logger: Logger): string {
  const primaryShell = process.env.SHELL;

  // Try primary shell from SHELL environment variable
  if (primaryShell && existsSync(primaryShell)) {
    logger.debug({ shell: primaryShell }, 'Using primary shell from SHELL environment');
    return primaryShell;
  }

  if (primaryShell) {
    logger.warn(
      { primaryShell, exists: false },
      'Primary shell from SHELL env does not exist, trying alternatives'
    );
  }

  // Try common shell alternatives
  const fallbackShells = ['/bin/zsh', '/bin/bash', '/bin/sh'];

  for (const shell of fallbackShells) {
    if (existsSync(shell)) {
      logger.debug({ shell }, 'Using fallback shell');
      return shell;
    }
  }

  // Last resort: try to find sh in PATH
  try {
    const whichSh = execSync('which sh', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
    if (whichSh && existsSync(whichSh)) {
      logger.debug({ shell: whichSh }, 'Found sh in PATH as last resort');
      return whichSh;
    }
  } catch {
    logger.warn('Failed to find sh in PATH');
  }

  // This should rarely happen on Unix systems
  logger.error('No usable shell found, defaulting to /bin/bash');
  return '/bin/bash';
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
   * Resolves shell with fallbacks and includes detailed error logging for debugging M1 issues.
   */
  create(workingDir: string, cols: number, rows: number): Promise<TerminalSession> {
    const sessionId = new SessionId(nanoid(12));
    const shell = resolveShell(this.logger);

    this.logger.debug(
      { sessionId: sessionId.value, workingDir, shell, cols, rows },
      'Creating terminal session'
    );

    try {
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
        { sessionId: sessionId.value, pid: ptyProcess.pid, shell },
        'Terminal session created'
      );

      return Promise.resolve(session);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(
        {
          sessionId: sessionId.value,
          shell,
          workingDir,
          cols,
          rows,
          error: errorMsg,
          stack: error instanceof Error ? error.stack : undefined,
        },
        'Failed to create terminal session'
      );

      // Re-throw with better error message for client
      const message = `Terminal creation failed: ${errorMsg}. Shell: ${shell}, Working dir: ${workingDir}`;
      throw new Error(message);
    }
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

