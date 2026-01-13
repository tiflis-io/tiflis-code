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
import { getAvailableAgents } from '../../config/constants.js';

/**
 * Manages a BacklogAgent session including LLM interaction and Harness orchestration.
 */
export class BacklogAgentManager extends EventEmitter {
  private session: BacklogAgentSession;
  private backlog: Backlog;
  private harness: BacklogHarness | null = null;
  private conversationHistory: { role: 'user' | 'assistant'; content: string }[] = [];
  private workingDir: string;
  private agentSessionManager: AgentSessionManager;
  private logger: Logger;
  private llmAgent: BacklogAgent;
  private selectedAgent: string | null = null;
  private agentSelectionInProgress = false;

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
    // Now uses streaming mode from LangGraphAgent base class
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
      workingDir,
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
      } catch (error: unknown) {
        this.logger.error({ error }, 'Failed to load backlog from file');
      }
    }
  }

  /**
   * Process user command using streaming LLM execution.
   *
   * This method now uses the unified streaming mode from LangGraphAgent
   * which emits blocks in real-time to all connected clients.
   *
   * For MVP, the command processor:
   * - Parses user intent (start_harness, add_task, get_status, etc.)
   * - Returns appropriate response through LLM streaming
   * - Handles agent selection if in progress
   */
  async executeCommand(userMessage: string): Promise<ContentBlock[]> {
    this.conversationHistory.push({ role: 'user', content: userMessage });

    // If agent selection is in progress, handle it first
    if (this.agentSelectionInProgress && !this.selectedAgent) {
      const selectionBlocks = this.handleAgentSelection(userMessage);
      const responseText = selectionBlocks.map((b) => b.content).join('\n');
      this.conversationHistory.push({ role: 'assistant', content: responseText });
      this.saveBacklog();
      return selectionBlocks;
    }

    const streamedBlocks: ContentBlock[] = [];

    // Listen to streaming blocks
    const blockHandler = (_deviceId: string, blocks: ContentBlock[], isComplete: boolean, finalOutput?: string) => {
      streamedBlocks.push(...blocks);
      if (isComplete && finalOutput) {
        this.conversationHistory.push({ role: 'assistant', content: finalOutput });
        this.saveBacklog();
      }
    };

    this.llmAgent.on('blocks', blockHandler);

    try {
      // Execute with streaming (blocks are emitted, not returned directly)
      // Using deviceId 'backlog-manager' for internal streaming
      await this.llmAgent.executeWithStream(userMessage, 'backlog-manager');
    } finally {
      this.llmAgent.removeListener('blocks', blockHandler);
    }

    return streamedBlocks;
  }

  /**
   * Get status blocks for current backlog.
   */
  private getStatusBlocks(): ContentBlock[] {
    const summary = this.backlog.summary ?? {
      total: this.backlog.tasks.length,
      completed: 0,
      failed: 0,
      in_progress: 0,
      pending: 0,
    };

    const percentage =
      summary.total > 0 ? Math.round((summary.completed / summary.total) * 100) : 0;

    const worktreeDisplay = this.backlog.worktree ?? 'main';

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

  private startHarnessCommand(): ContentBlock[] {
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

    if (this.agentSelectionInProgress) {
      return [
        {
          id: 'agent-selection-pending',
          block_type: 'status',
          content: '⏳ Waiting for you to select an agent...',
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

    const agents = Array.from(getAvailableAgents().values());

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
  private handleAgentSelection(userMessage: string): ContentBlock[] {
    const availableAgents = getAvailableAgents();

    const agentNames = Array.from(availableAgents.keys());
    const selectedAgent = this.findBestAgentMatch(userMessage, agentNames);

    if (!selectedAgent) {
      const agentList = agentNames
        .map((name) => {
          const config = availableAgents.get(name);
          return `• **${name}**${config?.isAlias ? ' (alias)' : ''}: ${config?.description ?? ''}`;
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

    this.selectedAgent = selectedAgent;
    this.agentSelectionInProgress = false;

    const selectedConfig = availableAgents.get(selectedAgent);
    const confirmation = `✅ Great! I'll use **${selectedAgent}**${selectedConfig?.isAlias ? ' (alias)' : ''} to execute the tasks.

Now starting the harness...`;

    const confirmationBlocks: ContentBlock[] = [
      {
        id: 'agent-selection-confirmed',
        block_type: 'status',
        content: confirmation,
      },
    ];

    const harnessBlocks = this.createAndStartHarness();

    return [...confirmationBlocks, ...harnessBlocks];
  }

  /**
   * Find best agent match from user response using improved fuzzy matching.
   * Handles variations like "claude code", "use cursor", "my zai alias", etc.
   */
  private findBestAgentMatch(userMessage: string, agentNames: string[]): string | null {
    const lowerMessage = userMessage.toLowerCase();

    // First pass: exact match
    for (const agentName of agentNames) {
      if (lowerMessage === agentName.toLowerCase()) {
        return agentName;
      }
    }

    // Second pass: direct substring match (highest priority)
    for (const agentName of agentNames) {
      const lowerAgent = agentName.toLowerCase();
      if (lowerMessage.includes(lowerAgent)) {
        return agentName;
      }
    }

    // Third pass: fuzzy matching with common variations
    // Handle patterns like "claude code", "cursor agent", etc.
    const commonPatterns: Record<string, string[]> = {
      claude: ['claude', 'claude code', 'claudecode', 'claude-code', 'claude agent'],
      cursor: ['cursor', 'cursor agent', 'cursoragent', 'cursor-agent'],
      opencode: ['opencode', 'open code', 'opencode agent', 'open-code'],
    };

    for (const [baseName, patterns] of Object.entries(commonPatterns)) {
      const agentName = agentNames.find(n => n.toLowerCase() === baseName);
      if (agentName) {
        for (const pattern of patterns) {
          if (lowerMessage.includes(pattern.toLowerCase())) {
            return agentName;
          }
        }
      }
    }

    // Fourth pass: Levenshtein-like distance matching for aliases
    // Find closest match if user typed something similar
    let bestMatch: { name: string; score: number } | null = null;
    const threshold = 0.6; // 60% similarity threshold

    for (const agentName of agentNames) {
      const similarity = this.calculateStringSimilarity(lowerMessage, agentName.toLowerCase());
      if (similarity > threshold && (!bestMatch || similarity > bestMatch.score)) {
        bestMatch = { name: agentName, score: similarity };
      }
    }

    return bestMatch ? bestMatch.name : null;
  }

  /**
   * Calculate string similarity score (0-1) using Levenshtein distance.
   */
  private calculateStringSimilarity(str1: string, str2: string): number {
    const maxLen = Math.max(str1.length, str2.length);
    if (maxLen === 0) return 1;

    const distance = this.levenshteinDistance(str1, str2);
    return 1 - distance / maxLen;
  }

  /**
   * Calculate Levenshtein distance between two strings.
   */
  private levenshteinDistance(str1: string, str2: string): number {
    const len1 = str1.length;
    const len2 = str2.length;
    const matrix: number[][] = Array.from(
      { length: len1 + 1 },
      () => Array.from({ length: len2 + 1 }, () => 0)
    );

    for (let i = 0; i <= len1; i++) {
      const row = matrix[i];
      if (row) row[0] = i;
    }
    for (let j = 0; j <= len2; j++) {
      const firstRow = matrix[0];
      if (firstRow) firstRow[j] = j;
    }

    for (let i = 1; i <= len1; i++) {
      for (let j = 1; j <= len2; j++) {
        const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
        const row = matrix[i];
        const prevRow = matrix[i - 1];
        if (row && prevRow) {
          row[j] = Math.min(
            (prevRow[j] ?? 0) + 1,
            (row[j - 1] ?? 0) + 1,
            (prevRow[j - 1] ?? 0) + cost
          );
        }
      }
    }

    return matrix[len1]?.[len2] ?? 0;
  }

  /**
   * Create and start the harness with selected agent.
   */
  private createAndStartHarness(): ContentBlock[] {
    if (!this.selectedAgent) {
      return [
        {
          id: 'no-agent-selected',
          block_type: 'error',
          content: '❌ No agent selected. Please select an agent first.',
        },
      ];
    }

    this.harness = new BacklogHarness(
      this.backlog,
      this.workingDir,
      this.selectedAgent,
      this.agentSessionManager,
      this.logger
    );

    this.harness.on('output', (blocks: ContentBlock[]) => {
      this.emit('output', blocks);
    });

    this.harness.on('harness-completed', () => {
      this.selectedAgent = null;
      this.agentSelectionInProgress = false;
    });

    this.session.setHarnessRunning(true);

    void this.harness.start().catch((error: unknown) => {
      this.logger.error({ error }, 'Harness error');
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

    const worktreeDisplay = this.backlog.worktree ?? 'main';
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
      },
    ];
  }

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
      },
    ];
  }

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
      },
    ];
  }

  /**
   * Add a new task to backlog.
   */
  private addTaskCommand(params: Record<string, string>): ContentBlock[] {
    const priorityValue = params.priority as 'low' | 'medium' | 'high' | undefined;
    const complexityValue = params.complexity as 'simple' | 'moderate' | 'complex' | undefined;
    const newTask = {
      id: Math.max(0, ...this.backlog.tasks.map((t) => t.id)) + 1,
      title: params.title ?? 'Untitled',
      description: params.description ?? '',
      acceptance_criteria: params.criteria ? [params.criteria] : [],
      dependencies: [] as number[],
      priority: priorityValue ?? 'medium',
      complexity: complexityValue ?? 'moderate',
      status: 'pending' as const,
      retry_count: 0,
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
        const emoji = statusEmoji[t.status] ?? '❓';
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

    const summary = this.backlog.summary ?? {
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

  private getAvailableAgentsData(): Promise<{ name: string; description: string; isAlias: boolean }[]> {
    const availableAgents = getAvailableAgents();

    const agents = Array.from(availableAgents.values()).map((config) => ({
      name: config.name,
      description: config.description,
      isAlias: config.isAlias,
    }));

    return Promise.resolve(agents);
  }

  private parseAgentSelectionData(userResponse: string): Promise<{ agentName: string | null; valid: boolean; message: string }> {
    const availableAgents = getAvailableAgents();

    const agentNames = Array.from(availableAgents.keys());
    const selectedAgent = this.findBestAgentMatch(userResponse, agentNames);

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

  private saveBacklog(): void {
    const backlogPath = join(this.workingDir, 'backlog.json');
    try {
      writeFileSync(backlogPath, JSON.stringify(this.backlog, null, 2));
      this.logger.debug({ backlogPath }, 'Saved backlog');
    } catch (error: unknown) {
      this.logger.error({ error }, 'Failed to save backlog');
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
    const agentType = session.agentName as 'claude' | 'cursor' | 'opencode';
    const backlog: Backlog = {
      id: session.backlogId,
      project: workingDir.split('/').pop() ?? 'project',
      worktree: session.workspacePath?.worktree,
      agent: agentType,
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
