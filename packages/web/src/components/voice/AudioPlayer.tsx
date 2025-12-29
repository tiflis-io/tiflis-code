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
import { AudioPlayerService } from '@/services/audio';
import { WebSocketService } from '@/services/websocket/WebSocketService';
import { logger, devLog } from '@/utils/logger';
import type { AudioRequestMessage } from '@/types/protocol';

const TTS_AUDIO_MIME_TYPE = 'audio/wav';

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

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const progressBarRef = useRef<HTMLDivElement>(null);
  const wasPlayingBeforeDrag = useRef(false);
  const hasInitialized = useRef(false);

  const hasDirectAudio = Boolean(audioBase64 || audioUrl);
  const hasCachedAudio = messageId ? AudioPlayerService.hasAudio(messageId) : false;
  const canFetchAudio = Boolean(messageId) && !hasDirectAudio && !hasCachedAudio;

  const displayTime = dragTime !== null ? dragTime : currentTime;
  const progress = duration > 0 ? (displayTime / duration) * 100 : 0;

  const setupAudioElement = useCallback((audio: HTMLAudioElement) => {
    audioRef.current = audio;

    const updateProgress = () => {
      if (audioRef.current && !audioRef.current.paused) {
        setCurrentTime(audioRef.current.currentTime);
        animationFrameRef.current = requestAnimationFrame(updateProgress);
      }
    };

    const handleLoadedMetadata = () => {
      if (audioRef.current && !isNaN(audioRef.current.duration)) {
        setDuration(audioRef.current.duration);
      }
    };

    const handleEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
      if (audioRef.current) {
        audioRef.current.currentTime = 0;
      }
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      AudioPlayerService.unregisterAudio(audio);
      onPlayEnd?.();
    };

    const handlePlay = () => {
      setIsPlaying(true);
      onPlayStart?.();
      updateProgress();
    };

    const handlePause = () => {
      setIsPlaying(false);
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };

    const handleError = () => {
      setError('Failed to load audio');
      setIsLoading(false);
    };

    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('play', handlePlay);
    audio.addEventListener('pause', handlePause);
    audio.addEventListener('error', handleError);

    if (audio.duration && !isNaN(audio.duration)) {
      setDuration(audio.duration);
    }

    if (!audio.paused) {
      setIsPlaying(true);
      updateProgress();
    }

    setAudioReady(true);

    return () => {
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('play', handlePlay);
      audio.removeEventListener('pause', handlePause);
      audio.removeEventListener('error', handleError);
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [onPlayStart, onPlayEnd]);

  useEffect(() => {
    if (hasInitialized.current) return;

    let cleanup: (() => void) | undefined;

    if (messageId && AudioPlayerService.hasAudio(messageId)) {
      const cachedAudio = AudioPlayerService.getAudio(messageId);
      if (cachedAudio) {
        cleanup = setupAudioElement(cachedAudio);
        hasInitialized.current = true;
      }
    } else if (audioBase64 || audioUrl) {
      const audioSource = audioBase64
        ? `data:${TTS_AUDIO_MIME_TYPE};base64,${audioBase64}`
        : audioUrl;

      if (audioSource) {
        const audio = new Audio(audioSource);
        cleanup = setupAudioElement(audio);
        hasInitialized.current = true;
      }
    }

    return () => {
      cleanup?.();
    };
  }, [audioUrl, audioBase64, messageId, setupAudioElement]);

  useEffect(() => {
    if (!messageId) return;

    const checkPlayingState = () => {
      const currentlyPlayingId = AudioPlayerService.getCurrentMessageId();
      const isThisPlaying = currentlyPlayingId === messageId && AudioPlayerService.isPlaying();
      
      if (isThisPlaying !== isPlaying) {
        setIsPlaying(isThisPlaying);
      }
    };

    const interval = setInterval(checkPlayingState, 100);
    return () => clearInterval(interval);
  }, [messageId, isPlaying]);

  const requestAudio = useCallback(async () => {
    if (!messageId || isLoading) return;

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
          return;
        }

        const audioData = response.payload.audio || response.payload.audio_base64;

        if (audioData) {
          const audio = new Audio(`data:${TTS_AUDIO_MIME_TYPE};base64,${audioData}`);
          setupAudioElement(audio);
          AudioPlayerService.stop();
          AudioPlayerService.registerAudio(audio, messageId);
          audio.play().catch((e) => logger.warn('Play failed:', e));
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
  }, [messageId, isLoading, setupAudioElement]);

  const togglePlay = useCallback(() => {
    if (!audioReady && canFetchAudio) {
      requestAudio();
      return;
    }

    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
    } else {
      AudioPlayerService.stop();
      AudioPlayerService.registerAudio(audio, messageId);
      audio.play().catch((e) => logger.warn('Play failed:', e));
    }
  }, [isPlaying, audioReady, canFetchAudio, requestAudio, messageId]);

  const resetToStart = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const wasPlaying = !audio.paused;
    audio.pause();
    audio.currentTime = 0;
    setCurrentTime(0);
    setIsPlaying(false);
    AudioPlayerService.unregisterAudio(audio);

    if (wasPlaying) {
      AudioPlayerService.registerAudio(audio, messageId);
      audio.play().catch((e) => logger.warn('Play failed:', e));
    }

    if ('vibrate' in navigator) {
      navigator.vibrate(10);
    }
  }, [messageId]);

  const formatTime = useCallback((time: number) => {
    if (isNaN(time) || !isFinite(time)) return '0:00';
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }, []);

  const getPositionFromEvent = useCallback((e: MouseEvent | TouchEvent | React.MouseEvent | React.TouchEvent) => {
    if (!progressBarRef.current || !duration) return null;

    const rect = progressBarRef.current.getBoundingClientRect();
    const clientX = 'touches' in e
      ? e.touches[0]?.clientX ?? e.changedTouches[0]?.clientX ?? 0
      : e.clientX;

    const percent = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    return percent * duration;
  }, [duration]);

  const handleDragStart = useCallback((e: React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>) => {
    if (!audioRef.current || !duration || isLoading) return;

    e.preventDefault();
    e.stopPropagation();

    wasPlayingBeforeDrag.current = isPlaying;

    if (isPlaying) {
      audioRef.current.pause();
    }

    setIsDragging(true);

    const newTime = getPositionFromEvent(e);
    if (newTime !== null) {
      setDragTime(newTime);
      if ('vibrate' in navigator) {
        navigator.vibrate(5);
      }
    }
  }, [duration, isLoading, isPlaying, getPositionFromEvent]);

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
      if (newTime !== null && audioRef.current) {
        audioRef.current.currentTime = newTime;
        setCurrentTime(newTime);

        if (wasPlayingBeforeDrag.current) {
          audioRef.current.play().catch((err) => logger.warn('Resume play failed:', err));
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
  }, [isDragging, getPositionFromEvent]);

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

    if (!audioRef.current || !duration || isLoading) return;

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
    audioRef.current.currentTime = newTime;
    setCurrentTime(newTime);
  }, [currentTime, duration, isLoading, togglePlay, resetToStart]);

  if (!hasDirectAudio && !hasCachedAudio && !canFetchAudio && !error) {
    return null;
  }

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
        disabled={isLoading}
        className={cn(
          'flex items-center justify-center w-10 h-10 rounded-full shrink-0 transition-all active:scale-95',
          isLoading && 'opacity-70 cursor-wait',
          'bg-primary text-primary-foreground'
        )}
        aria-label={
          isLoading
            ? 'Loading audio'
            : isPlaying
              ? 'Pause audio'
              : 'Play audio'
        }
        aria-busy={isLoading}
      >
        {isLoading ? (
          <Loader2 className="w-5 h-5 animate-spin" aria-hidden="true" />
        ) : isPlaying ? (
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
            audioReady && !isLoading && 'cursor-pointer',
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
            {isLoading ? '...' : formatTime(displayTime)}
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
