// Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
// Licensed under the FSL-1.1-NC.

import { FC } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useAppStore } from "@/store/useAppStore";
import { useChatStore } from "@/store/useChatStore";
import type { Session } from "@/types";
import { useNavigate, useLocation } from "react-router-dom";
import {
  SupervisorIcon,
  ClaudeIcon,
  OpenCodeIcon,
  CursorIcon,
  AgentIcon as DefaultAgentIcon,
} from "@/components/icons";

interface ThreadListProps {
  className?: string;
}

export const ThreadList: FC<ThreadListProps> = ({ className }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const sessions = useAppStore((state) => state.sessions);
  const supervisorMessages = useChatStore((state) => state.supervisorMessages);
  const agentMessages = useChatStore((state) => state.agentMessages);

  // Get icon for session type
  const getSessionIcon = (session: Session | null) => {
    if (!session) {
      return <DefaultAgentIcon className="w-4 h-4" />;
    }
    switch (session.type) {
      case 'claude':
        return <ClaudeIcon className="w-4 h-4" />;
      case 'cursor':
        return <CursorIcon className="w-4 h-4" />;
      case 'opencode':
        return <OpenCodeIcon className="w-4 h-4" />;
      default:
        return <DefaultAgentIcon className="w-4 h-4" />;
    }
  };

  // Check if a thread is active
  const isActive = (sessionId: string) => {
    return location.pathname === `/assistant-ui/${sessionId}`;
  };

  const isSupervisorActive = location.pathname === "/assistant-ui";

  return (
    <div className={cn("space-y-2", className)}>
      {/* Supervisor Thread */}
      <Button
        variant={isSupervisorActive ? "secondary" : "ghost"}
        className="w-full justify-start gap-2 h-auto p-3"
        onClick={() => navigate("/assistant-ui")}
      >
        <SupervisorIcon className="w-4 h-4" />
        <div className="flex-1 text-left">
          <div className="font-medium text-sm">Supervisor</div>
          <div className="text-xs text-muted-foreground truncate">
            AI-powered session orchestrator
          </div>
          <div className="text-xs text-muted-foreground">
            {supervisorMessages.length} messages
          </div>
        </div>
      </Button>

      {/* Agent Sessions */}
      <div className="pt-2">
        <h4 className="text-xs font-medium text-muted-foreground px-3 pb-2">
          Active Sessions
        </h4>
        {sessions.length === 0 ? (
          <div className="text-xs text-muted-foreground px-3 py-2">
            No active sessions
          </div>
        ) : (
          <div className="space-y-1">
            {sessions.map((session) => (
              <Button
                key={session.id}
                variant={isActive(session.id) ? "secondary" : "ghost"}
                className="w-full justify-start gap-2 h-auto p-3"
                onClick={() => navigate(`/assistant-ui/${session.id}`)}
              >
                {getSessionIcon(session)}
                <div className="flex-1 text-left">
                  <div className="font-medium text-sm">
                    {session.agentName || session.type}
                  </div>
                  <div className="text-xs text-muted-foreground truncate">
                    {session.workspace}/{session.project}
                    {session.worktree && `--${session.worktree}`}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {agentMessages[session.id]?.length || 0} messages
                  </div>
                </div>
              </Button>
            ))}
          </div>
        )}
      </div>

      {/* New Session Link */}
      <div className="pt-2 border-t">
        <Button
          variant="ghost"
          className="w-full justify-start gap-2 h-auto p-3 text-muted-foreground"
          onClick={() => navigate("/chat")}
        >
          <div className="w-4 h-4 rounded-full bg-green-100 flex items-center justify-center text-xs text-green-600">
            +
          </div>
          <div className="flex-1 text-left">
            <div className="text-sm">
              Create new session (use original chat)
            </div>
          </div>
        </Button>
      </div>
    </div>
  );
};