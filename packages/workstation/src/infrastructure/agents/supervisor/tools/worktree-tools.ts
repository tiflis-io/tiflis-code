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
export function createWorktreeTools(
  workspaceDiscovery: WorkspaceDiscovery,
  _agentSessionManager?: { terminateSession(sessionId: string): void }
) {

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

  /**
   * Gets branch status including uncommitted changes and commit count.
   */
  const branchStatus = tool(
    async ({ workspace, project }: {
      workspace: string;
      project: string;
    }) => {
      try {
        const status = await (workspaceDiscovery as any).getBranchStatus(workspace, project);
        
        return {
          currentBranch: status.currentBranch,
          uncommittedChanges: status.uncommittedChanges,
          aheadCommits: status.aheadCommits,
          isClean: status.isClean,
          summary: status.isClean 
            ? `Branch "${status.currentBranch}" is clean with ${status.aheadCommits} commits ahead of main`
            : `Branch "${status.currentBranch}" has ${status.uncommittedChanges.length} uncommitted changes:\n${status.uncommittedChanges.map((c: string) => `  ${c}`).join('\n')}`,
        };
      } catch (error) {
        return { error: error instanceof Error ? error.message : String(error) };
      }
    },
    {
      name: 'branch_status',
      description: 'Get current branch status including uncommitted changes and commit count ahead of main',
      schema: z.object({
        workspace: z.string().describe('Workspace name containing the project'),
        project: z.string().describe('Project name to get branch status for'),
      }),
    }
  );

  /**
   * Merges a branch into target with safety checks and optional push.
   */
  const mergeBranch = tool(
    async ({ workspace, project, sourceBranch, targetBranch, pushAfter, skipPreCheck }: {
      workspace: string;
      project: string;
      sourceBranch: string;
      targetBranch?: string;
      pushAfter?: boolean;
      skipPreCheck?: boolean;
    }) => {
      try {
        const result = await workspaceDiscovery.mergeBranch(
          workspace,
          project,
          sourceBranch,
          targetBranch ?? 'main',
          { pushAfter, skipPreCheck }
        );
        
        return result;
      } catch (error) {
        return { 
          success: false, 
          message: `Merge operation failed: ${error instanceof Error ? error.message : String(error)}` 
        } as const;
      }
    },
    {
      name: 'merge_branch',
      description: 'Merge source branch into target branch with safety checks and optional push to remote',
      schema: z.object({
        workspace: z.string().describe('Workspace name'),
        project: z.string().describe('Project name'),
        sourceBranch: z.string().describe('Source branch to merge from'),
        targetBranch: z.string().optional().describe('Target branch (defaults to main)'),
        pushAfter: z.boolean().optional().describe('Push to remote after successful merge'),
        skipPreCheck: z.boolean().optional().describe('Skip pre-merge safety checks (not recommended)'),
      }),
    }
  );

  /**
   * Lists all branches and their merge/cleanup status.
   */
  const listMergeableBranches = tool(
    async ({ workspace, project }: {
      workspace: string;
      project: string;
    }) => {
      try {
        const branches = await workspaceDiscovery.listMergeableBranches(workspace, project);
        
        if (branches.length === 0) {
          return 'No feature branches found.';
        }

        const statusLines = branches.map((b) => {
          const status = [
            `Branch: ${b.branch}`,
            `Path: ${b.path}`,
            `Merged: ${b.isMerged ? '✓' : '✗'}`,
            `Clean: ${b.hasUncommittedChanges ? '✗ (has changes)' : '✓'}`,
            `Cleanup ready: ${b.canCleanup ? '✓' : '✗'}`,
            `Ahead commits: ${b.aheadCommits}`
          ].join(' | ');
          
          return `- ${status}`;
        });

        const summary = `Found ${branches.length} branches. ${branches.filter((b) => b.canCleanup).length} are ready for cleanup.`;

        return `${summary}\n\n${statusLines.join('\n')}`;
      } catch (error) {
        return { error: error instanceof Error ? error.message : String(error) };
      }
    },
    {
      name: 'list_mergeable_branches',
      description: 'List all feature branches and their merge/cleanup status',
      schema: z.object({
        workspace: z.string().describe('Workspace name'),
        project: z.string().describe('Project name'),
      }),
    }
  );

  /**
   * Cleans up worktree and optionally deletes the merged branch.
   */
  const cleanupWorktree = tool(
    async ({ workspace, project, branch, force }: {
      workspace: string;
      project: string;
      branch: string;
      force?: boolean;
    }) => {
      try {
if (!force) {
          // Check for uncommitted changes before cleanup
          const status = await workspaceDiscovery.getBranchStatus(workspace, project);
          if (!status.isClean && status.currentBranch === branch) {
            return {
              success: false,
              message: `Cannot cleanup: uncommitted changes exist in "${branch}". Use force=true to override.`,
              uncommittedChanges: status.uncommittedChanges,
            };
          }
        }
        
        const result = await workspaceDiscovery.cleanupWorktreeAndBranch(
          workspace,
          project,
          branch
        );
        
        return result;
      } catch (error) {
        return {
          success: false,
          message: `Cleanup failed: ${error instanceof Error ? error.message : String(error)}`,
          branchDeleted: false,
        } as const;
      }
    },
    {
      name: 'cleanup_worktree',
      description: 'Remove worktree and optionally delete the branch if merged',
      schema: z.object({
        workspace: z.string().describe('Workspace name'),
        project: z.string().describe('Project name'),
        branch: z.string().describe('Branch/worktree name to cleanup'),
        force: z.boolean().optional().describe('Force cleanup even with uncommitted changes'),
      }),
    }
  );

  /**
   * Complete workflow: merge branch and cleanup worktree.
   */
  const completeFeature = tool(
    async ({ workspace, project, featureBranch, targetBranch, skipConfirmation }: {
      workspace: string;
      project: string;
      featureBranch: string;
      targetBranch?: string;
      skipConfirmation?: boolean;
    }) => {
      try {
        const results: {
          step: string;
          data: Record<string, unknown>;
        }[] = [];

        // Step 1: Check branch status
        const status = await workspaceDiscovery.getBranchStatus(workspace, project);
        results.push({
          step: 'status_check',
          data: {
            currentBranch: status.currentBranch,
            isClean: status.isClean,
            uncommittedChanges: status.uncommittedChanges,
            aheadCommits: status.aheadCommits,
          }
        });

        if (!status.isClean && status.currentBranch === featureBranch && !skipConfirmation) {
          return {
            success: false,
            message: `Cannot complete feature: uncommitted changes exist in "${featureBranch}". Commit or stash changes first.`,
            results,
          };
        }

        // Step 2: Perform merge
        const mergeResult = await workspaceDiscovery.mergeBranch(
          workspace,
          project,
          featureBranch,
          targetBranch ?? 'main',
          { pushAfter: true }
        );
        results.push({
          step: 'merge',
          data: mergeResult,
        });

        if (!mergeResult.success) {
          return {
            success: false,
            message: `Merge failed: ${mergeResult.message}`,
            results,
          };
        }

        // Step 3: Cleanup worktree
        const cleanupResult = await workspaceDiscovery.cleanupWorktreeAndBranch(
          workspace,
          project,
          featureBranch
        );
        results.push({
          step: 'cleanup',
          data: cleanupResult,
        });

        return {
          success: true,
          message: `✅ Feature "${featureBranch}" completed successfully!\n\nSteps executed:\n1. ✅ Branch validated\n2. ✅ Merged into ${targetBranch ?? 'main'} and pushed\n3. ✅ Worktree cleaned up${cleanupResult.branchDeleted ? ' and branch deleted' : ''}`,
          results,
        };

      } catch (error) {
        return {
          success: false,
          message: `Feature completion failed: ${error instanceof Error ? error.message : String(error)}`,
          results: [],
        } as const;
      }
    },
    {
      name: 'complete_feature',
      description: 'Complete workflow: merge feature branch into main and cleanup worktree/branch',
      schema: z.object({
        workspace: z.string().describe('Workspace name'),
        project: z.string().describe('Project name'),
        featureBranch: z.string().describe('Feature branch name to complete'),
        targetBranch: z.string().optional().describe('Target branch (defaults to main)'),
        skipConfirmation: z.boolean().optional().describe('Skip safety checks (not recommended)'),
      }),
    }
  );

  return [
    listWorktrees, 
    createWorktree, 
    removeWorktree,
    branchStatus,
    mergeBranch,
    listMergeableBranches,
    cleanupWorktree,
    completeFeature,
  ];
}

