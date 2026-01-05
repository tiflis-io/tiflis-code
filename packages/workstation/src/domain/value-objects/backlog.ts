/**
 * @file backlog.ts
 * @copyright 2025 Roman Barinov <rbarinov@gmail.com>
 * @license FSL-1.1-NC
 */

import { z } from 'zod';

/**
 * Task status in the backlog.
 */
export type TaskStatus =
  | 'pending'
  | 'in_progress'
  | 'completed'
  | 'failed'
  | 'skipped';

/**
 * Source type for external task systems.
 */
export type TaskSourceType =
  | 'jira'
  | 'github'
  | 'gitlab'
  | 'linear'
  | 'notion'
  | 'manual';

/**
 * Zod schema for a single task.
 */
export const TaskSchema = z.object({
  id: z.number().describe('Internal task ID (sequential)'),
  external_id: z.string().optional().describe('External system ID (e.g., AUTH-123)'),
  external_url: z.string().optional().describe('Link to external issue'),
  title: z.string().describe('Task title'),
  description: z.string().describe('Detailed description'),
  acceptance_criteria: z.array(z.string()).describe('Acceptance criteria'),
  dependencies: z.array(z.number()).describe('Task IDs this task depends on'),
  priority: z.enum(['low', 'medium', 'high']).describe('Priority level'),
  complexity: z.enum(['simple', 'moderate', 'complex']).describe('Estimated complexity'),
  status: z.enum(['pending', 'in_progress', 'completed', 'failed', 'skipped']).describe('Current status'),
  started_at: z.string().datetime().optional().describe('When task execution started'),
  completed_at: z.string().datetime().optional().describe('When task was completed'),
  error: z.string().optional().describe('Error message if task failed'),
  commit_hash: z.string().optional().describe('Git commit hash if code was written'),
  retry_count: z.number().default(0).describe('Number of times task was retried'),
});

export type Task = z.infer<typeof TaskSchema>;

/**
 * Zod schema for task source configuration.
 */
export const TaskSourceSchema = z.object({
  type: z.enum(['jira', 'github', 'gitlab', 'linear', 'notion', 'manual']).describe('Source system'),
  system: z.string().optional().describe('Human-friendly system name'),
  issue_id: z.string().optional().describe('Single issue/epic ID'),
  sprint_id: z.number().optional().describe('Jira sprint ID'),
  project_key: z.string().optional().describe('Jira project key'),
  repository: z.string().optional().describe('GitHub repo (owner/repo)'),
  labels: z.array(z.string()).optional().describe('GitHub/GitLab labels'),
  url: z.string().optional().describe('URL for custom sources'),
});

export type TaskSource = z.infer<typeof TaskSourceSchema>;

/**
 * Zod schema for entire backlog.json file.
 */
export const BacklogSchema = z.object({
  id: z.string().describe('Unique backlog identifier'),
  project: z.string().describe('Project name'),
  worktree: z.string().describe('Git worktree/branch name'),
  agent: z.enum(['claude', 'cursor', 'opencode']).describe('Agent to use for execution'),
  source: TaskSourceSchema.describe('Where tasks came from'),
  created_at: z.string().datetime().describe('When backlog was created'),
  updated_at: z.string().datetime().optional().describe('Last update time'),
  tasks: z.array(TaskSchema).describe('List of tasks'),
  completed_at: z.string().datetime().optional().describe('When all tasks completed'),
  summary: z
    .object({
      total: z.number(),
      completed: z.number(),
      failed: z.number(),
      in_progress: z.number(),
      pending: z.number(),
    })
    .optional()
    .describe('Task count summary'),
});

export type Backlog = z.infer<typeof BacklogSchema>;

/**
 * Helper to create a new task.
 */
export function createTask(overrides: Partial<Task> = {}): Task {
  return TaskSchema.parse({
    id: Date.now(),
    title: 'Untitled',
    description: '',
    acceptance_criteria: [],
    dependencies: [],
    priority: 'medium',
    complexity: 'moderate',
    status: 'pending',
    ...overrides,
  });
}

/**
 * Helper to create a new backlog.
 */
export function createBacklog(
  id: string,
  project: string,
  worktree: string,
  agent: 'claude' | 'cursor' | 'opencode',
  source: TaskSource,
  tasks: Task[] = []
): Backlog {
  return BacklogSchema.parse({
    id,
    project,
    worktree,
    agent,
    source,
    created_at: new Date().toISOString(),
    tasks,
    summary: {
      total: tasks.length,
      completed: 0,
      failed: 0,
      in_progress: 0,
      pending: tasks.length,
    },
  });
}

/**
 * Recalculate backlog summary.
 */
export function recalculateSummary(backlog: Backlog): Backlog {
  const summary = {
    total: backlog.tasks.length,
    completed: 0,
    failed: 0,
    in_progress: 0,
    pending: 0,
  };

  for (const task of backlog.tasks) {
    if (task.status === 'completed') summary.completed++;
    else if (task.status === 'failed') summary.failed++;
    else if (task.status === 'in_progress') summary.in_progress++;
    else if (task.status === 'pending') summary.pending++;
  }

  return {
    ...backlog,
    summary,
    updated_at: new Date().toISOString(),
  };
}
