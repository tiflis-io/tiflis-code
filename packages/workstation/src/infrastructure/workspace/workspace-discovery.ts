/**
 * @file workspace-discovery.ts
 * @copyright 2025 Roman Barinov <rbarinov@gmail.com>
 * @license FSL-1.1-NC
 */

import { readdir, stat, access, mkdir } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";
import { execSync } from "child_process";
import type {
  WorkspaceDiscovery,
  WorkspaceInfo,
  ProjectInfo,
  WorktreeInfo,
} from "../../domain/ports/workspace-discovery.js";

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
      if (entry.isDirectory() && !entry.name.startsWith(".")) {
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
      if (entry.isDirectory() && !entry.name.startsWith(".")) {
        // Skip worktree directories (they have -- in the name)
        if (entry.name.includes("--")) {
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
  async getProject(
    workspace: string,
    project: string
  ): Promise<ProjectInfo | undefined> {
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
  async listWorktrees(
    workspace: string,
    project: string
  ): Promise<WorktreeInfo[]> {
    const projectPath = join(this.workspacesRoot, workspace, project);

    if (!(await this.isGitRepository(projectPath))) {
      return [];
    }

    try {
      const output = execSync("git worktree list --porcelain", {
        cwd: projectPath,
        encoding: "utf-8",
        stdio: ["ignore", "pipe", "ignore"], // Suppress stderr to prevent error logging
      });

      const worktrees: WorktreeInfo[] = [];
      const entries = output.trim().split("\n\n");

      for (const entry of entries) {
        const lines = entry.split("\n");
        let path = "";
        let branch = "";

        for (const line of lines) {
          if (line.startsWith("worktree ")) {
            path = line.substring(9);
          } else if (line.startsWith("branch refs/heads/")) {
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
   * If createNewBranch is true, creates a new branch from baseBranch.
   */
  createWorktree(
    workspace: string,
    project: string,
    branch: string,
    createNewBranch = false,
    baseBranch?: string
  ): Promise<WorktreeInfo> {
    const projectPath = join(this.workspacesRoot, workspace, project);
    const worktreeName = branch.replace(/\//g, "-");
    const worktreePath = join(
      this.workspacesRoot,
      workspace,
      `${project}--${worktreeName}`
    );

    if (createNewBranch) {
      // Create new branch and worktree: git worktree add -b <new-branch> <path> [<start-point>]
      const startPoint = baseBranch ?? "HEAD";
      execSync(
        `git worktree add -b "${branch}" "${worktreePath}" "${startPoint}"`,
        {
          cwd: projectPath,
          encoding: "utf-8",
        }
      );
    } else {
      // Checkout existing branch: git worktree add <path> <branch>
      execSync(`git worktree add "${worktreePath}" "${branch}"`, {
        cwd: projectPath,
        encoding: "utf-8",
      });
    }

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
  removeWorktree(
    workspace: string,
    project: string,
    worktree: string
  ): Promise<void> {
    const projectPath = join(this.workspacesRoot, workspace, project);
    const worktreePath = join(
      this.workspacesRoot,
      workspace,
      `${project}--${worktree}`
    );

    execSync(`git worktree remove "${worktreePath}"`, {
      cwd: projectPath,
      encoding: "utf-8",
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
        (e) =>
          e.isDirectory() && !e.name.startsWith(".") && !e.name.includes("--")
      ).length;
    } catch {
      return 0;
    }
  }

  /**
   * Checks if a directory is a git repository.
   */
  private async isGitRepository(path: string): Promise<boolean> {
    const gitPath = join(path, ".git");
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
      // Check if .git directory exists first to avoid git errors
      const gitDir = join(projectPath, ".git");
      if (!existsSync(gitDir)) {
        return "main";
      }

      const output = execSync("git rev-parse --abbrev-ref HEAD", {
        cwd: projectPath,
        encoding: "utf-8",
        stdio: ["ignore", "pipe", "ignore"], // Suppress stderr to prevent error logging
      });
      return output.trim();
    } catch {
      // Silently return default branch if git command fails
      return "main";
    }
  }

  /**
   * Extracts worktree name from path.
   */
  private getWorktreeName(worktreePath: string, project: string): string {
    const baseName = worktreePath.split("/").pop() ?? "";
    if (baseName === project) {
      return "main";
    }
    if (baseName.startsWith(`${project}--`)) {
      return baseName.substring(project.length + 2);
    }
    return baseName;
  }

  /**
   * Validates that a name is in lower-kebab-case format.
   */
  isValidKebabCase(name: string): boolean {
    return /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/.test(name);
  }

  /**
   * Creates a new workspace directory.
   */
  async createWorkspace(name: string): Promise<WorkspaceInfo> {
    if (!this.isValidKebabCase(name)) {
      throw new Error(
        `Invalid workspace name "${name}". Must be in lower-kebab-case (e.g., "my-workspace").`
      );
    }

    const workspacePath = join(this.workspacesRoot, name);

    if (await this.pathExists(workspacePath)) {
      throw new Error(`Workspace "${name}" already exists.`);
    }

    await mkdir(workspacePath, { recursive: true });

    return {
      name,
      path: workspacePath,
      projectCount: 0,
    };
  }

  /**
   * Creates a new project directory within a workspace.
   */
  async createProject(
    workspace: string,
    name: string,
    initGit = true
  ): Promise<ProjectInfo> {
    if (!this.isValidKebabCase(name)) {
      throw new Error(
        `Invalid project name "${name}". Must be in lower-kebab-case (e.g., "my-project").`
      );
    }

    const workspacePath = join(this.workspacesRoot, workspace);

    if (!(await this.pathExists(workspacePath))) {
      throw new Error(`Workspace "${workspace}" does not exist.`);
    }

    const projectPath = join(workspacePath, name);

    if (await this.pathExists(projectPath)) {
      throw new Error(
        `Project "${name}" already exists in workspace "${workspace}".`
      );
    }

    await mkdir(projectPath, { recursive: true });

    if (initGit) {
      execSync("git init", {
        cwd: projectPath,
        encoding: "utf-8",
      });
    }

    return {
      name,
      path: projectPath,
      isGitRepo: initGit,
      defaultBranch: initGit ? "main" : undefined,
      worktrees: [],
    };
  }

  /**
   * Gets current branch and uncommitted changes status for a project.
   */
  async getBranchStatus(workspace: string, project: string): Promise<{
    currentBranch: string;
    uncommittedChanges: string[];
    aheadCommits: number;
    isClean: boolean;
  }> {
    const projectPath = join(this.workspacesRoot, workspace, project);

    if (!(await this.isGitRepository(projectPath))) {
      throw new Error(`Project "${project}" is not a git repository`);
    }

    try {
      // Current branch
      const currentBranch = execSync('git rev-parse --abbrev-ref HEAD', {
        cwd: projectPath,
        encoding: 'utf-8',
      }).trim();

      // Uncommitted changes
      const statusOutput = execSync('git status --porcelain', {
        cwd: projectPath,
        encoding: 'utf-8',
      });
      const uncommittedChanges = statusOutput.trim().split('\n').filter(line => line.length > 0);

      // Commits ahead of main/master (try both branch names)
      let aheadCommits = 0;
      const mainBranches = ['main', 'master'];
      for (const mainBranch of mainBranches) {
        try {
          aheadCommits = parseInt(execSync(`git rev-list --count ${mainBranch}..${currentBranch}`, {
            cwd: projectPath,
            encoding: 'utf-8',
          }).trim(), 10);
          break;
        } catch {
          // Branch doesn't exist, continue trying
          continue;
        }
      }

      return {
        currentBranch,
        uncommittedChanges,
        aheadCommits,
        isClean: uncommittedChanges.length === 0,
      };
    } catch {
      throw new Error('Failed to get branch status');
    }
  }

  /**
   * Merges source branch into target branch with safety checks.
   */
  async mergeBranch(
    workspace: string, 
    project: string, 
    sourceBranch: string, 
    targetBranch = 'main',
    options: {
      pushAfter?: boolean;
      skipPreCheck?: boolean;
    } = {}
  ): Promise<{
    success: boolean;
    message: string;
    conflicts?: string[];
  }> {
    const projectPath = join(this.workspacesRoot, workspace, project);

    if (!(await this.isGitRepository(projectPath))) {
      throw new Error(`Project "${project}" is not a git repository`);
    }

    try {
      // Pre-merge safety checks
      if (!options.skipPreCheck) {
        const status = await this.getBranchStatus(workspace, project);
        if (!status.isClean) {
          return {
            success: false,
            message: `Cannot merge: uncommitted changes exist in ${status.currentBranch}`,
          };
        }
      }

      // Switch to target branch
      execSync(`git checkout "${targetBranch}"`, { cwd: projectPath });

      // Pull latest changes
      try {
        execSync(`git pull origin "${targetBranch}"`, { cwd: projectPath });
      } catch {
        // Remote pull failed, continue with local merge
        console.warn(`Failed to pull ${targetBranch} from remote, continuing with local merge`);
      }

      // Merge source branch
      try {
        execSync(`git merge "${sourceBranch}"`, { cwd: projectPath });
      } catch (error) {
        // Handle merge conflicts
        const conflicts = execSync('git diff --name-only --diff-filter=U', {
          cwd: projectPath,
          encoding: 'utf-8',
        }).trim().split('\n').filter(f => f.length > 0);

        return {
          success: false,
          message: `Merge conflicts in files: ${conflicts.join(', ')}`,
          conflicts,
        };
      }

      // Push if requested
      if (options.pushAfter) {
        try {
          execSync(`git push origin "${targetBranch}"`, { cwd: projectPath });
        } catch {
          console.warn(`Failed to push ${targetBranch} to remote`);
        }
      }

      return {
        success: true,
        message: `Successfully merged "${sourceBranch}" into "${targetBranch}"`,
      };

    } catch (error) {
      return {
        success: false,
        message: `Merge failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  /**
   * Checks if branch is merged into target branch.
   */
  async isBranchMerged(workspace: string, project: string, branch: string, targetBranch: string): Promise<boolean> {
    const projectPath = join(this.workspacesRoot, workspace, project);

    if (!(await this.isGitRepository(projectPath))) {
      return false;
    }

    try {
      const mergeBase = execSync(`git merge-base "${targetBranch}" "${branch}"`, {
        cwd: projectPath,
        encoding: 'utf-8',
      }).trim();

      const branchHead = execSync(`git rev-parse "${branch}"`, {
        cwd: projectPath,
        encoding: 'utf-8',
      }).trim();

      return mergeBase === branchHead;
    } catch {
      return false;
    }
  }

  /**
   * Cleans up worktree and safely deletes the branch if merged.
   */
  async cleanupWorktreeAndBranch(
    workspace: string,
    project: string, 
    branch: string
  ): Promise<{
    success: boolean;
    message: string;
    branchDeleted: boolean;
  }> {
    const projectPath = join(this.workspacesRoot, workspace, project);

    try {
      let branchDeleted = false;

      // Remove worktree
      await this.removeWorktree(workspace, project, branch);

      // Check if branch is merged into main/master and delete if safe
      const mainBranches = ['main', 'master'];
      for (const mainBranch of mainBranches) {
        try {
          const isMerged = await this.isBranchMerged(workspace, project, branch, mainBranch);
          if (isMerged) {
            execSync(`git branch -d "${branch}"`, { cwd: projectPath });
            branchDeleted = true;
            break;
          }
        } catch {
          // Branch deletion failed, continue
          continue;
        }
      }

      return {
        success: true,
        message: `Cleaned up worktree for "${branch}"${branchDeleted ? ' and deleted merged branch' : ''}`,
        branchDeleted,
      };

    } catch (error) {
      return {
        success: false,
        message: `Cleanup failed: ${error instanceof Error ? error.message : String(error)}`,
        branchDeleted: false,
      };
    }
  }

  /**
   * Lists mergeable branches with their status.
   */
  async listMergeableBranches(workspace: string, project: string): Promise<{
    branch: string;
    path: string;
    isMerged: boolean;
    hasUncommittedChanges: boolean;
    canCleanup: boolean;
    aheadCommits: number;
  }[]> {
    const worktrees = await this.listWorktrees(workspace, project);
    const mergeableBranches = [];

    for (const worktree of worktrees) {
      if (worktree.branch === 'main' || worktree.branch === 'master') continue;

      try {
        const [isMerged, hasChanges, aheadCommits] = await Promise.all([
          this.isBranchMerged(workspace, project, worktree.branch, 'main'),
          this.getBranchStatus(workspace, project).then(status => !status.isClean),
          this.getBranchStatus(workspace, project).then(status => status.aheadCommits),
        ]);

        mergeableBranches.push({
          branch: worktree.branch,
          path: worktree.path,
          isMerged: await this.isBranchMerged(workspace, project, worktree.branch, 'main'),
          hasUncommittedChanges: hasChanges,
          canCleanup: isMerged && !hasChanges,
          aheadCommits,
        });
      } catch {
        // Skip branches on error
        continue;
      }
    }

    return mergeableBranches;
  }
}
