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
  private isRunning: boolean = false;
  private isPaused: boolean = false;
  private workingDir: string;
  private agentSessionManager: AgentSessionManager;
  private logger: Logger;
  private startTime: number = 0;

  constructor(
    backlog: Backlog,
    workingDir: string,
    agentSessionManager: AgentSessionManager,
    logger: Logger
  ) {
    super();
    this.backlog = backlog;
    this.workingDir = workingDir;
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
      metadata: { status: 'running' },
    });

    try {
      await this.executeLoop();
    } catch (error) {
      this.logger.error('Harness error:', error);
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
      metadata: { status: 'paused' },
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
      metadata: { status: 'running' },
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
      metadata: { status: 'stopped' },
    });
  }

  /**
   * Main execution loop.
   */
  private async executeLoop(): Promise<void> {
    let completedCount = 0;
    let failedCount = 0;

    while (this.isRunning) {
      // If paused, wait
      while (this.isPaused && this.isRunning) {
        await this.sleep(1000);
      }

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
        this.logger.error(`Task ${task.id} failed:`, error);
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
    const summary = this.backlog.summary || {
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
      metadata: {
        status: 'completed',
        completed: summary.completed,
        failed: summary.failed,
        total: summary.total,
      },
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
      metadata: { task_id: task.id, status: 'started' },
    });

    // Create a prompt for the coding agent based on task
    const prompt = this.buildTaskPrompt(task);

    // Find or create agent session
    let sessionId: string;
    const existingSessions = this.agentSessionManager.listSessions();
    const agentSession = existingSessions.find(
      (s) => s.agentType === this.backlog.agent && s.workingDir === this.workingDir
    );

    if (agentSession) {
      sessionId = agentSession.sessionId;
    } else {
      throw new Error(
        `No agent session found for ${this.backlog.agent} in ${this.workingDir}`
      );
    }

    // Execute command
    await new Promise<void>((resolve, reject) => {
      const onBlocks = (blocks: ContentBlock[]) => {
        this.broadcastOutput(...blocks);

        // Look for commit hash in output
        const commitBlock = blocks.find(
          (b) => b.block_type === 'text' && b.content.includes('commit ')
        );

        if (commitBlock && commitBlock.block_type === 'text') {
          const match = commitBlock.content.match(/commit\s+([a-f0-9]+)/i);
          if (match) {
            const duration = Date.now() - startTime;
            this.emit('task-completed', {
              taskId: task.id,
              title: task.title,
              success: true,
              commitHash: match[1],
              duration,
            });

            this.updateTaskStatus(task.id, 'completed', {
              completed_at: new Date().toISOString(),
              commit_hash: match[1],
            });

            resolve();
          }
        }
      };

      const onError = (error: Error) => {
        reject(error);
      };

      this.agentSessionManager.once('blocks', onBlocks);
      this.agentSessionManager.once('error', onError);

      // Execute with timeout
      const timeoutHandle = setTimeout(() => {
        this.agentSessionManager.removeListener('blocks', onBlocks);
        this.agentSessionManager.removeListener('error', onError);
        reject(new Error('Task execution timeout'));
      }, 30 * 60 * 1000); // 30 minutes

      this.agentSessionManager
        .executeCommand(sessionId, prompt)
        .catch((error) => {
          clearTimeout(timeoutHandle);
          onError(error as Error);
        })
        .finally(() => {
          clearTimeout(timeoutHandle);
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
1. Implement the feature/fix
2. Write/update tests
3. Make sure all tests pass
4. Commit your changes with a descriptive message
5. Ensure code follows project conventions

When done, write a summary of what was implemented.
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
      return depTask && depTask.status === 'completed';
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
      this.logger.error('Failed to save backlog:', error);
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
   */
  static loadFromFile(
    path: string,
    agentSessionManager: AgentSessionManager,
    logger: Logger
  ): BacklogHarness {
    const content = readFileSync(path, 'utf-8');
    const backlog = JSON.parse(content) as Backlog;
    const workingDir = path.substring(0, path.lastIndexOf('/'));
    return new BacklogHarness(backlog, workingDir, agentSessionManager, logger);
  }
}
