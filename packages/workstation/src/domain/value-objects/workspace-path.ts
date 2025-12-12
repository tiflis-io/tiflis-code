/**
 * @file workspace-path.ts
 * @copyright 2025 Roman Barinov <rbarinov@gmail.com>
 * @license FSL-1.1-NC
 */

/**
 * Value object representing a workspace path (organization/group).
 */
export class WorkspacePath {
  private readonly _workspace: string;
  private readonly _project?: string;
  private readonly _worktree?: string;

  constructor(workspace: string, project?: string, worktree?: string) {
    if (!workspace || workspace.length < 1) {
      throw new Error('Workspace name cannot be empty');
    }
    this._workspace = workspace;
    this._project = project;
    this._worktree = worktree;
  }

  get workspace(): string {
    return this._workspace;
  }

  get project(): string | undefined {
    return this._project;
  }

  get worktree(): string | undefined {
    return this._worktree;
  }

  /**
   * Returns the full path representation.
   * Format: workspace/project--worktree or workspace/project or workspace
   */
  get fullPath(): string {
    if (!this._project) {
      return this._workspace;
    }
    if (!this._worktree) {
      return `${this._workspace}/${this._project}`;
    }
    return `${this._workspace}/${this._project}--${this._worktree}`;
  }

  /**
   * Returns the directory name for the project.
   * If worktree is specified, returns project--worktree format.
   */
  get directoryName(): string {
    if (!this._project) {
      return this._workspace;
    }
    if (!this._worktree) {
      return this._project;
    }
    return `${this._project}--${this._worktree}`;
  }

  equals(other: WorkspacePath): boolean {
    return (
      this._workspace === other._workspace &&
      this._project === other._project &&
      this._worktree === other._worktree
    );
  }

  toString(): string {
    return this.fullPath;
  }
}

