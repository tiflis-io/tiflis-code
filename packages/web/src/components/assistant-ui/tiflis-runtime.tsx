// Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
// Licensed under the FSL-1.1-NC.

import { useEffect, useState, useCallback } from "react";
import { useAppStore } from "@/store/useAppStore";
import { useChatStore } from "@/store/useChatStore";
import { useWebSocket } from "@/hooks/useWebSocket";
import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";
import type { Message, ContentBlock } from "@/types";
import { logger } from "@/utils/logger";

// Helper function to convert Tiflis ContentBlock to assistant-ui message parts
const convertContentBlockToPart = (block: ContentBlock): any => {
  switch (block.blockType) {
    case "text":
      return {
        type: "text" as const,
        text: block.content,
      };
    case "code":
      return {
        type: "tool-call" as const,
        toolCallId: block.id,
        toolName: "code_execution",
        args: { code: block.content, language: block.metadata?.language },
      };
    case "tool":
      return {
        type: "tool-call" as const,
        toolCallId: block.id,
        toolName: block.metadata?.toolName || "unknown_tool",
        args: block.metadata?.toolInput ? JSON.parse(block.metadata.toolInput) : {},
      };
    case "thinking":
      return {
        type: "text" as const,
        text: `*Thinking: ${block.content}*`,
      };
    case "voice_input":
      return {
        type: "text" as const,
        text: `[Voice message - ${block.metadata?.audioBase64?.length || 0} bytes]`,
      };
    case "voice_output":
      return {
        type: "text" as const,
        text: `[Voice response - ${block.metadata?.audioBase64?.length || 0} bytes]`,
      };
    case "error":
      return {
        type: "text" as const,
        text: `Error: ${block.content}`,
      };
    case "status":
      return {
        type: "text" as const,
        text: `Status: ${block.content}`,
      };
    default:
      return {
        type: "text" as const,
        text: `[Unsupported content type: ${block.blockType}]`,
      };
  }
};

// Helper function to check if message is a user message
const isUserMessage = (message: any): message is { role: "user"; content: any[] } => {
  return message.role === "user";
};

// Helper function to convert Tiflis Message to assistant-ui ThreadMessage
const convertTiflisMessageToThreadMessage = (message: Message): any => {
  const parts = message.contentBlocks.map(convertContentBlockToPart);
  
  const baseMessage: any = {
    id: message.id,
    content: parts,
    createdAt: message.createdAt,
    // Required metadata property
    metadata: {
      custom: {}, // Required empty custom object
    },
  };

  if (message.role === "assistant") {
    baseMessage.role = "assistant";
    baseMessage.status = { type: "complete", reason: "stop" }; // Required status for assistant messages
  } else {
    baseMessage.role = "user";
    baseMessage.attachments = []; // Required attachments for user messages
  }
  
  return baseMessage;
};

// Zustand store for assistant-ui runtime state - use any to avoid complex type checking
interface AssistantUIState {
  messages: any[];
  isLoading: boolean;
  isRunning: boolean;
  
  // Actions
  addMessage: (message: any) => void;
  updateMessage: (messageId: string, updates: Partial<any>) => void;
  setMessages: (messages: any[]) => void;
  setIsLoading: (isLoading: boolean) => void;
  setIsRunning: (isRunning: boolean) => void;
  reset: () => void;
}

const useAssistantUIStore = create<AssistantUIState>()(
  subscribeWithSelector((set) => ({
    messages: [],
    isLoading: false,
    isRunning: false,

    addMessage: (message) =>
      set((state) => ({
        messages: [...state.messages, message],
      })),

    updateMessage: (messageId, updates) =>
      set((state) => ({
        messages: state.messages.map((m) =>
          m.id === messageId ? { ...m, ...updates } : m
        ),
      })),

    setMessages: (messages) => set({ messages }),
    setIsLoading: (isLoading) => set({ isLoading }),
    setIsRunning: (isRunning) => set({ isRunning }),
    
    reset: () => set({ messages: [], isLoading: false, isRunning: false }),
  }))
);

