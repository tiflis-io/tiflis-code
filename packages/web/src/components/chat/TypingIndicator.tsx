// Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
// Licensed under the FSL-1.1-NC.

import { cn } from '@/lib/utils';

interface TypingIndicatorProps {
  className?: string;
}

/**
 * Typing indicator with 3 animated dots (matches iOS design)
 * Animation: Scale 0.6 → 1.0, duration 0.5s, staggered by 0.15s
 */
export function TypingIndicator({ className }: TypingIndicatorProps) {
  return (
    <div
      className={cn('flex items-center gap-1', className)}
      role="status"
      aria-label="Agent is typing"
    >
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="w-2 h-2 bg-muted-foreground/60 rounded-full animate-[typing-dot_1s_ease-in-out_infinite]"
          style={{
            animationDelay: `${i * 0.15}s`,
          }}
        />
      ))}
    </div>
  );
}
