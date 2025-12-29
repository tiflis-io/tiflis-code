// Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
// Licensed under the FSL-1.1-NC.

import { useEffect, useRef, useMemo, useState, useCallback, type ReactNode } from 'react';
import type { Message } from '@/types';
import { SegmentBubble } from './MessageBubble';
import { ChatInput } from './ChatInput';
import { AgentIcon } from '@/components/icons';
import { ChatSkeleton } from '@/components/ui/Skeleton';
import { splitMessages } from '@/utils/messageSplitter';
import { Loader2, ArrowDown, MoreVertical, Trash2, Eraser } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface ChatViewProps {
  messages: Message[];
  isLoading: boolean;
  isSubscribing?: boolean;
  onSend: (text: string) => void;
  onSendAudio?: (audioBlob: Blob, format: string) => void;
  onCancel?: () => void;
  onClearContext?: () => void;
  onTerminate?: () => void;
  title: string;
  subtitle?: string;
  currentDeviceId?: string;
  disabled?: boolean;
  emptyMessage?: string;
  showVoice?: boolean;
  emptyIcon?: ReactNode;
  isSupervisor?: boolean;
  agentType?: 'supervisor' | 'claude' | 'cursor' | 'opencode' | 'terminal';
}

export function ChatView({
  messages,
  isLoading,
  isSubscribing = false,
  onSend,
  onSendAudio,
  onCancel,
  onClearContext,
  onTerminate,
  title,
  subtitle,
  currentDeviceId,
  disabled = false,
  emptyMessage = 'No messages yet. Start the conversation!',
  showVoice = true,
  emptyIcon,
  isSupervisor = false,
  agentType,
}: ChatViewProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [isNearBottom, setIsNearBottom] = useState(true);
  const [showClearDialog, setShowClearDialog] = useState(false);
  const [showTerminateDialog, setShowTerminateDialog] = useState(false);

  // Split messages into segments for display
  const segments = useMemo(() => splitMessages(messages), [messages]);

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
      {/* Header - hidden on mobile (MobileHeader handles it) */}
      <header className="hidden md:block border-b px-4 py-3 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-semibold truncate">{title}</h1>
              {isLoading && (
                <div className="flex items-center gap-1.5 text-primary shrink-0">
                  <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                  <span className="text-xs font-medium">Generating...</span>
                </div>
              )}
            </div>
            {subtitle && (
              <p className="text-sm text-muted-foreground truncate">{subtitle}</p>
            )}
          </div>

          {(onClearContext || onTerminate) && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="shrink-0">
                  <MoreVertical className="w-5 h-5" />
                  <span className="sr-only">Menu</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {isSupervisor && onClearContext && (
                  <DropdownMenuItem
                    onClick={() => setShowClearDialog(true)}
                    className="text-destructive focus:text-destructive"
                  >
                    <Eraser className="w-4 h-4" />
                    Clear Context
                  </DropdownMenuItem>
                )}
                {!isSupervisor && onTerminate && (
                  <DropdownMenuItem
                    onClick={() => setShowTerminateDialog(true)}
                    className="text-destructive focus:text-destructive"
                  >
                    <Trash2 className="w-4 h-4" />
                    Terminate Session
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </header>

      {/* Clear Context Confirmation Dialog */}
      <AlertDialog open={showClearDialog} onOpenChange={setShowClearDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear Conversation?</AlertDialogTitle>
            <AlertDialogDescription>
              This will clear the entire conversation history with the Supervisor.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                onClearContext?.();
                setShowClearDialog(false);
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Clear Context
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Terminate Session Confirmation Dialog */}
      <AlertDialog open={showTerminateDialog} onOpenChange={setShowTerminateDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Terminate Session?</AlertDialogTitle>
            <AlertDialogDescription>
              This will end the current session and close the connection to the agent.
              You will need to create a new session to continue.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                onTerminate?.();
                setShowTerminateDialog(false);
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Terminate
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Messages */}
      <div className="relative flex-1">
        <div
          ref={scrollRef}
          className="absolute inset-0 overflow-y-auto p-4"
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
                  agentType={agentType}
                />
              ))
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
