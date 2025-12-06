/**
 * @file session-tools.ts
 * @copyright 2025 Roman Barinov <rbarinov@gmail.com>
 * @license MIT
 *
 * LangGraph tools for session management.
 */

import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import type { SessionManager } from '../../../../domain/ports/session-manager.js';
import type { AgentSessionManager } from '../../agent-session-manager.js';
import type { WorkspaceDiscovery } from '../../../../domain/ports/workspace-discovery.js';
import type { MessageBroadcaster } from '../../../../domain/ports/message-broadcaster.js';
import type { ChatHistoryService } from '../../../../application/services/chat-history-service.js';
import type { SessionTerminatedMessage } from '../../../../protocol/messages.js';
import { isAgentType } from '../../../../domain/entities/agent-session.js';
import { homedir } from 'os';

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
 * Creates session management tools.
 */
export function createSessionTools(
  sessionManager: SessionManager,
  agentSessionManager: AgentSessionManager,
  workspaceDiscovery: WorkspaceDiscovery,
  getMessageBroadcaster?: () => MessageBroadcaster | null,
  getChatHistoryService?: () => ChatHistoryService | null
) {
  /**
   * Helper to broadcast session termination.
   */
  const broadcastTermination = (sessionId: string) => {
    const broadcaster = getMessageBroadcaster?.();
    if (!broadcaster) return;
    const message: SessionTerminatedMessage = {
      type: 'session.terminated',
      session_id: sessionId,
    };
    broadcaster.broadcastToAll(JSON.stringify(message));
  };
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
   * Creates a new agent session.
   */
  const createAgentSession = tool(
    async ({
      agentType,
      workspace,
      project,
      worktree,
    }: {
      agentType: 'cursor' | 'claude' | 'opencode';
      workspace: string;
      project: string;
      worktree?: string;
    }) => {
      try {
        // Resolve the working directory
        const workingDir = workspaceDiscovery.resolvePath(workspace, project, worktree);
        
        // Check if path exists
        const exists = await workspaceDiscovery.pathExists(workingDir);
        if (!exists) {
          return `Error: Path does not exist: ${workingDir}`;
        }

        const session = await sessionManager.createSession({
          sessionType: agentType,
          workingDir,
        });
        return `Created ${agentType} session: ${session.id.value}\nWorking directory: ${session.workingDir}`;
      } catch (error) {
        return `Error creating session: ${error instanceof Error ? error.message : String(error)}`;
      }
    },
    {
      name: 'create_agent_session',
      description:
        'Creates a new AI agent session (Cursor, Claude Code, or OpenCode) in a specific project.',
      schema: z.object({
        agentType: z
          .enum(['cursor', 'claude', 'opencode'])
          .describe('Type of AI agent to start'),
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
    async ({ workingDir }: { workingDir?: string }) => {
      try {
        const dir = workingDir ?? homedir();
        const session = await sessionManager.createSession({
          sessionType: 'terminal',
          workingDir: dir,
        });
        return `Created terminal session: ${session.id.value}\nWorking directory: ${session.workingDir}`;
      } catch (error) {
        return `Error creating terminal: ${error instanceof Error ? error.message : String(error)}`;
      }
    },
    {
      name: 'create_terminal_session',
      description: 'Creates a new terminal session. Optionally specify a working directory.',
      schema: z.object({
        workingDir: z
          .string()
          .optional()
          .describe('Optional working directory path. Defaults to home directory.'),
      }),
    }
  );

  /**
   * Terminates a session.
   * Checks both in-memory store and database for the session.
   */
  const terminateSession = tool(
    async ({ sessionId }: { sessionId: string }) => {
      try {
        const { SessionId } = await import('../../../../domain/value-objects/session-id.js');
        const id = new SessionId(sessionId);
        const session = sessionManager.getSession(id);

        let terminatedInMemory = false;
        let terminatedInDb = false;

        // Terminate from in-memory if found
        if (session) {
          // Terminate from agent session manager if it's an agent
          if (isAgentType(session.type)) {
            agentSessionManager.terminateSession(sessionId);
          }
          await sessionManager.terminateSession(id);
          terminatedInMemory = true;
        }

        // Also terminate in database (for persisted agent sessions)
        const chatHistoryService = getChatHistoryService?.();
        if (chatHistoryService) {
          terminatedInDb = chatHistoryService.terminateSession(sessionId);
        }

        if (!terminatedInMemory && !terminatedInDb) {
          return `Session "${sessionId}" not found.`;
        }

        broadcastTermination(sessionId);
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
   * Checks both in-memory sessions and persisted agent sessions in database.
   */
  const terminateAllSessions = tool(
    async ({ sessionType }: { sessionType?: 'terminal' | 'cursor' | 'claude' | 'opencode' | 'all' }) => {
      try {
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

        if (inMemoryToTerminate.length === 0 && persistedToTerminate.length === 0) {
          return typeFilter
            ? `No active ${typeFilter} sessions to terminate.`
            : 'No active sessions to terminate.';
        }

        const terminated: string[] = [];
        const errors: string[] = [];

        // Terminate in-memory sessions
        for (const session of inMemoryToTerminate) {
          try {
            // Terminate from agent session manager if it's an agent
            if (isAgentType(session.type)) {
              agentSessionManager.terminateSession(session.id.value);
            }
            await sessionManager.terminateSession(session.id);
            // Also terminate in database
            chatHistoryService?.terminateSession(session.id.value);
            broadcastTermination(session.id.value);
            terminated.push(`${session.type}:${session.id.value}`);
          } catch (error) {
            errors.push(`${session.id.value}: ${error instanceof Error ? error.message : String(error)}`);
          }
        }

        // Terminate persisted-only sessions (not in memory)
        for (const session of persistedToTerminate) {
          try {
            chatHistoryService?.terminateSession(session.sessionId);
            broadcastTermination(session.sessionId);
            terminated.push(`${session.sessionType}:${session.sessionId}`);
          } catch (error) {
            errors.push(`${session.sessionId}: ${error instanceof Error ? error.message : String(error)}`);
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

  return [listSessions, createAgentSession, createTerminalSession, terminateSession, terminateAllSessions, getSessionInfo];
}
