// Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
// Licensed under the FSL-1.1-NC.

import { useEffect, useCallback, useRef } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { useChatStore } from '@/store/useChatStore';
import { WebSocketService } from '@/services/websocket/WebSocketService';
import { handleWebSocketMessage } from '@/services/websocket/MessageHandler';
import { CredentialStore } from '@/services/security/CredentialStore';
import { logger, devLog } from '@/utils/logger';
import type { ConnectionState, Credentials } from '@/types';
import type {
  SupervisorCommandMessage,
  SessionExecuteMessage,
  CreateSessionMessage,
  SessionSubscribeMessage,
  SessionInputMessage,
  SessionResizeMessage,
  SyncMessage,
  HistoryRequestMessage,
} from '@/types/protocol';

export function useWebSocket() {
  const isInitialized = useRef(false);
  // Track pending ACK timeouts for cleanup on unmount
  const pendingAckTimeoutsRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const setConnectionState = useAppStore((state) => state.setConnectionState);
  const setWorkstationOnline = useAppStore((state) => state.setWorkstationOnline);
  const setAuthenticated = useAppStore((state) => state.setAuthenticated);
  const setCredentials = useAppStore((state) => state.setCredentials);
  const credentials = useAppStore((state) => state.credentials);
  const connectionState = useAppStore((state) => state.connectionState);

  const addSupervisorMessage = useChatStore((state) => state.addSupervisorMessage);
  const setSupervisorIsLoading = useChatStore((state) => state.setSupervisorIsLoading);
  const addPendingAck = useChatStore((state) => state.addPendingAck);
  const setMessageSendStatus = useChatStore((state) => state.setMessageSendStatus);

  // Initialize WebSocket service
  useEffect(() => {
    if (isInitialized.current) return;
    isInitialized.current = true;

    WebSocketService.init({
      onConnectionStateChange: (state: ConnectionState) => {
        setConnectionState(state);

        if (state === 'authenticated' || state === 'verified') {
          setWorkstationOnline(true);
        } else if (state === 'disconnected' || state === 'error') {
          setWorkstationOnline(false);
        }
      },
      onMessage: handleWebSocketMessage,
      onWorkstationOnline: () => setWorkstationOnline(true),
      onWorkstationOffline: () => setWorkstationOnline(false),
    });

    // Try to restore credentials and auto-connect
    (async () => {
      const storedCredentials = await CredentialStore.getCredentials();
      if (storedCredentials) {
        setCredentials(storedCredentials);
        setAuthenticated(true);
        try {
          await WebSocketService.connect(storedCredentials);
        } catch (error) {
          logger.error('Auto-connect failed:', error);
        }
      }
    })();

    // Cleanup function to clear all pending ACK timeouts on unmount
    // Copy ref value to variable for cleanup function per React hooks rules
    const pendingTimeouts = pendingAckTimeoutsRef.current;
    return () => {
      pendingTimeouts.forEach((timeoutId) => {
        clearTimeout(timeoutId);
      });
      pendingTimeouts.clear();
    };
  }, [setConnectionState, setWorkstationOnline, setAuthenticated, setCredentials]);

  // Connect with credentials
  const connect = useCallback(
    async (creds: Omit<Credentials, 'deviceId'>) => {
      const deviceId = CredentialStore.getDeviceId();
      const fullCredentials: Credentials = { ...creds, deviceId };

      await CredentialStore.storeCredentials(creds);
      setCredentials(fullCredentials);

      try {
        await WebSocketService.connect(fullCredentials);
        setAuthenticated(true);
      } catch (error) {
        setAuthenticated(false);
        throw error;
      }
    },
    [setCredentials, setAuthenticated]
  );

  // Disconnect
  const disconnect = useCallback(() => {
    WebSocketService.disconnect();
    setAuthenticated(false);
  }, [setAuthenticated]);

  // Disconnect and forget all data
  const disconnectAndForget = useCallback(async () => {
    WebSocketService.disconnect();
    await CredentialStore.forgetAll();
    useAppStore.getState().reset();
    useChatStore.getState().reset();
  }, []);

  // Send supervisor command
  const sendSupervisorCommand = useCallback(
    async (command: string) => {
      const messageId = crypto.randomUUID();

      // Add user message to store immediately
      addSupervisorMessage({
        id: messageId,
        sessionId: 'supervisor',
        role: 'user',
        contentBlocks: [
          {
            id: crypto.randomUUID(),
            blockType: 'text',
            content: command,
          },
        ],
        isStreaming: false,
        createdAt: new Date(),
        sendStatus: 'pending',
        fromDeviceId: credentials?.deviceId,
      });

      addPendingAck(messageId);
      setSupervisorIsLoading(true);

      const message: SupervisorCommandMessage = {
        type: 'supervisor.command',
        id: messageId,
        payload: {
          command,
        },
      };

      WebSocketService.send(message);

      // Set timeout for ack with cleanup tracking
      const timeoutId = setTimeout(() => {
        pendingAckTimeoutsRef.current.delete(messageId);
        const chatStore = useChatStore.getState();
        if (chatStore.pendingMessageAcks.has(messageId)) {
          chatStore.removePendingAck(messageId);
          setMessageSendStatus(messageId, 'failed');
        }
      }, 5000);
pendingAckTimeoutsRef.current.set(messageId, timeoutId);
    },
    [credentials, connectionState]
  );

  // Send agent command
  const sendAgentCommand = useCallback(
    async (sessionId: string, content: string) => {
      const messageId = crypto.randomUUID();
      const chatStore = useChatStore.getState();

      // Add user message to store
      chatStore.addAgentMessage(sessionId, {
        id: messageId,
        sessionId,
        role: 'user',
        contentBlocks: [
          {
            id: crypto.randomUUID(),
            blockType: 'text',
            content,
          },
        ],
        isStreaming: false,
        createdAt: new Date(),
        sendStatus: 'pending',
        fromDeviceId: credentials?.deviceId,
      });

      chatStore.addPendingAck(messageId);
      chatStore.setAgentIsLoading(sessionId, true);

      const message: SessionExecuteMessage = {
        type: 'session.execute',
        id: messageId,
        session_id: sessionId,
        payload: {
          content,
        },
      };

      WebSocketService.send(message);

      // Set timeout for ack with cleanup tracking
      const timeoutId = setTimeout(() => {
        pendingAckTimeoutsRef.current.delete(messageId);
        const state = useChatStore.getState();
        if (state.pendingMessageAcks.has(messageId)) {
          state.removePendingAck(messageId);
          state.setMessageSendStatus(messageId, 'failed');
        }
      }, 5000);
      pendingAckTimeoutsRef.current.set(messageId, timeoutId);
    },
    [credentials]
  );

  // Create session
  const createSession = useCallback(
    async (
      sessionType: 'claude' | 'cursor' | 'opencode' | 'terminal',
      workspace: string,
      project: string,
      worktree?: string,
      agentName?: string
    ) => {
      const message: CreateSessionMessage = {
        type: 'supervisor.create_session',
        id: crypto.randomUUID(),
        payload: {
          session_type: sessionType,
          agent_name: agentName,
          workspace,
          project,
          worktree,
        },
      };

      return WebSocketService.sendRequest<{ payload: { session_id: string } }>(message);
    },
    []
  );

  // Subscribe to session
  const subscribeToSession = useCallback((sessionId: string) => {
    const message: SessionSubscribeMessage = {
      type: 'session.subscribe',
      session_id: sessionId,
    };

    WebSocketService.send(message);
  }, []);

  // Send terminal input
  const sendTerminalInput = useCallback((sessionId: string, data: string) => {
    const message: SessionInputMessage = {
      type: 'session.input',
      session_id: sessionId,
      payload: {
        data,
      },
    };

    WebSocketService.send(message);
  }, []);

  // Resize terminal
  const resizeTerminal = useCallback((sessionId: string, cols: number, rows: number) => {
    const message: SessionResizeMessage = {
      type: 'session.resize',
      session_id: sessionId,
      payload: {
        cols,
        rows,
      },
    };

    WebSocketService.send(message);
  }, []);

  // Cancel supervisor
  const cancelSupervisor = useCallback(() => {
    WebSocketService.send({
      type: 'supervisor.cancel',
      id: crypto.randomUUID(),
    });
    setSupervisorIsLoading(false);
  }, [setSupervisorIsLoading]);

  // Cancel agent
  const cancelAgent = useCallback((sessionId: string) => {
    WebSocketService.send({
      type: 'session.cancel',
      id: crypto.randomUUID(),
      session_id: sessionId,
    });
    useChatStore.getState().setAgentIsLoading(sessionId, false);
  }, []);

  // Send supervisor voice command
  const sendSupervisorVoiceCommand = useCallback(
    async (audioBase64: string, format: string) => {
      if (!credentials) {
        logger.error('Cannot send supervisor voice command: Not authenticated');
        return;
      }

      if (connectionState !== 'verified' && connectionState !== 'authenticated') {
        logger.error('Cannot send supervisor voice command: Not connected', { connectionState });
        return;
      }

      const messageId = crypto.randomUUID();

      devLog.voice(`Sending supervisor voice command: format=${format}, audioSize=${audioBase64.length}, messageId=${messageId}`);

      // Add user message with voice_input block
      addSupervisorMessage({
        id: messageId,
        sessionId: 'supervisor',
        role: 'user',
        contentBlocks: [
          {
            id: crypto.randomUUID(),
            blockType: 'voice_input',
            content: '',
            metadata: {
              audioBase64,
              messageId,
            },
          },
        ],
        isStreaming: false,
        createdAt: new Date(),
        sendStatus: 'pending',
        fromDeviceId: credentials?.deviceId,
      });

      // Create placeholder streaming message immediately (shows typing indicator while STT processes)
      const streamingMessageId = crypto.randomUUID();
      addSupervisorMessage({
        id: streamingMessageId,
        sessionId: 'supervisor',
        role: 'assistant',
        contentBlocks: [],
        isStreaming: true,
        createdAt: new Date(),
      });

      const chatStore = useChatStore.getState();
      chatStore.setSupervisorStreamingMessageId(streamingMessageId);

      addPendingAck(messageId);
      setSupervisorIsLoading(true);

      const message: SupervisorCommandMessage = {
        type: 'supervisor.command',
        id: messageId,
        payload: {
          audio: audioBase64,
          audio_format: format as 'm4a' | 'wav' | 'mp3' | 'webm' | 'opus',
          message_id: messageId,
        },
      };

      devLog.voice(`WebSocket sending supervisor voice:`, message);
      WebSocketService.send(message);

      // Set timeout for ack with cleanup tracking
      const timeoutId = setTimeout(() => {
        pendingAckTimeoutsRef.current.delete(messageId);
        const chatStore = useChatStore.getState();
        if (chatStore.pendingMessageAcks.has(messageId)) {
          logger.warn(`Voice message ACK timeout: ${messageId}`);
          chatStore.removePendingAck(messageId);
          setMessageSendStatus(messageId, 'failed');
        }
      }, 10000); // Longer timeout for voice (STT processing)
      pendingAckTimeoutsRef.current.set(messageId, timeoutId);
    },
    [credentials, connectionState, addSupervisorMessage, addPendingAck, setSupervisorIsLoading, setMessageSendStatus]
  );

  // Send agent voice command
  const sendAgentVoiceCommand = useCallback(
    async (sessionId: string, audioBase64: string, format: string) => {
      if (!credentials) {
        logger.error('Cannot send agent voice command: Not authenticated');
        return;
      }

      if (connectionState !== 'verified' && connectionState !== 'authenticated') {
        logger.error('Cannot send agent voice command: Not connected', { connectionState });
        return;
      }

      const messageId = crypto.randomUUID();
      const chatStore = useChatStore.getState();

      devLog.voice(`Sending agent voice command: sessionId=${sessionId}, format=${format}, audioSize=${audioBase64.length}, messageId=${messageId}`);

      // Add user message with voice_input block
      chatStore.addAgentMessage(sessionId, {
        id: messageId,
        sessionId,
        role: 'user',
        contentBlocks: [
          {
            id: crypto.randomUUID(),
            blockType: 'voice_input',
            content: '',
            metadata: {
              audioBase64,
              messageId,
            },
          },
        ],
        isStreaming: false,
        createdAt: new Date(),
        sendStatus: 'pending',
        fromDeviceId: credentials?.deviceId,
      });

      // Create placeholder streaming message immediately (shows typing indicator while STT processes)
      const streamingMessageId = crypto.randomUUID();
      chatStore.addAgentMessage(sessionId, {
        id: streamingMessageId,
        sessionId,
        role: 'assistant',
        contentBlocks: [],
        isStreaming: true,
        createdAt: new Date(),
      });
      chatStore.setAgentStreamingMessageId(sessionId, streamingMessageId);

      chatStore.addPendingAck(messageId);
      chatStore.setAgentIsLoading(sessionId, true);

      const message: SessionExecuteMessage = {
        type: 'session.execute',
        id: messageId,
        session_id: sessionId,
        payload: {
          audio: audioBase64,
          audio_format: format as 'm4a' | 'wav' | 'mp3' | 'webm' | 'opus',
          message_id: messageId,
        },
      };

      WebSocketService.send(message);

      // Set timeout for ack with cleanup tracking
      const timeoutId = setTimeout(() => {
        pendingAckTimeoutsRef.current.delete(messageId);
        const state = useChatStore.getState();
        if (state.pendingMessageAcks.has(messageId)) {
          state.removePendingAck(messageId);
          state.setMessageSendStatus(messageId, 'failed');
        }
      }, 10000); // Longer timeout for voice (STT processing)
      pendingAckTimeoutsRef.current.set(messageId, timeoutId);
    },
    [credentials, connectionState]
  );

  // Clear supervisor context
  const clearSupervisorContext = useCallback(() => {
    WebSocketService.send({
      type: 'supervisor.clear_context',
      id: crypto.randomUUID(),
    });
    useChatStore.getState().clearSupervisorMessages();
  }, []);

  const requestSync = useCallback(() => {
    const message: SyncMessage = {
      type: 'sync',
      id: crypto.randomUUID(),
    };
    WebSocketService.send(message);
  }, []);

  const requestHistory = useCallback((sessionId?: string | null, beforeSequence?: number, limit = 20) => {
    const message: HistoryRequestMessage = {
      type: 'history.request',
      id: crypto.randomUUID(),
      payload: {
        session_id: sessionId,
        before_sequence: beforeSequence,
        limit,
      },
    };
    WebSocketService.send(message);
  }, []);

  const terminateSession = useCallback((sessionId: string) => {
    WebSocketService.send({
      type: 'supervisor.terminate_session',
      id: crypto.randomUUID(),
      payload: {
        session_id: sessionId,
      },
    });
  }, []);

  return {
    connect,
    disconnect,
    disconnectAndForget,
    sendSupervisorCommand,
    sendAgentCommand,
    sendSupervisorVoiceCommand,
    sendAgentVoiceCommand,
    createSession,
    subscribeToSession,
    sendTerminalInput,
    resizeTerminal,
    cancelSupervisor,
    cancelAgent,
    clearSupervisorContext,
    terminateSession,
    requestSync,
    requestHistory,
    isConnected: WebSocketService.isConnected,
  };
}
