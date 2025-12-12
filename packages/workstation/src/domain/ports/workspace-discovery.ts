/**
 * @file workspace-discovery.ts
 * @copyright 2025 Roman Barinov <rbarinov@gmail.com>
 * @license FSL-1.1-NC
 */

/**
 * Information about a workspace (organization/group).
 */
export interface WorkspaceInfo {
  name: string;
  path: string;
  projectCount: number;
}

/**
 * Information about a project within a workspace.
 */
export interface ProjectInfo {
  name: string;
  path: string;
  isGitRepo: boolean;
  defaultBranch?: string;
  worktrees: WorktreeInfo[];
}

/**
 * Information about a git worktree.
 */
export interface WorktreeInfo {
  name: string;
  path: string;
  branch: string;
  isMain: boolean;
}

/**
 * Port for workspace and project discovery.
 */
export interface WorkspaceDiscovery {
  /**
   * Lists all workspaces in the workspaces root.
   */
  listWorkspaces(): Promise<WorkspaceInfo[]>;

  /**
   * Lists all projects in a workspace.
   */
  listProjects(workspace: string): Promise<ProjectInfo[]>;

  /**
   * Gets information about a specific project.
   */
  getProject(workspace: string, project: string): Promise<ProjectInfo | undefined>;

  /**
   * Lists worktrees for a project.
   */
  listWorktrees(workspace: string, project: string): Promise<WorktreeInfo[]>;

  /**
   * Creates a new worktree for a project.
   * If createNewBranch is true, creates a new branch from baseBranch (defaults to current HEAD).
   * If createNewBranch is false, the branch must already exist.
   */
  createWorktree(
    workspace: string,
    project: string,
    branch: string,
    createNewBranch?: boolean,
    baseBranch?: string
  ): Promise<WorktreeInfo>;

  /**
   * Removes a worktree from a project.
   */
  removeWorktree(workspace: string, project: string, worktree: string): Promise<void>;

  /**
   * Resolves the full path to a workspace/project/worktree.
   */
  resolvePath(workspace: string, project?: string, worktree?: string): string;

  /**
   * Checks if a path exists and is a directory.
   */
  pathExists(path: string): Promise<boolean>;

  /**
   * Creates a new workspace directory.
   * Name must be in lower-kebab-case.
   */
  createWorkspace(name: string): Promise<WorkspaceInfo>;

  /**
   * Creates a new project directory within a workspace.
   * Name must be in lower-kebab-case.
   * Optionally initializes as a git repository.
   */
  createProject(
    workspace: string,
    name: string,
    initGit?: boolean
  ): Promise<ProjectInfo>;
}

