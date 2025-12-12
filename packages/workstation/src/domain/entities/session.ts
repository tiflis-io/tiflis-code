/**
 * @file session.ts
 * @copyright 2025 Roman Barinov <rbarinov@gmail.com>
 * @license FSL-1.1-NC
 */

import type { SessionId } from '../value-objects/session-id.js';
import type { WorkspacePath } from '../value-objects/workspace-path.js';

/**
 * Session types supported by the workstation.
 */
export type SessionType = 'supervisor' | 'cursor' | 'claude' | 'opencode' | 'terminal';

/**
 * Session status.
 */
export type SessionStatus = 'active' | 'idle' | 'busy' | 'terminated';

/**
 * Base interface for session properties.
 */
export interface BaseSessionProps {
  id: SessionId;
  type: SessionType;
  workspacePath?: WorkspacePath;
  workingDir: string;
}

/**
 * Abstract base class for all session types.
 */
export abstract class Session {
  protected readonly _id: SessionId;
  protected readonly _type: SessionType;
  protected readonly _workspacePath?: WorkspacePath;
  protected readonly _workingDir: string;
  protected _status: SessionStatus;
  protected readonly _createdAt: Date;
  protected _lastActivityAt: Date;

  constructor(props: BaseSessionProps) {
    this._id = props.id;
    this._type = props.type;
    this._workspacePath = props.workspacePath;
    this._workingDir = props.workingDir;
    this._status = 'active';
    this._createdAt = new Date();
    this._lastActivityAt = new Date();
  }

  get id(): SessionId {
    return this._id;
  }

  get type(): SessionType {
    return this._type;
  }

  get workspacePath(): WorkspacePath | undefined {
    return this._workspacePath;
  }

  get workingDir(): string {
    return this._workingDir;
  }

  get status(): SessionStatus {
    return this._status;
  }

  get createdAt(): Date {
    return this._createdAt;
  }

  get lastActivityAt(): Date {
    return this._lastActivityAt;
  }

  get isActive(): boolean {
    return this._status !== 'terminated';
  }

  get isBusy(): boolean {
    return this._status === 'busy';
  }

  /**
   * Marks the session as busy (processing a command).
   */
  markBusy(): void {
    if (this._status === 'terminated') {
      throw new Error('Cannot mark terminated session as busy');
    }
    this._status = 'busy';
    this._lastActivityAt = new Date();
  }

  /**
   * Marks the session as idle (ready for commands).
   */
  markIdle(): void {
    if (this._status === 'terminated') {
      throw new Error('Cannot mark terminated session as idle');
    }
    this._status = 'idle';
    this._lastActivityAt = new Date();
  }

  /**
   * Marks the session as terminated.
   */
  markTerminated(): void {
    this._status = 'terminated';
  }

  /**
   * Records activity on the session.
   */
  recordActivity(): void {
    this._lastActivityAt = new Date();
  }

  /**
   * Returns session information for protocol messages.
   */
  toInfo(): SessionInfo {
    return {
      session_id: this._id.value,
      session_type: this._type,
      status: this._status,
      workspace: this._workspacePath?.workspace,
      project: this._workspacePath?.project,
      worktree: this._workspacePath?.worktree,
      working_dir: this._workingDir,
      created_at: this._createdAt.getTime(),
    };
  }

  /**
   * Abstract method to terminate the session and clean up resources.
   */
  abstract terminate(): Promise<void>;
}

/**
 * Session information for protocol messages.
 */
export interface SessionInfo {
  session_id: string;
  session_type: SessionType;
  status: SessionStatus;
  workspace?: string;
  project?: string;
  worktree?: string;
  working_dir: string;
  created_at: number;
  /** Agent name (alias) if different from session_type (e.g., 'zai' for a claude alias) */
  agent_name?: string;
}

