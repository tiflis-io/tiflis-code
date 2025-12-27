// Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
// Licensed under the FSL-1.1-NC.

import { useState, useRef, useCallback, useEffect } from 'react';
import {
  Play,
  Pause,
  Square,
  Loader2,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { AudioPlayerService } from '@/services/audio';
import { WebSocketService } from '@/services/websocket/WebSocketService';
import { logger, devLog } from '@/utils/logger';
import type { AudioRequestMessage } from '@/types/protocol';

interface AudioPlayerProps {
  audioUrl?: string;
  audioBase64?: string;
  messageId?: string;
  autoPlay?: boolean;
  className?: string;
  onPlayStart?: () => void;
  onPlayEnd?: () => void;
}

// iOS-style waveform: 30 bars with deterministic heights (matches iOS AudioPlayerView)
const BAR_COUNT = 30;
const WAVEFORM_HEIGHTS = Array.from({ length: BAR_COUNT }, (_, i) => {
  // iOS formula: 0.3 + sin(index * 0.5) * 0.5 + 0.5 * 0.7
  // Simplified to generate heights between 30% and 100%
  const height = 0.3 + Math.sin(i * 0.5) * 0.35 + 0.35;
  return Math.max(0.3, Math.min(1.0, height));
});

export function AudioPlayer({
  audioUrl,
  audioBase64,
  messageId,
  autoPlay = false,
  className,
  onPlayStart,
  onPlayEnd,
}: AudioPlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
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
  const containerRef = useRef<HTMLDivElement>(null);

  // Check if we have audio available (directly or cached)
  const hasDirectAudio = Boolean(audioBase64 || audioUrl);
  const hasCachedAudio = messageId ? AudioPlayerService.hasAudio(messageId) : false;
  const canFetchAudio = Boolean(messageId) && !hasDirectAudio && !hasCachedAudio;

  // Display time (drag time takes precedence during scrubbing)
  const displayTime = dragTime !== null ? dragTime : currentTime;
  const progress = duration > 0 ? (displayTime / duration) * 100 : 0;

  // Setup audio when we have a source
  useEffect(() => {
    let audio: HTMLAudioElement | null = null;

    // Check if audio is cached in AudioPlayerService
    if (messageId && AudioPlayerService.hasAudio(messageId)) {
      audio = AudioPlayerService.getAudio(messageId);
      setAudioReady(true);
    }

    // Create new audio if not cached but we have direct source
    if (!audio && (audioBase64 || audioUrl)) {
      const audioSource = audioBase64
        ? `data:audio/mp3;base64,${audioBase64}`
        : audioUrl;

      if (audioSource) {
        audio = new Audio(audioSource);
        setAudioReady(true);
      }
    }

    if (!audio) {
      setAudioReady(false);
      return;
    }

    audioRef.current = audio;

    const handleLoadedMetadata = () => {
      if (audioRef.current) {
        setDuration(audioRef.current.duration);
      }
    };

    const handleEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      onPlayEnd?.();
    };

    const handlePlay = () => {
      setIsPlaying(true);
      onPlayStart?.();
      // Start animation frame loop for smooth progress updates
      const updateProgress = () => {
        if (audioRef.current && !audioRef.current.paused) {
          setCurrentTime(audioRef.current.currentTime);
          animationFrameRef.current = requestAnimationFrame(updateProgress);
        }
      };
      updateProgress();
    };

    const handlePause = () => {
      setIsPlaying(false);
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };

    const handleWaiting = () => {
      setIsBuffering(true);
    };

    const handleCanPlay = () => {
      setIsBuffering(false);
    };

    const handleError = () => {
      setError('Failed to load audio');
      setIsLoading(false);
      setIsBuffering(false);
    };

    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('play', handlePlay);
    audio.addEventListener('pause', handlePause);
    audio.addEventListener('waiting', handleWaiting);
    audio.addEventListener('canplay', handleCanPlay);
    audio.addEventListener('error', handleError);

    // If duration already loaded (cached audio)
    if (audio.duration && !isNaN(audio.duration)) {
      setDuration(audio.duration);
    }

    if (autoPlay && audio.paused) {
      audio.play().catch(() => {
        logger.log('Autoplay blocked by browser');
      });
    }

    return () => {
      audio?.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio?.removeEventListener('ended', handleEnded);
      audio?.removeEventListener('play', handlePlay);
      audio?.removeEventListener('pause', handlePause);
      audio?.removeEventListener('waiting', handleWaiting);
      audio?.removeEventListener('canplay', handleCanPlay);
      audio?.removeEventListener('error', handleError);
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [audioUrl, audioBase64, messageId, autoPlay, onPlayStart, onPlayEnd]);

  // Request audio from server
  const requestAudio = useCallback(async () => {
    if (!messageId || isLoading) return;

    setIsLoading(true);
    setError(null);
    devLog.audio(`Requesting audio for messageId: ${messageId}`);

    try {
      // Send audio request via WebSocket
      const request: AudioRequestMessage = {
        type: 'audio.request',
        id: crypto.randomUUID(),
        payload: { message_id: messageId },
      };
      const response = await WebSocketService.sendRequest<{
        payload: { audio?: string; audio_base64?: string; error?: string };
      }>(request);

      devLog.audio(`Audio response payload:`, response.payload);

      // Check for server-side error
      if (response.payload.error) {
        setError(response.payload.error);
        return;
      }

      // Server uses 'audio' field, but we also support 'audio_base64' for compatibility
      const audioData = response.payload.audio || response.payload.audio_base64;

      if (audioData) {
        devLog.audio(`Received audio for messageId: ${messageId}, size: ${audioData.length}`);
        // Cache and create audio element
        AudioPlayerService.playAudio(audioData, messageId, false);
        const audio = AudioPlayerService.getAudio(messageId);
        if (audio) {
          audioRef.current = audio;
          setAudioReady(true);
          setDuration(audio.duration || 0);
          // Auto-play after loading
          AudioPlayerService.stop();
          audio.play().catch((e) => logger.warn('Play failed:', e));
        }
      } else {
        setError('Audio not available');
        logger.warn(`No audio in response for messageId: ${messageId}`, response.payload);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load audio';
      setError(errorMessage);
      logger.error(`Failed to fetch audio for messageId: ${messageId}`, err);
    } finally {
      setIsLoading(false);
    }
  }, [messageId, isLoading]);

  const togglePlay = useCallback(() => {
    // If we don't have audio yet, request it
    if (!audioReady && canFetchAudio) {
      requestAudio();
      return;
    }

    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
    } else {
      // Stop any other playing audio first, then register this one
      AudioPlayerService.stop();
      AudioPlayerService.registerAudio(audio, messageId);
      audio.play().catch((e) => logger.warn('Play failed:', e));
    }
  }, [isPlaying, audioReady, canFetchAudio, requestAudio, messageId]);

  // Stop playback completely (reset to beginning)
  const stopPlayback = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;

    audio.pause();
    audio.currentTime = 0;
    setCurrentTime(0);
    setIsPlaying(false);
    AudioPlayerService.unregisterAudio(audio);

    // Haptic feedback
    if ('vibrate' in navigator) {
      navigator.vibrate(10);
    }
  }, []);

  const formatTime = useCallback((time: number) => {
    if (isNaN(time) || !isFinite(time)) return '0:00';
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }, []);

  // Calculate position from mouse/touch event
  const getPositionFromEvent = useCallback((e: MouseEvent | TouchEvent | React.MouseEvent | React.TouchEvent) => {
    if (!progressBarRef.current || !duration) return null;

    const rect = progressBarRef.current.getBoundingClientRect();
    const clientX = 'touches' in e
      ? e.touches[0]?.clientX ?? e.changedTouches[0]?.clientX ?? 0
      : e.clientX;

    const percent = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    return percent * duration;
  }, [duration]);

  // Handle drag start (mousedown/touchstart)
  const handleDragStart = useCallback((e: React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>) => {
    if (!audioRef.current || !duration || isLoading) return;

    e.preventDefault();
    e.stopPropagation();

    // Remember if we were playing
    wasPlayingBeforeDrag.current = isPlaying;

    // Pause during scrub for smooth experience
    if (isPlaying) {
      audioRef.current.pause();
    }

    setIsDragging(true);

    const newTime = getPositionFromEvent(e);
    if (newTime !== null) {
      setDragTime(newTime);

      // Haptic feedback
      if ('vibrate' in navigator) {
        navigator.vibrate(5);
      }
    }
  }, [duration, isLoading, isPlaying, getPositionFromEvent]);

  // Handle drag move and end via document events
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

        // Resume playback if was playing before drag
        if (wasPlayingBeforeDrag.current) {
          audioRef.current.play().catch((err) => logger.warn('Resume play failed:', err));
        }
      }
      setDragTime(null);
      setIsDragging(false);

      // Haptic feedback
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

  // Handle keyboard navigation for accessibility
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    // Space to play/pause
    if (e.key === ' ' || e.key === 'Spacebar') {
      e.preventDefault();
      togglePlay();
      return;
    }

    // Escape or 's' to stop
    if (e.key === 'Escape' || e.key === 's' || e.key === 'S') {
      e.preventDefault();
      stopPlayback();
      return;
    }

    if (!audioRef.current || !duration || isLoading) return;

    const step = duration * 0.05; // 5% step
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
  }, [currentTime, duration, isLoading, togglePlay, stopPlayback]);

  // Show player if we have audio OR can fetch it
  if (!hasDirectAudio && !hasCachedAudio && !canFetchAudio && !error) {
    return null;
  }

  // Show error state
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
      ref={containerRef}
      className={cn(
        // iOS-style container: padding 12pt, bg systemGray6, corner radius 16pt
        'flex items-center gap-3 p-3 rounded-2xl bg-muted select-none',
        className
      )}
      role="group"
      aria-label="Audio player"
      tabIndex={0}
      onKeyDown={handleKeyDown}
    >
      {/* Play/Pause button - 32pt like iOS */}
      <button
        type="button"
        onClick={togglePlay}
        disabled={isLoading}
        className={cn(
          'flex items-center justify-center w-8 h-8 rounded-full shrink-0 transition-all active:scale-95',
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
        {isLoading || isBuffering ? (
          <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
        ) : isPlaying ? (
          <Pause className="w-4 h-4" fill="currentColor" aria-hidden="true" />
        ) : (
          <Play className="w-4 h-4 ml-0.5" fill="currentColor" aria-hidden="true" />
        )}
      </button>

      {/* Waveform and time section */}
      <div className="flex-1 flex flex-col gap-1 min-w-0">
        {/* Waveform visualization - 24pt height like iOS */}
        <div
          ref={progressBarRef}
          className={cn(
            'relative h-6 touch-none',
            audioReady && !isLoading && 'cursor-pointer',
            isDragging && 'cursor-grabbing'
          )}
          role="slider"
          tabIndex={-1}
          aria-valuenow={Math.round(progress)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`Audio progress: ${formatTime(displayTime)} of ${formatTime(duration)}. Use arrow keys to seek.`}
          onMouseDown={handleDragStart}
          onTouchStart={handleDragStart}
        >
          {/* iOS-style waveform: 30 bars with 2pt gap, corner radius 1pt */}
          <div className="absolute inset-0 flex items-center gap-0.5">
            {WAVEFORM_HEIGHTS.map((height, i) => {
              const barProgress = (i + 0.5) / BAR_COUNT;
              const currentProgress = duration > 0 ? displayTime / duration : 0;
              const isPlayed = barProgress <= currentProgress;
              return (
                <div
                  key={i}
                  className={cn(
                    'flex-1 rounded-[1px] transition-colors',
                    isPlaying ? 'duration-100' : 'duration-0',
                    isPlayed ? 'bg-primary' : 'bg-secondary/30'
                  )}
                  style={{ height: `${height * 100}%` }}
                />
              );
            })}
          </div>

          {/* Time tooltip during drag */}
          {isDragging && dragTime !== null && (
            <div
              className="absolute -top-8 transform -translate-x-1/2 px-2 py-1 bg-popover border rounded shadow-lg text-xs font-medium tabular-nums pointer-events-none z-10"
              style={{ left: `${progress}%` }}
            >
              {formatTime(dragTime)}
            </div>
          )}
        </div>

        {/* Time display row - matches iOS .caption2 style */}
        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
          <span className="tabular-nums">
            {isLoading ? '...' : formatTime(displayTime)}
          </span>
          <span className="tabular-nums">
            {formatTime(duration)}
          </span>
        </div>
      </div>

      {/* Stop button - only shown when playing or has progress */}
      {audioReady && (isPlaying || currentTime > 0) && (
        <button
          type="button"
          onClick={stopPlayback}
          className="p-1.5 text-muted-foreground hover:text-destructive transition-colors rounded-full hover:bg-destructive/10 active:scale-95"
          aria-label="Stop and reset audio"
        >
          <Square className="w-4 h-4" fill="currentColor" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
