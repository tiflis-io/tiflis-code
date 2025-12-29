// Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
// Licensed under the FSL-1.1-NC.

import { cn } from '@/lib/utils';
import type { Message, ContentBlock } from '@/types';
import { ContentBlockRenderer } from './ContentBlockRenderer';
import { TypingIndicator } from './TypingIndicator';
import { User, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  SupervisorIcon,
  ClaudeIcon,
  CursorIcon,
  OpenCodeIcon,
  TerminalIcon,
  AgentIcon,
} from '@/components/icons';

interface MessageBubbleProps {
  message: Message;
  isCurrentDevice?: boolean;
  onRetry?: () => void;
  agentType?: 'supervisor' | 'claude' | 'cursor' | 'opencode' | 'terminal';
}

interface SegmentBubbleProps {
  contentBlocks: ContentBlock[];
  isUser: boolean;
  isStreaming: boolean;
  showAvatar: boolean;
  isContinuation: boolean;
  sendStatus?: Message['sendStatus'];
  isCurrentDevice: boolean;
  fromDeviceId?: string;
  onRetry?: () => void;
  agentType?: 'supervisor' | 'claude' | 'cursor' | 'opencode' | 'terminal';
}

function AgentAvatar({ agentType }: { agentType?: string }) {
  const iconClass = "w-[18px] h-[18px]";
  
  const renderIcon = () => {
    switch (agentType) {
      case 'supervisor':
        return <SupervisorIcon className={iconClass} />;
      case 'claude':
        return <ClaudeIcon className={iconClass} />;
      case 'cursor':
        return <CursorIcon className={iconClass} />;
      case 'opencode':
        return <OpenCodeIcon className={iconClass} />;
      case 'terminal':
        return <TerminalIcon className={cn(iconClass, "text-foreground")} />;
      default:
        return <AgentIcon className={cn(iconClass, "text-foreground")} />;
    }
  };

  return (
    <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-muted flex items-center justify-center overflow-hidden">
      {renderIcon()}
    </div>
  );
}

/**
 * Render a single bubble segment
 */
function SegmentBubble({
  contentBlocks,
  isUser,
  isStreaming,
  showAvatar,
  isContinuation,
  sendStatus,
  isCurrentDevice,
  fromDeviceId,
  onRetry,
  agentType,
}: SegmentBubbleProps) {
  // Check if we have any content to display
  const hasContent = contentBlocks.length > 0 && contentBlocks.some(
    block => block.content || block.blockType === 'tool' || block.blockType === 'voice_output'
  );

  return (
    <div
      className={cn(
        'flex gap-3',
        isContinuation ? 'mb-1' : 'mb-4',
        isUser && 'flex-row-reverse'
      )}
    >
      {/* Avatar */}
      {showAvatar ? (
        isUser ? (
          <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center">
            <User className="w-4 h-4" />
          </div>
        ) : (
          <AgentAvatar agentType={agentType} />
        )
      ) : (
        <div className="flex-shrink-0 w-8" />
      )}

      {/* Content */}
      <div
        className={cn(
          'flex-1 max-w-[85%] md:max-w-[75%]',
          isUser && 'flex flex-col items-end'
        )}
      >
        <div
          className={cn(
            'rounded-2xl px-4 py-3',
            isUser
              ? 'bg-primary text-primary-foreground rounded-br-sm'
              : 'bg-muted rounded-bl-sm',
            isContinuation && !isUser && 'rounded-tl-sm'
          )}
        >
          {/* Show typing indicator when streaming with no content yet */}
          {isStreaming && !hasContent ? (
            <TypingIndicator />
          ) : (
            <>
              {contentBlocks.map((block) => (
                <ContentBlockRenderer key={block.id} block={block} isUserMessage={isUser} />
              ))}

              {/* Show typing indicator at the end while still streaming */}
              {isStreaming && hasContent && (
                <div className="mt-2">
                  <TypingIndicator />
                </div>
              )}
            </>
          )}
        </div>

        {/* Message status */}
        {sendStatus === 'pending' && (
          <span className="text-xs text-muted-foreground mt-1" role="status">
            Sending...
          </span>
        )}
        {sendStatus === 'failed' && (
          <div className="flex items-center gap-2 mt-1">
            <span className="text-xs text-destructive" role="alert">
              Failed to send
            </span>
            {onRetry && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onRetry}
                className="h-6 px-2 text-xs"
                aria-label="Retry sending message"
              >
                <RefreshCw className="w-3 h-3 mr-1" aria-hidden="true" />
                Retry
              </Button>
            )}
          </div>
        )}
        {!isCurrentDevice && fromDeviceId && (
          <span className="text-xs text-muted-foreground mt-1">
            From another device
          </span>
        )}
      </div>
    </div>
  );
}

export function MessageBubble({ message, isCurrentDevice = true, agentType }: MessageBubbleProps) {
  const isUser = message.role === 'user';

  return (
    <SegmentBubble
      contentBlocks={message.contentBlocks}
      isUser={isUser}
      isStreaming={message.isStreaming}
      showAvatar={true}
      isContinuation={false}
      sendStatus={message.sendStatus}
      isCurrentDevice={isCurrentDevice}
      fromDeviceId={message.fromDeviceId}
      agentType={agentType}
    />
  );
}

export { SegmentBubble };
