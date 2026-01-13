/**
 * @file backlog-agent-session.ts
 * @copyright 2025 Roman Barinov <rbarinov@gmail.com>
 * @license FSL-1.1-NC
 */

import type { SessionId } from '../value-objects/session-id.js';
import type { WorkspacePath } from '../value-objects/workspace-path.js';
import { Session, type BaseSessionProps } from './session.js';

/**
 * Properties for creating a backlog agent session.
 */
export interface BacklogAgentSessionProps extends BaseSessionProps {
  agentName: string; // Which agent to use for coding (claude, cursor, opencode)
  backlogId: string; // Identifier for this backlog/direction
}

/**
 * Represents a Backlog Agent session for autonomous development direction.
 *
 * A backlog agent session:
 * - Manages a single autonomous development direction
 * - Maintains a backlog of tasks
 * - Orchestrates a Harness for execution
 * - Communicates with Coding Agents to complete tasks
 */
export class BacklogAgentSession extends Session {
  private readonly _agentName: string;
  private readonly _backlogId: string;
  private _harnessRunning: boolean = false;

  constructor(props: BacklogAgentSessionProps) {
    super({
      ...props,
      type: 'backlog-agent' as any, // Override to backlog-agent
    });
    this._agentName = props.agentName;
    this._backlogId = props.backlogId;
  }

  get agentName(): string {
    return this._agentName;
  }

  get backlogId(): string {
    return this._backlogId;
  }

  get harnessRunning(): boolean {
    return this._harnessRunning;
  }

  setHarnessRunning(running: boolean): void {
    this._harnessRunning = running;
    if (running) {
      this.markBusy();
    } else {
      this.markIdle();
    }
  }

  async terminate(): Promise<void> {
    this._harnessRunning = false;
    this.markTerminated();
    // Cleanup will be handled by BacklogAgentManager
  }

  override toInfo() {
    const info = super.toInfo();
    return {
      ...info,
      agent_name: this._agentName,
      backlog_id: this._backlogId,
      harness_running: this._harnessRunning,
      // backlog_summary will be populated by BacklogAgentManager if needed
    };
  }
}
