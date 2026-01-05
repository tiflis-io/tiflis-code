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
   */
  async executeCommand(userMessage: string): Promise<ContentBlock[]> {
    this.conversationHistory.push({ role: 'user', content: userMessage });

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

    const statusText = `
📊 **Backlog Status**: ${this.backlog.id}

**Progress**: ${summary.completed}/${summary.total} tasks (${percentage}%)

**Breakdown**:
- ✅ Completed: ${summary.completed}
- ⏳ In Progress: ${summary.in_progress}
- ⏸️ Pending: ${summary.pending}
- ❌ Failed: ${summary.failed}

**Agent**: ${this.backlog.agent}
**Worktree**: ${this.backlog.worktree}

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
   */
  private async startHarnessCommand(): Promise<ContentBlock[]> {
    if (this.harness) {
      return [
        {
          id: 'harness-already-running',
          block_type: 'text',
          content: '⚠️ Harness is already running!',
        },
      ];
    }

    // Create harness
    this.harness = new BacklogHarness(
      this.backlog,
      this.workingDir,
      this.agentSessionManager,
      this.logger
    );

    // Forward harness events
    this.harness.on('output', (blocks: ContentBlock[]) => {
      this.emit('output', blocks);
    });

    this.session.setHarnessRunning(true);

    // Start in background
    this.harness.start().catch((error) => {
      this.logger.error('Harness error:', error);
      this.session.setHarnessRunning(false);
    });

    return [
      {
        id: 'harness-started',
        block_type: 'status',
        content: `✅ Harness started for ${this.backlog.worktree}. ${this.backlog.tasks.length} tasks to execute.`,
        metadata: { status: 'harness_started' },
      },
    ];
  }

  /**
   * Stop harness execution.
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

    return [
      {
        id: 'harness-stopped',
        block_type: 'status',
        content: '⏹️ Harness stopped.',
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
   * List all tasks.
   */
  private listTasksBlocks(): ContentBlock[] {
    const tasksList = this.backlog.tasks
      .map(
        (t) =>
          `${t.id}. [${t.status.toUpperCase()}] ${t.title} (${t.priority}, ${t.complexity})`
      )
      .join('\n');

    return [
      {
        id: 'tasks-list',
        block_type: 'text',
        content: `📋 **Tasks in ${this.backlog.id}**:\n\n${tasksList}`,
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
      worktree: session.workspacePath?.worktree || 'feature',
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
