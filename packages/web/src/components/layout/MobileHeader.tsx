// Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
// Licensed under the FSL-1.1-NC.

import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useAppStore } from '@/store/useAppStore';
import { CreateSessionDialog } from '@/components/session/CreateSessionDialog';
import { cn } from '@/lib/utils';
import {
  Menu,
  X,
  Settings,
  Plus,
  Wifi,
  WifiOff,
  Loader2,
  AlertTriangle,
  Check,
} from 'lucide-react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
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
 * Session status indicator dot (matches Sidebar)
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

export function MobileHeader() {
  const [isOpen, setIsOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const sessions = useAppStore((state) => state.sessions);
  const selectedSessionId = useAppStore((state) => state.selectedSessionId);
  const selectSession = useAppStore((state) => state.selectSession);
  const workstationInfo = useAppStore((state) => state.workstationInfo);
  const connectionState = useAppStore((state) => state.connectionState);
  const workstationOnline = useAppStore((state) => state.workstationOnline);

  const workspacesRoot = workstationInfo?.workspacesRoot ?? '';

  const supervisorActive = !selectedSessionId && location.pathname === '/chat';
  const settingsActive = location.pathname === '/settings';

  const agentSessions = sessions.filter((s) => s.type !== 'terminal');
  const terminalSessions = sessions.filter((s) => s.type === 'terminal');

  const handleNavigation = (path: string, sessionId?: string) => {
    if (sessionId !== undefined) {
      selectSession(sessionId);
    } else {
      selectSession(null);
    }
    navigate(path);
    setIsOpen(false);
  };

  // Helper function to navigate 
  const getCurrentPathBase = () => {
    return '/chat';
  };
  
  const getSessionPath = (sessionId: string) => {
    return `/chat/${sessionId}`;
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

  // Get display name for session type (matches Sidebar)
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
    const hasRealWorkspace = session.workspace && session.workspace !== 'home';
    const hasRealProject = session.project && session.project !== 'default';

    if (hasRealWorkspace && hasRealProject) {
      if (session.worktree) {
        return `${session.workspace}/${session.project}--${session.worktree}`;
      }
      return `${session.workspace}/${session.project}`;
    }

    if (!session.workingDir) {
      return (!hasRealWorkspace && !hasRealProject) ? '~' : null;
    }

    if (!workspacesRoot) {
      return session.workingDir;
    }

    if (session.workingDir.startsWith(workspacesRoot)) {
      let relative = session.workingDir.slice(workspacesRoot.length);
      if (relative.startsWith('/')) {
        relative = relative.slice(1);
      }
      return relative || '~';
    }

    return session.workingDir;
  };

  const getCurrentSession = () => {
    if (selectedSessionId) {
      return sessions.find((s) => s.id === selectedSessionId);
    }
    return null;
  };

  const getPageTitle = () => {
    if (settingsActive) return 'Settings';
    const session = getCurrentSession();
    if (session) {
      const displayName = session.type === 'terminal' ? 'Terminal' : getSessionDisplayName(session);
      return displayName;
    }
    return 'Supervisor';
  };

  const getPageIcon = () => {
    if (settingsActive) return <Settings className="w-4 h-4" />;
    const session = getCurrentSession();
    if (session) {
      return getSessionIcon(session);
    }
    return <SupervisorIcon className="w-4 h-4" />;
  };

  const getConnectionStatus = () => {
    if (connectionState === 'verified' && workstationOnline) {
      return { icon: Check, color: 'text-green-500', label: 'Connected' };
    }
    if (connectionState === 'verified' && !workstationOnline) {
      return { icon: AlertTriangle, color: 'text-orange-500', label: 'Workstation offline' };
    }
    if (connectionState === 'error' || connectionState === 'disconnected') {
      return { icon: WifiOff, color: 'text-destructive', label: 'Disconnected' };
    }
    if (connectionState === 'connecting' || connectionState === 'authenticating' || connectionState === 'authenticated') {
      return { icon: Loader2, color: 'text-yellow-500', label: 'Connecting...', spin: true };
    }
    return { icon: Wifi, color: 'text-muted-foreground', label: connectionState };
  };

  const status = getConnectionStatus();

  return (
    <>
      {/* Mobile Header */}
      <header className="md:hidden flex items-center gap-3 p-4 border-b bg-card">
        <Button variant="ghost" size="icon" onClick={() => setIsOpen(true)}>
          <Menu className="w-5 h-5" />
        </Button>
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {getPageIcon()}
          <h1 className="font-semibold truncate">{getPageTitle()}</h1>
        </div>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="icon" className="relative shrink-0">
              <status.icon className={cn('w-4 h-4', status.color, status.spin && 'animate-spin')} />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-56">
            <div className="flex items-center gap-2">
              <status.icon className={cn('w-4 h-4', status.color, status.spin && 'animate-spin')} />
              <span className="text-sm font-medium">{status.label}</span>
            </div>
            {workstationInfo && (
              <div className="mt-2 pt-2 border-t text-xs text-muted-foreground space-y-1">
                <p>Workstation: {workstationInfo.name}</p>
                <p>Version: {workstationInfo.version}</p>
              </div>
            )}
          </PopoverContent>
        </Popover>
      </header>

      {/* Mobile Drawer Overlay */}
      {isOpen && (
        <div
          className="md:hidden fixed inset-0 bg-black/50 z-40"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Mobile Drawer */}
      <div
        className={cn(
          'md:hidden fixed inset-y-0 left-0 w-full bg-card z-50 transform transition-transform duration-300',
          isOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b">
            <h1 className="font-semibold text-lg">Tiflis Code</h1>
            <Button variant="ghost" size="icon" onClick={() => setIsOpen(false)}>
              <X className="w-5 h-5" />
            </Button>
          </div>

          {/* Navigation */}
          <nav className="flex-1 overflow-auto p-2 space-y-1" aria-label="Sessions">
            {/* Supervisor */}
            <Button
              variant={supervisorActive ? 'secondary' : 'ghost'}
              className="w-full justify-start"
              onClick={() => handleNavigation(getCurrentPathBase())}
              aria-current={supervisorActive ? 'page' : undefined}
            >
              <SupervisorIcon className="w-4 h-4" aria-hidden="true" />
              <span className="ml-2">Supervisor</span>
              
            </Button>

            {/* Agent Sessions */}
            {agentSessions.length > 0 && (
              <section className="pt-4" aria-label="Agent sessions">
                <h2 className="px-2 py-1 text-xs font-medium text-muted-foreground uppercase">
                  Agent Sessions
                </h2>
                <ul role="list" className="space-y-1">
                  {agentSessions.map((session) => {
                    const subtitle = getSessionSubtitle(session);
                    const displayName = getSessionDisplayName(session);
                    return (
                      <li key={session.id}>
<Button
                           variant={selectedSessionId === session.id ? 'secondary' : 'ghost'}
                           className="w-full justify-start h-auto py-2"
                           onClick={() => handleNavigation(getSessionPath(session.id), session.id)}
                           aria-current={selectedSessionId === session.id ? 'page' : undefined}
                        >
                          <div className="relative shrink-0">
                            <span aria-hidden="true">{getSessionIcon(session)}</span>
                            <span className="absolute -bottom-0.5 -right-0.5">
                              <StatusIndicator status={session.status} />
                            </span>
                          </div>
<div className="ml-2 flex flex-col items-start min-w-0 flex-1">
                             <span className="truncate text-sm font-medium flex items-center">
                               {displayName}
                             </span>
                            {subtitle && (
                              <span className="truncate text-xs text-muted-foreground">
                                {subtitle}
                              </span>
                            )}
                          </div>
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
                <h2 className="px-2 py-1 text-xs font-medium text-muted-foreground uppercase">
                  Terminals
                </h2>
                <ul role="list" className="space-y-1">
                  {terminalSessions.map((session) => {
                    const subtitle = getSessionSubtitle(session);
                    return (
                      <li key={session.id}>
                        <Button
                          variant={selectedSessionId === session.id ? 'secondary' : 'ghost'}
                          className="w-full justify-start h-auto py-2"
                          onClick={() => handleNavigation(`/terminal/${session.id}`, session.id)}
                          aria-current={selectedSessionId === session.id ? 'page' : undefined}
                        >
                          <div className="relative shrink-0">
                            <span aria-hidden="true">{getSessionIcon(session)}</span>
                            <span className="absolute -bottom-0.5 -right-0.5">
                              <StatusIndicator status={session.status} />
                            </span>
                          </div>
                          <div className="ml-2 flex flex-col items-start min-w-0 flex-1">
                            <span className="truncate text-sm font-medium">Terminal</span>
                            {subtitle && (
                              <span className="truncate text-xs text-muted-foreground">
                                {subtitle}
                              </span>
                            )}
                          </div>
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
                <Button variant="outline" className="w-full justify-start">
                  <Plus className="w-4 h-4" aria-hidden="true" />
                  <span className="ml-2">New Session</span>
                </Button>
              </CreateSessionDialog>
            </div>
          </nav>

          {/* Footer */}
          <div className="p-2 border-t">
            <Button
              variant={settingsActive ? 'secondary' : 'ghost'}
              className="w-full justify-start"
              onClick={() => handleNavigation('/settings')}
            >
              <Settings className="w-4 h-4" />
              <span className="ml-2">Settings</span>
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
