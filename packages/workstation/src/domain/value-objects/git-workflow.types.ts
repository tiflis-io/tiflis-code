/**
 * @file git-workflow.types.ts
 * @copyright 2025 Roman Barinov <rbarinov@gmail.com>
 * @license FSL-1.1-NC
 *
 * Types and interfaces for git workflow and merge operations.
 */

/**
 * Result from branch status operation.
 */
export interface BranchStatus {
  currentBranch: string;
  uncommittedChanges: string[];
  aheadCommits: number;
  isClean: boolean;
}

/**
 * Result from merge branch operation.
 */
export interface MergeResult {
  success: boolean;
  message: string;
  conflicts?: string[];
}

/**
 * Result from worktree cleanup operation.
 */
export interface CleanupResult {
  success: boolean;
  message: string;
  branchDeleted: boolean;
}

/**
 * Information about a mergeable branch.
 */
export interface MergeableBranch {
  branch: string;
  path: string;
  isMerged: boolean;
  hasUncommittedChanges: boolean;
  canCleanup: boolean;
  aheadCommits: number;
}

/**
   * Complete feature workflow result.
   */
export interface CompleteFeatureResult {
  success: boolean;
  message: string;
  results: {
    step: string;
    data: Record<string, unknown>;
  }[];
}

/**
   * Worktree session summary.
   */
export interface WorktreeSessionSummary {
  activeSessions: {
    sessionId: string;
    agentType: string;
    isExecuting: boolean;
    createdAt: number;
  }[];
  sessionCount: number;
  sessionTypes: string[];
  executingCount: number;
}

/**
 * Session with worktree information.
 */
export interface SessionWithWorktreeInfo {
  sessionId: string;
  agentType: string;
  agentName: string;
  workingDir: string;
  isExecuting: boolean;
  worktreeInfo?: {
    workspace?: string;
    project?: string;
    branch?: string;
    isWorktree: boolean;
  };
}

/**
 * Options for merge operations.
 */
export interface MergeOptions {
  pushAfter?: boolean;
  skipPreCheck?: boolean;
}

/**
 * Options for complete feature workflow.
 */
export interface CompleteFeatureOptions {
  targetBranch?: string;
  skipConfirmation?: boolean;
}