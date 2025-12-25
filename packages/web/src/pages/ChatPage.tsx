// Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
// Licensed under the FSL-1.1-NC.

import { useParams } from 'react-router-dom';
import { useCallback, useEffect, useRef } from 'react';
import { ChatView } from '@/components/chat';
import { useChatStore } from '@/store/useChatStore';
import { useAppStore } from '@/store/useAppStore';
import { useWebSocket } from '@/hooks/useWebSocket';
import {
  SupervisorIcon,
  ClaudeIcon,
  OpenCodeIcon,
  CursorIcon,
  AgentIcon,
} from '@/components/icons';
import type { Session } from '@/types';

export function ChatPage() {
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

  // Handlers
  const handleSupervisorSend = useCallback(
    (text: string) => {
      sendSupervisorCommand(text);
    },
    [sendSupervisorCommand]
  );

  const handleAgentSend = useCallback(
    (text: string) => {
      if (sessionId) {
        sendAgentCommand(sessionId, text);
      }
    },
    [sessionId, sendAgentCommand]
  );

  const handleSupervisorCancel = useCallback(() => {
    cancelSupervisor();
  }, [cancelSupervisor]);

  const handleAgentCancel = useCallback(() => {
    if (sessionId) {
      cancelAgent(sessionId);
    }
  }, [sessionId, cancelAgent]);

  // Voice command handlers
  const handleSupervisorAudio = useCallback(
    async (audioBlob: Blob, format: string) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result as string;
        const base64 = result.split(',')[1];
        if (base64) {
          sendSupervisorVoiceCommand(base64, format);
        }
      };
      reader.readAsDataURL(audioBlob);
    },
    [sendSupervisorVoiceCommand]
  );

  const handleAgentAudio = useCallback(
    async (audioBlob: Blob, format: string) => {
      if (!sessionId) return;
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result as string;
        const base64 = result.split(',')[1];
        if (base64) {
          sendAgentVoiceCommand(sessionId, base64, format);
        }
      };
      reader.readAsDataURL(audioBlob);
    },
    [sessionId, sendAgentVoiceCommand]
  );

  // Get icon for session type
  const getSessionIcon = (session: Session | null) => {
    if (!session) {
      return <AgentIcon className="w-8 h-8 text-muted-foreground" />;
    }
    switch (session.type) {
      case 'claude':
        return <ClaudeIcon className="w-8 h-8 text-muted-foreground" />;
      case 'cursor':
        return <CursorIcon className="w-8 h-8 text-muted-foreground" />;
      case 'opencode':
        return <OpenCodeIcon className="w-8 h-8 text-muted-foreground" />;
      default:
        return <AgentIcon className="w-8 h-8 text-muted-foreground" />;
    }
  };

  // Render Supervisor chat
  if (isSupervisor) {
    return (
      <ChatView
        messages={supervisorMessages}
        isLoading={supervisorIsLoading}
        onSend={handleSupervisorSend}
        onSendAudio={handleSupervisorAudio}
        onCancel={handleSupervisorCancel}
        title="Supervisor"
        subtitle="AI-powered session orchestrator"
        currentDeviceId={credentials?.deviceId}
        disabled={!isConnected}
        emptyMessage="Hello! I'm your AI assistant. Ask me to create sessions, manage your workspace, or help with tasks."
        emptyIcon={<SupervisorIcon className="w-8 h-8 text-muted-foreground" />}
      />
    );
  }

  // Render Agent chat
  const messages = agentMessages[sessionId] ?? [];
  const isLoading = agentIsLoading[sessionId] ?? false;

  const title = session
    ? session.agentName ?? session.type
    : sessionId;
  const subtitle = session
    ? `${session.workspace ?? ''}/${session.project ?? ''}${session.worktree ? `--${session.worktree}` : ''}`
    : undefined;

  return (
    <ChatView
      messages={messages}
      isLoading={isLoading}
      onSend={handleAgentSend}
      onSendAudio={handleAgentAudio}
      onCancel={handleAgentCancel}
      title={title}
      subtitle={subtitle}
      currentDeviceId={credentials?.deviceId}
      disabled={!isConnected}
      emptyMessage={`Start a conversation with ${session?.agentName ?? 'the agent'}...`}
      emptyIcon={getSessionIcon(session ?? null)}
    />
  );
}
