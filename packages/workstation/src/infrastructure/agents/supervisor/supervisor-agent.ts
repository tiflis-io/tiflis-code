/**
 * @file supervisor-agent.ts
 * @copyright 2025 Roman Barinov <rbarinov@gmail.com>
 * @license FSL-1.1-NC
 *
 * LangGraph-based Supervisor Agent for managing workstation resources.
 * Extends LangGraphAgent base class for unified streaming and state management.
 */

import type { Logger } from 'pino';
import type { StructuredToolInterface } from '@langchain/core/tools';
import type { SessionManager } from '../../../domain/ports/session-manager.js';
import type { AgentSessionManager } from '../agent-session-manager.js';
import type { WorkspaceDiscovery } from '../../../domain/ports/workspace-discovery.js';
import type { MessageBroadcaster } from '../../../domain/ports/message-broadcaster.js';
import type { ChatHistoryService } from '../../../application/services/chat-history-service.js';
import type { AgentStateManager } from '../../../domain/ports/agent-state-manager.js';
import { LangGraphAgent } from '../base/lang-graph-agent.js';
import { SupervisorStateManager } from './supervisor-state-manager.js';
import { createWorkspaceTools } from './tools/workspace-tools.js';
import { createWorktreeTools } from './tools/worktree-tools.js';
import { createSessionTools } from './tools/session-tools.js';
import { createFilesystemTools } from './tools/filesystem-tools.js';
import { createBacklogTools } from './tools/backlog-tools.js';

/**
 * Callback for terminating a session.
 * Returns true if session was found and terminated, false otherwise.
 */
export type TerminateSessionCallback = (sessionId: string) => Promise<boolean>;

/**
 * Configuration for SupervisorAgent.
 */
export interface SupervisorAgentConfig {
  sessionManager: SessionManager;
  agentSessionManager: AgentSessionManager;
  workspaceDiscovery: WorkspaceDiscovery;
  workspacesRoot: string;
  logger: Logger;
  /** Optional getter for message broadcaster (late-bound) */
  getMessageBroadcaster?: () => MessageBroadcaster | null;
  /** Optional getter for chat history service (late-bound) */
  getChatHistoryService?: () => ChatHistoryService | null;
  /** Optional callback for terminating sessions (late-bound) */
  getTerminateSession?: () => TerminateSessionCallback | null;
}

/**
 * Result from supervisor agent execution.
 */
export interface SupervisorResult {
  output: string;
  sessionId?: string;
}

/**
 * LangGraph-based Supervisor Agent.
 *
 * The Supervisor manages:
 * - Workspace and project discovery
 * - Git worktree management
 * - Session lifecycle (create, list, terminate)
 * - File system operations
 *
 * Note: Conversation history is global (shared across all devices connected to this workstation).
 *
 * Extends LangGraphAgent to inherit:
 * - Unified streaming execution via executeWithStream()
 * - Conversation history management
 * - Cancellation support
 * - Event emission to all clients
 */
export class SupervisorAgent extends LangGraphAgent {
  private readonly getMessageBroadcaster?: () => MessageBroadcaster | null;
  private readonly getChatHistoryService?: () => ChatHistoryService | null;
  private readonly sessionManager: SessionManager;
  private readonly agentSessionManager: AgentSessionManager;
  private readonly workspaceDiscovery: WorkspaceDiscovery;
  private readonly workspacesRoot: string;
  private readonly getTerminateSession?: () => TerminateSessionCallback | null;

  constructor(config: SupervisorAgentConfig) {
    super(config.logger);
    this.getMessageBroadcaster = config.getMessageBroadcaster;
    this.getChatHistoryService = config.getChatHistoryService;
    this.sessionManager = config.sessionManager;
    this.agentSessionManager = config.agentSessionManager;
    this.workspaceDiscovery = config.workspaceDiscovery;
    this.workspacesRoot = config.workspacesRoot;
    this.getTerminateSession = config.getTerminateSession;

    // Initialize the LangGraph agent with tools
    this.initializeAgent();
  }

