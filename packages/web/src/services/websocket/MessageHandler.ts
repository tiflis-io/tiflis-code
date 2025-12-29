// Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
// Licensed under the FSL-1.1-NC.

import { useAppStore } from '@/store/useAppStore';
import { useChatStore } from '@/store/useChatStore';
import { useSettingsStore } from '@/store/useSettingsStore';
import { AudioPlayerService } from '@/services/audio';
import { WebSocketService } from '@/services/websocket/WebSocketService';
import { logger, devLog } from '@/utils/logger';
import type {
  SyncStateMessage,
  SessionCreatedMessage,
  SessionSubscribedMessage,
  SupervisorOutputMessage,
  SupervisorUserMessage,
  SessionOutputMessage,
  MessageAckMessage,
  ServerContentBlock,
  AuthSuccessMessage,
  SupervisorVoiceOutputMessage,
  SessionVoiceOutputMessage,
  SupervisorTranscriptionMessage,
  SessionTranscriptionMessage,
  HistoryResponseMessage,
} from '@/types/protocol';
import type { Session, Message, ContentBlock, AgentConfig, WorkspaceConfig, SessionType } from '@/types';

/**
 * Parse raw content blocks from server format to client format
 */
function parseContentBlocks(blocks: ServerContentBlock[]): ContentBlock[] {
  // Log voice blocks for debugging
  const voiceBlocks = blocks.filter((b) => b.block_type === 'voice_output' || b.block_type === 'voice_input');
  if (voiceBlocks.length > 0) {
    devLog.audio('parseContentBlocks - voice blocks from server:', voiceBlocks);
  }

  return blocks.map((block) => ({
    id: block.id,
    blockType: block.block_type as ContentBlock['blockType'],
    content: block.content,
    metadata: block.metadata
      ? {
          language: block.metadata.language as string | undefined,
          toolName: block.metadata.tool_name as string | undefined,
          toolUseId: block.metadata.tool_use_id as string | undefined,
          toolInput: block.metadata.tool_input as string | undefined,
          toolOutput: block.metadata.tool_output as string | undefined,
          toolStatus: block.metadata.tool_status as 'running' | 'completed' | 'failed' | undefined,
          audioUrl: block.metadata.audio_url as string | undefined,
          audioBase64: block.metadata.audio_base64 as string | undefined,
          messageId: block.metadata.message_id as string | undefined,
          duration: block.metadata.duration as number | undefined,
          hasAudio: block.metadata.has_audio as boolean | undefined,
          errorCode: block.metadata.error_code as string | undefined,
        }
      : undefined,
  }));
}

/**
 * Handle incoming WebSocket messages and update stores
 */
export function handleWebSocketMessage(message: unknown): void {
  const msg = message as { type: string; id?: string; session_id?: string; payload?: unknown };

  switch (msg.type) {
    case 'auth.success':
      handleAuthSuccess(msg as AuthSuccessMessage);
      break;

    case 'sync.state':
      handleSyncState(msg as SyncStateMessage);
      break;

    case 'history.response':
      handleHistoryResponse(msg as HistoryResponseMessage);
      break;

    case 'session.created':
      handleSessionCreated(msg as SessionCreatedMessage);
      break;

    case 'session.terminated':
      handleSessionTerminated(msg as { session_id: string });
      break;

    case 'session.subscribed':
      handleSessionSubscribed(msg as SessionSubscribedMessage);
      break;

    case 'supervisor.output':
      handleSupervisorOutput(msg as SupervisorOutputMessage);
      break;

    case 'supervisor.user_message':
      handleSupervisorUserMessage(msg as SupervisorUserMessage);
      break;

    case 'supervisor.context_cleared':
      handleSupervisorContextCleared();
      break;

    case 'session.output':
      handleSessionOutput(msg as SessionOutputMessage);
      break;

    case 'session.user_message':
      handleSessionUserMessage(msg as { session_id: string; payload: { content: string; from_device_id: string } });
      break;

    case 'message.ack':
      handleMessageAck(msg as MessageAckMessage);
      break;

    case 'supervisor.voice_output':
      handleSupervisorVoiceOutput(msg as SupervisorVoiceOutputMessage);
      break;

    case 'session.voice_output':
      handleSessionVoiceOutput(msg as SessionVoiceOutputMessage);
      break;

    case 'supervisor.transcription':
      handleSupervisorTranscription(msg as SupervisorTranscriptionMessage);
      break;

    case 'session.transcription':
      handleSessionTranscription(msg as SessionTranscriptionMessage);
      break;

    case 'response':
      // Responses to requests are handled in WebSocketService
      break;

    case 'error':
      logger.error('Server error:', msg.payload);
      break;

    default:
      logger.log('Unhandled message type:', msg.type);
  }
}

