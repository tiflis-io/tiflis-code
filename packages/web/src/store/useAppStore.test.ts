/**
 * @file useAppStore.test.ts
 * @copyright 2025 Roman Barinov <rbarinov@gmail.com>
 * @license FSL-1.1-NC
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { useAppStore } from './useAppStore';
import type { Session, Credentials, WorkstationInfo, TunnelInfo, AgentConfig, WorkspaceConfig } from '@/types';

describe('useAppStore', () => {
  beforeEach(() => {
    // Reset store before each test
    useAppStore.getState().reset();
  });

  describe('initial state', () => {
    it('should have correct initial values', () => {
      const state = useAppStore.getState();

      expect(state.isAuthenticated).toBe(false);
      expect(state.credentials).toBeNull();
      expect(state.connectionState).toBe('disconnected');
      expect(state.workstationOnline).toBe(false);
      expect(state.workstationInfo).toBeNull();
      expect(state.tunnelInfo).toBeNull();
      expect(state.sessions).toEqual([]);
      expect(state.selectedSessionId).toBeNull();
      expect(state.availableAgents).toEqual([]);
      expect(state.workspaces).toEqual([]);
    });
  });

  describe('authentication actions', () => {
    it('should set authenticated state', () => {
      useAppStore.getState().setAuthenticated(true);

      expect(useAppStore.getState().isAuthenticated).toBe(true);
    });

    it('should set credentials', () => {
      const credentials: Credentials = {
        tunnelId: 'tunnel-123',
        tunnelUrl: 'wss://tunnel.example.com',
        authKey: 'auth-key-123',
        deviceId: 'device-123',
      };

      useAppStore.getState().setCredentials(credentials);

      expect(useAppStore.getState().credentials).toEqual(credentials);
    });

    it('should clear credentials', () => {
      useAppStore.getState().setCredentials({
        tunnelId: 'test',
        tunnelUrl: 'wss://test.com',
        authKey: 'key',
        deviceId: 'device',
      });

      useAppStore.getState().setCredentials(null);

      expect(useAppStore.getState().credentials).toBeNull();
    });
  });

  describe('connection actions', () => {
    it('should set connection state', () => {
      useAppStore.getState().setConnectionState('connecting');
      expect(useAppStore.getState().connectionState).toBe('connecting');

      useAppStore.getState().setConnectionState('authenticated');
      expect(useAppStore.getState().connectionState).toBe('authenticated');
    });

    it('should set workstation online status', () => {
      useAppStore.getState().setWorkstationOnline(true);
      expect(useAppStore.getState().workstationOnline).toBe(true);

      useAppStore.getState().setWorkstationOnline(false);
      expect(useAppStore.getState().workstationOnline).toBe(false);
    });

    it('should set workstation info', () => {
      const workstationInfo: WorkstationInfo = {
        name: 'My Workstation',
        version: '1.0.0',
        protocolVersion: 'v1.12',
        workspacesRoot: '/home/user/workspaces',
      };

      useAppStore.getState().setWorkstationInfo(workstationInfo);

      expect(useAppStore.getState().workstationInfo).toEqual(workstationInfo);
    });

    it('should set tunnel info', () => {
      const tunnelInfo: TunnelInfo = {
        version: '1.0.0',
        protocolVersion: 'v1.12',
      };

      useAppStore.getState().setTunnelInfo(tunnelInfo);

      expect(useAppStore.getState().tunnelInfo).toEqual(tunnelInfo);
    });
  });

  describe('session actions', () => {
    const mockSession: Session = {
      id: 'session-1',
      type: 'claude',
      status: 'active',
      createdAt: new Date(),
    };

    it('should set sessions', () => {
      const sessions = [mockSession];

      useAppStore.getState().setSessions(sessions);

      expect(useAppStore.getState().sessions).toEqual(sessions);
    });

    it('should add session', () => {
      useAppStore.getState().addSession(mockSession);

      expect(useAppStore.getState().sessions).toHaveLength(1);
      expect(useAppStore.getState().sessions[0]).toEqual(mockSession);
    });

    it('should remove session', () => {
      useAppStore.getState().addSession(mockSession);
      useAppStore.getState().addSession({ ...mockSession, id: 'session-2' });

      useAppStore.getState().removeSession('session-1');

      expect(useAppStore.getState().sessions).toHaveLength(1);
      expect(useAppStore.getState().sessions[0]?.id).toBe('session-2');
    });

    it('should clear selectedSessionId when removing selected session', () => {
      useAppStore.getState().addSession(mockSession);
      useAppStore.getState().selectSession('session-1');

      useAppStore.getState().removeSession('session-1');

      expect(useAppStore.getState().selectedSessionId).toBeNull();
    });

    it('should keep selectedSessionId when removing different session', () => {
      useAppStore.getState().addSession(mockSession);
      useAppStore.getState().addSession({ ...mockSession, id: 'session-2' });
      useAppStore.getState().selectSession('session-1');

      useAppStore.getState().removeSession('session-2');

      expect(useAppStore.getState().selectedSessionId).toBe('session-1');
    });

    it('should update session', () => {
      useAppStore.getState().addSession(mockSession);

      useAppStore.getState().updateSession('session-1', { status: 'idle' });

      expect(useAppStore.getState().sessions[0]?.status).toBe('idle');
    });

    it('should select session', () => {
      useAppStore.getState().addSession(mockSession);

      useAppStore.getState().selectSession('session-1');

      expect(useAppStore.getState().selectedSessionId).toBe('session-1');
    });
  });

  describe('available options actions', () => {
    it('should set available agents', () => {
      const agents: AgentConfig[] = [
        { name: 'claude', baseType: 'claude', displayName: 'Claude', isAlias: false },
        { name: 'cursor', baseType: 'cursor', displayName: 'Cursor', isAlias: false },
      ];

      useAppStore.getState().setAvailableAgents(agents);

      expect(useAppStore.getState().availableAgents).toEqual(agents);
    });

    it('should set workspaces', () => {
      const workspaces: WorkspaceConfig[] = [
        { name: 'Project 1', projects: [{ name: 'main' }] },
        { name: 'Project 2', projects: [{ name: 'feature', isGitRepo: true, defaultBranch: 'dev' }] },
      ];

      useAppStore.getState().setWorkspaces(workspaces);

      expect(useAppStore.getState().workspaces).toEqual(workspaces);
    });
  });

  describe('reset', () => {
    it('should reset all state to initial values', () => {
      // Set various state values
      useAppStore.getState().setAuthenticated(true);
      useAppStore.getState().setConnectionState('authenticated');
      useAppStore.getState().setWorkstationOnline(true);
      useAppStore.getState().addSession({
        id: 'session-1',
        type: 'claude',
        status: 'active',
        createdAt: new Date(),
      });

      // Reset
      useAppStore.getState().reset();

      // Verify all values are reset
      const state = useAppStore.getState();
      expect(state.isAuthenticated).toBe(false);
      expect(state.connectionState).toBe('disconnected');
      expect(state.workstationOnline).toBe(false);
      expect(state.sessions).toEqual([]);
    });
  });
});
