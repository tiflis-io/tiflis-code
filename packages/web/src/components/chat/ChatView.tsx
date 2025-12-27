// Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
// Licensed under the FSL-1.1-NC.

import { useEffect, useRef, useMemo, type ReactNode } from 'react';
import type { Message } from '@/types';
import { SegmentBubble } from './MessageBubble';
import { ChatInput } from './ChatInput';
import { AgentIcon } from '@/components/icons';
import { ChatSkeleton } from '@/components/ui/Skeleton';
import { splitMessages } from '@/utils/messageSplitter';
import { Loader2 } from 'lucide-react';

interface ChatViewProps {
  messages: Message[];
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

export function ChatView({
  messages,
  isLoading,
  isSubscribing = false,
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
    <div className="flex flex-col h-full" role="main">
      {/* Header */}
      <header className="border-b px-4 py-3 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="max-w-3xl mx-auto">
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-semibold">{title}</h1>
            {isLoading && (
              <div className="flex items-center gap-1.5 text-primary">
                <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                <span className="text-xs font-medium">Generating...</span>
              </div>
            )}
          </div>
          {subtitle && (
            <p className="text-sm text-muted-foreground">{subtitle}</p>
          )}
        </div>
      </header>

      {/* Messages */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-4"
        role="log"
        aria-label="Chat messages"
        aria-live="polite"
      >
        <div className="max-w-3xl mx-auto">
          {isSubscribing ? (
            <ChatSkeleton count={3} />
          ) : messages.length === 0 ? (
            <div
              className="flex flex-col items-center justify-center h-full min-h-[200px] text-center"
              role="status"
              aria-label={emptyMessage}
            >
              <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4" aria-hidden="true">
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
