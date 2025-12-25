// Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
// Licensed under the FSL-1.1-NC.

import { useState, useRef, useCallback, type KeyboardEvent } from 'react';
import { VoiceRecordButton } from '@/components/voice';
import { Send, StopCircle } from 'lucide-react';
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
  placeholder = 'Type a message...',
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
      // Auto-resize textarea
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
    }
  }, []);

  const handleRecordingComplete = useCallback(
    (audioBlob: Blob, format: string) => {
      onSendAudio?.(audioBlob, format);
    },
    [onSendAudio]
  );

  return (
    <div className="border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 px-4 py-3">
      <div className="max-w-3xl mx-auto">
        <div className="flex gap-3 items-end">
          {/* Text input */}
          <div className="flex-1">
            <textarea
              ref={textareaRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={handleKeyDown}
              onInput={handleInput}
              placeholder={placeholder}
              disabled={disabled}
              rows={1}
              className={cn(
                'w-full resize-none rounded-2xl border-0 bg-muted px-4 py-3',
                'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
                'placeholder:text-muted-foreground',
                'min-h-[48px] max-h-[200px]',
                disabled && 'opacity-50 cursor-not-allowed'
              )}
            />
          </div>

          {/* Voice Record Button - matches iOS layout */}
          {showVoice && onSendAudio && (
            <div className="flex items-center justify-center h-12 w-12">
              <VoiceRecordButton
                onRecordingComplete={handleRecordingComplete}
                disabled={disabled || isLoading}
              />
            </div>
          )}

          {/* Send or Stop button - matches iOS SendStopButton */}
          {isLoading && onCancel ? (
            <button
              type="button"
              onClick={onCancel}
              className="flex items-center justify-center h-9 w-9 shrink-0"
              title="Stop generation"
            >
              <StopCircle className="w-9 h-9 text-red-500" fill="currentColor" />
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!text.trim() || isLoading || disabled}
              className={cn(
                'flex items-center justify-center h-9 w-9 shrink-0',
                !text.trim() || isLoading || disabled ? 'opacity-50 cursor-not-allowed' : ''
              )}
              title="Send message"
            >
              <Send
                className={cn(
                  'w-9 h-9',
                  text.trim() && !isLoading && !disabled ? 'text-primary' : 'text-gray-400'
                )}
              />
            </button>
          )}
        </div>

        <p className="text-xs text-muted-foreground mt-2 text-center">
          Press Enter to send, Shift+Enter for new line
        </p>
      </div>
    </div>
  );
}