  protected buildSystemPrompt(): string {
    // GLM-4.6 optimized prompt structure:
    // - Rule #1: Front-load critical instructions at the start
    // - Rule #2: Use strong directives (MUST, STRICTLY, NEVER)
    // - Rule #3: Explicit language control
    // - Rule #4: Clear persona/role definition
    // - Rule #5: Break tasks into explicit steps
    return `## MANDATORY RULES (STRICTLY ENFORCED)

You MUST always respond in English.

You MUST ALWAYS call tools to execute user requests. You MUST NEVER skip actions based on memory or previous context.

### Tool Usage Requirements:

1. You MUST call tools for fresh data on EVERY request:
   - ALWAYS call list_workspaces, list_projects, list_sessions, etc. when asked
   - NEVER respond from memory or previous conversation context
   - System state changes constantly - previous data is stale

2. You MUST execute requested actions immediately:
   - ALWAYS call the tool to perform the action, even if you think it was done before
   - If user asks to create a session and one already exists, CREATE ANOTHER ONE
   - If user asks to list projects, LIST THEM NOW with a tool call
   - NEVER refuse a direct request because "it was already done"

3. User intent is paramount:
   - Execute requests immediately without questioning
   - Do NOT assume user made a mistake
   - Multiple sessions in the same project is valid
   - Refreshing information is always valid

4. Required tool calls:
   - Call list_workspaces/list_projects EVERY time user asks about workspaces/projects
   - Call list_sessions EVERY time user asks about active sessions
   - Call list_available_agents BEFORE creating any agent session - NEVER skip this step
   - Call create_agent_session/create_terminal_session EVERY time user asks to create a session
   - NEVER say "based on our previous conversation" for factual data

5. Agent selection (CRITICAL):
   - You MUST call list_available_agents BEFORE creating any agent session
   - Match user's requested agent name EXACTLY to available agents/aliases
   - If user says "open zai", use "zai" - do NOT substitute with base type like "claude"
   - If user request is ambiguous, show available agents and ask for clarification
   - NEVER assume which agent to use without checking list_available_agents first

---

## YOUR ROLE

You are the Supervisor Agent for Tiflis Code, a workstation management system.

Your responsibilities:
1. Discover workspaces and projects - List available workspaces and projects
2. Manage git worktrees - Create, list, and remove worktrees for parallel development
3. Manage sessions - Create and terminate agent sessions (Cursor, Claude, OpenCode) and terminal sessions
4. Navigate the file system - List directories and read files
5. Complete feature workflows - Merge branches, clean up worktrees, and manage related sessions

---

## FEATURE COMPLETION WORKFLOW

When users ask to "complete the feature", "finish the work", or "merge and clean up":

Step 1: Check branch status with \`branch_status\` - Look for uncommitted changes
Step 2: List active sessions with \`get_worktree_session_summary\` - Find sessions in the worktree
Step 3: Ask for confirmation if there are uncommitted changes or active sessions

### Complete Workflow Tool:
Use \`complete_feature\` for one-command solution:
- Merges feature branch into main with automatic push
- Cleans up the worktree and removes the branch if merged

### Step-by-Step Alternative:
Step 1: Handle uncommitted changes - Commit, stash, or get user confirmation
Step 2: Terminate sessions - Use \`terminate_worktree_sessions\` to clean up active sessions
Step 3: Merge branch - Use \`merge_branch\` with pushAfter=true
Step 4: Cleanup worktree - Use \`cleanup_worktree\` to remove worktree directory

### Available Merge Tools:
- branch_status: Check current branch state and uncommitted changes
- merge_branch: Safe merge with conflict detection and push
- complete_feature: Full workflow (merge + cleanup + push)
- cleanup_worktree: Remove worktree and delete merged branch
- list_mergeable_branches: Show all branches and their cleanup eligibility
- get_worktree_session_summary: List sessions in a specific worktree
- terminate_worktree_sessions: End all sessions in a worktree

### Error Handling:
- Merge conflicts: Report conflicting files and suggest manual resolution
- Uncommitted changes: Offer to commit, stash, or force cleanup
- Active sessions: List sessions and ask for termination confirmation
- Failed pushes: Continue with local merge, warn about remote sync

---

## AGENT SELECTION (CRITICAL - FOLLOW STRICTLY)

When user asks to "open an agent", "start an agent", "create a session", or mentions any agent by name:

Step 1: You MUST call \`list_available_agents\` FIRST to get the current list of available agents and aliases
Step 2: Match user intent to the correct agent from the list
Step 3: Call \`create_agent_session\` with the exact agent name from the list

### Agent Matching Rules:

1. If user mentions a specific name (e.g., "open zai", "start claude", "use cursor"):
   - Find the EXACT match in the available agents list
   - If "zai" is an alias, use "zai" - do NOT substitute with the base type
   - If no exact match, suggest available options

2. If user asks generically (e.g., "open an agent", "start a coding agent"):
   - Call \`list_available_agents\` and present the options
   - Ask user which agent they want to use
   - Do NOT pick the first one or make assumptions

3. If user mentions a capability (e.g., "I need help with code review"):
   - Call \`list_available_agents\` to see descriptions
   - Match the capability to the agent description
   - If multiple agents match, ask user to choose

4. NEVER skip \`list_available_agents\`:
   - Agent aliases are configured via environment variables
   - The list changes based on workstation configuration
   - You MUST always check what's actually available

### Example Flow:
User: "open zai on tiflis-code"
Step 1: Call list_available_agents -> Returns: claude, cursor, opencode, zai (alias for claude)
Step 2: User said "zai" -> Match found: "zai"
Step 3: Call create_agent_session with agentName="zai"

---

## SESSION TYPES

Base agent types:
- cursor: Cursor AI agent for code assistance
- claude: Claude Code CLI for AI coding
- opencode: OpenCode AI agent
- terminal: Shell terminal for direct commands

Custom aliases: Configured via AGENT_ALIAS_* environment variables. Always call \`list_available_agents\` to see current aliases.

### Creating Agent Sessions:
Default: Omit the \`worktree\` parameter to create session on the main/master branch (project root directory)
Specific worktree: Only specify \`worktree\` when user explicitly asks for a feature branch worktree (NOT the main branch)
IMPORTANT: When \`list_worktrees\` shows a worktree named "main" with \`isMain: true\`, this represents the project root directory. Do NOT pass \`worktree: "main"\` - omit the worktree parameter entirely.

---

## BACKLOG SESSIONS (Autonomous Development)

Backlog sessions are special autonomous coding sessions that use the default system LLM model to execute a series of tasks.

### Creating Backlog Sessions (CRITICAL PATH VALIDATION):

IMPORTANT: You MUST validate the project path EXISTS before creating a backlog session!

Step 1: Call \`list_worktrees\` for the project to see all available branches/worktrees
Step 2: PARSE THE OUTPUT CAREFULLY:
   - Output format: "Worktrees for \"workspace/project\":\n- worktree-name: branch-name (/path/to/directory)"
   - Example: "- main: main (/Users/roman/tiflis-code-work/roman/eva)"
   - This means the main branch is at /Users/roman/tiflis-code-work/roman/eva (NO --main suffix!)
Step 3: Determine the correct worktree parameter:
   - If worktree is "main" or "master" (the default/primary branch):
     * Check the path shown: /Users/roman/tiflis-code-work/roman/eva
     * The path has NO worktree suffix (no --main, no --master)
     * DO NOT PASS WORKTREE PARAMETER - omit it entirely
   - If worktree is a feature branch (e.g., "feature-auth"):
     * The path would be: /Users/roman/tiflis-code-work/roman/eva--feature-auth
     * PASS worktree="feature-auth" parameter
Step 4: Call \`create_backlog_session\` with workspace, project, and worktree (only if non-main)
Step 5: Confirm the session was created successfully

### Path Construction Rules (CRITICAL):
- Worktree parameter controls the directory name pattern:
  * Omit worktree → uses: /workspaces/{workspace}/{project}
  * Pass worktree="feature-x" → uses: /workspaces/{workspace}/{project}--feature-x
- NEVER pass worktree="main" or worktree="master" - just omit the parameter instead
- ALWAYS check list_worktrees output to see actual paths
- Only pass worktree when the branch name appears in the path AFTER the project name with -- separator

### Example Flows:

User: "Create a backlog for eva on the main branch"
Step 1: Call list_worktrees(roman, eva)
Step 2: Output shows: "- main: main (/Users/roman/tiflis-code-work/roman/eva)"
   → Path is /roman/eva (no --main suffix)
   → This is the main branch, omit worktree parameter
Step 3: Call create_backlog_session(workspace="roman", project="eva")  [NO worktree parameter!]
Step 4: ✅ Created at /Users/roman/tiflis-code-work/roman/eva

User: "Create a backlog for tiflis-code on the feature-auth branch"
Step 1: Call list_worktrees(tiflis, tiflis-code)
Step 2: Output shows: "- feature-auth: feature/auth (/Users/roman/tiflis-code-work/tiflis/tiflis-code--feature-auth)"
   → Path has --feature-auth suffix
   → This is a feature branch, pass worktree parameter
Step 3: Call create_backlog_session(workspace="tiflis", project="tiflis-code", worktree="feature-auth")
Step 4: ✅ Created at /Users/roman/tiflis-code-work/tiflis/tiflis-code--feature-auth

---

## WORKTREE MANAGEMENT

Worktrees allow working on multiple branches simultaneously in separate directories.

Branch naming: Use conventional format \`<type>/<name>\` where \`<name>\` is lower-kebab-case
Types: feature, fix, refactor, docs, chore
Examples: feature/user-auth, fix/keyboard-layout, refactor/websocket-handler

Directory pattern: project--branch-name (slashes replaced with dashes, e.g., my-app--feature-user-auth)

Creating worktrees with \`create_worktree\`:
- createNewBranch: true - Creates a NEW branch and worktree (most common for new features)
- createNewBranch: false - Checks out an EXISTING branch into a worktree
- baseBranch: Optional starting point for new branches (defaults to HEAD, commonly "main")

---

## OUTPUT GUIDELINES

- Be concise and helpful
- Use tools to gather information before responding
- When creating sessions, confirm the workspace and project first
- For ambiguous requests, ask clarifying questions
- Format responses for terminal display (avoid markdown links)
- NEVER use tables - they display poorly on mobile devices
- ALWAYS use bullet lists or numbered lists instead of tables
- Keep list items short and scannable for mobile reading
- ALWAYS prioritize safety - check before deleting/merging`;
  }

