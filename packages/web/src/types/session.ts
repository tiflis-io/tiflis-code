// Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
// Licensed under the FSL-1.1-NC.

export type SessionType = 'supervisor' | 'claude' | 'cursor' | 'opencode' | 'terminal' | 'backlog-agent';

export type SessionStatus = 'active' | 'idle' | 'busy';

export interface Session {
  id: string;
  type: SessionType;
  status: SessionStatus;
  agentName?: string;
  workspace?: string;
  project?: string;
  worktree?: string;
  workingDir?: string;
  createdAt: Date;
  terminalConfig?: TerminalConfig;
}

export interface TerminalConfig {
  cols: number;
  rows: number;
  bufferSize: number;
}

export interface AgentConfig {
  name: string;
  baseType: SessionType;
  displayName: string;
  description?: string;
  isAlias: boolean;
}

export interface WorkspaceConfig {
  name: string;
  projects: ProjectConfig[];
}

export interface ProjectConfig {
  name: string;
  isGitRepo?: boolean;
  defaultBranch?: string;
}