function handleAuthSuccess(msg: AuthSuccessMessage): void {
  const appStore = useAppStore.getState();

  // Store workstation info including workspacesRoot
  appStore.setWorkstationInfo({
    name: msg.payload.workstation_name ?? 'Unknown',
    version: msg.payload.workstation_version ?? '',
    protocolVersion: msg.payload.protocol_version ?? '',
    workspacesRoot: msg.payload.workspaces_root ?? '',
  });
}

function handleSyncState(msg: SyncStateMessage): void {
  const appStore = useAppStore.getState();
  const chatStore = useChatStore.getState();

  // Parse sessions
  const sessions: Session[] = msg.payload.sessions.map((s) => ({
    id: s.session_id,
    type: s.session_type,
    status: s.status,
    agentName: s.agent_name,
    workspace: s.workspace,
    project: s.project,
    worktree: s.worktree,
    workingDir: s.working_dir,
    createdAt: new Date(),
  }));

  appStore.setSessions(sessions);

  // Parse available agents
  if (msg.payload.availableAgents) {
    const agents: AgentConfig[] = msg.payload.availableAgents.map((a) => ({
      name: a.name,
      baseType: a.base_type as SessionType,
      displayName: a.name.charAt(0).toUpperCase() + a.name.slice(1),
      description: a.description,
      isAlias: a.is_alias,
    }));
    appStore.setAvailableAgents(agents);
  }

  // Parse workspaces
  if (msg.payload.workspaces) {
    const workspaces: WorkspaceConfig[] = msg.payload.workspaces.map((ws) => ({
      name: ws.name,
      projects: ws.projects.map((p) => ({
        name: p.name,
        isGitRepo: p.is_git_repo,
        defaultBranch: p.default_branch,
      })),
    }));
    appStore.setWorkspaces(workspaces);
  }

  chatStore.setHistoryPaginationState('supervisor', {
    oldestSequence: undefined,
    hasMore: true,
    isLoading: true,
  });

  logger.log('Sending supervisor history.request');
  WebSocketService.send({
    type: 'history.request',
    id: crypto.randomUUID(),
    payload: {
      session_id: null,
      limit: 50,
    },
  });
}

