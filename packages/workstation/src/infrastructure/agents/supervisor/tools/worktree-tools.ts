/**
 * @file worktree-tools.ts
 * @copyright 2025 Roman Barinov <rbarinov@gmail.com>
 * @license FSL-1.1-NC
 *
 * LangGraph tools for git worktree management.
 */

import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import type { WorkspaceDiscovery, WorktreeInfo } from '../../../../domain/ports/workspace-discovery.js';

/**
 * Creates git worktree management tools.
 */
export function createWorktreeTools(workspaceDiscovery: WorkspaceDiscovery) {
  /**
   * Lists worktrees for a project.
   */
  const listWorktrees = tool(
    async ({ workspace, project }: { workspace: string; project: string }) => {
      try {
        const worktrees = await workspaceDiscovery.listWorktrees(workspace, project);
        if (worktrees.length === 0) {
          return `No worktrees found for project "${project}" in workspace "${workspace}".`;
        }
        return `Worktrees for "${workspace}/${project}":\n${worktrees
          .map((w: WorktreeInfo) => `- ${w.name}: ${w.branch} (${w.path})`)
          .join('\n')}`;
      } catch (error) {
        return `Error listing worktrees: ${error instanceof Error ? error.message : String(error)}`;
      }
    },
    {
      name: 'list_worktrees',
      description:
        'Lists all git worktrees for a specific project. Worktrees allow working on multiple branches simultaneously.',
      schema: z.object({
        workspace: z.string().describe('Name of the workspace'),
        project: z.string().describe('Name of the project (git repository)'),
      }),
    }
  );

  /**
   * Creates a new worktree.
   */
  const createWorktree = tool(
    async ({
      workspace,
      project,
      branch,
      createNewBranch,
      baseBranch,
    }: {
      workspace: string;
      project: string;
      branch: string;
      createNewBranch?: boolean;
      baseBranch?: string;
    }) => {
      try {
        const result = await workspaceDiscovery.createWorktree(
          workspace,
          project,
          branch,
          createNewBranch ?? false,
          baseBranch
        );
        const actionDesc = createNewBranch
          ? `Created new branch "${result.branch}"`
          : `Checked out existing branch "${result.branch}"`;
        return `${actionDesc} in worktree "${result.name}" at ${result.path}`;
      } catch (error) {
        return `Error creating worktree: ${error instanceof Error ? error.message : String(error)}`;
      }
    },
    {
      name: 'create_worktree',
      description:
        'Creates a new git worktree for a project. Use this to work on a different branch without switching. Can either checkout an existing branch or create a new branch.',
      schema: z.object({
        workspace: z.string().describe('Name of the workspace'),
        project: z.string().describe('Name of the project (git repository)'),
        branch: z.string().describe('Branch name to use in the worktree'),
        createNewBranch: z.boolean().optional().describe('If true, creates a new branch with the given name. If false or omitted, checks out an existing branch.'),
        baseBranch: z.string().optional().describe('When creating a new branch, specifies the starting point (e.g., "main", "develop"). Defaults to current HEAD if not specified.'),
      }),
    }
  );

  /**
   * Removes a worktree.
   */
  const removeWorktree = tool(
    async ({
      workspace,
      project,
      worktreeName,
    }: {
      workspace: string;
      project: string;
      worktreeName: string;
    }) => {
      try {
        await workspaceDiscovery.removeWorktree(workspace, project, worktreeName);
        return `Successfully removed worktree "${worktreeName}" from project "${project}".`;
      } catch (error) {
        return `Error removing worktree: ${error instanceof Error ? error.message : String(error)}`;
      }
    },
    {
      name: 'remove_worktree',
      description: 'Removes a git worktree from a project. This deletes the worktree directory.',
      schema: z.object({
        workspace: z.string().describe('Name of the workspace'),
        project: z.string().describe('Name of the project'),
        worktreeName: z.string().describe('Name of the worktree to remove'),
      }),
    }
  );

  return [listWorktrees, createWorktree, removeWorktree];
}

