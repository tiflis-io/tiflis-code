// Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
// Licensed under the FSL-1.1-NC.

import { useState, useRef, useCallback, type KeyboardEvent } from 'react';
import { VoiceRecordButton } from '@/components/voice';
import { ArrowUp, Square } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ChatInputProps {
  onSend: (text: string) => void;
  onSendAudio?: (audioBlob: Blob, format: string) => void;
  onCancel?: () => void;
  isLoading?: boolean;
  placeholder?: string;
  disabled?: boolean;
  showVoice?: boolean;
}

export function ChatInput({
  onSend,
  onSendAudio,
  onCancel,
  isLoading = false,
  placeholder = 'Message...',
  disabled = false,
  showVoice = true,
}: ChatInputProps) {
  const [text, setText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSubmit = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed || isLoading || disabled) return;

    onSend(trimmed);
    setText('');

    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  }, [text, isLoading, disabled, onSend]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      // Return sends, Shift+Return creates newline
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit]
  );

  const handleInput = useCallback(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      // Auto-resize textarea (1-6 lines like iOS)
      textarea.style.height = 'auto';
      const lineHeight = 24; // Approximate line height
      const maxLines = 6;
      const maxHeight = lineHeight * maxLines;
      textarea.style.height = `${Math.min(textarea.scrollHeight, maxHeight)}px`;
    }
  }, []);

  const handleRecordingComplete = useCallback(
    (audioBlob: Blob, format: string) => {
      onSendAudio?.(audioBlob, format);
    },
    [onSendAudio]
  );

  const canSend = text.trim() && !isLoading && !disabled;

  return (
    <footer className="border-t bg-background/80 backdrop-blur-xl supports-[backdrop-filter]:bg-background/60 px-3 py-3">
      <div className="max-w-3xl mx-auto">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSubmit();
          }}
          className="flex items-end gap-3"
          role="form"
          aria-label="Message input"
        >
          {/* Text input - pill shape like iOS */}
          <div className="flex-1 min-w-0">
            <label htmlFor="chat-input" className="sr-only">
              Message input
            </label>
            <textarea
              id="chat-input"
              ref={textareaRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={handleKeyDown}
              onInput={handleInput}
              placeholder={placeholder}
              disabled={disabled}
              rows={1}
              aria-label="Type your message"
              className={cn(
                'w-full resize-none rounded-[20px] bg-muted px-4 py-3',
                'text-base leading-6',
                'border-0 focus:outline-none focus:ring-2 focus:ring-primary/50',
                'placeholder:text-muted-foreground/60',
                'min-h-[48px]',
                disabled && 'opacity-50 cursor-not-allowed'
              )}
            />
          </div>

          {/* Voice Record Button - 36x36 like iOS */}
          {showVoice && onSendAudio && (
            <VoiceRecordButton
              onRecordingComplete={handleRecordingComplete}
              disabled={disabled || isLoading}
            />
          )}

          {/* Send or Stop button - circular filled like iOS */}
          {isLoading && onCancel ? (
            <button
              type="button"
              onClick={onCancel}
              className={cn(
                'flex items-center justify-center shrink-0',
                'w-9 h-9 rounded-full',
                'bg-destructive text-destructive-foreground',
                'transition-transform active:scale-95'
              )}
              aria-label="Stop generation"
            >
              <Square className="w-4 h-4" fill="currentColor" aria-hidden="true" />
            </button>
          ) : (
            <button
              type="submit"
              disabled={!canSend}
              className={cn(
                'flex items-center justify-center shrink-0',
                'w-9 h-9 rounded-full',
                'transition-all active:scale-95',
                canSend
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground/50 cursor-not-allowed'
              )}
              aria-label="Send message"
            >
              <ArrowUp className="w-5 h-5" strokeWidth={2.5} aria-hidden="true" />
            </button>
          )}
        </form>
      </div>
    </footer>
  );
}