function handleHistoryResponse(msg: HistoryResponseMessage): void {
  const chatStore = useChatStore.getState();
  const { session_id, history, has_more, oldest_sequence, is_executing, current_streaming_blocks } = msg.payload;
  
  logger.log('history.response received:', { session_id, historyCount: history?.length ?? 0, has_more, oldest_sequence });
  
  const sessionKey = session_id ?? 'supervisor';
  
  chatStore.setHistoryPaginationState(sessionKey, {
    oldestSequence: oldest_sequence,
    hasMore: has_more,
    isLoading: false,
  });

  if (history.length === 0) {
    return;
  }

  const sortedHistory = [...history].sort((a, b) => a.sequence - b.sequence);

  const messages: Message[] = sortedHistory.map((entry) => ({
    id: crypto.randomUUID(),
    sessionId: sessionKey,
    role: entry.role,
    contentBlocks: entry.content_blocks
      ? parseContentBlocks(entry.content_blocks)
      : [{ id: crypto.randomUUID(), blockType: 'text' as const, content: entry.content }],
    isStreaming: false,
    createdAt: new Date(entry.createdAt),
  }));

  if (session_id === null) {
    chatStore.prependSupervisorMessages(messages);
    if (is_executing) {
      chatStore.setSupervisorIsLoading(true);
    }
    if (current_streaming_blocks && current_streaming_blocks.length > 0) {
      const streamingMessage: Message = {
        id: crypto.randomUUID(),
        sessionId: 'supervisor',
        role: 'assistant',
        contentBlocks: parseContentBlocks(current_streaming_blocks),
        isStreaming: true,
        createdAt: new Date(),
      };
      chatStore.addSupervisorMessage(streamingMessage);
      chatStore.setSupervisorStreamingMessageId(streamingMessage.id);
      chatStore.setSupervisorIsLoading(true);
    }
  } else {
    chatStore.prependAgentMessages(session_id, messages);
    if (is_executing) {
      chatStore.setAgentIsLoading(session_id, true);
    }
    if (current_streaming_blocks && current_streaming_blocks.length > 0) {
      const streamingMessage: Message = {
        id: crypto.randomUUID(),
        sessionId: session_id,
        role: 'assistant',
        contentBlocks: parseContentBlocks(current_streaming_blocks),
        isStreaming: true,
        createdAt: new Date(),
      };
      chatStore.addAgentMessage(session_id, streamingMessage);
      chatStore.setAgentStreamingMessageId(session_id, streamingMessage.id);
      chatStore.setAgentIsLoading(session_id, true);
    }
  }
}

function handleSessionCreated(msg: SessionCreatedMessage): void {
  const appStore = useAppStore.getState();

  const session: Session = {
    id: msg.session_id,
    type: msg.payload.session_type,
    status: 'active',
    agentName: msg.payload.agent_name,
    workspace: msg.payload.workspace,
    project: msg.payload.project,
    worktree: msg.payload.worktree,
    workingDir: msg.payload.working_dir,
    createdAt: new Date(),
    terminalConfig: msg.payload.terminal_config
      ? {
          cols: 80,
          rows: 24,
          bufferSize: msg.payload.terminal_config.buffer_size,
        }
      : undefined,
  };

  appStore.addSession(session);
}

function handleSessionSubscribed(msg: SessionSubscribedMessage): void {
  const chatStore = useChatStore.getState();
  const sessionId = msg.session_id;

  const appStore = useAppStore.getState();
  const session = appStore.sessions.find((s) => s.id === sessionId);
  if (session?.type === 'terminal') {
    return;
  }

  if (msg.is_executing) {
    chatStore.setAgentIsLoading(sessionId, true);
  }

  chatStore.setHistoryPaginationState(sessionId, {
    oldestSequence: undefined,
    hasMore: true,
    isLoading: true,
  });

  logger.log('Sending agent history.request', { sessionId });
  WebSocketService.send({
    type: 'history.request',
    id: crypto.randomUUID(),
    payload: {
      session_id: sessionId,
      limit: 50,
    },
  });

  if (msg.current_streaming_blocks && msg.current_streaming_blocks.length > 0) {
    const streamingMessage: Message = {
      id: crypto.randomUUID(),
      sessionId,
      role: 'assistant',
      contentBlocks: parseContentBlocks(msg.current_streaming_blocks),
      isStreaming: true,
      createdAt: new Date(),
    };
    chatStore.addAgentMessage(sessionId, streamingMessage);
    chatStore.setAgentStreamingMessageId(sessionId, streamingMessage.id);
    chatStore.setAgentIsLoading(sessionId, true);
  }
}

function handleSessionTerminated(msg: { session_id: string }): void {
  const appStore = useAppStore.getState();
  appStore.removeSession(msg.session_id);
}

