/**
 * @file backlog-tools.ts
 * @copyright 2025 Roman Barinov <rbarinov@gmail.com>
 * @license FSL-1.1-NC
 */

import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import type { SessionManager } from '../../../../domain/ports/session-manager.js';
import type { BacklogAgentManager } from '../backlog-agent-manager.js';
import type { AgentSessionManager } from '../../agent-session-manager.js';
import type { WorkspacePath } from '../../../../domain/value-objects/workspace-path.js';
import { BacklogAgentSession } from '../../../../domain/entities/backlog-agent-session.js';
import { SessionId } from '../../../../domain/value-objects/session-id.js';

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
  backlogManagers: Map<string, BacklogAgentManager>
): BacklogToolsRegistry {
  const createBacklogSession = tool(
    async (args: {
      workspace: string;
      project: string;
      worktree: string;
      agent: 'claude' | 'cursor' | 'opencode';
      backlog_id?: string;
    }) => {
      const backlogId = args.backlog_id || `${project}-${Date.now()}`;
      const workspacePath: WorkspacePath = {
        workspace: args.workspace,
        project: args.project,
        worktree: args.worktree,
      };

      // Create agent session first (for later use by harness)
      const agentSessionId = await sessionManager.createSession({
        type: args.agent,
        workspacePath,
      });

      if (!agentSessionId) {
        return `Failed to create agent session for ${args.agent}`;
      }

      // Create backlog session
      const sessionId = new SessionId();
      const session = new BacklogAgentSession({
        id: sessionId,
        type: 'backlog-agent' as any,
        workspacePath,
        workingDir: `/workspaces/${args.workspace}/${args.project}--${args.worktree}`,
        agentName: args.agent,
        backlogId,
      });

      const success = await sessionManager.createSession({
        type: 'backlog-agent' as any,
        workspacePath,
      });

      if (!success) {
        return `Failed to create backlog session`;
      }

      // Create backlog manager
      const manager = BacklogAgentManager.createEmpty(
        session,
        session.workingDir,
        agentSessionManager,
        { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} } as any
      );

      backlogManagers.set(sessionId.value, manager);

      return `✅ Created backlog session "${backlogId}" with ${args.agent} agent in worktree "${args.worktree}". Use this session ID: ${sessionId.value}`;
    },
    {
      name: 'create_backlog_session',
      description: 'Create a new Backlog Agent session for autonomous development',
      schema: z.object({
        workspace: z.string().describe('Workspace name'),
        project: z.string().describe('Project name'),
        worktree: z.string().describe('Git worktree/branch name'),
        agent: z
          .enum(['claude', 'cursor', 'opencode'])
          .describe('AI agent to use for coding'),
        backlog_id: z.string().optional().describe('Custom backlog identifier'),
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
    async (args: { session_id: string }) => {
      const manager = backlogManagers.get(args.session_id);
      if (!manager) {
        return `Backlog session "${args.session_id}" not found`;
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
        session_id: z.string().describe('Backlog session ID'),
      }),
    }
  );

  const addTaskToBacklog = tool(
    async (args: {
      session_id: string;
      title: string;
      description: string;
      criteria?: string;
    }) => {
      const manager = backlogManagers.get(args.session_id);
      if (!manager) {
        return `Backlog session "${args.session_id}" not found`;
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
        session_id: z.string().describe('Backlog session ID'),
        title: z.string().describe('Task title'),
        description: z.string().describe('Task description'),
        criteria: z.string().optional().describe('Acceptance criteria'),
      }),
    }
  );

  const startBacklogHarness = tool(
    async (args: { session_id: string }) => {
      const manager = backlogManagers.get(args.session_id);
      if (!manager) {
        return `Backlog session "${args.session_id}" not found`;
      }

      const blocks = await manager.executeCommand('start');
      return blocks.map((b) => (b.block_type === 'text' ? b.content : '')).join('\n');
    },
    {
      name: 'start_backlog_harness',
      description: 'Start autonomous execution of a backlog',
      schema: z.object({
        session_id: z.string().describe('Backlog session ID'),
      }),
    }
  );

  const stopBacklogHarness = tool(
    async (args: { session_id: string }) => {
      const manager = backlogManagers.get(args.session_id);
      if (!manager) {
        return `Backlog session "${args.session_id}" not found`;
      }

      const blocks = await manager.executeCommand('stop');
      return blocks.map((b) => (b.block_type === 'text' ? b.content : '')).join('\n');
    },
    {
      name: 'stop_backlog_harness',
      description: 'Stop autonomous execution of a backlog',
      schema: z.object({
        session_id: z.string().describe('Backlog session ID'),
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
