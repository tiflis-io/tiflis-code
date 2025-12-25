// Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
// Licensed under the FSL-1.1-NC.

import { cn } from '@/lib/utils';
import type { Message, ContentBlock } from '@/types';
import { ContentBlockRenderer } from './ContentBlockRenderer';
import { User, Bot, Loader2 } from 'lucide-react';

interface MessageBubbleProps {
  message: Message;
  isCurrentDevice?: boolean;
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
}: SegmentBubbleProps) {
  return (
    <div
      className={cn(
        'flex gap-3',
        isContinuation ? 'mb-1' : 'mb-4',
        isUser && 'flex-row-reverse'
      )}
    >
      {/* Avatar - only show for first segment or always for user */}
      {showAvatar ? (
        <div
          className={cn(
            'flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center',
            isUser ? 'bg-primary text-primary-foreground' : 'bg-muted'
          )}
        >
          {isUser ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
        </div>
      ) : (
        // Spacer to maintain alignment for continuation segments
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
            'rounded-2xl px-4 py-2',
            isUser
              ? 'bg-primary text-primary-foreground rounded-br-sm'
              : 'bg-muted rounded-bl-sm',
            isContinuation && !isUser && 'rounded-tl-sm'
          )}
        >
          {contentBlocks.map((block) => (
            <ContentBlockRenderer key={block.id} block={block} isUserMessage={isUser} />
          ))}

          {isStreaming && (
            <div className="flex items-center gap-2 mt-2 text-muted-foreground">
              <Loader2 className="w-3 h-3 animate-spin" />
              <span className="text-xs">Generating...</span>
            </div>
          )}
        </div>

        {/* Message status - only show on last segment */}
        {sendStatus === 'pending' && (
          <span className="text-xs text-muted-foreground mt-1">Sending...</span>
        )}
        {sendStatus === 'failed' && (
          <span className="text-xs text-destructive mt-1">Failed to send</span>
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

export function MessageBubble({ message, isCurrentDevice = true }: MessageBubbleProps) {
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
    />
  );
}

export { SegmentBubble };
