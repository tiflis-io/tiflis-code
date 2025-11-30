/**
 * @file list-sessions.ts
 * @copyright 2025 Roman Barinov <rbarinov@gmail.com>
 * @license MIT
 */

import type { Logger } from 'pino';
import type { SessionManager } from '../../domain/ports/session-manager.js';
import type { ResponseMessage } from '../../protocol/messages.js';

export interface ListSessionsDeps {
  sessionManager: SessionManager;
  logger: Logger;
}

export interface ListSessionsParams {
  requestId: string;
}

/**
 * Use case for listing active sessions.
 */
export class ListSessionsUseCase {
  private readonly deps: ListSessionsDeps;
  private readonly logger: Logger;

  constructor(deps: ListSessionsDeps) {
    this.deps = deps;
    this.logger = deps.logger.child({ useCase: 'list-sessions' });
  }

  /**
   * Lists all active sessions.
   */
  execute(params: ListSessionsParams): ResponseMessage {
    const { requestId } = params;

    const sessions = this.deps.sessionManager.getSessionInfos();

    this.logger.debug({ count: sessions.length }, 'Listed sessions');

    return {
      type: 'response',
      id: requestId,
      payload: {
        sessions,
      },
    };
  }
}

