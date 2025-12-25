// Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
// Licensed under the FSL-1.1-NC.

import { useEffect, useRef, useMemo, type ReactNode } from 'react';
import type { Message } from '@/types';
import { SegmentBubble } from './MessageBubble';
import { ChatInput } from './ChatInput';
import { AgentIcon } from '@/components/icons';
import { splitMessages } from '@/utils/messageSplitter';

interface ChatViewProps {
  messages: Message[];
  isLoading: boolean;
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

export function ChatView({
  messages,
  isLoading,
  onSend,
  onSendAudio,
  onCancel,
  title,
  subtitle,
  currentDeviceId,
  disabled = false,
  emptyMessage = 'No messages yet. Start the conversation!',
  showVoice = true,
  emptyIcon,
}: ChatViewProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Split messages into segments for display
  const segments = useMemo(() => splitMessages(messages), [messages]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [segments]);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="border-b px-4 py-3 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="max-w-3xl mx-auto">
          <h1 className="text-lg font-semibold">{title}</h1>
          {subtitle && (
            <p className="text-sm text-muted-foreground">{subtitle}</p>
          )}
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4">
        <div className="max-w-3xl mx-auto">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full min-h-[200px] text-center">
              <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
                {emptyIcon || <AgentIcon className="w-8 h-8 text-muted-foreground" />}
              </div>
              <p className="text-muted-foreground">{emptyMessage}</p>
            </div>
          ) : (
            segments.map((segment) => (
              <SegmentBubble
                key={segment.id}
                contentBlocks={segment.contentBlocks}
                isUser={segment.role === 'user'}
                isStreaming={segment.isStreaming}
                showAvatar={segment.showAvatar}
                isContinuation={!segment.isFirstSegment}
                sendStatus={segment.isLastSegment ? segment.sendStatus : undefined}
                isCurrentDevice={
                  !segment.fromDeviceId || segment.fromDeviceId === currentDeviceId
                }
                fromDeviceId={segment.isLastSegment ? segment.fromDeviceId : undefined}
              />
            ))
          )}
        </div>
      </div>

      {/* Input */}
      <ChatInput
        onSend={onSend}
        onSendAudio={onSendAudio}
        onCancel={onCancel}
        isLoading={isLoading}
        disabled={disabled}
        placeholder={disabled ? 'Not connected...' : 'Type a message...'}
        showVoice={showVoice}
      />
    </div>
  );
}
