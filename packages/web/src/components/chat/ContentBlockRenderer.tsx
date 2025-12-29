// Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
// Licensed under the FSL-1.1-NC.

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { devLog } from '@/utils/logger';
import type { ContentBlock } from '@/types';
import { AudioPlayer } from '@/components/voice/AudioPlayer';
import { CodeHighlighter } from './CodeHighlighter';
import { Terminal, Brain, AlertCircle, CheckCircle, Loader2, Mic, Volume2, ChevronDown, ChevronUp } from 'lucide-react';

interface ContentBlockRendererProps {
  block: ContentBlock;
  isUserMessage?: boolean;
}

export function ContentBlockRenderer({ block, isUserMessage = false }: ContentBlockRendererProps) {
  switch (block.blockType) {
    case 'text':
      return <TextBlock content={block.content} isUserMessage={isUserMessage} />;
    case 'code':
      return (
        <CodeHighlighter
          code={block.content}
          language={block.metadata?.language}
        />
      );
    case 'tool':
      return (
        <ToolBlock
          toolName={block.metadata?.toolName}
          toolInput={block.metadata?.toolInput}
          toolOutput={block.metadata?.toolOutput}
          toolStatus={block.metadata?.toolStatus}
        />
      );
    case 'thinking':
      return <ThinkingBlock content={block.content} />;
    case 'error':
      return <ErrorBlock content={block.content} errorCode={block.metadata?.errorCode} />;
    case 'status':
      return <StatusBlock content={block.content} />;
    case 'voice_input':
      return (
        <VoiceInputBlock
          content={block.content}
          audioUrl={block.metadata?.audioUrl}
          audioBase64={block.metadata?.audioBase64}
          duration={block.metadata?.duration}
          isUserMessage={isUserMessage}
        />
      );
    case 'voice_output':
      return (
        <VoiceOutputBlock
          content={block.content}
          audioUrl={block.metadata?.audioUrl}
          audioBase64={block.metadata?.audioBase64}
          messageId={block.metadata?.messageId}
          hasAudio={block.metadata?.hasAudio}
        />
      );
    default:
      return <TextBlock content={block.content} isUserMessage={isUserMessage} />;
  }
}

function TextBlock({ content, isUserMessage }: { content: string; isUserMessage: boolean }) {
  const renderInlineFormatting = (text: string, keyPrefix: string): React.ReactNode[] => {
    const result: React.ReactNode[] = [];
    let remaining = text;
    let keyIndex = 0;

    while (remaining.length > 0) {
      // Match patterns in order of specificity
      // Inline code: `code`
      const codeMatch = remaining.match(/^`([^`]+)`/);
      if (codeMatch) {
        result.push(
          <code
            key={`${keyPrefix}-${keyIndex++}`}
            className={cn(
              'px-1 py-0.5 rounded text-sm font-mono',
              isUserMessage ? 'bg-primary-foreground/20' : 'bg-muted'
            )}
          >
            {codeMatch[1]}
          </code>
        );
        remaining = remaining.slice(codeMatch[0].length);
        continue;
      }

      // Bold: **text** or __text__
      const boldMatch = remaining.match(/^(\*\*|__)(.+?)\1/);
      if (boldMatch?.[2]) {
        result.push(
          <strong key={`${keyPrefix}-${keyIndex++}`} className="font-semibold">
            {renderInlineFormatting(boldMatch[2], `${keyPrefix}-b${keyIndex}`)}
          </strong>
        );
        remaining = remaining.slice(boldMatch[0].length);
        continue;
      }

      // Italic: *text* or _text_ (but not ** or __)
      const italicMatch = remaining.match(/^(\*|_)(?!\1)(.+?)\1(?!\1)/);
      if (italicMatch?.[2]) {
        result.push(
          <em key={`${keyPrefix}-${keyIndex++}`} className="italic">
            {renderInlineFormatting(italicMatch[2], `${keyPrefix}-i${keyIndex}`)}
          </em>
        );
        remaining = remaining.slice(italicMatch[0].length);
        continue;
      }

      // Links: [text](url)
      const linkMatch = remaining.match(/^\[([^\]]+)\]\(([^)]+)\)/);
      if (linkMatch) {
        result.push(
          <a
            key={`${keyPrefix}-${keyIndex++}`}
            href={linkMatch[2]}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
              'underline underline-offset-2 hover:opacity-80',
              isUserMessage ? 'text-primary-foreground' : 'text-primary'
            )}
          >
            {linkMatch[1]}
          </a>
        );
        remaining = remaining.slice(linkMatch[0].length);
        continue;
      }

      // Find next special character or end
      const nextSpecialIndex = remaining.slice(1).search(/[`*_[]/);
      if (nextSpecialIndex === -1) {
        result.push(<span key={`${keyPrefix}-${keyIndex++}`}>{remaining}</span>);
        break;
      } else {
        const plainText = remaining.slice(0, nextSpecialIndex + 1);
        result.push(<span key={`${keyPrefix}-${keyIndex++}`}>{plainText}</span>);
        remaining = remaining.slice(nextSpecialIndex + 1);
      }
    }

    return result;
  };

  // Split by newlines to handle line breaks properly
  const lines = (content || '').split('\n');

  return (
    <div className="whitespace-pre-wrap break-words space-y-1">
      {lines.map((line, lineIndex) => (
        <p key={lineIndex} className={line === '' ? 'h-4' : undefined}>
          {renderInlineFormatting(line, `line-${lineIndex}`)}
        </p>
      ))}
    </div>
  );
}



