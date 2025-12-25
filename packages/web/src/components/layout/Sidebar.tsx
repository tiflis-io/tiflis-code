// Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
// Licensed under the FSL-1.1-NC.

import { useNavigate, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useAppStore } from '@/store/useAppStore';
import { useSettingsStore } from '@/store/useSettingsStore';
import { CreateSessionDialog } from '@/components/session/CreateSessionDialog';
import { cn } from '@/lib/utils';
import {
  Settings,
  Plus,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import {
  SupervisorIcon,
  ClaudeIcon,
  OpenCodeIcon,
  CursorIcon,
  TerminalIcon,
  AgentIcon,
} from '@/components/icons';
import type { Session } from '@/types';

export function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const sessions = useAppStore((state) => state.sessions);
  const selectedSessionId = useAppStore((state) => state.selectedSessionId);
  const selectSession = useAppStore((state) => state.selectSession);
  const workstationInfo = useAppStore((state) => state.workstationInfo);
  const sidebarCollapsed = useSettingsStore((state) => state.sidebarCollapsed);
  const toggleSidebar = useSettingsStore((state) => state.toggleSidebar);

  const workspacesRoot = workstationInfo?.workspacesRoot ?? '';

  const supervisorActive = location.pathname === '/chat' && !selectedSessionId;
  const settingsActive = location.pathname === '/settings';

  const agentSessions = sessions.filter((s) => s.type !== 'terminal');
  const terminalSessions = sessions.filter((s) => s.type === 'terminal');

  const handleSupervisorClick = () => {
    selectSession(null);
    navigate('/chat');
  };

  const handleSessionClick = (session: Session) => {
    selectSession(session.id);
    if (session.type === 'terminal') {
      navigate(`/terminal/${session.id}`);
    } else {
      navigate(`/chat/${session.id}`);
    }
  };

  const handleSettingsClick = () => {
    navigate('/settings');
  };

  const getSessionIcon = (session: Session) => {
    switch (session.type) {
      case 'terminal':
        return <TerminalIcon className="w-4 h-4" />;
      case 'claude':
        return <ClaudeIcon className="w-4 h-4" />;
      case 'cursor':
        return <CursorIcon className="w-4 h-4" />;
      case 'opencode':
        return <OpenCodeIcon className="w-4 h-4" />;
      default:
        return <AgentIcon className="w-4 h-4" />;
    }
  };

  // Get display name for session type
  const getTypeDisplayName = (type: string): string => {
    switch (type) {
      case 'claude':
        return 'Claude Code';
      case 'cursor':
        return 'Cursor';
      case 'opencode':
        return 'OpenCode';
      case 'terminal':
        return 'Terminal';
      case 'supervisor':
        return 'Supervisor';
      default:
        return type.charAt(0).toUpperCase() + type.slice(1);
    }
  };

  // Get display name for session (with alias in parentheses if present)
  const getSessionDisplayName = (session: Session): string => {
    const typeName = getTypeDisplayName(session.type);
    if (session.agentName && session.agentName !== session.type) {
      return `${typeName} (${session.agentName})`;
    }
    return typeName;
  };

  // Get subtitle for session (workspace/project path relative to workspacesRoot)
  const getSessionSubtitle = (session: Session): string | null => {
    // Check if we have real workspace/project (not sentinel values used for terminal defaults)
    const hasRealWorkspace = session.workspace && session.workspace !== 'home';
    const hasRealProject = session.project && session.project !== 'default';

    // If we have real workspace/project, show that format (relative by nature)
    if (hasRealWorkspace && hasRealProject) {
      if (session.worktree) {
        return `${session.workspace}/${session.project}--${session.worktree}`;
      }
      return `${session.workspace}/${session.project}`;
    }

    // Otherwise compute relative path from workspaces root
    if (!session.workingDir) {
      // No working dir - return "~" if using sentinel values (terminal at home)
      return (!hasRealWorkspace && !hasRealProject) ? '~' : null;
    }

    if (!workspacesRoot) {
      // No root known - fallback to absolute path
      return session.workingDir;
    }

    // Remove root prefix to get relative path
    if (session.workingDir.startsWith(workspacesRoot)) {
      let relative = session.workingDir.slice(workspacesRoot.length);
      // Remove leading slash if present
      if (relative.startsWith('/')) {
        relative = relative.slice(1);
      }
      // Return "~" for empty relative path (at root)
      return relative || '~';
    }

    // Path doesn't start with root - return as-is
    return session.workingDir;
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b flex items-center justify-between">
        {!sidebarCollapsed && (
          <h1 className="font-semibold text-lg">Tiflis Code</h1>
        )}
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleSidebar}
          className={cn(sidebarCollapsed && 'mx-auto')}
        >
          {sidebarCollapsed ? (
            <ChevronRight className="w-4 h-4" />
          ) : (
            <ChevronLeft className="w-4 h-4" />
          )}
        </Button>
      </div>

      {/* Navigation */}
      <div className="flex-1 overflow-auto p-2 space-y-1">
        {/* Supervisor */}
        <Button
          variant={supervisorActive ? 'secondary' : 'ghost'}
          className={cn(
            'w-full justify-start',
            sidebarCollapsed && 'justify-center px-2'
          )}
          onClick={handleSupervisorClick}
        >
          <SupervisorIcon className="w-4 h-4" />
          {!sidebarCollapsed && <span className="ml-2">Supervisor</span>}
        </Button>

        {/* Agent Sessions */}
        {agentSessions.length > 0 && (
          <div className="pt-4">
            {!sidebarCollapsed && (
              <p className="px-2 py-1 text-xs font-medium text-muted-foreground uppercase">
                Agent Sessions
              </p>
            )}
            {agentSessions.map((session) => {
              const subtitle = getSessionSubtitle(session);
              return (
                <Button
                  key={session.id}
                  variant={selectedSessionId === session.id ? 'secondary' : 'ghost'}
                  className={cn(
                    'w-full justify-start h-auto py-2',
                    sidebarCollapsed && 'justify-center px-2'
                  )}
                  onClick={() => handleSessionClick(session)}
                >
                  {getSessionIcon(session)}
                  {!sidebarCollapsed && (
                    <div className="ml-2 flex flex-col items-start min-w-0">
                      <span className="truncate text-sm font-medium">
                        {getSessionDisplayName(session)}
                      </span>
                      {subtitle && (
                        <span className="truncate text-xs text-muted-foreground">
                          {subtitle}
                        </span>
                      )}
                    </div>
                  )}
                </Button>
              );
            })}
          </div>
        )}

        {/* Terminal Sessions */}
        {terminalSessions.length > 0 && (
          <div className="pt-4">
            {!sidebarCollapsed && (
              <p className="px-2 py-1 text-xs font-medium text-muted-foreground uppercase">
                Terminals
              </p>
            )}
            {terminalSessions.map((session) => {
              const subtitle = getSessionSubtitle(session);
              return (
                <Button
                  key={session.id}
                  variant={selectedSessionId === session.id ? 'secondary' : 'ghost'}
                  className={cn(
                    'w-full justify-start h-auto py-2',
                    sidebarCollapsed && 'justify-center px-2'
                  )}
                  onClick={() => handleSessionClick(session)}
                >
                  {getSessionIcon(session)}
                  {!sidebarCollapsed && (
                    <div className="ml-2 flex flex-col items-start min-w-0">
                      <span className="truncate text-sm font-medium">Terminal</span>
                      {subtitle && (
                        <span className="truncate text-xs text-muted-foreground">
                          {subtitle}
                        </span>
                      )}
                    </div>
                  )}
                </Button>
              );
            })}
          </div>
        )}

        {/* New Session Button */}
        <div className="pt-4">
          <CreateSessionDialog>
            <Button
              variant="outline"
              className={cn(
                'w-full justify-start',
                sidebarCollapsed && 'justify-center px-2'
              )}
            >
              <Plus className="w-4 h-4" />
              {!sidebarCollapsed && <span className="ml-2">New Session</span>}
            </Button>
          </CreateSessionDialog>
        </div>
      </div>

      {/* Footer */}
      <div className="p-2 border-t">
        <Button
          variant={settingsActive ? 'secondary' : 'ghost'}
          className={cn(
            'w-full justify-start',
            sidebarCollapsed && 'justify-center px-2'
          )}
          onClick={handleSettingsClick}
        >
          <Settings className="w-4 h-4" />
          {!sidebarCollapsed && <span className="ml-2">Settings</span>}
        </Button>
      </div>
    </div>
  );
}
