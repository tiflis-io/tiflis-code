// Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
// Licensed under the FSL-1.1-NC.

import { useState, useRef, useCallback, useEffect } from 'react';
import { Play, Pause, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { AudioPlayerService } from '@/services/audio';
import { WebSocketService } from '@/services/websocket/WebSocketService';
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
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [audioReady, setAudioReady] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  // Check if we have audio available (directly or cached)
  const hasDirectAudio = Boolean(audioBase64 || audioUrl);
  const hasCachedAudio = messageId ? AudioPlayerService.hasAudio(messageId) : false;
  const canFetchAudio = Boolean(messageId) && !hasDirectAudio && !hasCachedAudio;

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

    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('play', handlePlay);
    audio.addEventListener('pause', handlePause);

    // If duration already loaded (cached audio)
    if (audio.duration && !isNaN(audio.duration)) {
      setDuration(audio.duration);
    }

    if (autoPlay && audio.paused) {
      audio.play().catch(() => {
        console.log('Autoplay blocked by browser');
      });
    }

    return () => {
      audio?.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio?.removeEventListener('ended', handleEnded);
      audio?.removeEventListener('play', handlePlay);
      audio?.removeEventListener('pause', handlePause);
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [audioUrl, audioBase64, messageId, autoPlay, onPlayStart, onPlayEnd]);

  // Request audio from server
  const requestAudio = useCallback(async () => {
    if (!messageId || isLoading) return;

    setIsLoading(true);
    console.log(`🔊 Requesting audio for messageId: ${messageId}`);

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

      console.log(`🔊 Audio response payload:`, response.payload);

      // Server uses 'audio' field, but we also support 'audio_base64' for compatibility
      const audioData = response.payload.audio || response.payload.audio_base64;

      if (audioData) {
        console.log(`🔊 Received audio for messageId: ${messageId}, size: ${audioData.length}`);
        // Cache and create audio element
        AudioPlayerService.playAudio(audioData, messageId, false);
        const audio = AudioPlayerService.getAudio(messageId);
        if (audio) {
          audioRef.current = audio;
          setAudioReady(true);
          setDuration(audio.duration || 0);
          // Auto-play after loading
          AudioPlayerService.stop();
          audio.play().catch((e) => console.warn('Play failed:', e));
        }
      } else {
        console.warn(`🔊 No audio in response for messageId: ${messageId}`, response.payload);
      }
    } catch (error) {
      console.error(`🔊 Failed to fetch audio for messageId: ${messageId}`, error);
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
      // Stop any other playing audio first
      AudioPlayerService.stop();
      audio.play().catch((e) => console.warn('Play failed:', e));
    }
  }, [isPlaying, audioReady, canFetchAudio, requestAudio]);

  const formatTime = (time: number) => {
    if (isNaN(time) || !isFinite(time)) return '0:00';
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  // Show player if we have audio OR can fetch it
  if (!hasDirectAudio && !hasCachedAudio && !canFetchAudio) {
    return null;
  }

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div
      className={cn(
        'flex items-center gap-3 py-2',
        className
      )}
    >
      {/* Play/Pause button - circular like iOS */}
      <button
        type="button"
        onClick={togglePlay}
        disabled={isLoading}
        className={cn(
          'flex items-center justify-center w-10 h-10 rounded-full shrink-0 transition-colors',
          isLoading && 'opacity-70 cursor-wait',
          isPlaying ? 'bg-primary/20 text-primary' : 'bg-muted/80 text-primary'
        )}
      >
        {isLoading ? (
          <Loader2 className="w-5 h-5 animate-spin" />
        ) : isPlaying ? (
          <Pause className="w-5 h-5" fill="currentColor" />
        ) : (
          <Play className="w-5 h-5 ml-0.5" fill="currentColor" />
        )}
      </button>

      {/* Progress bar - matches iOS style */}
      <div className="flex-1 flex items-center gap-2">
        <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-primary rounded-full transition-all duration-75"
            style={{ width: `${progress}%` }}
          />
        </div>
        <span className="text-xs text-muted-foreground tabular-nums min-w-[3rem] text-right">
          {isLoading ? 'Loading...' : formatTime(currentTime)}
        </span>
      </div>
    </div>
  );
}
