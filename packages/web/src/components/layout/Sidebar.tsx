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
  Bot,
  MessageSquare,
} from 'lucide-react';
import {
  SupervisorIcon,
  ClaudeIcon,
  OpenCodeIcon,
  CursorIcon,
  TerminalIcon,
  AgentIcon,
} from '@/components/icons';
import type { Session, SessionStatus } from '@/types';

/**
 * Session status indicator dot
 */
function StatusIndicator({ status }: { status: SessionStatus }) {
  const statusConfig = {
    active: {
      className: 'bg-green-500',
      label: 'Active',
    },
    busy: {
      className: 'bg-blue-500 animate-pulse',
      label: 'Processing',
    },
    idle: {
      className: 'bg-yellow-500',
      label: 'Idle',
    },
  };

  const config = statusConfig[status] || statusConfig.idle;

  return (
    <span
      className={cn('w-2 h-2 rounded-full shrink-0', config.className)}
      title={config.label}
      aria-label={`Status: ${config.label}`}
    />
  );
}

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

  // Check if we're on an assistant-ui route
  const isAssistantUIRoute = location.pathname.startsWith('/assistant-ui');
  const isCurrentRouteAssistantUI = isAssistantUIRoute;

  const supervisorActive = !selectedSessionId && (
    (location.pathname === '/chat' && !isAssistantUIRoute) || 
    (location.pathname === '/assistant-ui' && isAssistantUIRoute)
  );
  
  const settingsActive = location.pathname === '/settings';
  
  // Check if the current session is active (handles both interfaces)
  const isSessionActive = (sessionId: string) => {
    if (isAssistantUIRoute) {
      return selectedSessionId === sessionId && location.pathname === `/assistant-ui/${sessionId}`;
    }
    return selectedSessionId === sessionId && location.pathname === `/chat/${sessionId}`;
  };
  
  // Get the base path and session ID for navigation
  const getCurrentPathBase = () => {
    if (isAssistantUIRoute) {
      return '/assistant-ui';
    }
    return '/chat';
  };
  
  const getSessionPath = (sessionId: string) => {
    if (isAssistantUIRoute) {
      return `/assistant-ui/${sessionId}`;
    }
    return `/chat/${sessionId}`;
  };

  const agentSessions = sessions.filter((s) => s.type !== 'terminal');
  const terminalSessions = sessions.filter((s) => s.type === 'terminal');

  const handleSupervisorClick = () => {
    selectSession(null);
    navigate(getCurrentPathBase());
  };

  const handleSessionClick = (session: Session) => {
    selectSession(session.id);
    if (session.type === 'terminal') {
      navigate(`/terminal/${session.id}`);
    } else {
      navigate(getSessionPath(session.id));
    }
  };

  const handleSettingsClick = () => {
    navigate('/settings');
  };
  
  const handleInterfaceToggle = () => {
    if (selectedSessionId) {
      // If we have a selected session, toggle between interfaces for that session
      if (isAssistantUIRoute) {
        navigate(`/chat/${selectedSessionId}`);
      } else {
        navigate(`/assistant-ui/${selectedSessionId}`);
      }
    } else {
      // Otherwise toggle the supervisor view
      if (isAssistantUIRoute) {
        navigate('/chat');
      } else {
        navigate('/assistant-ui');
      }
    }
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
    <aside className="flex flex-col h-full" aria-label="Session navigation">
      {/* Header */}
      <div className="p-4 border-b space-y-2">
        <div className="flex items-center justify-between">
          {!sidebarCollapsed && (
            <h1 className="font-semibold text-lg">Tiflis Code</h1>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleSidebar}
            className={cn(sidebarCollapsed && 'mx-auto')}
            aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-expanded={!sidebarCollapsed}
          >
            {sidebarCollapsed ? (
              <ChevronRight className="w-4 h-4" aria-hidden="true" />
            ) : (
              <ChevronLeft className="w-4 h-4" aria-hidden="true" />
            )}
          </Button>
        </div>
        
        {/* Interface Toggle */}
        {!sidebarCollapsed && (
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
              <span>Interface</span>
              <div className="flex items-center gap-1">
                <Button
                  variant={!isCurrentRouteAssistantUI ? "secondary" : "ghost"}
                  size="sm"
                  className="h-6 px-2 text-xs"
                  onClick={() => {
                    if (selectedSessionId) {
                      navigate(`/chat/${selectedSessionId}`);
                    } else {
                      navigate('/chat');
                    }
                  }}
                  aria-pressed={!isCurrentRouteAssistantUI}
                  title="Classic chat interface"
                >
                  <MessageSquare className="w-3 h-3 mr-1" aria-hidden="true" />
                  Classic
                </Button>
                <Button
                  variant={isCurrentRouteAssistantUI ? "secondary" : "ghost"}
                  size="sm"
                  className="h-6 px-2 text-xs"
                  onClick={() => {
                    if (selectedSessionId) {
                      navigate(`/assistant-ui/${selectedSessionId}`);
                    } else {
                      navigate('/assistant-ui');
                    }
                  }}
                  aria-pressed={isCurrentRouteAssistantUI}
                  title="New AI assistant interface with enhanced features"
                >
                  <Bot className="w-3 h-3 mr-1" aria-hidden="true" />
                  Assistant
                </Button>
              </div>
            </div>
          </div>
        )}
        
        {/* Collapsed state toggle */}
        {sidebarCollapsed && (
          <div className="flex justify-center">
            <Button
              variant={isCurrentRouteAssistantUI ? "secondary" : "ghost"}
              size="icon"
              className="h-8 w-8"
              onClick={handleInterfaceToggle}
              aria-label={isCurrentRouteAssistantUI ? 'Switch to Classic interface' : 'Switch to Assistant UI interface'}
              title={isCurrentRouteAssistantUI ? 'Switch to Classic chat interface' : 'Switch to Assistant UI interface'}
              aria-pressed={isCurrentRouteAssistantUI}
            >
              {isCurrentRouteAssistantUI ? (
                <MessageSquare className="w-3 h-3" aria-hidden="true" />
              ) : (
                <Bot className="w-3 h-3" aria-hidden="true" />
              )}
            </Button>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-auto p-2 space-y-1" aria-label="Sessions">
        {/* Supervisor */}
        <Button
          variant={supervisorActive ? 'secondary' : 'ghost'}
          className={cn(
            'w-full justify-start',
            sidebarCollapsed && 'justify-center px-2'
          )}
          onClick={handleSupervisorClick}
          aria-current={supervisorActive ? 'page' : undefined}
          aria-label={sidebarCollapsed ? 'Supervisor' : undefined}
        >
          <SupervisorIcon className="w-4 h-4" aria-hidden="true" />
          {!sidebarCollapsed && <span className="ml-2">Supervisor</span>}
        </Button>

        {/* Agent Sessions */}
        {agentSessions.length > 0 && (
          <section className="pt-4" aria-label="Agent sessions">
            {!sidebarCollapsed && (
              <h2 className="px-2 py-1 text-xs font-medium text-muted-foreground uppercase">
                Agent Sessions
              </h2>
            )}
            <ul role="list" className="space-y-1">
              {agentSessions.map((session) => {
                const subtitle = getSessionSubtitle(session);
                const displayName = getSessionDisplayName(session);
                return (
                  <li key={session.id}>
                    <Button
                      variant={isSessionActive(session.id) ? 'secondary' : 'ghost'}
                      className={cn(
                        'w-full justify-start h-auto py-2',
                        sidebarCollapsed && 'justify-center px-2'
                      )}
                      onClick={() => handleSessionClick(session)}
                      aria-current={isSessionActive(session.id) ? 'page' : undefined}
                      aria-label={sidebarCollapsed ? `${displayName}${subtitle ? ` - ${subtitle}` : ''}` : undefined}
                    >
                      <div className="relative shrink-0">
                        <span aria-hidden="true">{getSessionIcon(session)}</span>
                        {/* Status indicator overlay */}
                        <span className="absolute -bottom-0.5 -right-0.5">
                          <StatusIndicator status={session.status} />
                        </span>
                      </div>
                      {!sidebarCollapsed && (
                        <div className="ml-2 flex flex-col items-start min-w-0 flex-1">
                          <span className="truncate text-sm font-medium">
                            {displayName}
                          </span>
                          {subtitle && (
                            <span className="truncate text-xs text-muted-foreground">
                              {subtitle}
                            </span>
                          )}
                        </div>
                      )}
                    </Button>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {/* Terminal Sessions */}
        {terminalSessions.length > 0 && (
          <section className="pt-4" aria-label="Terminal sessions">
            {!sidebarCollapsed && (
              <h2 className="px-2 py-1 text-xs font-medium text-muted-foreground uppercase">
                Terminals
              </h2>
            )}
            <ul role="list" className="space-y-1">
              {terminalSessions.map((session) => {
                const subtitle = getSessionSubtitle(session);
                return (
                  <li key={session.id}>
                    <Button
                      variant={isSessionActive(session.id) ? 'secondary' : 'ghost'}
                      className={cn(
                        'w-full justify-start h-auto py-2',
                        sidebarCollapsed && 'justify-center px-2'
                      )}
                      onClick={() => handleSessionClick(session)}
                      aria-current={isSessionActive(session.id) ? 'page' : undefined}
                      aria-label={sidebarCollapsed ? `Terminal${subtitle ? ` - ${subtitle}` : ''}` : undefined}
                    >
                      <div className="relative shrink-0">
                        <span aria-hidden="true">{getSessionIcon(session)}</span>
                        {/* Status indicator overlay */}
                        <span className="absolute -bottom-0.5 -right-0.5">
                          <StatusIndicator status={session.status} />
                        </span>
                      </div>
                      {!sidebarCollapsed && (
                        <div className="ml-2 flex flex-col items-start min-w-0 flex-1">
                          <span className="truncate text-sm font-medium">Terminal</span>
                          {subtitle && (
                            <span className="truncate text-xs text-muted-foreground">
                              {subtitle}
                            </span>
                          )}
                        </div>
                      )}
                    </Button>
                  </li>
                );
              })}
            </ul>
          </section>
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
              aria-label={sidebarCollapsed ? 'Create new session' : undefined}
            >
              <Plus className="w-4 h-4" aria-hidden="true" />
              {!sidebarCollapsed && <span className="ml-2">New Session</span>}
            </Button>
          </CreateSessionDialog>
        </div>
      </nav>

      {/* Footer */}
      <div className="p-2 border-t">
        <Button
          variant={settingsActive ? 'secondary' : 'ghost'}
          className={cn(
            'w-full justify-start',
            sidebarCollapsed && 'justify-center px-2'
          )}
          onClick={handleSettingsClick}
          aria-current={settingsActive ? 'page' : undefined}
          aria-label={sidebarCollapsed ? 'Settings' : undefined}
        >
          <Settings className="w-4 h-4" aria-hidden="true" />
          {!sidebarCollapsed && <span className="ml-2">Settings</span>}
        </Button>
      </div>
    </aside>
  );
}
