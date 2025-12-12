/**
 * @file workspace-tools.ts
 * @copyright 2025 Roman Barinov <rbarinov@gmail.com>
 * @license FSL-1.1-NC
 *
 * LangGraph tools for workspace and project discovery.
 */

import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import type { WorkspaceDiscovery, WorkspaceInfo, ProjectInfo, WorktreeInfo } from '../../../../domain/ports/workspace-discovery.js';

/**
 * Creates workspace discovery tools.
 */
export function createWorkspaceTools(workspaceDiscovery: WorkspaceDiscovery) {
  /**
   * Lists all available workspaces.
   */
  const listWorkspaces = tool(
    async () => {
      const workspaces = await workspaceDiscovery.listWorkspaces();
      if (workspaces.length === 0) {
        return 'No workspaces found. The workspaces root directory may be empty.';
      }
      return `Available workspaces:\n${workspaces.map((w: WorkspaceInfo) => `- ${w.name} (${w.projectCount} projects)`).join('\n')}`;
    },
    {
      name: 'list_workspaces',
      description:
        'Lists all available workspaces (top-level directories in the workspaces root). Use this to discover what workspaces exist.',
      schema: z.object({}),
    }
  );

  /**
   * Lists projects in a workspace.
   */
  const listProjects = tool(
    async ({ workspace }: { workspace: string }) => {
      try {
        const projects = await workspaceDiscovery.listProjects(workspace);
        if (projects.length === 0) {
          return `No projects found in workspace "${workspace}".`;
        }
        return `Projects in "${workspace}":\n${projects.map((p: ProjectInfo) => `- ${p.name}${p.isGitRepo ? ' (git)' : ''}`).join('\n')}`;
      } catch (error) {
        return `Error listing projects: ${error instanceof Error ? error.message : String(error)}`;
      }
    },
    {
      name: 'list_projects',
      description:
        'Lists all projects in a specific workspace. Projects are git repositories or directories.',
      schema: z.object({
        workspace: z.string().describe('Name of the workspace to list projects from'),
      }),
    }
  );

  /**
   * Gets project info including path and worktrees.
   */
  const getProjectInfo = tool(
    async ({ workspace, project }: { workspace: string; project: string }) => {
      try {
        const projectInfo = await workspaceDiscovery.getProject(workspace, project);
        if (!projectInfo) {
          return `Project "${project}" not found in workspace "${workspace}".`;
        }

        const worktreeInfo =
          projectInfo.worktrees.length > 0
            ? `\nWorktrees:\n${projectInfo.worktrees.map((w: WorktreeInfo) => `  - ${w.name} (${w.branch})`).join('\n')}`
            : '\nNo worktrees.';

        return `Project: ${projectInfo.name}\nPath: ${projectInfo.path}\nGit: ${projectInfo.isGitRepo ? 'Yes' : 'No'}${projectInfo.defaultBranch ? `\nDefault Branch: ${projectInfo.defaultBranch}` : ''}${worktreeInfo}`;
      } catch (error) {
        return `Error getting project info: ${error instanceof Error ? error.message : String(error)}`;
      }
    },
    {
      name: 'get_project_info',
      description:
        'Gets detailed information about a project including its path and any git worktrees.',
      schema: z.object({
        workspace: z.string().describe('Name of the workspace'),
        project: z.string().describe('Name of the project'),
      }),
    }
  );

  /**
   * Creates a new workspace.
   */
  const createWorkspace = tool(
    async ({ name }: { name: string }) => {
      try {
        const workspace = await workspaceDiscovery.createWorkspace(name);
        return `Created workspace "${workspace.name}" at ${workspace.path}`;
      } catch (error) {
        return `Error creating workspace: ${error instanceof Error ? error.message : String(error)}`;
      }
    },
    {
      name: 'create_workspace',
      description:
        'Creates a new workspace directory. The name must be in lower-kebab-case (e.g., "my-company", "personal-projects").',
      schema: z.object({
        name: z
          .string()
          .regex(
            /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/,
            'Name must be in lower-kebab-case (e.g., "my-workspace")'
          )
          .describe('Name for the new workspace in lower-kebab-case'),
      }),
    }
  );

  /**
   * Creates a new project in a workspace.
   */
  const createProject = tool(
    async ({
      workspace,
      name,
      init_git = true,
    }: {
      workspace: string;
      name: string;
      init_git?: boolean;
    }) => {
      try {
        const project = await workspaceDiscovery.createProject(workspace, name, init_git);
        const gitInfo = project.isGitRepo ? ' (git initialized)' : '';
        return `Created project "${project.name}" in workspace "${workspace}"${gitInfo}\nPath: ${project.path}`;
      } catch (error) {
        return `Error creating project: ${error instanceof Error ? error.message : String(error)}`;
      }
    },
    {
      name: 'create_project',
      description:
        'Creates a new project directory within a workspace. The name must be in lower-kebab-case. By default, initializes a git repository.',
      schema: z.object({
        workspace: z.string().describe('Name of the workspace to create the project in'),
        name: z
          .string()
          .regex(
            /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/,
            'Name must be in lower-kebab-case (e.g., "my-project")'
          )
          .describe('Name for the new project in lower-kebab-case'),
        init_git: z
          .boolean()
          .optional()
          .default(true)
          .describe('Whether to initialize a git repository (default: true)'),
      }),
    }
  );

  return [listWorkspaces, listProjects, getProjectInfo, createWorkspace, createProject];
}

