/**
 * @file create-session.ts
 * @copyright 2025 Roman Barinov <rbarinov@gmail.com>
 * @license FSL-1.1-NC
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
import { isAgentSession } from '../../domain/entities/agent-session.js';
import type { SessionCreatedMessage, ResponseMessage } from '../../protocol/messages.js';

export interface CreateSessionDeps {
  sessionManager: SessionManager;
  workspaceDiscovery: WorkspaceDiscovery;
  messageBroadcaster: MessageBroadcaster;
  workspacesRoot: string;
  logger: Logger;
  terminalOutputBufferSize: number;
}

export interface CreateSessionParams {
  requestId: string;
  sessionType: 'cursor' | 'claude' | 'opencode' | 'terminal' | 'backlog-agent';
  agentName?: string; // Custom alias name (e.g., 'zai' for claude with custom config)
  workspace: string;
  project: string;
  worktree?: string;
  // Backlog-specific parameters
  backlogAgent?: 'claude' | 'cursor' | 'opencode'; // Which agent to use for backlog
  backlogId?: string; // Custom backlog identifier
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
    const { requestId, sessionType, agentName, workspace, project, worktree: rawWorktree, backlogAgent, backlogId } = params;

    // Normalize worktree: treat "main" and "master" as undefined (no worktree suffix)
    // This handles cases where LLM incorrectly passes worktree="main"
    let worktree = rawWorktree;
    if (worktree && (worktree.toLowerCase() === 'main' || worktree.toLowerCase() === 'master')) {
      worktree = undefined;
    }

    this.logger.info({ requestId, sessionType, agentName, workspace, project, worktree, backlogAgent, backlogId }, 'CreateSession execute called');

    let workingDir: string;
    let workspacePath: WorkspacePath | null = null;

    // Backlog and Terminal sessions can be created without workspace/project - use workspaces root
    if (sessionType === 'terminal' || sessionType === 'backlog-agent') {
      // Determine what working directory to use based on provided workspace/project
      const hasRealWorkspace = workspace && workspace !== 'home';
      const hasRealProject = project && project !== 'default';

      this.logger.info({ hasRealWorkspace, hasRealProject, workspace, project }, 'Terminal session path logic');

      if (!hasRealWorkspace) {
        // No workspace - use workspaces root (home)
        workingDir = this.deps.workspacesRoot;
        workspacePath = null;
      } else if (!hasRealProject) {
        // Workspace but no project - open terminal in workspace directory
        const workspaceDir = this.deps.workspaceDiscovery.resolvePath(workspace);
        const workspaceExists = await this.deps.workspaceDiscovery.pathExists(workspaceDir);
        if (!workspaceExists) {
          throw new WorkspaceNotFoundError(workspace);
        }
        workingDir = workspaceDir;
        workspacePath = new WorkspacePath(workspace, '', undefined);
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
      agentName,
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
    // Get agent_name from session if it's an alias (differs from base type)
    let broadcastAgentName: string | undefined;
    if (isAgentSession(session)) {
      const agentSession = session;
      // Only include agent_name if it differs from base type (i.e., it's an alias)
      if (agentSession.agentName !== agentSession.type) {
        broadcastAgentName = agentSession.agentName;
      }
    }

    const broadcast: SessionCreatedMessage = {
      type: 'session.created',
      session_id: session.id.value,
      payload: {
        session_type: sessionType,
        agent_name: broadcastAgentName,
        workspace,
        project,
        worktree,
        working_dir: workingDir,
        // Include terminal configuration for terminal sessions
        terminal_config: sessionType === 'terminal' ? {
          buffer_size: this.deps.terminalOutputBufferSize,
        } : undefined,
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
    } else if (sessionType === 'backlog-agent') {
      const count = this.deps.sessionManager.countByType('backlog-agent');
      if (count >= SESSION_CONFIG.MAX_BACKLOG_SESSIONS) {
        throw new SessionLimitReachedError('backlog', SESSION_CONFIG.MAX_BACKLOG_SESSIONS);
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

