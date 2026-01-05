/**
 * @file backlog-tools.ts
 * @copyright 2025 Roman Barinov <rbarinov@gmail.com>
 * @license FSL-1.1-NC
 */

import { join } from 'path';
import { existsSync } from 'fs';
import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import type { Logger } from 'pino';
import type { SessionManager } from '../../../../domain/ports/session-manager.js';
import type { MessageBroadcaster } from '../../../../domain/ports/message-broadcaster.js';
import { BacklogAgentManager } from '../../backlog-agent-manager.js';
import type { AgentSessionManager } from '../../agent-session-manager.js';
import type { WorkspacePath } from '../../../../domain/value-objects/workspace-path.js';
import { BacklogAgentSession } from '../../../../domain/entities/backlog-agent-session.js';

/**
 * Tool registry for backlog operations.
 */
export interface BacklogToolsRegistry {
  createBacklogSession: ReturnType<typeof tool>;
  listBacklogSessions: ReturnType<typeof tool>;
  getBacklogStatus: ReturnType<typeof tool>;
  addTaskToBacklog: ReturnType<typeof tool>;
  startBacklogHarness: ReturnType<typeof tool>;
  stopBacklogHarness: ReturnType<typeof tool>;
}

/**
 * Create backlog tools for supervisor.
 */