function ToolBlock({
  toolName,
  toolInput,
  toolOutput,
  toolStatus,
}: {
  toolName?: string;
  toolInput?: string;
  toolOutput?: string;
  toolStatus?: 'running' | 'completed' | 'failed';
}) {
  // Default to collapsed (like mobile clients)
  const [isExpanded, setIsExpanded] = useState(false);

  // Format tool name: convert snake_case to readable format
  const displayName = toolName
    ? toolName.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
    : 'Tool';

  return (
    <div className="my-2 rounded-lg overflow-hidden border bg-orange-500/10">
      {/* Header - always visible, clickable to expand/collapse */}
      <button
        type="button"
        className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-orange-500/5 transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        {/* Status icon */}
        {toolStatus === 'running' && (
          <Loader2 className="w-4 h-4 animate-spin text-blue-500 flex-shrink-0" />
        )}
        {toolStatus === 'completed' && (
          <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />
        )}
        {toolStatus === 'failed' && (
          <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
        )}
        {!toolStatus && <Terminal className="w-4 h-4 flex-shrink-0" />}

        <span className="font-medium flex-1 text-left">{displayName}</span>

        {/* Expand/collapse chevron */}
        {isExpanded ? (
          <ChevronUp className="w-4 h-4 text-muted-foreground flex-shrink-0" />
        ) : (
          <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" />
        )}
      </button>

      {/* Collapsible content */}
      {isExpanded && (
        <div className="px-3 pb-3 space-y-3">
          {toolInput && (
            <div>
              <span className="text-xs text-muted-foreground">Input:</span>
              <div className="mt-1 p-2 rounded bg-muted/50 max-h-48 overflow-auto">
                <pre className="whitespace-pre-wrap text-xs font-mono">
                  {toolInput}
                </pre>
              </div>
            </div>
          )}
          {toolOutput && (
            <div>
              <span className="text-xs text-muted-foreground">Output:</span>
              <div className="mt-1 p-2 rounded bg-background/50 max-h-48 overflow-auto">
                <pre className="whitespace-pre-wrap text-xs font-mono">
                  {toolOutput}
                </pre>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ThinkingBlock({ content }: { content: string }) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="my-2 rounded-lg overflow-hidden border border-dashed bg-purple-500/5">
      <button
        type="button"
        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground hover:bg-purple-500/5 transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <Brain className="w-4 h-4 text-purple-500 flex-shrink-0" />
        <span className="flex-1 text-left italic">Thinking...</span>
        {isExpanded ? (
          <ChevronUp className="w-4 h-4 flex-shrink-0" />
        ) : (
          <ChevronDown className="w-4 h-4 flex-shrink-0" />
        )}
      </button>
      {isExpanded && (
        <div className="px-3 pb-3 text-sm text-muted-foreground italic border-t border-dashed">
          <pre className="whitespace-pre-wrap text-xs pt-2">{content}</pre>
        </div>
      )}
    </div>
  );
}

function ErrorBlock({ content, errorCode }: { content: string; errorCode?: string }) {
  return (
    <div className="my-2 rounded-lg overflow-hidden border border-destructive/50 bg-destructive/10">
      <div className="flex items-center gap-2 px-3 py-1.5 text-sm text-destructive">
        <AlertCircle className="w-3 h-3" />
        <span className="font-medium">Error{errorCode ? `: ${errorCode}` : ''}</span>
      </div>
      <div className="px-3 py-2 text-sm text-destructive">
        <p className="whitespace-pre-wrap">{content}</p>
      </div>
    </div>
  );
}

function StatusBlock({ content }: { content: string }) {
  return (
    <div className="my-2 text-center text-sm text-muted-foreground">
      <span className="px-3 py-1 rounded-full bg-muted">{content}</span>
    </div>
  );
}

function VoiceInputBlock({
  content,
  audioUrl,
  audioBase64,
  duration,
  isUserMessage,
}: {
  content: string;
  audioUrl?: string;
  audioBase64?: string;
  duration?: number;
  isUserMessage: boolean;
}) {
  const hasAudio = Boolean(audioUrl || audioBase64);

  return (
    <div className="space-y-2">
      {/* Voice indicator with duration */}
      <div
        className={cn(
          'flex items-center gap-2 text-sm',
          isUserMessage ? 'text-primary-foreground/70' : 'text-muted-foreground'
        )}
      >
        <Mic className="w-3 h-3" />
        <span>Voice message</span>
        {duration && (
          <span className="tabular-nums">
            {Math.floor(duration / 60)}:{(duration % 60).toString().padStart(2, '0')}
          </span>
        )}
      </div>

      {/* Audio player if audio is available */}
      {hasAudio && (
        <AudioPlayer
          audioUrl={audioUrl}
          audioBase64={audioBase64}
          className={cn(
            isUserMessage
              ? 'bg-primary-foreground/10'
              : 'bg-background/50'
          )}
        />
      )}

      {/* Transcription text */}
      {content && (
        <p className="whitespace-pre-wrap break-words text-sm italic">
          {content}
        </p>
      )}
    </div>
  );
}

function VoiceOutputBlock({
  content,
  audioUrl,
  audioBase64,
  messageId,
  hasAudio,
}: {
  content: string;
  audioUrl?: string;
  audioBase64?: string;
  messageId?: string;
  hasAudio?: boolean;
}) {
  // Audio is available if we have direct audio data OR a messageId to fetch it
  const audioAvailable = Boolean(audioUrl || audioBase64 || messageId);

  // Always show voice output block if hasAudio is true
  const shouldShowAudioPlayer = audioAvailable || hasAudio;

  devLog.audio('VoiceOutputBlock render:', {
    content: content?.slice(0, 50),
    audioUrl: !!audioUrl,
    audioBase64: !!audioBase64,
    messageId,
    hasAudio,
    audioAvailable,
    shouldShowAudioPlayer,
  });

  return (
    <div className="space-y-2">
      {/* Voice indicator header */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Volume2 className="w-4 h-4" />
        <span>Voice response</span>
      </div>

      {/* Text content (spoken text) */}
      {content && (
        <p className="whitespace-pre-wrap break-words">{content}</p>
      )}

      {/* Audio player if audio is available */}
      {shouldShowAudioPlayer && (
        <AudioPlayer
          audioUrl={audioUrl}
          audioBase64={audioBase64}
          messageId={messageId}
          className="bg-background/50"
        />
      )}
    </div>
  );
}
