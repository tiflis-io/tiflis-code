// Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
// Licensed under the FSL-1.1-NC.

import { cn } from '@/lib/utils';

interface SkeletonProps {
  className?: string;
}

export function Skeleton({ className }: SkeletonProps) {
  return (
    <div
      className={cn(
        'animate-pulse rounded-md bg-muted',
        className
      )}
      aria-hidden="true"
    />
  );
}

/**
 * Skeleton for a chat message bubble
 */
export function MessageSkeleton({ isUser = false }: { isUser?: boolean }) {
  return (
    <div
      className={cn(
        'flex gap-3 mb-4',
        isUser && 'flex-row-reverse'
      )}
    >
      {/* Avatar skeleton */}
      <Skeleton className="w-8 h-8 rounded-full shrink-0" />

      {/* Content skeleton */}
      <div className={cn('flex-1 max-w-[75%]', isUser && 'flex flex-col items-end')}>
        <div
          className={cn(
            'rounded-2xl px-4 py-3 space-y-2',
            isUser ? 'bg-primary/20' : 'bg-muted'
          )}
        >
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-4 w-32" />
        </div>
      </div>
    </div>
  );
}

/**
 * Multiple message skeletons for loading state
 */
export function ChatSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-4" role="status" aria-label="Loading messages">
      {Array.from({ length: count }).map((_, i) => (
        <MessageSkeleton key={i} isUser={i % 2 === 0} />
      ))}
      <span className="sr-only">Loading chat messages...</span>
    </div>
  );
}
