/**
 * @file backlog-harness.ts
 * @copyright 2025 Roman Barinov <rbarinov@gmail.com>
 * @license FSL-1.1-NC
 */

import { EventEmitter } from 'events';
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import type {
  Backlog,
  Task,
  TaskStatus,
} from '../../domain/value-objects/backlog.js';
import { recalculateSummary } from '../../domain/value-objects/backlog.js';
import type { AgentSessionManager } from './agent-session-manager.js';
import type { ContentBlock } from '../../domain/value-objects/content-block.js';
import type { Logger } from 'pino';

/**
 * Events emitted by the Harness.
 */
export interface HarnessEvents {
  'task-started': { taskId: number; title: string; externalId?: string };
  'task-completed': {
    taskId: number;
    title: string;
    success: boolean;
    commitHash?: string;
    duration?: number;
  };
  'task-failed': { taskId: number; title: string; error: string };
  'harness-started': { totalTasks: number };
  'harness-paused': undefined;
  'harness-resumed': undefined;
  'harness-completed': {
    completed: number;
    failed: number;
    total: number;
    duration: number;
  };
  'harness-stopped': undefined;
  output: ContentBlock[];
}

/**
 * Autonomous harness that executes tasks from a backlog.
 *
 * The Harness:
 * - Iterates through pending tasks
 * - Spawns Coding Agent sessions for each task
 * - Tracks completion and failures
 * - Broadcasts progress to UI via content blocks
 */
export class BacklogHarness extends EventEmitter {
  private backlog: Backlog;
  private isRunning = false;
  private isPaused = false;
  private workingDir: string;
  private agentSessionManager: AgentSessionManager;
  private logger: Logger;
  private startTime = 0;
  private selectedAgent: string;

  constructor(
    backlog: Backlog,
    workingDir: string,
    selectedAgent: string,
    agentSessionManager: AgentSessionManager,
    logger: Logger
  ) {
    super();
    this.backlog = backlog;
    this.workingDir = workingDir;
    this.selectedAgent = selectedAgent;
    this.agentSessionManager = agentSessionManager;
    this.logger = logger;
  }

  /**
   * Start autonomous execution of tasks.
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      this.logger.warn('Harness already running');
      return;
    }

    this.isRunning = true;
    this.isPaused = false;
    this.startTime = Date.now();

    this.emit('harness-started', {
      totalTasks: this.backlog.tasks.length,
    });

    this.broadcastOutput({
      id: 'harness-start',
      block_type: 'status',
      content: `🚀 Starting Harness. Total tasks: ${this.backlog.tasks.length}`,
    });

    try {
      await this.executeLoop();
    } catch (error: unknown) {
      this.logger.error({ error }, 'Harness error');
      this.broadcastOutput({
        id: 'harness-error',
        block_type: 'error',
        content: `Harness error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      });
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Pause execution (current task finishes, then pauses).
   */
  pause(): void {
    if (!this.isRunning) {
      this.logger.warn('Harness not running');
      return;
    }

    this.isPaused = true;
    this.emit('harness-paused', undefined);
    this.broadcastOutput({
      id: 'harness-pause',
      block_type: 'status',
      content: '⏸️ Harness paused',
    });
  }

  /**
   * Resume paused execution.
   */
  resume(): void {
    if (!this.isRunning || !this.isPaused) {
      this.logger.warn('Cannot resume harness');
      return;
    }

    this.isPaused = false;
    this.emit('harness-resumed', undefined);
    this.broadcastOutput({
      id: 'harness-resume',
      block_type: 'status',
      content: '▶️ Harness resumed',
    });
  }

  /**
   * Stop execution immediately.
   */
  stop(): void {
    this.isRunning = false;
    this.isPaused = false;
    this.emit('harness-stopped', undefined);
    this.broadcastOutput({
      id: 'harness-stop',
      block_type: 'status',
      content: '⏹️ Harness stopped',
    });
  }