function handleSupervisorOutput(msg: SupervisorOutputMessage): void {
  const chatStore = useChatStore.getState();
  const streamingId = chatStore.supervisorStreamingMessageId;

  const contentBlocks = parseContentBlocks(msg.payload.content_blocks);
  const hasContent = contentBlocks.length > 0 && contentBlocks.some(b => b.content || b.blockType === 'tool' || b.blockType === 'voice_output');

  if (streamingId) {
    // Only update blocks if we have content (don't replace with empty on completion)
    if (hasContent) {
      chatStore.updateSupervisorStreamingBlocks(streamingId, contentBlocks);
    }

    if (msg.payload.is_complete) {
      chatStore.updateSupervisorMessage(streamingId, { isStreaming: false });
      chatStore.setSupervisorStreamingMessageId(null);
      chatStore.setSupervisorIsLoading(false);
    }
  } else {
    // Create new message (only if we have content or still streaming)
    if (!hasContent && msg.payload.is_complete) {
      // Empty completed message - skip creating it
      return;
    }

    const message: Message = {
      id: crypto.randomUUID(),
      sessionId: 'supervisor',
      role: 'assistant',
      contentBlocks,
      isStreaming: !msg.payload.is_complete,
      createdAt: new Date(msg.payload.timestamp),
    };

    chatStore.addSupervisorMessage(message);

    if (!msg.payload.is_complete) {
      chatStore.setSupervisorStreamingMessageId(message.id);
      chatStore.setSupervisorIsLoading(true);
    }
  }
}

function handleSupervisorUserMessage(msg: SupervisorUserMessage): void {
  const chatStore = useChatStore.getState();
  const appStore = useAppStore.getState();
  const credentials = appStore.credentials;

  // Don't add message if it's from this device (already added locally)
  if (credentials && msg.payload.from_device_id === credentials.deviceId) {
    return;
  }

  const message: Message = {
    id: crypto.randomUUID(),
    sessionId: 'supervisor',
    role: 'user',
    contentBlocks: [
      {
        id: crypto.randomUUID(),
        blockType: 'text',
        content: msg.payload.content,
      },
    ],
    isStreaming: false,
    createdAt: new Date(msg.payload.timestamp),
    fromDeviceId: msg.payload.from_device_id,
  };

  chatStore.addSupervisorMessage(message);
}

function handleSupervisorContextCleared(): void {
  const chatStore = useChatStore.getState();
  chatStore.clearSupervisorMessages();
}

function handleSessionOutput(msg: SessionOutputMessage): void {
  const chatStore = useChatStore.getState();
  const sessionId = msg.session_id;

  if (msg.payload.content_type === 'terminal') {
    // Dispatch terminal output event for TerminalView
    window.dispatchEvent(
      new CustomEvent('terminal-output', {
        detail: { sessionId, data: msg.payload.content },
      })
    );
    return;
  }

  const streamingId = chatStore.agentStreamingMessageIds[sessionId];
  const contentBlocks = msg.payload.content_blocks
    ? parseContentBlocks(msg.payload.content_blocks)
    : [{ id: crypto.randomUUID(), blockType: 'text' as const, content: msg.payload.content }];
  const hasContent = contentBlocks.length > 0 && contentBlocks.some(b => b.content || b.blockType === 'tool' || b.blockType === 'voice_output');

  if (streamingId) {
    // Only update blocks if we have content (don't replace with empty on completion)
    if (hasContent) {
      chatStore.updateAgentStreamingBlocks(sessionId, streamingId, contentBlocks);
    }

    if (msg.payload.is_complete) {
      chatStore.updateAgentMessage(sessionId, streamingId, { isStreaming: false });
      chatStore.setAgentStreamingMessageId(sessionId, null);
      chatStore.setAgentIsLoading(sessionId, false);
    }
  } else {
    // Create new message (only if we have content or still streaming)
    if (!hasContent && msg.payload.is_complete) {
      // Empty completed message - skip creating it
      return;
    }

    const message: Message = {
      id: crypto.randomUUID(),
      sessionId,
      role: 'assistant',
      contentBlocks,
      isStreaming: !msg.payload.is_complete,
      createdAt: new Date(msg.payload.timestamp),
    };

    chatStore.addAgentMessage(sessionId, message);

    if (!msg.payload.is_complete) {
      chatStore.setAgentStreamingMessageId(sessionId, message.id);
      chatStore.setAgentIsLoading(sessionId, true);
    }
  }
}

