// Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
// Licensed under the FSL-1.1-NC.

import { cn } from '@/lib/utils';
import { TypingIndicator } from './TypingIndicator';
import {
  SupervisorIcon,
  ClaudeIcon,
  CursorIcon,
  OpenCodeIcon,
  TerminalIcon,
  AgentIcon,
} from '@/components/icons';

interface ThinkingBubbleProps {
  agentType?: 'supervisor' | 'claude' | 'cursor' | 'opencode' | 'terminal' | 'backlog-agent';
  className?: string;
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
 * Separate thinking/loading bubble shown when agent is processing
 * but hasn't started streaming a response yet.
 * Matches iOS design with agent avatar + typing indicator.
 */
export function ThinkingBubble({ agentType, className }: ThinkingBubbleProps) {
  return (
    <div
      className={cn('flex gap-3 mb-4', className)}
      role="status"
      aria-label="Agent is thinking"
    >
      {/* Avatar */}
      <AgentAvatar agentType={agentType} />

      {/* Typing indicator bubble */}
      <div className="flex-1 max-w-[85%] md:max-w-[75%]">
        <div className="rounded-2xl px-4 py-3 bg-muted rounded-bl-sm inline-block">
          <TypingIndicator />
        </div>
      </div>
    </div>
  );
}
