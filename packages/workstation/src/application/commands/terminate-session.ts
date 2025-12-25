/**
 * @file terminate-session.ts
 * @copyright 2025 Roman Barinov <rbarinov@gmail.com>
 * @license FSL-1.1-NC
 */

import type { Logger } from "pino";
import type { SessionManager } from "../../domain/ports/session-manager.js";
import type { MessageBroadcaster } from "../../domain/ports/message-broadcaster.js";
import type { ChatHistoryService } from "../services/chat-history-service.js";
import type { AgentSessionManager } from "../../infrastructure/agents/agent-session-manager.js";
import { SessionId } from "../../domain/value-objects/session-id.js";
import { SessionNotFoundError } from "../../domain/errors/domain-errors.js";
import { isAgentType } from "../../domain/entities/agent-session.js";
import type {
  ResponseMessage,
  SessionTerminatedMessage,
} from "../../protocol/messages.js";

export interface TerminateSessionDeps {
  sessionManager: SessionManager;
  agentSessionManager: AgentSessionManager;
  messageBroadcaster: MessageBroadcaster;
  chatHistoryService: ChatHistoryService;
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
    this.logger = deps.logger.child({ useCase: "terminate-session" });
  }

  /**
   * Terminates a session.
   * Sessions can exist in:
   * 1. In-memory sessionManager (active terminals/agents)
   * 2. SQLite database (persisted agent sessions that survive restart)
   * We try both sources to ensure complete cleanup.
   */
  async execute(
    params: TerminateSessionParams
  ): Promise<TerminateSessionResult> {
    const { requestId, sessionId } = params;
    const id = new SessionId(sessionId);

    this.logger.info(
      { sessionId, requestId },
      "Attempting to terminate session"
    );

    // Check if session exists in memory
    const session = this.deps.sessionManager.getSession(id);
    this.logger.info(
      {
        sessionId,
        foundInMemory: !!session,
        sessionType: session?.type,
        allInMemorySessions: this.deps.sessionManager
          .getSessionInfos()
          .map((s) => s.session_id),
      },
      "Session lookup result (in-memory)"
    );

    // Cannot terminate supervisor
    if (session?.type === "supervisor") {
      throw new Error("Cannot terminate supervisor session");
    }

    let terminatedInMemory = false;
    let terminatedInDb = false;

    // Terminate from in-memory store if present
    if (session) {
      // Terminate from agent session manager if it's an agent
      if (isAgentType(session.type)) {
        this.deps.agentSessionManager.terminateSession(sessionId);
      }
      await this.deps.sessionManager.terminateSession(id);
      terminatedInMemory = true;
      this.logger.info(
        { sessionId },
        "Session terminated from in-memory store"
      );
    }

    // Also terminate in database (for persisted agent sessions)
    this.logger.debug({ sessionId }, "Attempting database termination");
    terminatedInDb = this.deps.chatHistoryService.terminateSession(sessionId);
    this.logger.info(
      { sessionId, terminatedInDb },
      "Database termination result"
    );

    // If session wasn't found in either place, throw error
    if (!terminatedInMemory && !terminatedInDb) {
      this.logger.warn(
        { sessionId },
        "Session not found for termination in any store"
      );
      throw new SessionNotFoundError(sessionId);
    }

    this.logger.info(
      { sessionId, terminatedInMemory, terminatedInDb },
      "Session terminated"
    );

    // Build response
    const response: ResponseMessage = {
      type: "response",
      id: requestId,
      payload: {
        session_id: sessionId,
        terminated: true,
      },
    };

    // Build broadcast message
    const broadcast: SessionTerminatedMessage = {
      type: "session.terminated",
      session_id: sessionId,
    };

    return { response, broadcast };
  }

  /**
   * Terminates a session and broadcasts the termination to all clients.
   * Use this for internal calls (e.g., from supervisor tools) where no request/response is needed.
   * Returns true if session was found and terminated, false otherwise.
   */
  async terminateAndBroadcast(sessionId: string): Promise<boolean> {
    const id = new SessionId(sessionId);

    this.logger.info({ sessionId }, "Attempting to terminate session (internal)");

    // Check if session exists in memory
    const session = this.deps.sessionManager.getSession(id);

    // Cannot terminate supervisor
    if (session?.type === "supervisor") {
      throw new Error("Cannot terminate supervisor session");
    }

    let terminatedInMemory = false;
    let terminatedInDb = false;

    // Terminate from in-memory store if present
    if (session) {
      // Terminate from agent session manager if it's an agent
      if (isAgentType(session.type)) {
        this.deps.agentSessionManager.terminateSession(sessionId);
      }
      await this.deps.sessionManager.terminateSession(id);
      terminatedInMemory = true;
    }

    // Also terminate in database (for persisted agent sessions)
    terminatedInDb = this.deps.chatHistoryService.terminateSession(sessionId);

    // If session wasn't found in either place, return false
    if (!terminatedInMemory && !terminatedInDb) {
      return false;
    }

    // Broadcast termination to all clients
    const broadcast: SessionTerminatedMessage = {
      type: "session.terminated",
      session_id: sessionId,
    };
    this.deps.messageBroadcaster.broadcastToAll(JSON.stringify(broadcast));

    this.logger.info(
      { sessionId, terminatedInMemory, terminatedInDb },
      "Session terminated and broadcast sent"
    );

    return true;
  }
}
