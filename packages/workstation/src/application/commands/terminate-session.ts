/**
 * @file terminate-session.ts
 * @copyright 2025 Roman Barinov <rbarinov@gmail.com>
 * @license MIT
 */

import type { Logger } from 'pino';
import type { SessionManager } from '../../domain/ports/session-manager.js';
import type { MessageBroadcaster } from '../../domain/ports/message-broadcaster.js';
import { SessionId } from '../../domain/value-objects/session-id.js';
import { SessionNotFoundError } from '../../domain/errors/domain-errors.js';
import type { ResponseMessage, SessionTerminatedMessage } from '../../protocol/messages.js';

export interface TerminateSessionDeps {
  sessionManager: SessionManager;
  messageBroadcaster: MessageBroadcaster;
  logger: Logger;
}

export interface TerminateSessionParams {
  requestId: string;
  sessionId: string;
}

export interface TerminateSessionResult {
  response: ResponseMessage;
  broadcast: SessionTerminatedMessage;
}

/**
 * Use case for terminating sessions.
 */
export class TerminateSessionUseCase {
  private readonly deps: TerminateSessionDeps;
  private readonly logger: Logger;

  constructor(deps: TerminateSessionDeps) {
    this.deps = deps;
    this.logger = deps.logger.child({ useCase: 'terminate-session' });
  }

  /**
   * Terminates a session.
   */
  async execute(params: TerminateSessionParams): Promise<TerminateSessionResult> {
    const { requestId, sessionId } = params;
    const id = new SessionId(sessionId);

    // Check session exists
    const session = this.deps.sessionManager.getSession(id);
    if (!session) {
      throw new SessionNotFoundError(sessionId);
    }

    // Cannot terminate supervisor
    if (session.type === 'supervisor') {
      throw new Error('Cannot terminate supervisor session');
    }

    // Terminate session
    await this.deps.sessionManager.terminateSession(id);

    this.logger.info({ sessionId }, 'Session terminated');

    // Build response
    const response: ResponseMessage = {
      type: 'response',
      id: requestId,
      payload: {
        session_id: sessionId,
        terminated: true,
      },
    };

    // Build broadcast message
    const broadcast: SessionTerminatedMessage = {
      type: 'session.terminated',
      session_id: sessionId,
    };

    return { response, broadcast };
  }
}

