// Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
// Licensed under the FSL-1.1-NC.

import { useState, useRef, useCallback, useEffect } from 'react';
import {
  Play,
  Pause,
  RotateCcw,
  Loader2,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { AudioPlayerService, type AudioState } from '@/services/audio';
import { WebSocketService } from '@/services/websocket/WebSocketService';
import { devLog } from '@/utils/logger';
import type { AudioRequestMessage } from '@/types/protocol';

interface AudioPlayerProps {
  audioUrl?: string;
  audioBase64?: string;
  messageId?: string;
  className?: string;
  onPlayStart?: () => void;
  onPlayEnd?: () => void;
}

export function AudioPlayer({
  audioUrl,
  audioBase64,
  messageId,
  className,
  onPlayStart,
  onPlayEnd,
}: AudioPlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [audioReady, setAudioReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragTime, setDragTime] = useState<number | null>(null);
  const [isFetching, setIsFetching] = useState(false);

  const progressBarRef = useRef<HTMLDivElement>(null);
  const wasPlayingBeforeDrag = useRef(false);
  const hasInitialized = useRef(false);
  const prevIsPlaying = useRef(false);

  const hasDirectAudio = Boolean(audioBase64 || audioUrl);
  const hasCachedAudio = messageId ? AudioPlayerService.hasAudio(messageId) : false;
  const canFetchAudio = Boolean(messageId) && !hasDirectAudio && !hasCachedAudio && !audioReady;

  const displayTime = dragTime !== null ? dragTime : currentTime;
  const progress = duration > 0 ? (displayTime / duration) * 100 : 0;

  // Subscribe to AudioPlayerService state changes
  useEffect(() => {
    const unsubscribe = AudioPlayerService.subscribe((state: AudioState) => {
      // Check if this audio player instance should respond to state changes
      const isThisAudio = state.messageId === messageId;
      
      if (isThisAudio) {
        // This is our audio - update all state
        setIsPlaying(state.isPlaying);
        setIsLoading(state.isLoading);
        setCurrentTime(state.currentTime);
        if (state.duration > 0) {
          setDuration(state.duration);
          setAudioReady(true);
        }
        if (state.error) {
          setError(state.error);
        }
        
        // Track play state changes for callbacks
        if (state.isPlaying && !prevIsPlaying.current) {
          onPlayStart?.();
        } else if (!state.isPlaying && prevIsPlaying.current && state.currentTime === 0) {
          onPlayEnd?.();
        }
        prevIsPlaying.current = state.isPlaying;
      } else if (prevIsPlaying.current && state.messageId !== messageId) {
        // Another audio started playing - we should stop showing as playing
        setIsPlaying(false);
        prevIsPlaying.current = false;
      }
    });

    return unsubscribe;
  }, [messageId, onPlayStart, onPlayEnd]);

  // Initialize audio on mount
  useEffect(() => {
    if (hasInitialized.current) return;
    
    if (messageId && AudioPlayerService.hasAudio(messageId)) {
      // Audio is cached, get duration
      const audio = AudioPlayerService.getAudio(messageId);
      if (audio) {
        if (audio.duration && !isNaN(audio.duration)) {
          setDuration(audio.duration);
        } else {
          const onMeta = () => {
            if (!isNaN(audio.duration)) {
              setDuration(audio.duration);
            }
            audio.removeEventListener('loadedmetadata', onMeta);
          };
          audio.addEventListener('loadedmetadata', onMeta);
        }
        setAudioReady(true);
        hasInitialized.current = true;
      }
    } else if (audioBase64) {
      // Direct audio data - play through service
      if (messageId) {
        AudioPlayerService.playAudio(audioBase64, messageId, false);
        setAudioReady(true);
        hasInitialized.current = true;
      }
    }
  }, [audioBase64, messageId]);

  // Request audio from server
  const requestAudio = useCallback(async () => {
    if (!messageId || isFetching) return;

    setIsFetching(true);
    setIsLoading(true);
    setError(null);

    devLog.audio(`Requesting audio for messageId: ${messageId}`);

    const tryRequest = async (attempt: number = 1): Promise<void> => {
      try {
        const request: AudioRequestMessage = {
          type: 'audio.request',
          id: crypto.randomUUID(),
          payload: { message_id: messageId },
        };
        const response = await WebSocketService.sendRequest<{
          payload: { audio?: string; audio_base64?: string; error?: string };
        }>(request);

        if (response.payload.error) {
          if (response.payload.error === 'Audio not found' && attempt < 3) {
            await new Promise(resolve => setTimeout(resolve, 1000));
            return tryRequest(attempt + 1);
          }
          if (response.payload.error === 'Audio not found') {
            setError('Audio unavailable - TTS may be disabled');
          } else {
            setError(response.payload.error);
          }
          setIsLoading(false);
          setIsFetching(false);
          return;
        }

        const audioData = response.payload.audio || response.payload.audio_base64;

        if (audioData) {
          // Play through service - this will cache and play
          AudioPlayerService.playAudio(audioData, messageId, true);
          setAudioReady(true);
          hasInitialized.current = true;
        } else {
          if (attempt < 3) {
            await new Promise(resolve => setTimeout(resolve, 1000));
            return tryRequest(attempt + 1);
          }
          setError('Audio not available');
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to load audio';
        if (attempt < 3) {
          await new Promise(resolve => setTimeout(resolve, 1000));
          return tryRequest(attempt + 1);
        }
        setError(errorMessage);
      }
    };

    await tryRequest();
    setIsLoading(false);
    setIsFetching(false);
  }, [messageId, isFetching]);

  // Toggle play/pause
  const togglePlay = useCallback(() => {
    // If audio not ready and we can fetch, request it
    if (!audioReady && canFetchAudio) {
      requestAudio();
      return;
    }

    // If this is not the current audio, start playing it
    if (messageId && AudioPlayerService.getCurrentMessageId() !== messageId) {
      if (AudioPlayerService.hasAudio(messageId)) {
        AudioPlayerService.playByMessageId(messageId);
      } else if (audioBase64) {
        AudioPlayerService.playAudio(audioBase64, messageId, true);
      }
      return;
    }

    // Toggle current audio
    AudioPlayerService.togglePlay();
  }, [audioReady, canFetchAudio, requestAudio, messageId, audioBase64]);

  // Reset to start
  const resetToStart = useCallback(() => {
    if (messageId && AudioPlayerService.getCurrentMessageId() === messageId) {
      AudioPlayerService.resetToStart();
      if ('vibrate' in navigator) {
        navigator.vibrate(10);
      }
    }
  }, [messageId]);

  // Format time
  const formatTime = useCallback((time: number) => {
    if (isNaN(time) || !isFinite(time)) return '0:00';
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }, []);

  // Get position from event
  const getPositionFromEvent = useCallback((e: MouseEvent | TouchEvent | React.MouseEvent | React.TouchEvent) => {
    if (!progressBarRef.current || !duration) return null;

    const rect = progressBarRef.current.getBoundingClientRect();
    const clientX = 'touches' in e
      ? e.touches[0]?.clientX ?? e.changedTouches[0]?.clientX ?? 0
      : e.clientX;

    const percent = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    return percent * duration;
  }, [duration]);

  // Handle drag start
  const handleDragStart = useCallback((e: React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>) => {
    if (!duration || isLoading) return;

    e.preventDefault();
    e.stopPropagation();

    wasPlayingBeforeDrag.current = isPlaying;

    if (isPlaying && messageId && AudioPlayerService.getCurrentMessageId() === messageId) {
      AudioPlayerService.togglePlay(); // Pause
    }

    setIsDragging(true);

    const newTime = getPositionFromEvent(e);
    if (newTime !== null) {
      setDragTime(newTime);
      if ('vibrate' in navigator) {
        navigator.vibrate(5);
      }
    }
  }, [duration, isLoading, isPlaying, messageId, getPositionFromEvent]);

  // Handle drag
  useEffect(() => {
    if (!isDragging) return;

    const handleMove = (e: MouseEvent | TouchEvent) => {
      e.preventDefault();
      const newTime = getPositionFromEvent(e);
      if (newTime !== null) {
        setDragTime(newTime);
      }
    };

    const handleEnd = (e: MouseEvent | TouchEvent) => {
      const newTime = getPositionFromEvent(e);
      if (newTime !== null && messageId) {
        AudioPlayerService.seekToTime(newTime);
        setCurrentTime(newTime);

        if (wasPlayingBeforeDrag.current) {
          AudioPlayerService.togglePlay(); // Resume
        }
      }
      setDragTime(null);
      setIsDragging(false);

      if ('vibrate' in navigator) {
        navigator.vibrate(10);
      }
    };

    document.addEventListener('mousemove', handleMove, { passive: false });
    document.addEventListener('mouseup', handleEnd);
    document.addEventListener('touchmove', handleMove, { passive: false });
    document.addEventListener('touchend', handleEnd);

    return () => {
      document.removeEventListener('mousemove', handleMove);
      document.removeEventListener('mouseup', handleEnd);
      document.removeEventListener('touchmove', handleMove);
      document.removeEventListener('touchend', handleEnd);
    };
  }, [isDragging, getPositionFromEvent, messageId]);

  // Handle keyboard
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === ' ' || e.key === 'Spacebar') {
      e.preventDefault();
      togglePlay();
      return;
    }

    if (e.key === 'r' || e.key === 'R') {
      e.preventDefault();
      resetToStart();
      return;
    }

    if (!duration || isLoading) return;

    const step = duration * 0.05;
    let newTime = currentTime;

    switch (e.key) {
      case 'ArrowLeft':
        newTime = Math.max(0, currentTime - step);
        break;
      case 'ArrowRight':
        newTime = Math.min(duration, currentTime + step);
        break;
      case 'Home':
        newTime = 0;
        break;
      case 'End':
        newTime = duration;
        break;
      default:
        return;
    }

    e.preventDefault();
    if (messageId) {
      AudioPlayerService.seekToTime(newTime);
      setCurrentTime(newTime);
    }
  }, [currentTime, duration, isLoading, togglePlay, resetToStart, messageId]);

  // Don't render if no audio source
  if (!hasDirectAudio && !hasCachedAudio && !canFetchAudio && !error && !audioReady) {
    return null;
  }

  // Error state
  if (error) {
    return (
      <div
        className={cn(
          'flex items-center gap-3 py-2 text-destructive',
          className
        )}
        role="alert"
      >
        <div className="flex items-center justify-center w-10 h-10 rounded-full shrink-0 bg-destructive/10">
          <AlertCircle className="w-5 h-5" aria-hidden="true" />
        </div>
        <div className="flex-1 flex items-center gap-2">
          <span className="text-sm">{error}</span>
          {canFetchAudio && (
            <button
              type="button"
              onClick={() => {
                setError(null);
                requestAudio();
              }}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Retry loading audio"
            >
              <RefreshCw className="w-3 h-3" aria-hidden="true" />
              Retry
            </button>
          )}
        </div>
      </div>
    );
  }

  const showLoading = isLoading || isFetching;
  const isThisPlaying = isPlaying && messageId && AudioPlayerService.getCurrentMessageId() === messageId;

  return (
    <div
      className={cn(
        'flex items-center gap-3 p-3 rounded-2xl bg-muted select-none',
        className
      )}
      role="group"
      aria-label="Audio player"
      tabIndex={0}
      onKeyDown={handleKeyDown}
    >
      <button
        type="button"
        onClick={togglePlay}
        disabled={showLoading}
        className={cn(
          'flex items-center justify-center w-10 h-10 rounded-full shrink-0 transition-all active:scale-95',
          showLoading && 'opacity-70 cursor-wait',
          'bg-primary text-primary-foreground'
        )}
        aria-label={
          showLoading
            ? 'Loading audio'
            : isThisPlaying
              ? 'Pause audio'
              : 'Play audio'
        }
        aria-busy={showLoading}
      >
        {showLoading ? (
          <Loader2 className="w-5 h-5 animate-spin" aria-hidden="true" />
        ) : isThisPlaying ? (
          <Pause className="w-5 h-5" fill="currentColor" aria-hidden="true" />
        ) : (
          <Play className="w-5 h-5 ml-0.5" fill="currentColor" aria-hidden="true" />
        )}
      </button>

      <div className="flex-1 flex flex-col gap-1.5 min-w-0">
        <div
          ref={progressBarRef}
          className={cn(
            'relative h-1.5 rounded-full bg-secondary-foreground/20 touch-none overflow-hidden',
            audioReady && !showLoading && 'cursor-pointer',
            isDragging && 'cursor-grabbing'
          )}
          role="slider"
          tabIndex={-1}
          aria-valuenow={Math.round(progress)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`Audio progress: ${formatTime(displayTime)} of ${formatTime(duration)}`}
          onMouseDown={handleDragStart}
          onTouchStart={handleDragStart}
        >
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-primary"
            style={{ width: `${progress}%` }}
          />

          {isDragging && dragTime !== null && (
            <div
              className="absolute -top-8 transform -translate-x-1/2 px-2 py-1 bg-popover border rounded shadow-lg text-xs font-medium tabular-nums pointer-events-none z-10"
              style={{ left: `${progress}%` }}
            >
              {formatTime(dragTime)}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
          <span className="tabular-nums">
            {showLoading ? '...' : formatTime(displayTime)}
          </span>
          <span className="tabular-nums">
            {formatTime(duration)}
          </span>
        </div>
      </div>

      {audioReady && currentTime > 0 && (
        <button
          type="button"
          onClick={resetToStart}
          className="p-2 text-muted-foreground hover:text-foreground transition-colors rounded-full hover:bg-muted-foreground/10 active:scale-95"
          aria-label="Reset to start"
        >
          <RotateCcw className="w-4 h-4" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
