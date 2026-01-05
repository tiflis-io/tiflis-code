/**
 * @file backlog-agent-tools.ts
 * @copyright 2025 Roman Barinov <rbarinov@gmail.com>
 * @license FSL-1.1-NC
 *
 * LangGraph tools for backlog agent operations.
 */

import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import type { ContentBlock } from '../../domain/value-objects/content-block.js';

export interface BacklogToolsContext {
  getStatus: () => ContentBlock[];
  startHarness: () => Promise<ContentBlock[]>;
  stopHarness: () => ContentBlock[];
  pauseHarness: () => ContentBlock[];
  resumeHarness: () => ContentBlock[];
  listTasks: () => ContentBlock[];
  addTask: (title: string, description: string) => ContentBlock[];
}

/**
 * Creates tools for the Backlog Agent.
 */
export function createBacklogAgentTools(context: BacklogToolsContext) {
  const getStatus = tool(
    async () => {
      const blocks = context.getStatus();
      return blocks.map((b: any) => b.content).join('\n');
    },
    {
      name: 'get_backlog_status',
      description: 'Get the current status of the backlog including task counts and progress',
      schema: z.object({}),
    }
  );

  const startHarness = tool(
    async () => {
      const blocks = await context.startHarness();
      return blocks.map((b: any) => b.content).join('\n');
    },
    {
      name: 'start_backlog_harness',
      description: 'Start the backlog harness to begin executing tasks',
      schema: z.object({}),
    }
  );

  const stopHarness = tool(
    async () => {
      const blocks = context.stopHarness();
      return blocks.map((b: any) => b.content).join('\n');
    },
    {
      name: 'stop_backlog_harness',
      description: 'Stop the backlog harness execution',
      schema: z.object({}),
    }
  );

  const pauseHarness = tool(
    async () => {
      const blocks = context.pauseHarness();
      return blocks.map((b: any) => b.content).join('\n');
    },
    {
      name: 'pause_backlog_harness',
      description: 'Pause the backlog harness (current task will complete)',
      schema: z.object({}),
    }
  );

  const resumeHarness = tool(
    async () => {
      const blocks = context.resumeHarness();
      return blocks.map((b: any) => b.content).join('\n');
    },
    {
      name: 'resume_backlog_harness',
      description: 'Resume a paused backlog harness',
      schema: z.object({}),
    }
  );

  const listTasks = tool(
    async () => {
      const blocks = context.listTasks();
      return blocks.map((b: any) => b.content).join('\n');
    },
    {
      name: 'list_backlog_tasks',
      description: 'List all tasks in the backlog with their status',
      schema: z.object({}),
    }
  );

  const addTask = tool(
    async ({ title, description }: { title: string; description: string }) => {
      const blocks = context.addTask(title, description);
      return blocks.map((b: any) => b.content).join('\n');
    },
    {
      name: 'add_backlog_task',
      description: 'Add a new task to the backlog',
      schema: z.object({
        title: z.string().describe('Task title'),
        description: z.string().optional().describe('Task description'),
      }),
    }
  );

  return [getStatus, startHarness, stopHarness, pauseHarness, resumeHarness, listTasks, addTask];
}
