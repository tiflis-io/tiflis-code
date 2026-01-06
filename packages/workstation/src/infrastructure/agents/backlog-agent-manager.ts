/**
 * @file backlog-agent-manager.ts
 * @copyright 2025 Roman Barinov <rbarinov@gmail.com>
 * @license FSL-1.1-NC
 */

import { EventEmitter } from 'events';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import type { Logger } from 'pino';
import type { BacklogAgentSession } from '../../domain/entities/backlog-agent-session.js';
import type { Backlog } from '../../domain/value-objects/backlog.js';
import { BacklogSchema } from '../../domain/value-objects/backlog.js';
import { BacklogHarness } from './backlog-harness.js';
import { BacklogAgent } from './backlog-agent.js';
import type { AgentSessionManager } from './agent-session-manager.js';
import type { ContentBlock } from '../../domain/value-objects/content-block.js';

/**
 * Manages a BacklogAgent session including LLM interaction and Harness orchestration.
 */
export class BacklogAgentManager extends EventEmitter {
  private session: BacklogAgentSession;
  private backlog: Backlog;
  private harness: BacklogHarness | null = null;
  private conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }> = [];
  private workingDir: string;
  private agentSessionManager: AgentSessionManager;
  private logger: Logger;
  private llmAgent: BacklogAgent;
  private selectedAgent: string | null = null;
  private agentSelectionInProgress: boolean = false;

  constructor(
    session: BacklogAgentSession,
    backlog: Backlog,
    workingDir: string,
    agentSessionManager: AgentSessionManager,
    logger: Logger
  ) {
    super();
    this.session = session;
    this.backlog = backlog;
    this.workingDir = workingDir;
    this.agentSessionManager = agentSessionManager;
    this.logger = logger;

    // Initialize LLM-based agent with tools context
    this.llmAgent = new BacklogAgent(
      {
        getStatus: () => this.getStatusBlocks(),
        startHarness: () => this.startHarnessCommand(),
        stopHarness: () => this.stopHarnessCommand(),
        pauseHarness: () => this.pauseHarnessCommand(),
        resumeHarness: () => this.resumeHarnessCommand(),
        listTasks: () => this.listTasksBlocks(),
        addTask: (title: string, description: string) =>
          this.addTaskCommand({ title, description }),
        getAvailableAgents: () => this.getAvailableAgentsData(),
        parseAgentSelection: (userResponse: string) => this.parseAgentSelectionData(userResponse),
      },
      logger
    );
  }

  /**
   * Get session info.
   */
  getSession(): BacklogAgentSession {
    return this.session;
  }

  /**
   * Get current backlog.
   */
  getBacklog(): Backlog {
    return this.backlog;
  }

  /**
   * Update backlog from file.
   */
  updateBacklogFromFile(): void {
    const backlogPath = join(this.workingDir, 'backlog.json');
    if (existsSync(backlogPath)) {
      try {
        const content = readFileSync(backlogPath, 'utf-8');
        this.backlog = BacklogSchema.parse(JSON.parse(content));
        this.logger.debug('Updated backlog from file');
      } catch (error) {
        this.logger.error('Failed to load backlog from file:', error);
      }
    }
  }

  /**
   * Process user command (simulate LLM interaction).
   *
   * For MVP, this is a simple command processor that:
   * - Parses user intent (start_harness, add_task, get_status, etc.)
   * - Returns appropriate response
   * - Handles agent selection if in progress
   */
  async executeCommand(userMessage: string): Promise<ContentBlock[]> {
    this.conversationHistory.push({ role: 'user', content: userMessage });

    // If agent selection is in progress, handle it first
    if (this.agentSelectionInProgress && !this.selectedAgent) {
      const selectionBlocks = await this.handleAgentSelection(userMessage);
      const responseText = selectionBlocks.map((b: any) => b.content).join('\n');
      this.conversationHistory.push({ role: 'assistant', content: responseText });
      this.saveBacklog();
      return selectionBlocks;
    }

    // Use LLM agent to execute command (understands natural language)
    const blocks = await this.llmAgent.executeCommand(userMessage);

    // Record response in history
    const responseText = blocks.map((b: any) => b.content).join('\n');
    this.conversationHistory.push({ role: 'assistant', content: responseText });

    // Save state
    this.saveBacklog();

    return blocks;
  }

  /**
   * Get status blocks for current backlog.
   */
  private getStatusBlocks(): ContentBlock[] {
    const summary = this.backlog.summary || {
      total: this.backlog.tasks.length,
      completed: 0,
      failed: 0,
      in_progress: 0,
      pending: 0,
    };

    const percentage =
      summary.total > 0 ? Math.round((summary.completed / summary.total) * 100) : 0;

    const worktreeDisplay = this.backlog.worktree || 'main';

    const statusText = `
📊 **Backlog Status**: ${this.backlog.id}

**Progress**: ${summary.completed}/${summary.total} tasks (${percentage}%)

**Breakdown**:
- ✅ Completed: ${summary.completed}
- ⏳ In Progress: ${summary.in_progress}
- ⏸️ Pending: ${summary.pending}
- ❌ Failed: ${summary.failed}

**Agent**: ${this.backlog.agent}
**Worktree**: ${worktreeDisplay}

**Harness Status**: ${this.harness ? (this.session.harnessRunning ? '🟢 Running' : '🔴 Stopped') : '❌ Not started'}
    `.trim();

    return [
      {
        id: 'status',
        block_type: 'text',
        content: statusText,
      },
    ];
  }

  /**
   * Start harness execution.
   * If agent not selected yet, ask user first.
   */
  private async startHarnessCommand(): Promise<ContentBlock[]> {
    if (this.harness) {
      return [
        {
          id: 'harness-already-running',
          block_type: 'text',
          content: '⚠️ Harness is already running! Use "stop" to stop it first.',
        },
      ];
    }

    const pendingCount = this.backlog.tasks.filter((t) => t.status === 'pending').length;
    const inProgressCount = this.backlog.tasks.filter((t) => t.status === 'in_progress').length;

    if (pendingCount === 0 && inProgressCount === 0) {
      return [
        {
          id: 'no-tasks-to-run',
          block_type: 'text',
          content: '❌ No pending tasks to execute. Add tasks first using "add task" command.',
        },
      ];
    }

    // If agent not selected yet, ask user first
    if (!this.selectedAgent && !this.agentSelectionInProgress) {
      return this.askForAgentSelection();
    }

    // If selection is in progress, wait for user response
    if (this.agentSelectionInProgress) {
      return [
        {
          id: 'agent-selection-pending',
          block_type: 'status',
          content: '⏳ Waiting for you to select an agent...',
          metadata: { status: 'agent_selection_pending' },
        },
      ];
    }

    // Otherwise, proceed with harness creation
    return this.createAndStartHarness();
  }

  /**
   * Ask user which agent to use for harness execution.
   */
  private askForAgentSelection(): ContentBlock[] {
    this.agentSelectionInProgress = true;

    const agents = this.agentSessionManager.getAvailableAgents ?
      Array.from(this.agentSessionManager.getAvailableAgents().values()) :
      [];

    const agentList = agents
      .map((a) => `• **${a.name}**${a.isAlias ? ' (alias)' : ''}: ${a.description}`)
      .join('\n');

    const question = `
🤖 **Select a coding agent** to execute the harness tasks:

${agentList}

Please respond with the agent name you'd like to use (e.g., "claude", "cursor", or your alias name).
    `.trim();

    return [
      {
        id: 'agent-selection-question',
        block_type: 'text',
        content: question,
      },
    ];
  }

  /**
   * Handle user's agent selection response.
   */
  private async handleAgentSelection(userMessage: string): Promise<ContentBlock[]> {
    // Try to parse the user's response
    const availableAgents = this.agentSessionManager.getAvailableAgents ?
      this.agentSessionManager.getAvailableAgents() :
      new Map();

    const agentNames = Array.from(availableAgents.keys());
    const lowerMessage = userMessage.toLowerCase();

    // Simple fuzzy matching - find agent name in user response
    let selectedAgent: string | null = null;
    for (const agentName of agentNames) {
      if (lowerMessage.includes(agentName.toLowerCase())) {
        selectedAgent = agentName;
        break;
      }
    }

    if (!selectedAgent) {
      // No valid agent found - show available agents again
      const agentList = agentNames
        .map((name) => {
          const config = availableAgents.get(name);
          return `• **${name}**${config?.isAlias ? ' (alias)' : ''}: ${config?.description || ''}`;
        })
        .join('\n');

      return [
        {
          id: 'agent-selection-invalid',
          block_type: 'text',
          content: `❌ I didn't recognize that agent name. Here are the available options:\n\n${agentList}\n\nPlease try again.`,
        },
      ];
    }

    // Agent selected successfully
    this.selectedAgent = selectedAgent;
    this.agentSelectionInProgress = false;

    const selectedConfig = availableAgents.get(selectedAgent);
    const confirmation = `✅ Great! I'll use **${selectedAgent}**${selectedConfig?.isAlias ? ' (alias)' : ''} to execute the tasks.

Now starting the harness...`;

    // Return confirmation and then create/start harness
    const confirmationBlocks: ContentBlock[] = [
      {
        id: 'agent-selection-confirmed',
        block_type: 'status',
        content: confirmation,
        metadata: { status: 'agent_selected' },
      },
    ];

    // Trigger harness creation
    const harnessBlocks = await this.createAndStartHarness();

    return [...confirmationBlocks, ...harnessBlocks];
  }

  /**
   * Create and start the harness with selected agent.
   */
  private async createAndStartHarness(): Promise<ContentBlock[]> {
    if (!this.selectedAgent) {
      return [
        {
          id: 'no-agent-selected',
          block_type: 'error',
          content: '❌ No agent selected. Please select an agent first.',
        },
      ];
    }

    // Create harness with selected agent
    this.harness = new BacklogHarness(
      this.backlog,
      this.workingDir,
      this.selectedAgent,
      this.agentSessionManager,
      this.logger
    );

    // Forward harness events
    this.harness.on('output', (blocks: ContentBlock[]) => {
      this.emit('output', blocks);
    });

    // Reset agent selection when harness completes
    this.harness.on('harness-completed', () => {
      this.selectedAgent = null;
      this.agentSelectionInProgress = false;
    });

    this.session.setHarnessRunning(true);

    // Start in background
    this.harness.start().catch((error) => {
      this.logger.error('Harness error:', error);
      this.session.setHarnessRunning(false);
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      this.emit('output', [
        {
          id: 'harness-error',
          block_type: 'error',
          content: `🔴 Harness error: ${errorMsg}`,
        },
      ]);
    });

    const worktreeDisplay = this.backlog.worktree || 'main';
    const pendingCount = this.backlog.tasks.filter((t) => t.status === 'pending').length;
    const inProgressCount = this.backlog.tasks.filter((t) => t.status === 'in_progress').length;
    const tasksInfo = inProgressCount > 0
      ? `${inProgressCount} task(s) in progress, ${pendingCount} pending`
      : `${pendingCount} task(s) to execute`;

    return [
      {
        id: 'harness-started',
        block_type: 'status',
        content: `🚀 Harness started for ${worktreeDisplay}. ${tasksInfo}.`,
        metadata: { status: 'harness_started' },
      },
      {
        id: 'harness-notice',
        block_type: 'text',
        content: 'The harness will execute tasks sequentially. Use "status" to check progress, "pause" to pause, or "stop" to stop.',
      },
    ];
  }

  /**
   * Stop harness execution and reset agent selection.
   */
  private stopHarnessCommand(): ContentBlock[] {
    if (!this.harness || !this.session.harnessRunning) {
      return [
        {
          id: 'harness-not-running',
          block_type: 'text',
          content: '⚠️ Harness is not running.',
        },
      ];
    }

    this.harness.stop();
    this.session.setHarnessRunning(false);

    // Reset agent selection when harness is stopped
    this.selectedAgent = null;
    this.agentSelectionInProgress = false;

    return [
      {
        id: 'harness-stopped',
        block_type: 'status',
        content: '⏹️ Harness stopped. Agent selection reset.',
        metadata: { status: 'harness_stopped' },
      },
    ];
  }

  /**
   * Pause harness execution.
   */
  private pauseHarnessCommand(): ContentBlock[] {
    if (!this.harness || !this.session.harnessRunning) {
      return [
        {
          id: 'harness-not-running',
          block_type: 'text',
          content: '⚠️ Harness is not running.',
        },
      ];
    }

    this.harness.pause();

    return [
      {
        id: 'harness-paused',
        block_type: 'status',
        content: '⏸️ Harness paused (current task will complete).',
        metadata: { status: 'harness_paused' },
      },
    ];
  }

  /**
   * Resume harness execution.
   */
  private resumeHarnessCommand(): ContentBlock[] {
    if (!this.harness) {
      return [
        {
          id: 'harness-not-running',
          block_type: 'text',
          content: '⚠️ Harness is not running.',
        },
      ];
    }

    this.harness.resume();

    return [
      {
        id: 'harness-resumed',
        block_type: 'status',
        content: '▶️ Harness resumed.',
        metadata: { status: 'harness_resumed' },
      },
    ];
  }

  /**
   * Add a new task to backlog.
   */
  private addTaskCommand(params: Record<string, string>): ContentBlock[] {
    const newTask = {
      id: Math.max(0, ...this.backlog.tasks.map((t) => t.id)) + 1,
      title: params.title || 'Untitled',
      description: params.description || '',
      acceptance_criteria: params.criteria ? [params.criteria] : [],
      dependencies: [],
      priority: (params.priority as any) || 'medium',
      complexity: (params.complexity as any) || 'moderate',
      status: 'pending' as const,
    };

    this.backlog.tasks.push(newTask);

    return [
      {
        id: 'task-added',
        block_type: 'text',
        content: `✅ Task ${newTask.id} added: "${newTask.title}"`,
      },
    ];
  }

  /**
   * Reorder tasks by priority/dependency.
   */
  private reorderTasksCommand(_params: Record<string, string>): ContentBlock[] {
    // Simple reorder: completed first, then in_progress, then by priority
    const priorityOrder = { high: 0, medium: 1, low: 2 };

    this.backlog.tasks.sort((a, b) => {
      if (a.status === 'completed' && b.status !== 'completed') return 1;
      if (a.status !== 'completed' && b.status === 'completed') return -1;
      if (a.status === 'in_progress' && b.status !== 'in_progress') return -1;
      if (a.status !== 'in_progress' && b.status === 'in_progress') return 1;
      return priorityOrder[a.priority as keyof typeof priorityOrder] -
        priorityOrder[b.priority as keyof typeof priorityOrder];
    });

    return [
      {
        id: 'tasks-reordered',
        block_type: 'text',
        content: '✅ Tasks reordered by priority and status.',
      },
    ];
  }

  /**
   * List all tasks with better formatting.
   */
  private listTasksBlocks(): ContentBlock[] {
    const statusEmoji: Record<string, string> = {
      pending: '⬜',
      in_progress: '🟨',
      completed: '✅',
      failed: '❌',
      skipped: '⏭️',
    };

    const tasksList = this.backlog.tasks
      .map((t) => {
        const emoji = statusEmoji[t.status] || '❓';
        const status = t.status.replace('_', ' ').toUpperCase();
        let line = `${emoji} **${t.id}. ${t.title}** [${status}]`;

        if (t.description) {
          line += `\n   ${t.description.split('\n')[0]}`;
        }
        if (t.error) {
          line += `\n   ❌ Error: ${t.error}`;
        }

        return line;
      })
      .join('\n\n');

    const summary = this.backlog.summary || {
      total: this.backlog.tasks.length,
      completed: 0,
      failed: 0,
      in_progress: 0,
      pending: this.backlog.tasks.length,
    };

    const content = `
📋 **Tasks in ${this.backlog.id}**

**Progress**: ${summary.completed}/${summary.total} completed

**Breakdown**:
✅ Completed: ${summary.completed}
🟨 In Progress: ${summary.in_progress}
⬜ Pending: ${summary.pending}
❌ Failed: ${summary.failed}

**Task List**:
${tasksList}
    `.trim();

    return [
      {
        id: 'tasks-list',
        block_type: 'text',
        content,
      },
    ];
  }

  /**
   * Show help.
   */
  private helpBlocks(): ContentBlock[] {
    const help = `
🆘 **Available Commands**:

\`\`\`
- status                    Show backlog progress
- list                      List all tasks
- start                     Start Harness execution
- stop                      Stop Harness
- pause                     Pause Harness
- resume                    Resume Harness
- add [title] [description] Add new task
\`\`\`

**Examples**:
- "What's the status?"
- "Start executing"
- "Show all tasks"
    `.trim();

    return [
      {
        id: 'help',
        block_type: 'text',
        content: help,
      },
    ];
  }

  /**
   * Parse user message to extract command.
   */
  private parseCommand(message: string): { type: string; params: Record<string, string> } {
    const lower = message.toLowerCase();
    const params: Record<string, string> = {};

    if (
      lower.includes('status') ||
      lower.includes('progress') ||
      lower.includes('how many')
    ) {
      return { type: 'get_status', params };
    }

    if (lower.includes('start') || lower.includes('run')) {
      return { type: 'start_harness', params };
    }

    if (lower.includes('stop') || lower.includes('terminate')) {
      return { type: 'stop_harness', params };
    }

    if (lower.includes('pause')) {
      return { type: 'pause_harness', params };
    }

    if (lower.includes('resume') || lower.includes('continue')) {
      return { type: 'resume_harness', params };
    }

    if (lower.includes('list') || lower.includes('show')) {
      return { type: 'list_tasks', params };
    }

    if (lower.includes('add') || lower.includes('create')) {
      // Extract title and description from message
      const parts = message.split(/['"\n]/);
      if (parts.length > 1) {
        params.title = parts[1].trim();
        params.description = parts[2]?.trim() || '';
      }
      return { type: 'add_task', params };
    }

    if (lower.includes('help')) {
      return { type: 'help', params };
    }

    // Treat freeform text as a new task to add
    // This allows natural interaction without requiring "add" keyword
    params.title = message.trim();
    params.description = '';
    return { type: 'add_task', params };
  }

  /**
   * Get available agents data for the tools context.
   */
  private getAvailableAgentsData(): Promise<Array<{ name: string; description: string; isAlias: boolean }>> {
    const availableAgents = this.agentSessionManager.getAvailableAgents ?
      this.agentSessionManager.getAvailableAgents() :
      new Map();

    const agents = Array.from(availableAgents.values()).map((config) => ({
      name: config.name,
      description: config.description,
      isAlias: config.isAlias,
    }));

    return Promise.resolve(agents);
  }

  /**
   * Parse agent selection from user response.
   */
  private parseAgentSelectionData(userResponse: string): Promise<{ agentName: string | null; valid: boolean; message: string }> {
    const availableAgents = this.agentSessionManager.getAvailableAgents ?
      this.agentSessionManager.getAvailableAgents() :
      new Map();

    const agentNames = Array.from(availableAgents.keys());
    const lowerResponse = userResponse.toLowerCase();

    // Find agent name in user response
    let selectedAgent: string | null = null;
    for (const agentName of agentNames) {
      if (lowerResponse.includes(agentName.toLowerCase())) {
        selectedAgent = agentName;
        break;
      }
    }

    if (!selectedAgent) {
      const availableList = agentNames.join(', ');
      return Promise.resolve({
        agentName: null,
        valid: false,
        message: `Invalid agent. Available agents: ${availableList}`,
      });
    }

    return Promise.resolve({
      agentName: selectedAgent,
      valid: true,
      message: `Selected agent: ${selectedAgent}`,
    });
  }

  /**
   * Save backlog to file.
   */
  private saveBacklog(): void {
    const backlogPath = join(this.workingDir, 'backlog.json');
    try {
      writeFileSync(backlogPath, JSON.stringify(this.backlog, null, 2));
      this.logger.debug(`Saved backlog to ${backlogPath}`);
    } catch (error) {
      this.logger.error('Failed to save backlog:', error);
    }
  }

  /**
   * Create a new BacklogAgentManager for manual input.
   */
  static createEmpty(
    session: BacklogAgentSession,
    workingDir: string,
    agentSessionManager: AgentSessionManager,
    logger: Logger
  ): BacklogAgentManager {
    const backlog: Backlog = {
      id: session.backlogId,
      project: workingDir.split('/').pop() || 'project',
      worktree: session.workspacePath?.worktree,
      agent: session.agentName as any,
      source: { type: 'manual' },
      created_at: new Date().toISOString(),
      tasks: [],
      summary: { total: 0, completed: 0, failed: 0, in_progress: 0, pending: 0 },
    };

    return new BacklogAgentManager(session, backlog, workingDir, agentSessionManager, logger);
  }

  /**
   * Creates a manager and attempts to load backlog from file.
   * If backlog.json doesn't exist, starts with empty backlog.
   * Used during session restoration to load persisted backlog state.
   */
  static createAndLoadFromFile(
    session: BacklogAgentSession,
    workingDir: string,
    agentSessionManager: AgentSessionManager,
    logger: Logger
  ): BacklogAgentManager {
    const manager = BacklogAgentManager.createEmpty(session, workingDir, agentSessionManager, logger);
    // Try to load backlog from file
    manager.updateBacklogFromFile();
    return manager;
  }
}
