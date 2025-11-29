/**
 * @file in-memory-session-manager.ts
 * @copyright 2025 Roman Barinov <rbarinov@gmail.com>
 * @license MIT
 */

import { nanoid } from 'nanoid';
import type { Logger } from 'pino';
import type {
  SessionManager,
  CreateSessionParams,
  TerminalManager,
} from '../../domain/ports/session-manager.js';
import type {
  Session,
  SessionType,
  SessionInfo,
} from '../../domain/entities/session.js';
import { SupervisorSession } from '../../domain/entities/supervisor-session.js';
import { AgentSession, isAgentType } from '../../domain/entities/agent-session.js';
import type { AgentType } from '../../domain/entities/agent-session.js';
import type { SessionId } from '../../domain/value-objects/session-id.js';
import { SESSION_CONFIG } from '../../config/constants.js';
import type { AgentSessionManager } from '../agents/agent-session-manager.js';

export interface InMemorySessionManagerConfig {
  ptyManager: TerminalManager;
  agentSessionManager: AgentSessionManager;
  workspacesRoot: string;
  logger: Logger;
}

/**
 * In-memory implementation of the session manager.
 * Coordinates between terminal (PTY) and agent session managers.
 */
export class InMemorySessionManager implements SessionManager {
  private readonly sessions = new Map<string, Session>();
  private readonly ptyManager: TerminalManager;
  private readonly agentSessionManager: AgentSessionManager;
  private readonly logger: Logger;
  private supervisorSession: SupervisorSession | null = null;

  constructor(config: InMemorySessionManagerConfig) {
    this.ptyManager = config.ptyManager;
    this.agentSessionManager = config.agentSessionManager;
    this.logger = config.logger.child({ component: 'session-manager' });

    // Sync agent session events
    this.setupAgentSessionSync();
  }

  /**
   * Sets up event listeners to sync agent session state.
   */
  private setupAgentSessionSync(): void {
    this.agentSessionManager.on('sessionTerminated', (sessionId: string) => {
      const session = this.sessions.get(sessionId);
      if (session && isAgentType(session.type)) {
        this.sessions.delete(sessionId);
        this.logger.debug({ sessionId }, 'Agent session removed from registry');
      }
    });

    this.agentSessionManager.on('cliSessionIdDiscovered', (sessionId: string, cliSessionId: string) => {
      const session = this.sessions.get(sessionId);
      if (session instanceof AgentSession) {
        session.setCliSessionId(cliSessionId);
        this.logger.debug({ sessionId, cliSessionId }, 'CLI session ID updated');
      }
    });
  }

  /**
   * Creates a new session.
   */
  async createSession(params: CreateSessionParams): Promise<Session> {
    const { sessionType, workingDir, terminalSize } = params;

    if (sessionType === 'supervisor') {
      return this.getOrCreateSupervisor(workingDir);
    }

    if (sessionType === 'terminal') {
      const cols = terminalSize?.cols ?? SESSION_CONFIG.DEFAULT_TERMINAL_COLS;
      const rows = terminalSize?.rows ?? SESSION_CONFIG.DEFAULT_TERMINAL_ROWS;

      const session = await this.ptyManager.create(workingDir, cols, rows);
      this.sessions.set(session.id.value, session);

      this.logger.info(
        { sessionId: session.id.value, sessionType, workingDir },
        'Terminal session created'
      );

      return session;
    }

    // Agent sessions (cursor, claude, opencode)
    if (isAgentType(sessionType)) {
      return this.createAgentSession(sessionType, workingDir);
    }

    // This should never happen due to type checking, but TypeScript narrows to `never`
    throw new Error(`Unknown session type: ${String(sessionType)}`);
  }

  /**
   * Creates an agent session via AgentSessionManager.
   */
  private async createAgentSession(agentType: AgentType, workingDir: string): Promise<AgentSession> {
    const { SessionId } = await import('../../domain/value-objects/session-id.js');
    const sessionId = new SessionId(`${agentType}-${nanoid(8)}`);

    // Create session in AgentSessionManager (manages executor lifecycle)
    const agentState = this.agentSessionManager.createSession(agentType, workingDir, sessionId.value);

    // Create domain entity for the session
    const session = new AgentSession({
      id: sessionId,
      type: agentType,
      workingDir,
      cliSessionId: agentState.cliSessionId,
    });

    this.sessions.set(sessionId.value, session);

    this.logger.info(
      { sessionId: sessionId.value, agentType, workingDir },
      'Agent session created'
    );

    return session;
  }

  /**
   * Creates or gets the supervisor session (singleton).
   */
  async getOrCreateSupervisor(workingDir: string): Promise<SupervisorSession> {
    if (this.supervisorSession?.isActive) {
      return this.supervisorSession;
    }

    const { SessionId } = await import('../../domain/value-objects/session-id.js');
    const sessionId = new SessionId(`supervisor-${nanoid(8)}`);

    this.supervisorSession = new SupervisorSession({
      id: sessionId,
      workingDir,
    });

    this.sessions.set(sessionId.value, this.supervisorSession);

    this.logger.info(
      { sessionId: sessionId.value },
      'Supervisor session created'
    );

    return this.supervisorSession;
  }

  /**
   * Gets a session by ID.
   */
  getSession(sessionId: SessionId): Session | undefined {
    return this.sessions.get(sessionId.value);
  }

  /**
   * Gets all active sessions.
   */
  getAllSessions(): Session[] {
    return Array.from(this.sessions.values()).filter((s) => s.isActive);
  }

  /**
   * Gets sessions by type.
   */
  getSessionsByType(type: SessionType): Session[] {
    return Array.from(this.sessions.values()).filter(
      (s) => s.type === type && s.isActive
    );
  }

  /**
   * Gets session information for all sessions.
   */
  getSessionInfos(): SessionInfo[] {
    return this.getAllSessions().map((s) => s.toInfo());
  }

  /**
   * Terminates a session by ID.
   */
  async terminateSession(sessionId: SessionId): Promise<void> {
    const session = this.sessions.get(sessionId.value);
    if (!session) {
      return;
    }

    // For agent sessions, also terminate in AgentSessionManager
    if (isAgentType(session.type)) {
      this.agentSessionManager.terminateSession(sessionId.value);
    }

    await session.terminate();
    this.sessions.delete(sessionId.value);

    if (session === this.supervisorSession) {
      this.supervisorSession = null;
    }

    this.logger.info({ sessionId: sessionId.value }, 'Session terminated');
  }

  /**
   * Terminates all sessions.
   */
  async terminateAll(): Promise<void> {
    // Cleanup agent sessions first
    this.agentSessionManager.cleanup();

    const sessions = Array.from(this.sessions.values());

    await Promise.all(
      sessions.map(async (session) => {
        try {
          await session.terminate();
        } catch (error) {
          this.logger.error(
            { sessionId: session.id.value, error },
            'Error terminating session'
          );
        }
      })
    );

    this.sessions.clear();
    this.supervisorSession = null;

    this.logger.info({ count: sessions.length }, 'All sessions terminated');
  }

  /**
   * Gets the count of active sessions by type.
   */
  countByType(type: SessionType): number {
    return this.getSessionsByType(type).length;
  }

  /**
   * Gets the total count of active sessions.
   */
  count(): number {
    return this.getAllSessions().length;
  }

  /**
   * Gets the AgentSessionManager for direct access.
   */
  getAgentSessionManager(): AgentSessionManager {
    return this.agentSessionManager;
  }
}
