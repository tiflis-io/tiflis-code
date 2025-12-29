// Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
// Licensed under the FSL-1.1-NC.

import { create } from 'zustand';
import type {
  ConnectionState,
  Credentials,
  WorkstationInfo,
  TunnelInfo,
  Session,
  AgentConfig,
  WorkspaceConfig,
} from '@/types';

interface AppState {
  // Authentication
  isAuthenticated: boolean;
  credentials: Credentials | null;

  // Connection
  connectionState: ConnectionState;
  workstationOnline: boolean;
  workstationInfo: WorkstationInfo | null;
  tunnelInfo: TunnelInfo | null;

  // Sessions
  sessions: Session[];
  selectedSessionId: string | null;

  // Available options from workstation
  availableAgents: AgentConfig[];
  workspaces: WorkspaceConfig[];

  // Actions - Authentication
  setAuthenticated: (isAuthenticated: boolean) => void;
  setCredentials: (credentials: Credentials | null) => void;

  // Actions - Connection
  setConnectionState: (state: ConnectionState) => void;
  setWorkstationOnline: (online: boolean) => void;
  setWorkstationInfo: (info: WorkstationInfo | null) => void;
  setTunnelInfo: (info: TunnelInfo | null) => void;

  // Actions - Sessions
  setSessions: (sessions: Session[]) => void;
  addSession: (session: Session) => void;
  removeSession: (sessionId: string) => void;
  updateSession: (sessionId: string, updates: Partial<Session>) => void;
  selectSession: (sessionId: string | null) => void;

  // Actions - Available options
  setAvailableAgents: (agents: AgentConfig[]) => void;
  setWorkspaces: (workspaces: WorkspaceConfig[]) => void;

  // Actions - Reset
  reset: () => void;
}

const initialState = {
  isAuthenticated: false,
  credentials: null,
  connectionState: 'disconnected' as ConnectionState,
  workstationOnline: false,
  workstationInfo: null,
  tunnelInfo: null,
  sessions: [],
  selectedSessionId: null,
  availableAgents: [],
  workspaces: [],
};

export const useAppStore = create<AppState>((set) => ({
  ...initialState,

  // Authentication
  setAuthenticated: (isAuthenticated) => set({ isAuthenticated }),
  setCredentials: (credentials) => set({ credentials }),

  // Connection
  setConnectionState: (connectionState) => set({ connectionState }),
  setWorkstationOnline: (workstationOnline) => set({ workstationOnline }),
  setWorkstationInfo: (workstationInfo) => set({ workstationInfo }),
  setTunnelInfo: (tunnelInfo) => set({ tunnelInfo }),

  // Sessions
  setSessions: (sessions) => set({ sessions }),
  addSession: (session) =>
    set((state) => {
      if (state.sessions.some((s) => s.id === session.id)) {
        return state;
      }
      return { sessions: [...state.sessions, session] };
    }),
  removeSession: (sessionId) =>
    set((state) => ({
      sessions: state.sessions.filter((s) => s.id !== sessionId),
      selectedSessionId:
        state.selectedSessionId === sessionId ? null : state.selectedSessionId,
    })),
  updateSession: (sessionId, updates) =>
    set((state) => ({
      sessions: state.sessions.map((s) =>
        s.id === sessionId ? { ...s, ...updates } : s
      ),
    })),
  selectSession: (selectedSessionId) => set({ selectedSessionId }),

  // Available options
  setAvailableAgents: (availableAgents) => set({ availableAgents }),
  setWorkspaces: (workspaces) => set({ workspaces }),

  // Reset
  reset: () => set(initialState),
}));
