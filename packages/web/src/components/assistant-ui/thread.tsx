// Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
// Licensed under the FSL-1.1-NC.

import { FC, useRef, useEffect } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useAppStore } from "@/store/useAppStore";
import { useChatStore } from "@/store/useChatStore";
import { useWebSocket } from "@/hooks/useWebSocket";
import { type Message } from "@/types";
import { VoiceRecordButton } from "./voice-record-button";

interface ThreadProps {
  sessionId: string;
  isSupervisor?: boolean;
}

export const Thread: FC<ThreadProps> = ({ sessionId, isSupervisor = false }) => {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  
  // Get existing Tiflis state and actions
  const connectionState = useAppStore((state) => state.connectionState);
  
  const messages = useChatStore((state) => 
    isSupervisor ? state.supervisorMessages : state.agentMessages[sessionId] || []
  );
  const isLoading = useChatStore((state) => 
    isSupervisor ? state.supervisorIsLoading : state.agentIsLoading[sessionId] || false
  );
  
  const {
    sendSupervisorCommand,
    sendAgentCommand,
    sendSupervisorVoiceCommand,
    sendAgentVoiceCommand,
    cancelSupervisor,
    cancelAgent,
  } = useWebSocket();

  const isConnected = connectionState === 'verified' || connectionState === 'authenticated';

  // Auto-scroll to bottom when new messages arrive
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Handle message sending
  const handleSendMessage = async () => {
    const textarea = textareaRef.current;
    if (!textarea?.value.trim() || !isConnected) return;
    
    const message = textarea.value.trim();
    textarea.value = "";
    textarea.style.height = "auto"; // Reset height

    try {
      if (isSupervisor) {
        await sendSupervisorCommand(message);
      } else {
        await sendAgentCommand(sessionId, message);
      }
    } catch (error) {
      console.error("Failed to send message:", error);
    }
  };

  // Handle voice recording completion
  const handleVoiceRecordingComplete = async (audioBlob: Blob, format: string) => {
    if (!isConnected) return;

    try {
      // Convert blob to base64
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result as string;
        const base64 = result.split(',')[1];
        if (base64) {
          if (isSupervisor) {
            sendSupervisorVoiceCommand(base64, format);
          } else {
            sendAgentVoiceCommand(sessionId, base64, format);
          }
        }
      };
      reader.readAsDataURL(audioBlob);
    } catch (error) {
      console.error("Failed to send voice message:", error);
    }
  };

  // Handle textarea auto-resize
  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const textarea = e.target;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
  };

  // Handle keyboard shortcuts
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // Simple message component with modern styling
  const MessageBubble: FC<{ message: Message }> = ({ message }) => {
    const isUser = message.role === "user";

    return (
      <div
        className={cn(
          "flex gap-3 p-4",
          isUser ? "justify-end" : "justify-start"
        )}
      >
        {!isUser && (
          <Avatar className="h-8 w-8 flex-shrink-0">
            <AvatarFallback className="bg-blue-100 text-blue-600 text-xs">
              AI
            </AvatarFallback>
          </Avatar>
        )}
        
        <div
          className={cn(
            "max-w-[80%] rounded-2xl px-4 py-2",
            isUser 
              ? "bg-primary text-primary-foreground ml-auto" 
              : "bg-muted text-foreground"
          )}
        >
          {message.contentBlocks.map((block, index) => (
            <div key={block.id || index} className="space-y-1">
              {block.blockType === "text" && (
                <div className="whitespace-pre-wrap">{block.content}</div>
              )}
              {block.blockType === "code" && (
                <div className="rounded-md bg-gray-100 p-3 text-sm font-mono dark:bg-gray-800">
                  <div className="text-xs text-gray-500 mb-1">
                    {block.metadata?.language || "code"}
                  </div>
                  <div className="text-gray-900 dark:text-gray-100">{block.content}</div>
                </div>
              )}
              {block.blockType === "tool" && (
                <div className="rounded-md bg-blue-50 p-3 text-sm dark:bg-blue-900/20">
                  <div className="text-xs text-blue-600 mb-1">
                    {block.metadata?.toolName || "tool"}
                  </div>
                  <div className="text-gray-700 dark:text-gray-300">
                    {block.content}
                  </div>
                </div>
              )}
              {block.blockType === "thinking" && (
                <div className="italic text-gray-500 text-sm">
                  Thinking: {block.content}
                </div>
              )}
              {block.blockType === "error" && (
                <div className="text-red-600 text-sm">
                  Error: {block.content}
                </div>
              )}
              {block.blockType === "voice_input" && (
                <div className="text-gray-500 text-sm italic">
                  [Voice message - {block.metadata?.audioBase64?.length || 0} bytes]
                </div>
              )}
              {block.blockType === "voice_output" && (
                <div className="text-gray-500 text-sm italic">
                  [Voice response - {block.metadata?.audioBase64?.length || 0} bytes]
                </div>
              )}
            </div>
          ))}
        </div>

        {isUser && (
          <Avatar className="h-8 w-8 flex-shrink-0">
            <AvatarFallback className="bg-green-100 text-green-600 text-xs">
              You
            </AvatarFallback>
          </Avatar>
        )}
      </div>
    );
  };

  return (
    <div className="flex h-full flex-col bg-background">
      {/* Header */}
      <div className="border-b px-6 py-4">
        <h3 className="text-lg font-medium">
          {isSupervisor ? "Supervisor" : `Agent: ${sessionId}`}
        </h3>
        <p className="text-sm text-muted-foreground">
          {isConnected ? "Connected" : "Connecting..."}
        </p>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto">
        <div className="space-y-1 pb-4">
          {messages.length === 0 ? (
            <div className="flex items-center justify-center h-full text-muted-foreground">
              <div className="text-center">
                <h3 className="text-lg font-medium mb-2">
                  {isSupervisor ? "Supervisor Chat" : `Agent: ${sessionId}`}
                </h3>
                <p className="text-sm">
                  {isSupervisor 
                    ? "Ask me to create sessions, manage your workspace, or help with tasks."
                    : `Start a conversation with the agent...`
                  }
                </p>
              </div>
            </div>
          ) : (
            messages.map((message) => (
              <MessageBubble key={message.id} message={message} />
            ))
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Message Input */}
      <div className="border-t p-4">
        <div className="flex gap-2 max-w-4xl mx-auto">
          <textarea
            ref={textareaRef}
            placeholder={
              isConnected 
                ? "Send a message..." 
                : "Connecting..."
            }
            disabled={!isConnected || isLoading}
            onChange={handleTextareaChange}
            onKeyDown={handleKeyDown}
            className="flex-1 min-h-[40px] max-h-[200px] rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-none"
            rows={1}
          />
          
          <VoiceRecordButton
            onRecordingComplete={handleVoiceRecordingComplete}
            disabled={!isConnected || isLoading}
          />
          
          <div className="flex gap-1">
            {isLoading ? (
              <Button
                onClick={() => isSupervisor ? cancelSupervisor() : cancelAgent(sessionId)}
                disabled={!isConnected}
                size="sm"
                variant="destructive"
              >
                Stop
              </Button>
            ) : (
              <Button
                onClick={handleSendMessage}
                disabled={!isConnected}
                size="sm"
              >
                Send
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};