  /**
   * Main execution loop.
   */
  private async executeLoop(): Promise<void> {
    let completedCount = 0;
    let failedCount = 0;

    while (this.isRunning) {
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- isRunning can change during await
      while (this.isPaused && this.isRunning) {
        await this.sleep(1000);
      }

      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- isRunning can change during await
      if (!this.isRunning) break;

      // Find next pending task
      const task = this.findNextPendingTask();
      if (!task) {
        // All tasks completed or failed
        break;
      }

      // Check dependencies
      if (!this.canExecuteTask(task)) {
        this.logger.debug(`Task ${task.id} dependencies not ready, skipping`);
        continue;
      }

      try {
        await this.executeTask(task);
        completedCount++;
      } catch (error) {
        this.logger.error({ error, taskId: task.id }, `Task ${task.id} failed`);
        failedCount++;

        this.emit('task-failed', {
          taskId: task.id,
          title: task.title,
          error: error instanceof Error ? error.message : 'Unknown error',
        });

        this.updateTaskStatus(task.id, 'failed', {
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }

      // Save progress
      this.saveBacklog();
    }

    // Emit completion event
    const duration = Date.now() - this.startTime;
    const summary = this.backlog.summary ?? {
      total: this.backlog.tasks.length,
      completed: completedCount,
      failed: failedCount,
      in_progress: 0,
      pending: this.backlog.tasks.filter((t) => t.status === 'pending').length,
    };

    this.emit('harness-completed', {
      completed: summary.completed,
      failed: summary.failed,
      total: summary.total,
      duration,
    });

    this.broadcastOutput({
      id: 'harness-complete',
      block_type: 'status',
      content: `✅ Harness completed. Completed: ${summary.completed}/${summary.total}, Failed: ${summary.failed}`,
    });
  }

  /**
   * Execute a single task.
   */
  private async executeTask(task: Task): Promise<void> {
    const startTime = Date.now();

    this.emit('task-started', {
      taskId: task.id,
      title: task.title,
      externalId: task.external_id,
    });

    this.updateTaskStatus(task.id, 'in_progress', { started_at: new Date().toISOString() });
    this.broadcastOutput({
      id: `task-${task.id}-start`,
      block_type: 'status',
      content: `📌 Task ${task.id}: ${task.title}`,
    });

    // Create a prompt for the coding agent based on task
    const prompt = this.buildTaskPrompt(task);

    // Create a unique session for this specific task iteration
    const taskIndex = this.backlog.tasks.findIndex((t) => t.id === task.id) + 1;
    const totalTasks = this.backlog.tasks.length;
    const taskSessionId = `backlog-${this.backlog.id}-task-${task.id}`;
    const taskAgentName = `Task ${taskIndex}/${totalTasks}: ${task.title}`;

    this.logger.info(
      { sessionId: taskSessionId, agent: this.selectedAgent, taskIndex, totalTasks },
      'Creating new agent session for task iteration'
    );

    const agentType = this.selectedAgent as 'cursor' | 'claude' | 'opencode';
    const newSession = this.agentSessionManager.createSession(
      agentType,
      this.workingDir,
      taskSessionId,
      taskAgentName
    );
    const sessionId = newSession.sessionId;

    this.logger.info(
      { sessionId, agent: this.selectedAgent, taskIndex, taskTitle: task.title },
      'Created new agent session for task'
    );

    await new Promise<void>((resolve, reject) => {
      let isResolved = false;
      // eslint-disable-next-line prefer-const -- reassigned inside setTimeout callback
      let executionTimeoutHandle: NodeJS.Timeout | undefined;

      const onBlocks = (emittedSessionId: string, blocks: ContentBlock[], isComplete: boolean) => {
        // Only process blocks for this specific session
        if (emittedSessionId !== sessionId) {
          return;
        }

        this.broadcastOutput(...blocks);

        if (isResolved) {
          return;
        }

        // Look for commit hash in output - most reliable indicator of completion
        let commitHash: string | undefined;
        let hasCommitDetected = false;

        for (const block of blocks) {
          if (block.block_type === 'text') {
            const content = block.content;

            const commitRegex = /commit\s+([a-f0-9]{7,40})/i;
            const commitMatch = commitRegex.exec(content);
            if (commitMatch) {
              commitHash = commitMatch[1];
              hasCommitDetected = true;
              break;
            }

            const headRegex = /HEAD\s+is\s+now\s+at\s+([a-f0-9]{7,40})/i;
            const headMatch = headRegex.exec(content);
            if (headMatch) {
              commitHash = headMatch[1];
              hasCommitDetected = true;
              break;
            }
          }
        }

        if (hasCommitDetected && commitHash) {
          isResolved = true;
          if (executionTimeoutHandle) clearTimeout(executionTimeoutHandle);
          this.agentSessionManager.removeListener('blocks', onBlocks);

          const duration = Date.now() - startTime;
          this.emit('task-completed', {
            taskId: task.id,
            title: task.title,
            success: true,
            commitHash,
            duration,
          });

          this.updateTaskStatus(task.id, 'completed', {
            completed_at: new Date().toISOString(),
            commit_hash: commitHash,
          });

          this.logger.info(
            { taskId: task.id, title: task.title, commitHash, duration },
            'Task completed with commit'
          );

          resolve();
          return;
        }

        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- isComplete can be false
        if (isComplete && !isResolved) {
          isResolved = true;
          if (executionTimeoutHandle) clearTimeout(executionTimeoutHandle);
          this.agentSessionManager.removeListener('blocks', onBlocks);

          const duration = Date.now() - startTime;
          const errorMsg = 'Task execution completed but no commit was detected. The agent may not have completed the implementation.';

          this.emit('task-completed', {
            taskId: task.id,
            title: task.title,
            success: false,
            duration,
          });

          this.updateTaskStatus(task.id, 'failed', {
            completed_at: new Date().toISOString(),
            error: errorMsg,
          });

          this.logger.warn(
            { taskId: task.id, title: task.title, duration },
            errorMsg
          );

          reject(new Error(errorMsg));
        }
      };

      // Listen for blocks from this session
      this.agentSessionManager.on('blocks', onBlocks);

      // Execute with timeout (30 minutes per task)
      executionTimeoutHandle = setTimeout(() => {
        if (!isResolved) {
          isResolved = true;
          this.agentSessionManager.removeListener('blocks', onBlocks);
          const duration = Date.now() - startTime;

          this.emit('task-completed', {
            taskId: task.id,
            title: task.title,
            success: false,
            duration,
          });

          this.updateTaskStatus(task.id, 'failed', {
            completed_at: new Date().toISOString(),
            error: 'Task execution timeout (30 minutes exceeded)',
          });

          reject(new Error('Task execution timeout'));
        }
      }, 30 * 60 * 1000); // 30 minutes

      this.agentSessionManager
        .executeCommand(sessionId, prompt)
        .catch((error: unknown) => {
          if (!isResolved) {
            isResolved = true;
            // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- executionTimeoutHandle is assigned in setTimeout callback
            if (executionTimeoutHandle) clearTimeout(executionTimeoutHandle);
            this.agentSessionManager.removeListener('blocks', onBlocks);
            reject(error instanceof Error ? error : new Error(String(error)));
          }
        });
    });
  }

  /**
   * Build a prompt for the coding agent based on task.
   */
  private buildTaskPrompt(task: Task): string {
    return `
You are a senior developer. Complete this task:

## Task: ${task.title}

${task.description}

## Acceptance Criteria:
${task.acceptance_criteria.map((c) => `- ${c}`).join('\n')}

## Instructions:
1. Implement the feature/fix according to the acceptance criteria
2. Write/update tests to cover your changes
3. Run all tests and make sure they pass
4. Commit your changes with a descriptive message
5. Ensure code follows project conventions

## IMPORTANT - Completion Signal:
When you have COMPLETED the task and committed your changes:
- Make sure your last action is a git commit
- Output the full commit hash in your final summary
- Write a clear summary confirming what was implemented and that acceptance criteria are met

Do NOT write "Task complete" or similar - just commit your code and include the hash in your output.
    `.trim();
  }

  /**
   * Find next pending task.
   */
  private findNextPendingTask(): Task | undefined {
    return this.backlog.tasks.find((t) => t.status === 'pending');
  }

  /**
   * Check if task dependencies are satisfied.
   */
  private canExecuteTask(task: Task): boolean {
    if (task.dependencies.length === 0) {
      return true;
    }

    return task.dependencies.every((depId) => {
      const depTask = this.backlog.tasks.find((t) => t.id === depId);
      return depTask?.status === 'completed';
    });
  }

  /**
   * Update task status.
   */
  private updateTaskStatus(
    taskId: number,
    status: TaskStatus,
    updates: Partial<Task> = {}
  ): void {
    const task = this.backlog.tasks.find((t) => t.id === taskId);
    if (task) {
      task.status = status;
      Object.assign(task, updates);
      this.backlog = recalculateSummary(this.backlog);
    }
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
      this.logger.error({ error }, 'Failed to save backlog');
    }
  }

  /**
   * Broadcast output blocks to UI.
   */
  private broadcastOutput(...blocks: ContentBlock[]): void {
    this.emit('output', blocks);
  }

  /**
   * Sleep helper.
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Load backlog from file.
   * @param selectedAgent - The agent type to use for harness execution
   */
  static loadFromFile(
    path: string,
    selectedAgent: string,
    agentSessionManager: AgentSessionManager,
    logger: Logger
  ): BacklogHarness {
    const content = readFileSync(path, 'utf-8');
    const backlog = JSON.parse(content) as Backlog;
    const workingDir = path.substring(0, path.lastIndexOf('/'));
    return new BacklogHarness(backlog, workingDir, selectedAgent, agentSessionManager, logger);
  }
}
