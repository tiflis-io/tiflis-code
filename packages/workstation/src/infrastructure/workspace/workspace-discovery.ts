/**
 * @file workspace-discovery.ts
 * @copyright 2025 Roman Barinov <rbarinov@gmail.com>
 * @license MIT
 */

import { readdir, stat, access } from 'fs/promises';
import { join } from 'path';
import { execSync } from 'child_process';
import type {
  WorkspaceDiscovery,
  WorkspaceInfo,
  ProjectInfo,
  WorktreeInfo,
} from '../../domain/ports/workspace-discovery.js';

export interface FileSystemWorkspaceDiscoveryConfig {
  workspacesRoot: string;
}

/**
 * File system implementation of workspace discovery.
 */
export class FileSystemWorkspaceDiscovery implements WorkspaceDiscovery {
  private readonly workspacesRoot: string;

  constructor(config: FileSystemWorkspaceDiscoveryConfig) {
    this.workspacesRoot = config.workspacesRoot;
  }

  /**
   * Lists all workspaces in the workspaces root.
   */
  async listWorkspaces(): Promise<WorkspaceInfo[]> {
    const entries = await readdir(this.workspacesRoot, { withFileTypes: true });
    const workspaces: WorkspaceInfo[] = [];

    for (const entry of entries) {
      if (entry.isDirectory() && !entry.name.startsWith('.')) {
        const path = join(this.workspacesRoot, entry.name);
        const projects = await this.countProjects(path);
        workspaces.push({
          name: entry.name,
          path,
          projectCount: projects,
        });
      }
    }

    return workspaces.sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * Lists all projects in a workspace.
   */
  async listProjects(workspace: string): Promise<ProjectInfo[]> {
    const workspacePath = join(this.workspacesRoot, workspace);
    
    if (!(await this.pathExists(workspacePath))) {
      return [];
    }

    const entries = await readdir(workspacePath, { withFileTypes: true });
    const projects: ProjectInfo[] = [];

    for (const entry of entries) {
      if (entry.isDirectory() && !entry.name.startsWith('.')) {
        // Skip worktree directories (they have -- in the name)
        if (entry.name.includes('--')) {
          continue;
        }

        const projectPath = join(workspacePath, entry.name);
        const isGitRepo = await this.isGitRepository(projectPath);
        
        let defaultBranch: string | undefined;
        let worktrees: WorktreeInfo[] = [];

        if (isGitRepo) {
          defaultBranch = this.getDefaultBranch(projectPath);
          worktrees = await this.listWorktrees(workspace, entry.name);
        }

        projects.push({
          name: entry.name,
          path: projectPath,
          isGitRepo,
          defaultBranch,
          worktrees,
        });
      }
    }

    return projects.sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * Gets information about a specific project.
   */
  async getProject(workspace: string, project: string): Promise<ProjectInfo | undefined> {
    const projectPath = join(this.workspacesRoot, workspace, project);
    
    if (!(await this.pathExists(projectPath))) {
      return undefined;
    }

    const isGitRepo = await this.isGitRepository(projectPath);
    let defaultBranch: string | undefined;
    let worktrees: WorktreeInfo[] = [];

    if (isGitRepo) {
      defaultBranch = this.getDefaultBranch(projectPath);
      worktrees = await this.listWorktrees(workspace, project);
    }

    return {
      name: project,
      path: projectPath,
      isGitRepo,
      defaultBranch,
      worktrees,
    };
  }

  /**
   * Lists worktrees for a project.
   */
  async listWorktrees(workspace: string, project: string): Promise<WorktreeInfo[]> {
    const projectPath = join(this.workspacesRoot, workspace, project);
    
    if (!(await this.isGitRepository(projectPath))) {
      return [];
    }

    try {
      const output = execSync('git worktree list --porcelain', {
        cwd: projectPath,
        encoding: 'utf-8',
      });

      const worktrees: WorktreeInfo[] = [];
      const entries = output.trim().split('\n\n');

      for (const entry of entries) {
        const lines = entry.split('\n');
        let path = '';
        let branch = '';

        for (const line of lines) {
          if (line.startsWith('worktree ')) {
            path = line.substring(9);
          } else if (line.startsWith('branch refs/heads/')) {
            branch = line.substring(18);
          }
        }

        if (path && branch) {
          const name = this.getWorktreeName(path, project);
          worktrees.push({
            name,
            path,
            branch,
            isMain: path === projectPath,
          });
        }
      }

      return worktrees;
    } catch {
      return [];
    }
  }

  /**
   * Creates a new worktree for a project.
   */
  createWorktree(
    workspace: string,
    project: string,
    branch: string
  ): Promise<WorktreeInfo> {
    const projectPath = join(this.workspacesRoot, workspace, project);
    const worktreeName = branch.replace(/\//g, '-');
    const worktreePath = join(this.workspacesRoot, workspace, `${project}--${worktreeName}`);

    execSync(`git worktree add "${worktreePath}" "${branch}"`, {
      cwd: projectPath,
      encoding: 'utf-8',
    });

    return Promise.resolve({
      name: worktreeName,
      path: worktreePath,
      branch,
      isMain: false,
    });
  }

  /**
   * Removes a worktree from a project.
   */
  removeWorktree(workspace: string, project: string, worktree: string): Promise<void> {
    const projectPath = join(this.workspacesRoot, workspace, project);
    const worktreePath = join(this.workspacesRoot, workspace, `${project}--${worktree}`);

    execSync(`git worktree remove "${worktreePath}"`, {
      cwd: projectPath,
      encoding: 'utf-8',
    });
    return Promise.resolve();
  }

  /**
   * Resolves the full path to a workspace/project/worktree.
   */
  resolvePath(workspace: string, project?: string, worktree?: string): string {
    if (!project) {
      return join(this.workspacesRoot, workspace);
    }
    if (!worktree) {
      return join(this.workspacesRoot, workspace, project);
    }
    return join(this.workspacesRoot, workspace, `${project}--${worktree}`);
  }

  /**
   * Checks if a path exists and is a directory.
   */
  async pathExists(path: string): Promise<boolean> {
    try {
      await access(path);
      const stats = await stat(path);
      return stats.isDirectory();
    } catch {
      return false;
    }
  }

  /**
   * Counts projects in a workspace directory.
   */
  private async countProjects(workspacePath: string): Promise<number> {
    try {
      const entries = await readdir(workspacePath, { withFileTypes: true });
      return entries.filter(
        (e) => e.isDirectory() && !e.name.startsWith('.') && !e.name.includes('--')
      ).length;
    } catch {
      return 0;
    }
  }

  /**
   * Checks if a directory is a git repository.
   */
  private async isGitRepository(path: string): Promise<boolean> {
    const gitPath = join(path, '.git');
    try {
      await access(gitPath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Gets the default branch of a git repository.
   */
  private getDefaultBranch(projectPath: string): string {
    try {
      const output = execSync('git rev-parse --abbrev-ref HEAD', {
        cwd: projectPath,
        encoding: 'utf-8',
      });
      return output.trim();
    } catch {
      return 'main';
    }
  }

  /**
   * Extracts worktree name from path.
   */
  private getWorktreeName(worktreePath: string, project: string): string {
    const baseName = worktreePath.split('/').pop() ?? '';
    if (baseName === project) {
      return 'main';
    }
    if (baseName.startsWith(`${project}--`)) {
      return baseName.substring(project.length + 2);
    }
    return baseName;
  }
}

