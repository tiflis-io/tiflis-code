/**
 * @file agent-session.ts
 * @copyright 2025 Roman Barinov <rbarinov@gmail.com>
 * @license MIT
 */

import { Session, type BaseSessionProps, type SessionType } from './session.js';

/**
 * Agent types (excluding supervisor and terminal).
 */
export type AgentType = 'cursor' | 'claude' | 'opencode';

/**
 * Properties for creating an agent session.
 */
export interface AgentSessionProps extends BaseSessionProps {
  type: AgentType;
  /** CLI session ID for context preservation (--resume flag) */
  cliSessionId?: string | null;
}

/**
 * Entity representing a headless AI agent session.
 * The actual process lifecycle is managed by AgentSessionManager.
 */
export class AgentSession extends Session {
  private _cliSessionId: string | null;

  constructor(props: AgentSessionProps) {
    super(props);
    this._cliSessionId = props.cliSessionId ?? null;
  }

  override get type(): AgentType {
    return this._type as AgentType;
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
  return session.type === 'cursor' || session.type === 'claude' || session.type === 'opencode';
}

/**
 * Type guard to check if a session type is an agent type.
 */
export function isAgentType(type: SessionType): type is AgentType {
  return type === 'cursor' || type === 'claude' || type === 'opencode';
}
