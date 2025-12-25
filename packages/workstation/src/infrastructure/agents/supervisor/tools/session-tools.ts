/**
 * @file session-tools.ts
 * @copyright 2025 Roman Barinov <rbarinov@gmail.com>
 * @license FSL-1.1-NC
 *
 * LangGraph tools for session management.
 */

import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import type { SessionManager } from '../../../../domain/ports/session-manager.js';
import type { AgentSessionManager } from '../../agent-session-manager.js';
import type { WorkspaceDiscovery } from '../../../../domain/ports/workspace-discovery.js';
import type { ChatHistoryService } from '../../../../application/services/chat-history-service.js';
import { isAgentType } from '../../../../domain/entities/agent-session.js';
import { getAvailableAgents, getAgentConfig } from '../../../../config/constants.js';

/**
 * Session info for display.
 */
interface SessionInfo {
  id: string;
  type: string;
  status: string;
  workingDir: string;
}

/**
 * Callback for clearing supervisor context.
 */
export type ClearSupervisorContextCallback = () => void;

/**
 * Callback for terminating a session.
 * Returns true if session was found and terminated, false otherwise.
 */
export type TerminateSessionCallback = (sessionId: string) => Promise<boolean>;

/**
 * Creates session management tools.
 */
export function createSessionTools(
  sessionManager: SessionManager,
  agentSessionManager: AgentSessionManager,
  workspaceDiscovery: WorkspaceDiscovery,
  workspacesRoot: string,
  _getMessageBroadcaster?: () => unknown,
  getChatHistoryService?: () => ChatHistoryService | null,
  clearSupervisorContext?: ClearSupervisorContextCallback,
  terminateSessionCallback?: TerminateSessionCallback
) {
  /**
   * Lists all active sessions.
   * Shows both in-memory sessions and persisted agent sessions from database.
   */
  const listSessions = tool(
    () => {
      const chatHistoryService = getChatHistoryService?.();

      // Get in-memory sessions
      const inMemorySessions = sessionManager.getAllSessions();
      const sessionList: SessionInfo[] = inMemorySessions.map((s) => ({
        id: s.id.value,
        type: s.type,
        status: s.status,
        workingDir: s.workingDir,
      }));

      // Get persisted agent sessions not in memory
      const persistedSessions = chatHistoryService?.getActiveAgentSessions() ?? [];
      const inMemoryIds = new Set(inMemorySessions.map(s => s.id.value));
      const persistedOnly = persistedSessions
        .filter(s => !inMemoryIds.has(s.sessionId))
        .map(s => ({
          id: s.sessionId,
          type: s.sessionType,
          status: 'persisted',
          workingDir: s.workingDir,
        }));

      const allSessions = [...sessionList, ...persistedOnly];

      if (allSessions.length === 0) {
        return 'No active sessions.';
      }

      return `Active sessions:\n${allSessions
        .map((s) => `- [${s.type}] ${s.id} (${s.status}) - ${s.workingDir}`)
        .join('\n')}`;
    },
    {
      name: 'list_sessions',
      description:
        'Lists all active sessions (terminals, agents). Use this to see what sessions are running.',
      schema: z.object({}),
    }
  );

  /**
   * Lists available agent types (base agents + configured aliases).
   */
  const listAvailableAgents = tool(
    () => {
      const agents = getAvailableAgents();
      if (agents.size === 0) {
        return 'No agents available.';
      }

      const lines: string[] = ['Available agents:'];
      for (const [name, config] of agents) {
        const aliasInfo = config.isAlias ? ` (alias for ${config.baseType})` : '';
        lines.push(`- ${name}${aliasInfo}: ${config.description}`);
      }
      return lines.join('\n');
    },
    {
      name: 'list_available_agents',
      description:
        'Lists all available AI agent types, including base agents (cursor, claude, opencode) and custom aliases configured via AGENT_ALIAS_* environment variables.',
      schema: z.object({}),
    }
  );

  /**
   * Creates a new agent session.
   * Supports both base agent types and custom aliases.
   */
  const createAgentSession = tool(
    async ({
      agentName,
      workspace,
      project,
      worktree,
    }: {
      agentName: string;
      workspace: string;
      project: string;
      worktree?: string;
    }) => {
      try {
        // Get agent configuration (validates the agent name)
        const agentConfig = getAgentConfig(agentName);
        if (!agentConfig) {
          const available = Array.from(getAvailableAgents().keys()).join(', ');
          return `Error: Unknown agent "${agentName}". Available agents: ${available}`;
        }

        // Normalize worktree: "main" means the project root, not a worktree directory
        // This handles cases where LLM passes worktree: "main" instead of omitting it
        const normalizedWorktree = worktree === 'main' ? undefined : worktree;

        // Resolve the working directory
        const workingDir = workspaceDiscovery.resolvePath(workspace, project, normalizedWorktree);

        // Check if path exists
        const exists = await workspaceDiscovery.pathExists(workingDir);
        if (!exists) {
          return `Error: Path does not exist: ${workingDir}`;
        }

        // Create session using base type but with agent name for alias support
        const session = await sessionManager.createSession({
          sessionType: agentConfig.baseType,
          workingDir,
          agentName: agentName,
        });

        const aliasInfo = agentConfig.isAlias ? ` (alias for ${agentConfig.baseType})` : '';
        return `Created ${agentName}${aliasInfo} session: ${session.id.value}\nWorking directory: ${session.workingDir}`;
      } catch (error) {
        return `Error creating session: ${error instanceof Error ? error.message : String(error)}`;
      }
    },
    {
      name: 'create_agent_session',
      description:
        'Creates a new AI agent session in a specific project. Supports base agents (cursor, claude, opencode) and custom aliases configured via AGENT_ALIAS_* environment variables. Use list_available_agents to see all available options.',
      schema: z.object({
        agentName: z
          .string()
          .describe('Name of the agent to start (e.g., "claude", "cursor", "opencode", or a custom alias like "zai")'),
        workspace: z.string().describe('Name of the workspace'),
        project: z.string().describe('Name of the project'),
        worktree: z.string().optional().describe('Optional worktree name'),
      }),
    }
  );

  /**
   * Creates a new terminal session.
   */
  const createTerminalSession = tool(
    async ({
      workspace,
      project,
      worktree,
    }: {
      workspace?: string;
      project?: string;
      worktree?: string;
    }) => {
      try {
        // Normalize worktree: "main" means the project root, not a worktree directory
        const normalizedWorktree = worktree === 'main' ? undefined : worktree;

        let workingDir: string;

        if (workspace && project) {
          // Both workspace and project specified - resolve full path
          workingDir = workspaceDiscovery.resolvePath(workspace, project, normalizedWorktree);
        } else if (workspace) {
          // Only workspace - open in workspace directory
          workingDir = workspaceDiscovery.resolvePath(workspace);
        } else {
          // No workspace - use workspaces root
          workingDir = workspacesRoot;
        }

        // Verify path exists
        const exists = await workspaceDiscovery.pathExists(workingDir);
        if (!exists) {
          return `Error: Path does not exist: ${workingDir}`;
        }

        const session = await sessionManager.createSession({
          sessionType: 'terminal',
          workingDir,
        });
        return `Created terminal session: ${session.id.value}\nWorking directory: ${session.workingDir}`;
      } catch (error) {
        return `Error creating terminal: ${error instanceof Error ? error.message : String(error)}`;
      }
    },
    {
      name: 'create_terminal_session',
      description: `Creates a new terminal session. All parameters are optional:
- No parameters: opens terminal in workspaces root directory
- workspace only: opens terminal in that workspace directory
- workspace + project: opens terminal in that project directory
- workspace + project + worktree: opens terminal in that worktree directory

Use this tool when user asks to "open terminal", "create terminal", or similar requests.`,
      schema: z.object({
        workspace: z.string().optional().describe('Name of the workspace. Omit to open in workspaces root.'),
        project: z.string().optional().describe('Name of the project within the workspace. Requires workspace.'),
        worktree: z.string().optional().describe('Worktree name. Requires workspace and project.'),
      }),
    }
  );

  /**
   * Terminates a session.
   * Delegates to TerminateSessionUseCase which handles:
   * - In-memory session cleanup
   * - Agent executor cleanup
   * - Database cleanup
   * - Client notification broadcast
   */
  const terminateSession = tool(
    async ({ sessionId }: { sessionId: string }) => {
      try {
        if (!terminateSessionCallback) {
          return 'Error: Terminate session callback not configured.';
        }

        const terminated = await terminateSessionCallback(sessionId);
        if (!terminated) {
          return `Session "${sessionId}" not found.`;
        }

        return `Session "${sessionId}" terminated.`;
      } catch (error) {
        return `Error terminating session: ${error instanceof Error ? error.message : String(error)}`;
      }
    },
    {
      name: 'terminate_session',
      description: 'Terminates an active session by its ID.',
      schema: z.object({
        sessionId: z.string().describe('ID of the session to terminate'),
      }),
    }
  );

  /**
   * Terminates all sessions of a specific type or all sessions.
   * Uses terminateSessionCallback for each session to ensure proper cleanup and broadcast.
   */
  const terminateAllSessions = tool(
    async ({ sessionType }: { sessionType?: 'terminal' | 'cursor' | 'claude' | 'opencode' | 'all' }) => {
      try {
        if (!terminateSessionCallback) {
          return 'Error: Terminate session callback not configured.';
        }

        const typeFilter = sessionType === 'all' || !sessionType ? null : sessionType;
        const chatHistoryService = getChatHistoryService?.();

        // Get in-memory sessions
        const inMemorySessions = sessionManager.getAllSessions();
        const inMemoryToTerminate = typeFilter
          ? inMemorySessions.filter(s => s.type === typeFilter)
          : inMemorySessions;

        // Get persisted agent sessions from database
        const persistedSessions = chatHistoryService?.getActiveAgentSessions() ?? [];
        const inMemoryIds = new Set(inMemorySessions.map(s => s.id.value));
        const persistedToTerminate = persistedSessions
          .filter(s => !inMemoryIds.has(s.sessionId)) // Not already in memory
          .filter(s => !typeFilter || s.sessionType === typeFilter);

        // Collect all session IDs to terminate
        const sessionsToTerminate = [
          ...inMemoryToTerminate.map(s => ({ id: s.id.value, type: s.type })),
          ...persistedToTerminate.map(s => ({ id: s.sessionId, type: s.sessionType })),
        ];

        if (sessionsToTerminate.length === 0) {
          return typeFilter
            ? `No active ${typeFilter} sessions to terminate.`
            : 'No active sessions to terminate.';
        }

        const terminated: string[] = [];
        const errors: string[] = [];

        // Terminate each session using the shared callback
        for (const session of sessionsToTerminate) {
          try {
            const success = await terminateSessionCallback(session.id);
            if (success) {
              terminated.push(`${session.type}:${session.id}`);
            } else {
              errors.push(`${session.id}: Session not found`);
            }
          } catch (error) {
            errors.push(`${session.id}: ${error instanceof Error ? error.message : String(error)}`);
          }
        }

        let result = `Terminated ${terminated.length} session(s)`;
        if (terminated.length > 0) {
          result += `:\n${terminated.map(s => `  - ${s}`).join('\n')}`;
        }
        if (errors.length > 0) {
          result += `\n\nErrors (${errors.length}):\n${errors.map(e => `  - ${e}`).join('\n')}`;
        }

        return result;
      } catch (error) {
        return `Error terminating sessions: ${error instanceof Error ? error.message : String(error)}`;
      }
    },
    {
      name: 'terminate_all_sessions',
      description: 'Terminates all active sessions, or all sessions of a specific type (terminal, cursor, claude, opencode).',
      schema: z.object({
        sessionType: z
          .enum(['terminal', 'cursor', 'claude', 'opencode', 'all'])
          .optional()
          .describe('Type of sessions to terminate. Omit or use "all" to terminate all sessions.'),
      }),
    }
  );

  /**
   * Gets session details.
   */
  const getSessionInfo = tool(
    async ({ sessionId }: { sessionId: string }) => {
      try {
        const { SessionId } = await import('../../../../domain/value-objects/session-id.js');
        const id = new SessionId(sessionId);
        const session = sessionManager.getSession(id);

        if (!session) {
          return `Session "${sessionId}" not found.`;
        }

        let info = `Session: ${session.id.value}\n`;
        info += `Type: ${session.type}\n`;
        info += `Status: ${session.status}\n`;
        info += `Working Directory: ${session.workingDir}\n`;
        info += `Created: ${session.createdAt.toISOString()}`;

        // Add agent-specific info
        if (isAgentType(session.type)) {
          const agentState = agentSessionManager.getSession(sessionId);
          if (agentState) {
            info += `\nExecuting: ${agentState.isExecuting ? 'Yes' : 'No'}`;
            info += `\nMessages: ${agentState.messages.length}`;
          }
        }

        return info;
      } catch (error) {
        return `Error getting session info: ${error instanceof Error ? error.message : String(error)}`;
      }
    },
    {
      name: 'get_session_info',
      description: 'Gets detailed information about a specific session.',
      schema: z.object({
        sessionId: z.string().describe('ID of the session'),
      }),
    }
  );

  /**
   * Lists sessions with worktree information.
   */
  const listSessionsWithWorktrees = tool(
    () => {
      try {
        const sessions = agentSessionManager.listSessionsWithWorktreeInfo();
        
        if (sessions.length === 0) {
          return 'No active sessions.';
        }

        const sessionLines = sessions.map(s => {
          const worktreeInfo = s.worktreeInfo 
            ? s.worktreeInfo.isWorktree 
              ? ` (worktree: ${s.worktreeInfo.workspace}/${s.worktreeInfo.project}--${s.worktreeInfo.branch})`
              : ` (main: ${s.worktreeInfo.workspace}/${s.worktreeInfo.project})`
            : '';
          
          const executing = s.isExecuting ? ' [executing]' : '';
          return `- [${s.agentType}] ${s.sessionId}${executing}${worktreeInfo}\n  Working dir: ${s.workingDir}`;
        });

        return `Active sessions:\n${sessionLines.join('\n')}`;
      } catch (error) {
        return `Error listing sessions: ${error instanceof Error ? error.message : String(error)}`;
      }
    },
    {
      name: 'list_sessions_with_worktrees',
      description: 'Lists all active sessions with worktree information for branch management',
      schema: z.object({}),
    }
  );

  /**
   * Gets session summary for a specific worktree.
   */
  const getWorktreeSessionSummary = tool(
    ({ workspace, project, branch }: {
      workspace: string;
      project: string;
      branch: string;
    }) => {
      try {
        const summary = agentSessionManager.getWorktreeSessionSummary(workspace, project, branch);
        
        if (summary.sessionCount === 0) {
          return `No active sessions in worktree "${workspace}/${project}--${branch}".`;
        }

        const sessionDetails = summary.activeSessions.map(s => 
          `- [${s.agentType}] ${s.sessionId} (${s.isExecuting ? 'executing' : 'idle'})\n  Created: ${new Date(s.createdAt).toISOString()}`
        ).join('\n');

        return `Worktree "${workspace}/${project}--${branch}" has ${summary.sessionCount} active session(s):\n${sessionDetails}\n\nSession types: ${summary.sessionTypes.join(', ')}\nExecuting: ${summary.executingCount}`;
      } catch (error) {
        return `Error getting worktree session summary: ${error instanceof Error ? error.message : String(error)}`;
      }
    },
    {
      name: 'get_worktree_session_summary',
      description: 'Gets detailed session information for a specific worktree',
      schema: z.object({
        workspace: z.string().describe('Workspace name'),
        project: z.string().describe('Project name'),
        branch: z.string().describe('Branch/worktree name'),
      }),
    }
  );

  /**
   * Terminates sessions in a specific worktree.
   */
  const terminateWorktreeSessions = tool(
    ({ workspace, project, branch }: {
      workspace: string;
      project: string;
      branch: string;
    }) => {
      try {
        const terminatedSessions = agentSessionManager.terminateWorktreeSessions(workspace, project, branch);
        
        if (terminatedSessions.length === 0) {
          return `No active sessions to terminate in worktree "${workspace}/${project}--${branch}".`;
        }

        return `Terminated ${terminatedSessions.length} session(s) in worktree "${workspace}/${project}--${branch}":\n${terminatedSessions.map(id => `  - ${id}`).join('\n')}`;
      } catch (error) {
        return `Error terminating worktree sessions: ${error instanceof Error ? error.message : String(error)}`;
      }
    },
    {
      name: 'terminate_worktree_sessions',
      description: 'Terminates all active sessions in a specific worktree',
      schema: z.object({
        workspace: z.string().describe('Workspace name'),
        project: z.string().describe('Project name'),
        branch: z.string().describe('Branch/worktree name'),
      }),
    }
  );

  /**
   * Clears the supervisor agent's conversation context.
   * Delegates to SupervisorAgent.clearContext() which handles:
   * - In-memory history clearing
   * - Persistent history clearing
   * - Client notification broadcast
   */
  const clearContext = tool(
    () => {
      try {
        if (clearSupervisorContext) {
          clearSupervisorContext();
        }
        return 'Supervisor context cleared successfully. Conversation history has been reset.';
      } catch (error) {
        return `Error clearing context: ${error instanceof Error ? error.message : String(error)}`;
      }
    },
    {
      name: 'clear_supervisor_context',
      description:
        'Clears the supervisor agent conversation context and history. Use when user asks to "clear context", "reset conversation", "start fresh", or similar requests.',
      schema: z.object({}),
    }
  );

  return [
    listSessions,
    listAvailableAgents,
    createAgentSession,
    createTerminalSession,
    terminateSession,
    terminateAllSessions,
    getSessionInfo,
    listSessionsWithWorktrees,
    getWorktreeSessionSummary,
    terminateWorktreeSessions,
    clearContext,
  ];
}
