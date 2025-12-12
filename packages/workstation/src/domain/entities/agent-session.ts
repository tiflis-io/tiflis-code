/**
 * @file agent-session.ts
 * @copyright 2025 Roman Barinov <rbarinov@gmail.com>
 * @license FSL-1.1-NC
 */

import { Session, type BaseSessionProps, type SessionType, type SessionInfo } from './session.js';
import { BASE_AGENT_TYPES, getAvailableAgents, type BaseAgentType } from '../../config/constants.js';

/**
 * Base agent types for internal logic (parsing, command building).
 * Re-export for backwards compatibility.
 */
export type AgentType = BaseAgentType;

/**
 * Properties for creating an agent session.
 */
export interface AgentSessionProps extends BaseSessionProps {
  type: AgentType;
  /** Agent name (can be alias like 'zai' or base type like 'claude') */
  agentName?: string;
  /** CLI session ID for context preservation (--resume flag) */
  cliSessionId?: string | null;
}

/**
 * Entity representing a headless AI agent session.
 * The actual process lifecycle is managed by AgentSessionManager.
 */
export class AgentSession extends Session {
  private _cliSessionId: string | null;
  private _agentName: string;

  constructor(props: AgentSessionProps) {
    super(props);
    this._cliSessionId = props.cliSessionId ?? null;
    this._agentName = props.agentName ?? props.type;
  }

  override get type(): AgentType {
    return this._type as AgentType;
  }

  /**
   * Agent name (can be alias like 'zai' or base type like 'claude').
   * Used for display and command configuration lookup.
   */
  get agentName(): string {
    return this._agentName;
  }

  /**
   * CLI session ID for resuming context across commands.
   */
  get cliSessionId(): string | null {
    return this._cliSessionId;
  }

  /**
   * Updates the CLI session ID.
   */
  setCliSessionId(sessionId: string | null): void {
    this._cliSessionId = sessionId;
    this.recordActivity();
  }

  /**
   * Marks the session as busy when executing a command.
   */
  startExecution(): void {
    this.markBusy();
  }

  /**
   * Marks the session as idle after command execution.
   */
  endExecution(): void {
    this.markIdle();
  }

  /**
   * Returns session information for protocol messages.
   * Includes agent_name if it differs from the base type (i.e., it's an alias).
   */
  override toInfo(): SessionInfo {
    const info = super.toInfo();
    // Only include agent_name if it's different from the base type (i.e., it's an alias)
    if (this._agentName !== this._type) {
      info.agent_name = this._agentName;
    }
    return info;
  }

  /**
   * Terminates the agent session.
   * The actual process cleanup is handled by AgentSessionManager.
   */
  override async terminate(): Promise<void> {
    if (this._status === 'terminated') {
      return;
    }
    this.markTerminated();
    await Promise.resolve();
  }
}

/**
 * Type guard to check if a session is an agent session.
 */
export function isAgentSession(session: Session): session is AgentSession {
  return BASE_AGENT_TYPES.includes(session.type as BaseAgentType);
}

/**
 * Type guard to check if a session type is a base agent type.
 */
export function isAgentType(type: SessionType): type is AgentType {
  return BASE_AGENT_TYPES.includes(type as BaseAgentType);
}

/**
 * Checks if a string is a valid agent name (base type or alias).
 */
export function isValidAgentName(name: string): boolean {
  const agents = getAvailableAgents();
  return agents.has(name);
}
