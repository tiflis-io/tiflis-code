// Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
// Licensed under the FSL-1.1-NC.

import { useEffect, useRef, useMemo, useState, useCallback, type ReactNode } from 'react';
import type { Message } from '@/types';
import { SegmentBubble } from './MessageBubble';
import { ThinkingBubble } from './ThinkingBubble';
import { ChatInput } from './ChatInput';
import { AgentIcon } from '@/components/icons';
import { ChatSkeleton } from '@/components/ui/Skeleton';
import { splitMessages } from '@/utils/messageSplitter';
import { ArrowDown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ChatViewProps {
  messages: Message[];
  isLoading: boolean;
  isSubscribing?: boolean;
  onSend: (text: string) => void;
  onSendAudio?: (audioBlob: Blob, format: string) => void;
  onCancel?: () => void;
  currentDeviceId?: string;
  disabled?: boolean;
  emptyMessage?: string;
  showVoice?: boolean;
  emptyIcon?: ReactNode;
  agentType?: 'supervisor' | 'claude' | 'cursor' | 'opencode' | 'terminal' | 'backlog-agent';
  // Pagination props
  hasMore?: boolean;
  isLoadingMore?: boolean;
  onLoadMore?: () => void;
}

export function ChatView({
  messages,
  isLoading,
  isSubscribing = false,
  onSend,
  onSendAudio,
  onCancel,
  currentDeviceId,
  disabled = false,
  emptyMessage = 'No messages yet. Start the conversation!',
  showVoice = true,
  emptyIcon,
  agentType,
  hasMore = false,
  isLoadingMore = false,
  onLoadMore,
}: ChatViewProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const loadMoreTriggerRef = useRef<HTMLDivElement>(null);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [isNearBottom, setIsNearBottom] = useState(true);

  // Split messages into segments for display
  const segments = useMemo(() => splitMessages(messages), [messages]);

  // Show thinking bubble when loading (separate from message content)
  const showThinkingBubble = isLoading && messages.length > 0;

  // Check if user is near bottom of scroll
  const checkScrollPosition = useCallback(() => {
    if (!scrollRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
    const nearBottom = distanceFromBottom < 100;
    setIsNearBottom(nearBottom);
    setShowScrollButton(!nearBottom && messages.length > 0);
  }, [messages.length]);

  // Auto-scroll to bottom on new messages (only if user is near bottom)
  useEffect(() => {
    if (scrollRef.current && isNearBottom) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [segments, isNearBottom]);

  // Handle scroll events with throttling
  useEffect(() => {
    const scrollEl = scrollRef.current;
    if (!scrollEl) return;

    let ticking = false;
    const handleScroll = () => {
      if (!ticking) {
        requestAnimationFrame(() => {
          checkScrollPosition();
          ticking = false;
        });
        ticking = true;
      }
    };

    scrollEl.addEventListener('scroll', handleScroll, { passive: true });
    return () => scrollEl.removeEventListener('scroll', handleScroll);
  }, [checkScrollPosition]);

  // IntersectionObserver for "load more" pagination when scrolling to top
  useEffect(() => {
    if (!hasMore || !onLoadMore || isLoadingMore || isSubscribing) return;

    const triggerEl = loadMoreTriggerRef.current;
    if (!triggerEl) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry?.isIntersecting && hasMore && !isLoadingMore) {
          onLoadMore();
        }
      },
      {
        root: scrollRef.current,
        rootMargin: '100px 0px 0px 0px', // Trigger 100px before reaching top
        threshold: 0,
      }
    );

    observer.observe(triggerEl);
    return () => observer.disconnect();
  }, [hasMore, onLoadMore, isLoadingMore, isSubscribing]);

  // Scroll to bottom handler
  const scrollToBottom = useCallback(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: 'smooth',
      });
    }
  }, []);

  return (
    <div className="flex flex-col h-full" role="main">
      {/* Messages */}
      <div className="relative flex-1">
        <div
          ref={scrollRef}
          className="absolute inset-0 overflow-y-auto p-4"
          role="log"
          aria-label="Chat messages"
          aria-live="polite"
        >
          <div className="max-w-3xl lg:max-w-4xl xl:max-w-5xl 2xl:max-w-6xl mx-auto">
            {/* Load more trigger and indicator at top */}
            {!isSubscribing && messages.length > 0 && (
              <div ref={loadMoreTriggerRef} className="h-1" aria-hidden="true" />
            )}
            {isLoadingMore && (
              <div className="flex justify-center py-4">
                <div className="flex items-center gap-2 text-muted-foreground text-sm">
                  <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  <span>Loading older messages...</span>
                </div>
              </div>
            )}
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
              <>
                {segments.map((segment) => (
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
                    agentType={agentType}
                  />
                ))}
                {/* Separate thinking bubble shown when waiting for response */}
                {showThinkingBubble && (
                  <ThinkingBubble agentType={agentType} />
                )}
              </>
            )}
          </div>
        </div>

        {/* Scroll to bottom FAB */}
        <button
          type="button"
          onClick={scrollToBottom}
          className={cn(
            'absolute bottom-4 right-4 z-10',
            'w-10 h-10 rounded-full shadow-lg',
            'bg-background border border-border',
            'flex items-center justify-center',
            'transition-all duration-200 ease-out',
            'hover:bg-muted hover:shadow-xl',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            showScrollButton
              ? 'opacity-100 translate-y-0 pointer-events-auto'
              : 'opacity-0 translate-y-4 pointer-events-none'
          )}
          aria-label="Scroll to bottom"
          aria-hidden={!showScrollButton}
        >
          <ArrowDown className="w-5 h-5 text-muted-foreground" />
        </button>
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
