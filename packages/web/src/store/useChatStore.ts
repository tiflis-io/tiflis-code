// Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
// Licensed under the FSL-1.1-NC.

import { create } from 'zustand';
import type { Message, ContentBlock, SendStatus } from '@/types';

interface ChatState {
  // Messages
  supervisorMessages: Message[];
  agentMessages: Record<string, Message[]>;

  // Loading states
  supervisorIsLoading: boolean;
  agentIsLoading: Record<string, boolean>;

  // Streaming message IDs
  supervisorStreamingMessageId: string | null;
  agentStreamingMessageIds: Record<string, string>;

  // Pending acks tracking
  pendingMessageAcks: Set<string>;

  // Actions - Supervisor
  addSupervisorMessage: (message: Message) => void;
  updateSupervisorMessage: (messageId: string, updates: Partial<Message>) => void;
  updateSupervisorStreamingBlocks: (messageId: string, blocks: ContentBlock[]) => void;
  setSupervisorIsLoading: (isLoading: boolean) => void;
  setSupervisorStreamingMessageId: (messageId: string | null) => void;
  clearSupervisorMessages: () => void;

  // Actions - Agent
  addAgentMessage: (sessionId: string, message: Message) => void;
  updateAgentMessage: (sessionId: string, messageId: string, updates: Partial<Message>) => void;
  updateAgentStreamingBlocks: (sessionId: string, messageId: string, blocks: ContentBlock[]) => void;
  setAgentIsLoading: (sessionId: string, isLoading: boolean) => void;
  setAgentStreamingMessageId: (sessionId: string, messageId: string | null) => void;
  clearAgentMessages: (sessionId: string) => void;

  // Actions - Message status
  setMessageSendStatus: (messageId: string, status: SendStatus) => void;
  addPendingAck: (messageId: string) => void;
  removePendingAck: (messageId: string) => void;

  // Actions - Reset
  reset: () => void;
}

const initialState = {
  supervisorMessages: [],
  agentMessages: {},
  supervisorIsLoading: false,
  agentIsLoading: {},
  supervisorStreamingMessageId: null,
  agentStreamingMessageIds: {},
  pendingMessageAcks: new Set<string>(),
};

export const useChatStore = create<ChatState>((set) => ({
  ...initialState,

  // Supervisor messages
  addSupervisorMessage: (message) =>
    set((state) => ({
      supervisorMessages: [...state.supervisorMessages, message],
    })),

  updateSupervisorMessage: (messageId, updates) =>
    set((state) => ({
      supervisorMessages: state.supervisorMessages.map((m) =>
        m.id === messageId ? { ...m, ...updates } : m
      ),
    })),

  updateSupervisorStreamingBlocks: (messageId, blocks) =>
    set((state) => ({
      supervisorMessages: state.supervisorMessages.map((m) =>
        m.id === messageId ? { ...m, contentBlocks: blocks } : m
      ),
    })),

  setSupervisorIsLoading: (supervisorIsLoading) => set({ supervisorIsLoading }),

  setSupervisorStreamingMessageId: (supervisorStreamingMessageId) =>
    set({ supervisorStreamingMessageId }),

  clearSupervisorMessages: () => set({ supervisorMessages: [] }),

  // Agent messages
  addAgentMessage: (sessionId, message) =>
    set((state) => ({
      agentMessages: {
        ...state.agentMessages,
        [sessionId]: [...(state.agentMessages[sessionId] ?? []), message],
      },
    })),

  updateAgentMessage: (sessionId, messageId, updates) =>
    set((state) => ({
      agentMessages: {
        ...state.agentMessages,
        [sessionId]: (state.agentMessages[sessionId] ?? []).map((m) =>
          m.id === messageId ? { ...m, ...updates } : m
        ),
      },
    })),

  updateAgentStreamingBlocks: (sessionId, messageId, blocks) =>
    set((state) => ({
      agentMessages: {
        ...state.agentMessages,
        [sessionId]: (state.agentMessages[sessionId] ?? []).map((m) =>
          m.id === messageId ? { ...m, contentBlocks: blocks } : m
        ),
      },
    })),

  setAgentIsLoading: (sessionId, isLoading) =>
    set((state) => ({
      agentIsLoading: {
        ...state.agentIsLoading,
        [sessionId]: isLoading,
      },
    })),

  setAgentStreamingMessageId: (sessionId, messageId) =>
    set((state) => ({
      agentStreamingMessageIds: {
        ...state.agentStreamingMessageIds,
        [sessionId]: messageId ?? '',
      },
    })),

  clearAgentMessages: (sessionId) =>
    set((state) => ({
      agentMessages: {
        ...state.agentMessages,
        [sessionId]: [],
      },
    })),

  // Message status
  setMessageSendStatus: (messageId, status) =>
    set((state) => {
      // Check supervisor messages
      const supervisorMessage = state.supervisorMessages.find((m) => m.id === messageId);
      if (supervisorMessage) {
        return {
          supervisorMessages: state.supervisorMessages.map((m) =>
            m.id === messageId ? { ...m, sendStatus: status } : m
          ),
        };
      }

      // Check agent messages
      const updatedAgentMessages = { ...state.agentMessages };
      for (const sessionId in updatedAgentMessages) {
        const messages = updatedAgentMessages[sessionId];
        if (messages) {
          const messageIndex = messages.findIndex((m) => m.id === messageId);
          if (messageIndex !== -1) {
            updatedAgentMessages[sessionId] = messages.map((m) =>
              m.id === messageId ? { ...m, sendStatus: status } : m
            );
            return { agentMessages: updatedAgentMessages };
          }
        }
      }

      return {};
    }),

  addPendingAck: (messageId) =>
    set((state) => ({
      pendingMessageAcks: new Set([...state.pendingMessageAcks, messageId]),
    })),

  removePendingAck: (messageId) =>
    set((state) => {
      const newSet = new Set(state.pendingMessageAcks);
      newSet.delete(messageId);
      return { pendingMessageAcks: newSet };
    }),

  // Reset
  reset: () => set(initialState),
}));
