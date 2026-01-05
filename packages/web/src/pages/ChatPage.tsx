// Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
// Licensed under the FSL-1.1-NC.

import { useParams } from 'react-router-dom';
import { useCallback, useEffect, useRef } from 'react';
import { ChatView } from '@/components/chat';
import { useChatStore } from '@/store/useChatStore';
import { useAppStore } from '@/store/useAppStore';
import { useWebSocket } from '@/hooks/useWebSocket';
import { toastFunctions as toast } from '@/components/ui/toast';
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

  const subscribedSessionsRef = useRef<Set<string>>(new Set());

  const credentials = useAppStore((state) => state.credentials);
  const connectionState = useAppStore((state) => state.connectionState);
  const sessions = useAppStore((state) => state.sessions);

  const supervisorMessages = useChatStore((state) => state.supervisorMessages);
  const supervisorIsLoading = useChatStore((state) => state.supervisorIsLoading);
  const historyPaginationState = useChatStore((state) => state.historyPaginationState);

  const agentMessages = useChatStore((state) => state.agentMessages);
  const agentIsLoading = useChatStore((state) => state.agentIsLoading);

  const {
    sendSupervisorCommand,
    cancelSupervisor,
    sendAgentCommand,
    cancelAgent,
    subscribeToSession,
    sendSupervisorVoiceCommand,
    sendAgentVoiceCommand,
    requestHistory,
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
      console.log('🎤 handleSupervisorAudio called:', { 
        audioBlobSize: audioBlob.size, 
        format, 
        isConnected 
      });
      
      if (!isConnected) {
        console.error('❌ Not connected to WebSocket');
        toast.error('Connection Error', 'Not connected to Tiflis. Please check your connection.');
        return;
      }

      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result as string;
        const base64 = result.split(',')[1];
        console.log('🎤 Converting to base64:', { 
          originalSize: result.length, 
          base64Size: base64?.length 
        });
        
        if (base64) {
          try {
            sendSupervisorVoiceCommand(base64, format);
            console.log('✅ Voice command sent successfully');
          } catch (error) {
            console.error('❌ Failed to send voice command:', error);
            toast.error('Voice Message Error', 'Failed to send voice message. Please try again.');
          }
        } else {
          console.error('❌ Failed to convert audio to base64');
          toast.error('Voice Message Error', 'Failed to process audio. Please try recording again.');
        }
      };
      reader.onerror = (error) => {
        console.error('❌ FileReader error:', error);
        toast.error('Voice Message Error', 'Failed to read audio file. Please try again.');
      };
      reader.readAsDataURL(audioBlob);
    },
    [sendSupervisorVoiceCommand, isConnected]
  );

  const handleAgentAudio = useCallback(
    async (audioBlob: Blob, format: string) => {
      console.log('🎤 handleAgentAudio called:', { 
        sessionId, 
        audioBlobSize: audioBlob.size, 
        format, 
        isConnected 
      });
      
      if (!sessionId) {
        console.error('❌ No session ID provided');
        toast.error('Voice Message Error', 'No session active. Please select a session first.');
        return;
      }
      
      if (!isConnected) {
        console.error('❌ Not connected to WebSocket');
        toast.error('Connection Error', 'Not connected to Tiflis. Please check your connection.');
        return;
      }

      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result as string;
        const base64 = result.split(',')[1];
        console.log('🎤 Converting to base64:', { 
          originalSize: result.length, 
          base64Size: base64?.length 
        });
        
        if (base64) {
          try {
            sendAgentVoiceCommand(sessionId, base64, format);
            console.log('✅ Voice command sent successfully');
          } catch (error) {
            console.error('❌ Failed to send voice command:', error);
            toast.error('Voice Message Error', 'Failed to send voice message. Please try again.');
          }
        } else {
          console.error('❌ Failed to convert audio to base64');
          toast.error('Voice Message Error', 'Failed to process audio. Please try recording again.');
        }
      };
      reader.onerror = (error) => {
        console.error('❌ FileReader error:', error);
        toast.error('Voice Message Error', 'Failed to read audio file. Please try again.');
      };
      reader.readAsDataURL(audioBlob);
    },
    [sessionId, sendAgentVoiceCommand, isConnected]
  );

  // Load more history handlers
  const handleSupervisorLoadMore = useCallback(() => {
    const paginationState = historyPaginationState['supervisor'];
    if (paginationState?.hasMore && !paginationState?.isLoading && paginationState?.oldestSequence) {
      requestHistory(null, paginationState.oldestSequence);
    }
  }, [historyPaginationState, requestHistory]);

  const handleAgentLoadMore = useCallback(() => {
    if (!sessionId) return;
    const paginationState = historyPaginationState[sessionId];
    if (paginationState?.hasMore && !paginationState?.isLoading && paginationState?.oldestSequence) {
      requestHistory(sessionId, paginationState.oldestSequence);
    }
  }, [sessionId, historyPaginationState, requestHistory]);

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

  if (isSupervisor) {
    const supervisorPagination = historyPaginationState['supervisor'];
    const isHistoryLoading = supervisorPagination?.isLoading ?? false;
    const hasMore = supervisorPagination?.hasMore ?? false;
    return (
      <ChatView
        messages={supervisorMessages}
        isLoading={supervisorIsLoading}
        isSubscribing={isHistoryLoading && supervisorMessages.length === 0}
        onSend={handleSupervisorSend}
        onSendAudio={handleSupervisorAudio}
        onCancel={handleSupervisorCancel}
        currentDeviceId={credentials?.deviceId}
        disabled={!isConnected}
        emptyMessage="Hello! I'm your AI assistant. Ask me to create sessions, manage your workspace, or help with tasks."
        emptyIcon={<SupervisorIcon className="w-8 h-8 text-muted-foreground" />}
        agentType="supervisor"
        hasMore={hasMore}
        isLoadingMore={isHistoryLoading && supervisorMessages.length > 0}
        onLoadMore={handleSupervisorLoadMore}
      />
    );
  }

  // Render Agent chat
  const messages = agentMessages[sessionId] ?? [];
  const isLoading = agentIsLoading[sessionId] ?? false;
  const agentPagination = historyPaginationState[sessionId];
  const isHistoryLoading = agentPagination?.isLoading ?? false;
  const hasMore = agentPagination?.hasMore ?? false;

  return (
    <ChatView
      messages={messages}
      isLoading={isLoading}
      isSubscribing={isHistoryLoading && messages.length === 0}
      onSend={handleAgentSend}
      onSendAudio={handleAgentAudio}
      onCancel={handleAgentCancel}
      currentDeviceId={credentials?.deviceId}
      disabled={!isConnected}
      emptyMessage={`Start a conversation with ${session?.agentName ?? 'the agent'}...`}
      emptyIcon={getSessionIcon(session ?? null)}
      agentType={session?.type as 'supervisor' | 'claude' | 'cursor' | 'opencode' | 'terminal' | 'backlog-agent' | undefined}
      hasMore={hasMore}
      isLoadingMore={isHistoryLoading && messages.length > 0}
      onLoadMore={handleAgentLoadMore}
    />
  );
}