// Custom runtime for Tiflis WebSocket backend
export function useTiflisRuntime(sessionId: string = "supervisor") {
  const [isReady, setIsReady] = useState(false);
  
  // Existing Tiflis stores and hooks
  const credentials = useAppStore((state) => state.credentials);
  const supervisorMessages = useChatStore((state) => state.supervisorMessages);
  const agentMessages = useChatStore((state) => state.agentMessages);
  const supervisorIsLoading = useChatStore((state) => state.supervisorIsLoading);
  const agentIsLoading = useChatStore((state) => state.agentIsLoading);
  
  // assistant-ui store
  const setMessages = useAssistantUIStore((state) => state.setMessages);
  const setIsLoading = useAssistantUIStore((state) => state.setIsLoading);
  const setIsRunning = useAssistantUIStore((state) => state.setIsRunning);
  
  // Get current state from store
  const messages = useAssistantUIStore((state) => state.messages);
  const isLoading = useAssistantUIStore((state) => state.isLoading);
  const isRunning = useAssistantUIStore((state) => state.isRunning);
  
  // WebSocket hooks
  const { 
    sendSupervisorCommand, 
    sendAgentCommand,
    sendSupervisorVoiceCommand,
    sendAgentVoiceCommand,
    cancelSupervisor,
    cancelAgent,
  } = useWebSocket();

  // Convert Tiflis messages to assistant-ui messages
  useEffect(() => {
    const tiflisMessages = sessionId === "supervisor" 
      ? supervisorMessages 
      : agentMessages[sessionId] || [];

    const assistantUIMessages = tiflisMessages.map(convertTiflisMessageToThreadMessage);
    setMessages(assistantUIMessages);
    
    const loading = sessionId === "supervisor" 
      ? supervisorIsLoading 
      : agentIsLoading[sessionId] || false;
    
    setIsLoading(loading);
    setIsRunning(loading);
    
    if (credentials) {
      setIsReady(true);
    }
  }, [
    sessionId,
    supervisorMessages,
    agentMessages,
    supervisorIsLoading,
    agentIsLoading,
    credentials,
    setMessages,
    setIsLoading,
    setIsRunning,
  ]);

  // Send new message
  const append = useCallback(async (message: { role: string; content: any[] }) => {
    if (!isUserMessage(message)) {
      logger.warn("Only user messages can be appended");
      return;
    }

    // Convert content back to text
    const textContent = message.content
      .filter(part => part.type === "text")
      .map(part => part.text)
      .join("");

    try {
      if (sessionId === "supervisor") {
        await sendSupervisorCommand(textContent);
      } else {
        await sendAgentCommand(sessionId, textContent);
      }
    } catch (error) {
      logger.error("Failed to send message:", error);
    }
  }, [sessionId, sendSupervisorCommand, sendAgentCommand]);

  // Cancel generation
  const cancel = useCallback(() => {
    if (sessionId === "supervisor") {
      cancelSupervisor();
    } else {
      cancelAgent(sessionId);
    }
  }, [sessionId, cancelSupervisor, cancelAgent]);

  // Restart conversation (clear context)
  const restart = useCallback(() => {
    // This would need to be implemented in the backend
    logger.info("Restart requested for session:", sessionId);
  }, [sessionId]);

  // Handle voice messages (future extension)
  const sendVoiceMessage = useCallback(async (audioBase64: string, format: string) => {
    try {
      if (sessionId === "supervisor") {
        await sendSupervisorVoiceCommand(audioBase64, format);
      } else {
        await sendAgentVoiceCommand(sessionId, audioBase64, format);
      }
    } catch (error) {
      logger.error("Failed to send voice message:", error);
    }
  }, [sessionId, sendSupervisorVoiceCommand, sendAgentVoiceCommand]);

  return {
    // Core runtime interface
    messages,
    append,
    cancel,
    restart,
    isLoading,
    isRunning,
    
    // Additional methods for Tiflis integration
    sendVoiceMessage,
    isReady,
    
    // Direct access to stores for advanced use cases
    tiflisMessages: sessionId === "supervisor" ? supervisorMessages : agentMessages[sessionId] || [],
    assistantUIStore: useAssistantUIStore.getState(),
  };
}