function handleSessionUserMessage(msg: {
  session_id: string;
  payload: { content: string; from_device_id: string };
}): void {
  const chatStore = useChatStore.getState();
  const appStore = useAppStore.getState();
  const credentials = appStore.credentials;

  // Don't add message if it's from this device
  if (credentials && msg.payload.from_device_id === credentials.deviceId) {
    return;
  }

  const message: Message = {
    id: crypto.randomUUID(),
    sessionId: msg.session_id,
    role: 'user',
    contentBlocks: [
      {
        id: crypto.randomUUID(),
        blockType: 'text',
        content: msg.payload.content,
      },
    ],
    isStreaming: false,
    createdAt: new Date(),
    fromDeviceId: msg.payload.from_device_id,
  };

  chatStore.addAgentMessage(msg.session_id, message);
}

function handleMessageAck(msg: MessageAckMessage): void {
  const chatStore = useChatStore.getState();

  if (chatStore.pendingMessageAcks.has(msg.payload.message_id)) {
    chatStore.removePendingAck(msg.payload.message_id);
    chatStore.setMessageSendStatus(msg.payload.message_id, 'sent');
  }
}

function handleSupervisorVoiceOutput(msg: SupervisorVoiceOutputMessage): void {
  devLog.audio('Received supervisor.voice_output:', msg);

  const appStore = useAppStore.getState();
  const settingsStore = useSettingsStore.getState();
  const chatStore = useChatStore.getState();
  const credentials = appStore.credentials;

  const { message_id, audio_base64, from_device_id, duration } = msg.payload;

  // Check if TTS auto-play is enabled AND this is from our device
  const ttsEnabled = settingsStore.ttsEnabled;
  const isFromThisDevice = from_device_id !== undefined && from_device_id === credentials?.deviceId;
  const shouldAutoPlay = ttsEnabled && isFromThisDevice;

  devLog.audio(
    `TTS: from=${from_device_id ?? 'nil'} me=${credentials?.deviceId} match=${isFromThisDevice} ttsEnabled=${ttsEnabled} autoPlay=${shouldAutoPlay}`
  );

  // Play audio (and cache it)
  AudioPlayerService.playAudio(audio_base64, message_id, shouldAutoPlay);

  // Add voice_output block to the last assistant message
  const messages = chatStore.supervisorMessages;
  let lastAssistantIndex = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg && msg.role === 'assistant') {
      lastAssistantIndex = i;
      break;
    }
  }

  if (lastAssistantIndex !== -1) {
    const lastMessage = messages[lastAssistantIndex];
    if (lastMessage) {
      const voiceOutputBlock: ContentBlock = {
        id: crypto.randomUUID(),
        blockType: 'voice_output',
        content: '',
        metadata: {
          messageId: message_id,
          audioBase64: audio_base64,
          duration: duration,
          hasAudio: true,
        },
      };

      chatStore.updateSupervisorMessage(lastMessage.id, {
        contentBlocks: [...lastMessage.contentBlocks, voiceOutputBlock],
      });
    }
  }
}

