/**
 * @file create-session.ts
 * @copyright 2025 Roman Barinov <rbarinov@gmail.com>
 * @license MIT
 */

import type { Logger } from 'pino';
import type { SessionManager } from '../../domain/ports/session-manager.js';
import type { WorkspaceDiscovery } from '../../domain/ports/workspace-discovery.js';
import type { MessageBroadcaster } from '../../domain/ports/message-broadcaster.js';
import { WorkspacePath } from '../../domain/value-objects/workspace-path.js';
import {
  WorkspaceNotFoundError,
  ProjectNotFoundError,
  SessionLimitReachedError,
} from '../../domain/errors/domain-errors.js';
import { SESSION_CONFIG } from '../../config/constants.js';
import type { SessionType } from '../../domain/entities/session.js';
import type { SessionCreatedMessage, ResponseMessage } from '../../protocol/messages.js';

export interface CreateSessionDeps {
  sessionManager: SessionManager;
  workspaceDiscovery: WorkspaceDiscovery;
  messageBroadcaster: MessageBroadcaster;
  workspacesRoot: string;
  logger: Logger;
}

export interface CreateSessionParams {
  requestId: string;
  sessionType: 'cursor' | 'claude' | 'opencode' | 'terminal';
  workspace: string;
  project: string;
  worktree?: string;
}

export interface CreateSessionResult {
  response: ResponseMessage;
  broadcast: SessionCreatedMessage;
}

/**
 * Use case for creating new sessions.
 */
export class CreateSessionUseCase {
  private readonly deps: CreateSessionDeps;
  private readonly logger: Logger;

  constructor(deps: CreateSessionDeps) {
    this.deps = deps;
    this.logger = deps.logger.child({ useCase: 'create-session' });
  }

  /**
   * Creates a new session.
   */
  async execute(params: CreateSessionParams): Promise<CreateSessionResult> {
    const { requestId, sessionType, workspace, project, worktree } = params;

    let workingDir: string;
    let workspacePath: WorkspacePath | null = null;

    // Terminal sessions can be created without workspace/project - use workspaces root
    if (sessionType === 'terminal') {
      // For terminal sessions, if workspace/project are empty or special values, use workspaces root
      if (!workspace || workspace === 'home' || !project || project === 'default') {
        workingDir = this.deps.workspacesRoot;
        // Terminal sessions don't have workspace/project, set to null for broadcast
        workspacePath = null;
      } else {
        // Terminal session with specific workspace/project - validate and use it
        const workspaceExists = await this.deps.workspaceDiscovery.pathExists(
          this.deps.workspaceDiscovery.resolvePath(workspace)
        );
        if (!workspaceExists) {
          throw new WorkspaceNotFoundError(workspace);
        }

        const projectInfo = await this.deps.workspaceDiscovery.getProject(workspace, project);
        if (!projectInfo) {
          throw new ProjectNotFoundError(workspace, project);
        }

        workingDir = this.deps.workspaceDiscovery.resolvePath(workspace, project, worktree);
        const workingDirExists = await this.deps.workspaceDiscovery.pathExists(workingDir);
        if (!workingDirExists) {
          throw new ProjectNotFoundError(workspace, `${project}${worktree ? `--${worktree}` : ''}`);
        }

        workspacePath = new WorkspacePath(workspace, project, worktree);
      }
    } else {
      // Agent sessions require workspace and project
      // Validate workspace exists
      const workspaceExists = await this.deps.workspaceDiscovery.pathExists(
        this.deps.workspaceDiscovery.resolvePath(workspace)
      );
      if (!workspaceExists) {
        throw new WorkspaceNotFoundError(workspace);
      }

      // Validate project exists
      const projectInfo = await this.deps.workspaceDiscovery.getProject(workspace, project);
      if (!projectInfo) {
        throw new ProjectNotFoundError(workspace, project);
      }

      // Resolve working directory
      workingDir = this.deps.workspaceDiscovery.resolvePath(workspace, project, worktree);

      // Validate working directory exists
      const workingDirExists = await this.deps.workspaceDiscovery.pathExists(workingDir);
      if (!workingDirExists) {
        throw new ProjectNotFoundError(workspace, `${project}${worktree ? `--${worktree}` : ''}`);
      }

      // Create workspace path
      workspacePath = new WorkspacePath(workspace, project, worktree);
    }

    // Check session limits
    this.checkSessionLimits(sessionType);

    // Create session
    // For terminal sessions without workspace/project, workspacePath is null
    const session = await this.deps.sessionManager.createSession({
      sessionType,
      workspacePath: workspacePath ?? undefined,
      workingDir,
    });

    this.logger.info(
      {
        sessionId: session.id.value,
        sessionType,
        workspacePath: workspacePath ? workspacePath.fullPath : undefined,
        workspace: workspacePath ? workspace : undefined,
        project: workspacePath ? project : undefined,
        workingDir,
      },
      'Session created'
    );

    // Build response
    const response: ResponseMessage = {
      type: 'response',
      id: requestId,
      payload: {
        session_id: session.id.value,
        session_type: sessionType,
        working_dir: workingDir,
      },
    };

    // Build broadcast message
    const broadcast: SessionCreatedMessage = {
      type: 'session.created',
      session_id: session.id.value,
      payload: {
        session_type: sessionType,
        workspace,
        project,
        worktree,
        working_dir: workingDir,
      },
    };

    return { response, broadcast };
  }

  /**
   * Checks session limits based on type.
   */
  private checkSessionLimits(sessionType: SessionType): void {
    if (sessionType === 'terminal') {
      const count = this.deps.sessionManager.countByType('terminal');
      if (count >= SESSION_CONFIG.MAX_TERMINAL_SESSIONS) {
        throw new SessionLimitReachedError('terminal', SESSION_CONFIG.MAX_TERMINAL_SESSIONS);
      }
    } else if (sessionType !== 'supervisor') {
      const agentCount =
        this.deps.sessionManager.countByType('cursor') +
        this.deps.sessionManager.countByType('claude') +
        this.deps.sessionManager.countByType('opencode');
      if (agentCount >= SESSION_CONFIG.MAX_AGENT_SESSIONS) {
        throw new SessionLimitReachedError('agent', SESSION_CONFIG.MAX_AGENT_SESSIONS);
      }
    }
  }
}

