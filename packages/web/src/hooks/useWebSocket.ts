// Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
// Licensed under the FSL-1.1-NC.

import { useEffect, useCallback, useRef } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { useChatStore } from '@/store/useChatStore';
import { WebSocketService } from '@/services/websocket/WebSocketService';
import { handleWebSocketMessage } from '@/services/websocket/MessageHandler';
import { CredentialStore } from '@/services/security/CredentialStore';
import type { ConnectionState, Credentials } from '@/types';
import type {
  SupervisorCommandMessage,
  SessionExecuteMessage,
  CreateSessionMessage,
  SessionSubscribeMessage,
  SessionInputMessage,
  SessionResizeMessage,
  SyncMessage,
} from '@/types/protocol';

export function useWebSocket() {
  const isInitialized = useRef(false);

  const setConnectionState = useAppStore((state) => state.setConnectionState);
  const setWorkstationOnline = useAppStore((state) => state.setWorkstationOnline);
  const setAuthenticated = useAppStore((state) => state.setAuthenticated);
  const setCredentials = useAppStore((state) => state.setCredentials);
  const credentials = useAppStore((state) => state.credentials);

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
          console.error('Auto-connect failed:', error);
        }
      }
    })();
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

      // Set timeout for ack
      setTimeout(() => {
        const chatStore = useChatStore.getState();
        if (chatStore.pendingMessageAcks.has(messageId)) {
          chatStore.removePendingAck(messageId);
          setMessageSendStatus(messageId, 'failed');
        }
      }, 5000);
    },
    [credentials, addSupervisorMessage, addPendingAck, setSupervisorIsLoading, setMessageSendStatus]
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

      // Set timeout for ack
      setTimeout(() => {
        const state = useChatStore.getState();
        if (state.pendingMessageAcks.has(messageId)) {
          state.removePendingAck(messageId);
          state.setMessageSendStatus(messageId, 'failed');
        }
      }, 5000);
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
      const messageId = crypto.randomUUID();

      console.log(`🎤 Sending supervisor voice command: format=${format}, audioSize=${audioBase64.length}, messageId=${messageId}`);

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

      addPendingAck(messageId);
      setSupervisorIsLoading(true);

      const message: SupervisorCommandMessage = {
        type: 'supervisor.command',
        id: messageId,
        payload: {
          audio: audioBase64,
          audio_format: format as 'm4a' | 'wav' | 'mp3' | 'webm',
          message_id: messageId,
        },
      };

      console.log(`🎤 WebSocket sending supervisor voice:`, message);
      WebSocketService.send(message);

      // Set timeout for ack
      setTimeout(() => {
        const chatStore = useChatStore.getState();
        if (chatStore.pendingMessageAcks.has(messageId)) {
          console.warn(`🎤 Voice message ACK timeout: ${messageId}`);
          chatStore.removePendingAck(messageId);
          setMessageSendStatus(messageId, 'failed');
        }
      }, 10000); // Longer timeout for voice (STT processing)
    },
    [credentials, addSupervisorMessage, addPendingAck, setSupervisorIsLoading, setMessageSendStatus]
  );

  // Send agent voice command
  const sendAgentVoiceCommand = useCallback(
    async (sessionId: string, audioBase64: string, format: string) => {
      const messageId = crypto.randomUUID();
      const chatStore = useChatStore.getState();

      console.log(`🎤 Sending agent voice command: sessionId=${sessionId}, format=${format}, audioSize=${audioBase64.length}, messageId=${messageId}`);

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

      chatStore.addPendingAck(messageId);
      chatStore.setAgentIsLoading(sessionId, true);

      const message: SessionExecuteMessage = {
        type: 'session.execute',
        id: messageId,
        session_id: sessionId,
        payload: {
          audio: audioBase64,
          audio_format: format as 'm4a' | 'wav' | 'mp3' | 'webm',
          message_id: messageId,
        },
      };

      WebSocketService.send(message);

      // Set timeout for ack
      setTimeout(() => {
        const state = useChatStore.getState();
        if (state.pendingMessageAcks.has(messageId)) {
          state.removePendingAck(messageId);
          state.setMessageSendStatus(messageId, 'failed');
        }
      }, 10000); // Longer timeout for voice (STT processing)
    },
    [credentials]
  );

  // Clear supervisor context
  const clearSupervisorContext = useCallback(() => {
    WebSocketService.send({
      type: 'supervisor.clear_context',
      id: crypto.randomUUID(),
    });
    useChatStore.getState().clearSupervisorMessages();
  }, []);

  // Request sync state (lightweight - only agents and workspaces)
  const requestSync = useCallback(() => {
    const message: SyncMessage = {
      type: 'sync',
      id: crypto.randomUUID(),
      lightweight: true,
    };
    WebSocketService.send(message);
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
    requestSync,
    isConnected: WebSocketService.isConnected,
  };
}
