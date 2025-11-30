/**
 * @file supervisor-session.ts
 * @copyright 2025 Roman Barinov <rbarinov@gmail.com>
 * @license MIT
 */

import { Session, type BaseSessionProps } from './session.js';

/**
 * Properties for creating a supervisor session.
 */
export type SupervisorSessionProps = Omit<BaseSessionProps, 'type' | 'workspacePath'>;

/**
 * Entity representing the Supervisor agent session.
 * The Supervisor is a singleton per workstation that manages other sessions
 * and provides project discovery and management capabilities.
 */
export class SupervisorSession extends Session {
  private _contextCleared = false;

  constructor(props: SupervisorSessionProps) {
    super({ ...props, type: 'supervisor' });
  }

  /**
   * Returns whether the context has been cleared.
   */
  get contextCleared(): boolean {
    return this._contextCleared;
  }

  /**
   * Clears the supervisor's conversation context.
   */
  clearContext(): void {
    this._contextCleared = true;
    this.recordActivity();
    // Reset for next potential clear
    this._contextCleared = false;
  }

  /**
   * Terminates the supervisor session.
   * Note: Supervisor is typically not terminated, but this is provided for completeness.
   */
  override terminate(): Promise<void> {
    if (this._status === 'terminated') {
      return Promise.resolve();
    }
    this.markTerminated();
    return Promise.resolve();
  }
}

/**
 * Type guard to check if a session is a supervisor session.
 */
export function isSupervisorSession(session: Session): session is SupervisorSession {
  return session.type === 'supervisor';
}

