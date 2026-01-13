/**
 * @file session-manager.ts
 * @copyright 2025 Roman Barinov <rbarinov@gmail.com>
 * @license FSL-1.1-NC
 */

import type { Session, SessionType, SessionInfo } from '../entities/session.js';
import type { AgentSession, AgentType } from '../entities/agent-session.js';
import type { TerminalSession } from '../entities/terminal-session.js';
import type { SupervisorSession } from '../entities/supervisor-session.js';
import type { SessionId } from '../value-objects/session-id.js';
import type { WorkspacePath } from '../value-objects/workspace-path.js';

/**
 * Parameters for creating a new session.
 */
export interface CreateSessionParams {
  sessionType: SessionType;
  workspacePath?: WorkspacePath;
  workingDir: string;
  terminalSize?: { cols: number; rows: number };
  /** Agent name for aliases (e.g., 'zai'). If not provided, uses sessionType as agent name. */
  agentName?: string;
  /** Backlog-specific: which agent to use for code execution */
  backlogAgent?: 'claude' | 'cursor' | 'opencode';
  /** Backlog-specific: custom identifier for this backlog */
  backlogId?: string;
}

/**
 * Port for session management operations.
 */
export interface SessionManager {
  /**
   * Creates a new session.
   */
  createSession(params: CreateSessionParams): Promise<Session>;

  /**
   * Creates or gets the supervisor session (singleton).
   */
  getOrCreateSupervisor(workingDir: string): Promise<SupervisorSession>;

  /**
   * Gets a session by ID.
   */
  getSession(sessionId: SessionId): Session | undefined;

  /**
   * Gets all active sessions.
   */
  getAllSessions(): Session[];

  /**
   * Gets sessions by type.
   */
  getSessionsByType(type: SessionType): Session[];

  /**
   * Gets session information for all sessions (for protocol messages).
   */
  getSessionInfos(): SessionInfo[];

  /**
   * Terminates a session by ID.
   */
  terminateSession(sessionId: SessionId): Promise<void>;

  /**
   * Terminates all sessions.
   */
  terminateAll(): Promise<void>;

  /**
   * Gets the count of active sessions by type.
   */
  countByType(type: SessionType): number;

  /**
   * Gets the total count of active sessions.
   */
  count(): number;

  getBacklogManagers?(): Map<string, unknown>;
}

/**
 * Port for agent process execution.
 */
export interface AgentExecutor {
  /**
   * Spawns a new agent process.
   */
  spawn(agentType: AgentType, workingDir: string): Promise<AgentSession>;

  /**
   * Sends input to an agent.
   */
  sendInput(session: AgentSession, input: string): Promise<void>;
}

/**
 * Port for terminal (PTY) management.
 */
export interface TerminalManager {
  /**
   * Creates a new terminal session.
   */
  create(workingDir: string, cols: number, rows: number): Promise<TerminalSession>;

  /**
   * Writes data to a terminal.
   */
  write(session: TerminalSession, data: string): void;

  /**
   * Resizes a terminal.
   */
  resize(session: TerminalSession, cols: number, rows: number): void;
}