export function createBacklogTools(
  sessionManager: SessionManager,
  agentSessionManager: AgentSessionManager,
  backlogManagers: Map<string, BacklogAgentManager>,
  workspacesRoot?: string,
  getMessageBroadcaster?: () => MessageBroadcaster | null,
  logger?: Logger
): BacklogToolsRegistry {
  const createBacklogSession = tool(
    async (args: {
      workspace: string;
      project: string;
      worktree?: string;
      backlogId?: string;
    }) => {
      const finalBacklogId = args.backlogId || `${args.project}-${Date.now()}`;

      // Construct working directory path using workspacesRoot if available
      const root = workspacesRoot || '/workspaces';
      let workingDir: string;

      if (!args.worktree) {
        // No worktree specified = use project root (main/master branch)
        workingDir = join(root, args.workspace, args.project);
      } else {
        // Worktree specified = use worktree directory pattern
        workingDir = join(root, args.workspace, `${args.project}--${args.worktree}`);
      }

      const workspacePath: WorkspacePath = {
        workspace: args.workspace,
        project: args.project,
        worktree: args.worktree,
      };

      // Validate that the project directory exists before creating backlog session
      if (!existsSync(workingDir)) {
        const details = args.worktree
          ? `The worktree/branch "${args.worktree}" is checked out`
          : `The main/master branch is checked out`;
        return `❌ ERROR: Project path does not exist: ${workingDir}\n\nPlease make sure:\n1. The workspace "${args.workspace}" exists\n2. The project "${args.project}" exists\n3. ${details}\n\nUse list_worktrees to see available branches for the project.`;
      }

      // Backlog uses the default model (same as Supervisor)
      // It doesn't accept a specific agent - uses system defaults
      const defaultAgent = 'backlog';

      // Create backlog session via sessionManager with proper parameters
      const session = await sessionManager.createSession({
        sessionType: 'backlog-agent',
        workspacePath,
        workingDir,
        backlogAgent: defaultAgent,
        backlogId: finalBacklogId,
      });

      if (!session || session.type !== 'backlog-agent') {
        return `Failed to create backlog session`;
      }

      // Create backlog manager
      const backlogSession = session as BacklogAgentSession;
      const backlogLogger = logger || { debug: () => {}, info: () => {}, warn: () => {}, error: () => {}, child: () => ({ debug: () => {}, info: () => {}, warn: () => {}, error: () => {} }) } as any;
      const manager = BacklogAgentManager.createEmpty(
        backlogSession,
        workingDir,
        agentSessionManager,
        backlogLogger
      );

      backlogManagers.set(session.id.value, manager);

      // Broadcast session creation to all clients
      const broadcaster = getMessageBroadcaster?.();
      if (broadcaster) {
        broadcaster.broadcastToAll(JSON.stringify({
          type: 'session.created',
          session_id: session.id.value,
          payload: {
            session_type: 'backlog-agent',
            workspace: args.workspace,
            project: args.project,
            worktree: args.worktree,
            working_dir: workingDir,
          },
        }));
      }

      return `✅ Created backlog session "${finalBacklogId}" at ${workingDir}\nSession ID: ${session.id.value}`;
    },
    {
      name: 'create_backlog_session',
      description: 'Create a new Backlog Agent session for autonomous development (uses system default model)',
      schema: z.object({
        workspace: z.string().describe('Workspace name'),
        project: z.string().describe('Project name'),
        worktree: z.string().optional().describe('Git worktree/branch name. Omit for main/master branch'),
        backlogId: z.string().optional().describe('Custom backlog identifier'),
      }),
    }
  );

  const listBacklogSessions = tool(
    async () => {
      const sessions = Array.from(backlogManagers.entries())
        .map(
          ([sessionId, manager]) =>
            `- ${sessionId}: ${manager.getBacklog().id} (${manager.getSession().agentName})`
        )
        .join('\n');

      if (sessions.length === 0) {
        return 'No active backlog sessions';
      }

      return `Active Backlog Sessions:\n${sessions}`;
    },
    {
      name: 'list_backlog_sessions',
      description: 'List all active Backlog Agent sessions',
      schema: z.object({}),
    }
  );

  const getBacklogStatus = tool(
    async (args: { sessionId: string }) => {
      const manager = backlogManagers.get(args.sessionId);
      if (!manager) {
        return `Backlog session "${args.sessionId}" not found`;
      }

      const backlog = manager.getBacklog();
      const summary = backlog.summary || {
        total: backlog.tasks.length,
        completed: 0,
        failed: 0,
        in_progress: 0,
        pending: backlog.tasks.length,
      };

      const percentage = summary.total > 0 ? (summary.completed / summary.total) * 100 : 0;

      return `
📊 Backlog: ${backlog.id}
Progress: ${summary.completed}/${summary.total} (${percentage.toFixed(0)}%)
- Completed: ${summary.completed}
- In Progress: ${summary.in_progress}
- Pending: ${summary.pending}
- Failed: ${summary.failed}

Agent: ${manager.getSession().agentName}
Worktree: ${backlog.worktree}
      `.trim();
    },
    {
      name: 'get_backlog_status',
      description: 'Get status of a backlog session',
      schema: z.object({
        sessionId: z.string().describe('Backlog session ID'),
      }),
    }
  );

  const addTaskToBacklog = tool(
    async (args: {
      sessionId: string;
      title: string;
      description: string;
      criteria?: string;
    }) => {
      const manager = backlogManagers.get(args.sessionId);
      if (!manager) {
        return `Backlog session "${args.sessionId}" not found`;
      }

      const blocks = await manager.executeCommand(
        `add task: "${args.title}" - ${args.description}${args.criteria ? ` (criteria: ${args.criteria})` : ''}`
      );

      return blocks.map((b) => (b.block_type === 'text' ? b.content : '')).join('\n');
    },
    {
      name: 'add_task_to_backlog',
      description: 'Add a task to a backlog',
      schema: z.object({
        sessionId: z.string().describe('Backlog session ID'),
        title: z.string().describe('Task title'),
        description: z.string().describe('Task description'),
        criteria: z.string().optional().describe('Acceptance criteria'),
      }),
    }
  );

  const startBacklogHarness = tool(
    async (args: { sessionId: string }) => {
      const manager = backlogManagers.get(args.sessionId);
      if (!manager) {
        return `Backlog session "${args.sessionId}" not found`;
      }

      const blocks = await manager.executeCommand('start');
      return blocks.map((b) => (b.block_type === 'text' ? b.content : '')).join('\n');
    },
    {
      name: 'start_backlog_harness',
      description: 'Start autonomous execution of a backlog',
      schema: z.object({
        sessionId: z.string().describe('Backlog session ID'),
      }),
    }
  );

  const stopBacklogHarness = tool(
    async (args: { sessionId: string }) => {
      const manager = backlogManagers.get(args.sessionId);
      if (!manager) {
        return `Backlog session "${args.sessionId}" not found`;
      }

      const blocks = await manager.executeCommand('stop');
      return blocks.map((b) => (b.block_type === 'text' ? b.content : '')).join('\n');
    },
    {
      name: 'stop_backlog_harness',
      description: 'Stop autonomous execution of a backlog',
      schema: z.object({
        sessionId: z.string().describe('Backlog session ID'),
      }),
    }
  );

  return {
    createBacklogSession,
    listBacklogSessions,
    getBacklogStatus,
    addTaskToBacklog,
    startBacklogHarness,
    stopBacklogHarness,
  };
}