function handleSessionVoiceOutput(msg: SessionVoiceOutputMessage): void {
  devLog.audio('Received session.voice_output:', msg);

  const appStore = useAppStore.getState();
  const settingsStore = useSettingsStore.getState();
  const chatStore = useChatStore.getState();
  const credentials = appStore.credentials;

  const sessionId = msg.session_id;
  const { message_id, audio_base64, from_device_id, duration } = msg.payload;

  // Check if TTS auto-play is enabled AND this is from our device
  const ttsEnabled = settingsStore.ttsEnabled;
  const isFromThisDevice = from_device_id !== undefined && from_device_id === credentials?.deviceId;
  const shouldAutoPlay = ttsEnabled && isFromThisDevice;

  devLog.audio(
    `TTS(agent): from=${from_device_id ?? 'nil'} me=${credentials?.deviceId} match=${isFromThisDevice} autoPlay=${shouldAutoPlay}`
  );

  // Play audio (and cache it)
  AudioPlayerService.playAudio(audio_base64, message_id, shouldAutoPlay);

  // Add voice_output block to the last assistant message
  const agentMessages = chatStore.agentMessages[sessionId] ?? [];
  let lastAgentAssistantIndex = -1;
  for (let i = agentMessages.length - 1; i >= 0; i--) {
    const agentMsg = agentMessages[i];
    if (agentMsg && agentMsg.role === 'assistant') {
      lastAgentAssistantIndex = i;
      break;
    }
  }

  if (lastAgentAssistantIndex !== -1) {
    const lastMessage = agentMessages[lastAgentAssistantIndex];
    if (lastMessage) {
      const voiceOutputBlock: ContentBlock = {
        id: crypto.randomUUID(),
        blockType: 'voice_output',
        content: '',
        metadata: {
          messageId: message_id,
          audioBase64: audio_base64,
          duration: duration,
          hasAudio: true,
        },
      };

      chatStore.updateAgentMessage(sessionId, lastMessage.id, {
        contentBlocks: [...lastMessage.contentBlocks, voiceOutputBlock],
      });
    }
  }
}

function handleSupervisorTranscription(msg: SupervisorTranscriptionMessage): void {
  const chatStore = useChatStore.getState();
  const appStore = useAppStore.getState();
  const credentials = appStore.credentials;
  const { message_id, transcription, from_device_id } = msg.payload;

  // Find the voice_input message with this ID and update transcription
  const messages = chatStore.supervisorMessages;
  let messageFound = false;

  for (const message of messages) {
    if (message.id === message_id || message.contentBlocks.some((b) => b.metadata?.messageId === message_id)) {
      // Update the voice_input block with transcription
      const updatedBlocks = message.contentBlocks.map((block) => {
        if (block.blockType === 'voice_input') {
          return {
            ...block,
            content: transcription,
          };
        }
        return block;
      });
      chatStore.updateSupervisorMessage(message.id, { contentBlocks: updatedBlocks });
      messageFound = true;
      break;
    }
  }

  // If message not found and it's from another device, create a new user message
  if (!messageFound && from_device_id && from_device_id !== credentials?.deviceId && transcription) {
    const newMessage: Message = {
      id: message_id,
      sessionId: 'supervisor',
      role: 'user',
      contentBlocks: [
        {
          id: crypto.randomUUID(),
          blockType: 'voice_input',
          content: transcription,
          metadata: {
            messageId: message_id,
          },
        },
      ],
      isStreaming: false,
      createdAt: new Date(),
      fromDeviceId: from_device_id,
    };
    chatStore.addSupervisorMessage(newMessage);
  }
}

function handleSessionTranscription(msg: SessionTranscriptionMessage): void {
  const chatStore = useChatStore.getState();
  const appStore = useAppStore.getState();
  const credentials = appStore.credentials;
  const sessionId = msg.session_id;
  const { message_id, transcription, from_device_id } = msg.payload;

  const messages = chatStore.agentMessages[sessionId] ?? [];
  let messageFound = false;

  for (const message of messages) {
    if (message.id === message_id || message.contentBlocks.some((b) => b.metadata?.messageId === message_id)) {
      const updatedBlocks = message.contentBlocks.map((block) => {
        if (block.blockType === 'voice_input') {
          return {
            ...block,
            content: transcription,
          };
        }
        return block;
      });
      chatStore.updateAgentMessage(sessionId, message.id, { contentBlocks: updatedBlocks });
      messageFound = true;
      break;
    }
  }

  // If message not found and it's from another device, create a new user message
  if (!messageFound && from_device_id && from_device_id !== credentials?.deviceId && transcription) {
    const newMessage: Message = {
      id: message_id,
      sessionId,
      role: 'user',
      contentBlocks: [
        {
          id: crypto.randomUUID(),
          blockType: 'voice_input',
          content: transcription,
          metadata: {
            messageId: message_id,
          },
        },
      ],
      isStreaming: false,
      createdAt: new Date(),
      fromDeviceId: from_device_id,
    };
    chatStore.addAgentMessage(sessionId, newMessage);
  }
}
