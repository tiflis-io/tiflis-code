// Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
// Licensed under the FSL-1.1-NC.

import { useParams } from 'react-router-dom';
import { useEffect, useRef, type ReactNode } from 'react';
import { Thread } from '@/components/assistant-ui/thread';
import { ThreadList } from '@/components/assistant-ui/thread-list';
import { useChatStore } from '@/store/useChatStore';
import { useAppStore } from '@/store/useAppStore';
import { useWebSocket } from '@/hooks/useWebSocket';
import {
  SupervisorIcon,
  ClaudeIcon,
  OpenCodeIcon,
  CursorIcon,
  AgentIcon as DefaultAgentIcon,
} from '@/components/icons';
import type { Session } from '@/types';

interface ChatViewProps {
  messages: unknown[];
  isLoading: boolean;
  isSubscribing?: boolean;
  onSend: (text: string) => void;
  onSendAudio?: (audioBlob: Blob, format: string) => void;
  onCancel?: () => void;
  title: string;
  subtitle?: string;
  currentDeviceId?: string;
  disabled?: boolean;
  emptyMessage?: string;
  showVoice?: boolean;
  emptyIcon?: ReactNode;
}

// Assistant UI Chat View Component
function ChatViewWithAssistantUI({
  disabled = false,
}: ChatViewProps) {
  const { sessionId } = useParams<{ sessionId?: string }>();
  const isSupervisor = !sessionId;

  return (
    <div className="flex h-full">
      {/* Thread List Sidebar - only show if connected */}
      {!disabled && (
        <aside className="hidden md:flex w-64 flex-col border-r bg-card">
          <div className="p-4">
            <h2 className="text-lg font-semibold mb-2">Sessions</h2>
            <ThreadList />
          </div>
        </aside>
      )}
      
      {/* Main Chat Thread */}
      <div className="flex-1 flex flex-col">
        <Thread 
          sessionId={isSupervisor ? 'supervisor' : sessionId || 'unknown'}
          isSupervisor={isSupervisor}
        />
      </div>
    </div>
  );
}

export function ChatPageWithAssistantUI() {
  const { sessionId } = useParams<{ sessionId?: string }>();
  const isSupervisor = !sessionId;

  // Track subscribed sessions to avoid re-subscribing
  const subscribedSessionsRef = useRef<Set<string>>(new Set());

  // Get state
  const credentials = useAppStore((state) => state.credentials);
  const connectionState = useAppStore((state) => state.connectionState);
  const sessions = useAppStore((state) => state.sessions);

  // Supervisor state
  const supervisorMessages = useChatStore((state) => state.supervisorMessages);
  const supervisorIsLoading = useChatStore((state) => state.supervisorIsLoading);

  // Agent state
  const agentMessages = useChatStore((state) => state.agentMessages);
  const agentIsLoading = useChatStore((state) => state.agentIsLoading);

  // Actions
  const {
    sendSupervisorCommand,
    cancelSupervisor,
    sendAgentCommand,
    cancelAgent,
    subscribeToSession,
    sendSupervisorVoiceCommand,
    sendAgentVoiceCommand,
  } = useWebSocket();

  const isConnected = connectionState === 'verified' || connectionState === 'authenticated';

  // Subscribe to agent session when opening it
  useEffect(() => {
    if (!sessionId || isSupervisor || !isConnected) return;

    // Skip if already subscribed to this session
    if (subscribedSessionsRef.current.has(sessionId)) return;

    // Find session to check if it's a terminal (terminals are handled separately)
    const session = sessions.find((s) => s.id === sessionId);
    if (session?.type === 'terminal') return;

    // Subscribe to get history
    subscribedSessionsRef.current.add(sessionId);
    subscribeToSession(sessionId);
  }, [sessionId, isSupervisor, isConnected, sessions, subscribeToSession]);

  // Get session info
  const session = sessionId ? sessions.find((s) => s.id === sessionId) : null;

  // Get icon for session type
  const getSessionIcon = (session: Session | null) => {
    if (!session) {
      return <DefaultAgentIcon className="w-8 h-8 text-muted-foreground" />;
    }
    switch (session.type) {
      case 'claude':
        return <ClaudeIcon className="w-8 h-8 text-muted-foreground" />;
      case 'cursor':
        return <CursorIcon className="w-8 h-8 text-muted-foreground" />;
      case 'opencode':
        return <OpenCodeIcon className="w-8 h-8 text-muted-foreground" />;
      default:
        return <DefaultAgentIcon className="w-8 h-8 text-muted-foreground" />;
    }
  };

  // For now, redirect to the assistant implementation
  return (
    <ChatViewWithAssistantUI
      messages={isSupervisor ? supervisorMessages : agentMessages[sessionId] ?? []}
      isLoading={isSupervisor ? supervisorIsLoading : agentIsLoading[sessionId] ?? false}
      onSend={isSupervisor ? sendSupervisorCommand : (text) => sessionId && sendAgentCommand(sessionId, text)}
      onSendAudio={(audioBlob, format) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const result = reader.result as string;
          const base64 = result.split(',')[1];
          if (base64) {
            if (isSupervisor) {
              sendSupervisorVoiceCommand(base64, format);
            } else if (sessionId) {
              sendAgentVoiceCommand(sessionId, base64, format);
            }
          }
        };
        reader.readAsDataURL(audioBlob);
      }}
      onCancel={isSupervisor ? cancelSupervisor : () => sessionId && cancelAgent(sessionId)}
      title={isSupervisor ? "Supervisor" : (session?.agentName ?? session?.type ?? sessionId)}
      subtitle={isSupervisor ? "AI-powered session orchestrator" : 
        session ? `${session.workspace ?? ''}/${session.project ?? ''}${session.worktree ? `--${session.worktree}` : ''}` : undefined}
      currentDeviceId={credentials?.deviceId}
      disabled={!isConnected}
      emptyMessage={isSupervisor ? 
        "Hello! I'm your AI assistant. Ask me to create sessions, manage your workspace, or help with tasks." :
        `Start a conversation with ${session?.agentName ?? 'the agent'}...`
      }
      emptyIcon={isSupervisor ? <SupervisorIcon className="w-8 h-8 text-muted-foreground" /> : getSessionIcon(session ?? null)}
    />
  );
}

// Export the new chat page as default
export default ChatPageWithAssistantUI;