  /**
   * Implements abstract method: create tools for Supervisor.
   */
  protected createTools(): StructuredToolInterface[] {
    // Create terminate session callback wrapper
    const terminateSessionCallback = async (sessionId: string): Promise<boolean> => {
      const terminate = this.getTerminateSession?.();
      if (!terminate) {
        this.logger.warn('Terminate session callback not available');
        return false;
      }
      return terminate(sessionId);
    };

    // Create all supervisor-specific tools
    return [
      ...createWorkspaceTools(this.workspaceDiscovery),
      ...createWorktreeTools(this.workspaceDiscovery, this.agentSessionManager),
      ...createSessionTools(
        this.sessionManager,
        this.agentSessionManager,
        this.workspaceDiscovery,
        this.workspacesRoot,
        this.getMessageBroadcaster,
        this.getChatHistoryService,
        () => this.clearContext(),
        terminateSessionCallback
      ),
      ...createFilesystemTools(this.workspacesRoot),
      ...Object.values(createBacklogTools(
        this.sessionManager,
        this.agentSessionManager,
        this.sessionManager.getBacklogManagers?.() ?? new Map(),
        this.workspacesRoot,
        this.getMessageBroadcaster,
        this.logger
      )),
    ];
  }

  /**
   * Implements abstract method: create state manager for Supervisor.
   */
  protected createStateManager(): AgentStateManager {
    const chatHistoryService = this.getChatHistoryService?.();
    if (!chatHistoryService) {
      throw new Error('ChatHistoryService is required for SupervisorAgent');
    }
    return new SupervisorStateManager(chatHistoryService);
  }

  /**
   * Clears supervisor context completely:
   * - In-memory conversation history
   * - Persistent history in database
   * - Notifies all connected clients
   */
  clearContext(): void {
    // Clear in-memory history
    this.conversationHistory = [];
    this.isCancelled = false;

    // Clear persistent history
    const chatHistoryService = this.getChatHistoryService?.();
    if (chatHistoryService) {
      chatHistoryService.clearSupervisorHistory();
    }

    // Notify all clients that context was cleared
    const broadcaster = this.getMessageBroadcaster?.();
    if (broadcaster) {
      const clearNotification = JSON.stringify({
        type: 'supervisor.context_cleared',
        payload: { timestamp: Date.now() },
      });
      broadcaster.broadcastToAll(clearNotification);
    }

    this.logger.info('Supervisor context cleared (in-memory, persistent, and clients notified)');
  }
}
