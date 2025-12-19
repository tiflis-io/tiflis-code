/**
 * @file in-memory-session-manager.ts
 * @copyright 2025 Roman Barinov <rbarinov@gmail.com>
 * @license FSL-1.1-NC
 */

import { EventEmitter } from 'events';
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
import { SessionId } from '../../domain/value-objects/session-id.js';
import type { WorkspacePath } from '../../domain/value-objects/workspace-path.js';
import type { TerminalSession } from '../../domain/entities/terminal-session.js';
import { SESSION_CONFIG } from '../../config/constants.js';
import type { AgentSessionManager } from '../agents/agent-session-manager.js';

export interface InMemorySessionManagerConfig {
  ptyManager: TerminalManager;
  agentSessionManager: AgentSessionManager;
  workspacesRoot: string;
  logger: Logger;
}

/**
 * Events emitted by InMemorySessionManager.
 */
export interface SessionManagerEvents {
  /**
   * Emitted when a terminal session is created.
   * Used to attach output handlers and broadcast session.created messages.
   */
  terminalSessionCreated: (session: TerminalSession) => void;
}

/**
 * In-memory implementation of the session manager.
 * Coordinates between terminal (PTY) and agent session managers.
 */
export class InMemorySessionManager extends EventEmitter implements SessionManager {
  private readonly sessions = new Map<string, Session>();
  private readonly ptyManager: TerminalManager;
  private readonly agentSessionManager: AgentSessionManager;
  private readonly logger: Logger;
  private supervisorSession: SupervisorSession | null = null;

  constructor(config: InMemorySessionManagerConfig) {
    super();
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
    // Handle session creation events (for mock mode pre-created sessions)
    this.agentSessionManager.on('sessionCreated', (state: { sessionId: string; agentType: AgentType; agentName: string; workingDir: string }) => {
      // Only register if not already in sessions (avoid duplicates from createAgentSession path)
      if (!this.sessions.has(state.sessionId)) {
        const session = new AgentSession({
          id: new SessionId(state.sessionId),
          agentType: state.agentType,
          agentName: state.agentName,
          workingDir: state.workingDir,
        });
        this.sessions.set(state.sessionId, session);
        this.logger.debug(
          { sessionId: state.sessionId, agentType: state.agentType },
          'Agent session registered from external creation'
        );
      }
    });

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
    const { sessionType, workingDir, terminalSize, agentName } = params;

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

      // Emit event for listeners to attach output handlers and broadcast
      this.emit('terminalSessionCreated', session);

      return session;
    }

    // Agent sessions (cursor, claude, opencode)
    if (isAgentType(sessionType)) {
      return this.createAgentSession(sessionType, workingDir, agentName, params.workspacePath);
    }

    // This should never happen due to type checking, but TypeScript narrows to `never`
    throw new Error(`Unknown session type: ${String(sessionType)}`);
  }

  /**
   * Creates an agent session via AgentSessionManager.
   *
   * @param agentType - Base agent type (cursor, claude, opencode)
   * @param workingDir - Working directory for the agent
   * @param agentName - Optional agent name (alias like 'zai' or base type)
   * @param workspacePath - Optional workspace path for workspace/project/worktree info
   */
  private async createAgentSession(
    agentType: AgentType,
    workingDir: string,
    agentName?: string,
    workspacePath?: WorkspacePath
  ): Promise<AgentSession> {
    const { SessionId } = await import('../../domain/value-objects/session-id.js');
    const resolvedAgentName = agentName ?? agentType;
    const sessionId = new SessionId(`${resolvedAgentName}-${nanoid(8)}`);

    // Create session in AgentSessionManager (manages executor lifecycle)
    const agentState = this.agentSessionManager.createSession(
      agentType,
      workingDir,
      sessionId.value,
      resolvedAgentName
    );

    // Create domain entity for the session
    const session = new AgentSession({
      id: sessionId,
      type: agentType,
      agentName: resolvedAgentName,
      workingDir,
      workspacePath,
      cliSessionId: agentState.cliSessionId,
    });

    this.sessions.set(sessionId.value, session);

    this.logger.info(
      { sessionId: sessionId.value, agentType, agentName: resolvedAgentName, workingDir, workspacePath },
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
