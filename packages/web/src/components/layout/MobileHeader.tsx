// Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
// Licensed under the FSL-1.1-NC.

import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useAppStore } from '@/store/useAppStore';
import { cn } from '@/lib/utils';
import {
  Menu,
  X,
  MessageSquare,
  Terminal,
  Settings,
  Plus,
  Bot,
} from 'lucide-react';
import type { Session } from '@/types';

export function MobileHeader() {
  const [isOpen, setIsOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const sessions = useAppStore((state) => state.sessions);
  const selectedSessionId = useAppStore((state) => state.selectedSessionId);
  const selectSession = useAppStore((state) => state.selectSession);

  const supervisorActive = location.pathname === '/chat' && !selectedSessionId;
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

  const getSessionIcon = (session: Session) => {
    switch (session.type) {
      case 'terminal':
        return <Terminal className="w-4 h-4" />;
      case 'claude':
      case 'cursor':
      case 'opencode':
        return <Bot className="w-4 h-4" />;
      default:
        return <MessageSquare className="w-4 h-4" />;
    }
  };

  const getSessionLabel = (session: Session) => {
    if (session.agentName) {
      return session.agentName;
    }
    return session.type.charAt(0).toUpperCase() + session.type.slice(1);
  };

  const getPageTitle = () => {
    if (settingsActive) return 'Settings';
    if (selectedSessionId) {
      const session = sessions.find((s) => s.id === selectedSessionId);
      if (session) {
        return session.type === 'terminal' ? 'Terminal' : getSessionLabel(session);
      }
    }
    return 'Supervisor';
  };

  return (
    <>
      {/* Mobile Header */}
      <header className="md:hidden flex items-center justify-between p-4 border-b bg-card">
        <Button variant="ghost" size="icon" onClick={() => setIsOpen(true)}>
          <Menu className="w-5 h-5" />
        </Button>
        <h1 className="font-semibold">{getPageTitle()}</h1>
        <div className="w-10" /> {/* Spacer for centering */}
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
          'md:hidden fixed inset-y-0 left-0 w-72 bg-card border-r z-50 transform transition-transform duration-300',
          isOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="p-4 border-b flex items-center justify-between">
            <h1 className="font-semibold text-lg">Tiflis Code</h1>
            <Button variant="ghost" size="icon" onClick={() => setIsOpen(false)}>
              <X className="w-4 h-4" />
            </Button>
          </div>

          {/* Navigation */}
          <div className="flex-1 overflow-auto p-2 space-y-1">
            {/* Supervisor */}
            <Button
              variant={supervisorActive ? 'secondary' : 'ghost'}
              className="w-full justify-start"
              onClick={() => handleNavigation('/chat')}
            >
              <MessageSquare className="w-4 h-4" />
              <span className="ml-2">Supervisor</span>
            </Button>

            {/* Agent Sessions */}
            {agentSessions.length > 0 && (
              <div className="pt-4">
                <p className="px-2 py-1 text-xs font-medium text-muted-foreground uppercase">
                  Agent Sessions
                </p>
                {agentSessions.map((session) => (
                  <Button
                    key={session.id}
                    variant={selectedSessionId === session.id ? 'secondary' : 'ghost'}
                    className="w-full justify-start"
                    onClick={() =>
                      handleNavigation(`/chat/${session.id}`, session.id)
                    }
                  >
                    {getSessionIcon(session)}
                    <span className="ml-2 truncate">{getSessionLabel(session)}</span>
                  </Button>
                ))}
              </div>
            )}

            {/* Terminal Sessions */}
            {terminalSessions.length > 0 && (
              <div className="pt-4">
                <p className="px-2 py-1 text-xs font-medium text-muted-foreground uppercase">
                  Terminals
                </p>
                {terminalSessions.map((session) => (
                  <Button
                    key={session.id}
                    variant={selectedSessionId === session.id ? 'secondary' : 'ghost'}
                    className="w-full justify-start"
                    onClick={() =>
                      handleNavigation(`/terminal/${session.id}`, session.id)
                    }
                  >
                    {getSessionIcon(session)}
                    <span className="ml-2 truncate">Terminal</span>
                  </Button>
                ))}
              </div>
            )}

            {/* New Session Button */}
            <div className="pt-4">
              <Button variant="outline" className="w-full justify-start" disabled>
                <Plus className="w-4 h-4" />
                <span className="ml-2">New Session</span>
              </Button>
            </div>
          </div>

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
