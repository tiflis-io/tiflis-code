// Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
// Licensed under the FSL-1.1-NC.

import { logger } from '@/utils/logger';

const TTS_AUDIO_MIME_TYPE = 'audio/wav';

class AudioPlayerServiceClass {
  private audioCache = new Map<string, { audio: HTMLAudioElement; expiresAt: number; accessedAt: number }>();
  private currentAudio: HTMLAudioElement | null = null;
  private currentMessageId: string | null = null;
  private readonly CACHE_DURATION_MS = 15 * 60 * 1000; // 15 minutes
  private readonly MAX_CACHE_SIZE = 50; // Maximum number of cached audio elements

  /**
   * Play audio from base64 data
   * @param base64Audio Base64 encoded audio data
   * @param messageId Message ID for caching
   * @param autoPlay Whether to auto-play (true if from this device)
   */
  playAudio(base64Audio: string, messageId: string, autoPlay: boolean): void {
    // Stop any currently playing audio
    this.stop();

    // Check cache first
    const cached = this.audioCache.get(messageId);
    if (cached && Date.now() < cached.expiresAt) {
      // Update access time for LRU tracking
      cached.accessedAt = Date.now();
      this.currentAudio = cached.audio;
      this.currentMessageId = messageId;
      if (autoPlay) {
        this.currentAudio.play().catch((e) => {
          logger.warn('Failed to auto-play audio:', e);
        });
      }
      return;
    }

    const audio = new Audio(`data:${TTS_AUDIO_MIME_TYPE};base64,${base64Audio}`);
    audio.addEventListener('ended', () => {
      this.currentAudio = null;
      this.currentMessageId = null;
    });

    // Evict LRU entries if cache is full
    if (this.audioCache.size >= this.MAX_CACHE_SIZE) {
      this.evictLRU();
    }

    // Cache the audio
    const now = Date.now();
    this.audioCache.set(messageId, {
      audio,
      expiresAt: now + this.CACHE_DURATION_MS,
      accessedAt: now,
    });

    this.currentAudio = audio;
    this.currentMessageId = messageId;

    if (autoPlay) {
      audio.play().catch((e) => {
        logger.warn('Failed to auto-play audio:', e);
      });
    }

    // Clean up expired cache entries
    this.cleanupCache();
  }

  /**
   * Get cached audio for a message
   */
  getAudio(messageId: string): HTMLAudioElement | null {
    const cached = this.audioCache.get(messageId);
    if (cached && Date.now() < cached.expiresAt) {
      return cached.audio;
    }
    return null;
  }

  /**
   * Check if audio is cached for a message
   */
  hasAudio(messageId: string): boolean {
    const cached = this.audioCache.get(messageId);
    return cached !== undefined && Date.now() < cached.expiresAt;
  }

  /**
   * Register an audio element as the current playing audio
   * This allows external audio elements to be stopped via stop()
   */
  registerAudio(audio: HTMLAudioElement, messageId?: string): void {
    // Stop any currently playing audio first
    this.stop();
    this.currentAudio = audio;
    this.currentMessageId = messageId ?? null;
  }

  /**
   * Unregister the current audio (call when audio ends or component unmounts)
   */
  unregisterAudio(audio: HTMLAudioElement): void {
    if (this.currentAudio === audio) {
      this.currentAudio = null;
      this.currentMessageId = null;
    }
  }

  /**
   * Stop currently playing audio
   */
  stop(): void {
    if (this.currentAudio) {
      this.currentAudio.pause();
      this.currentAudio.currentTime = 0;
      this.currentAudio = null;
      this.currentMessageId = null;
    }
  }

  /**
   * Stop all audio including cached entries
   */
  stopAll(): void {
    // Stop current
    this.stop();

    // Pause all cached audio
    for (const [, entry] of this.audioCache.entries()) {
      if (!entry.audio.paused) {
        entry.audio.pause();
        entry.audio.currentTime = 0;
      }
    }
  }

  /**
   * Check if audio is currently playing
   */
  isPlaying(): boolean {
    return this.currentAudio !== null && !this.currentAudio.paused;
  }

  /**
   * Get currently playing message ID
   */
  getCurrentMessageId(): string | null {
    return this.currentMessageId;
  }

  /**
   * Clean up expired cache entries
   */
  private cleanupCache(): void {
    const now = Date.now();
    for (const [key, value] of this.audioCache.entries()) {
      if (now >= value.expiresAt) {
        this.audioCache.delete(key);
      }
    }
  }

  /**
   * Evict least recently used cache entry
   */
  private evictLRU(): void {
    let oldestKey: string | null = null;
    let oldestAccess = Infinity;

    for (const [key, value] of this.audioCache.entries()) {
      if (value.accessedAt < oldestAccess) {
        oldestAccess = value.accessedAt;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      const entry = this.audioCache.get(oldestKey);
      if (entry) {
        // Stop audio if it's currently playing
        entry.audio.pause();
        entry.audio.src = '';
      }
      this.audioCache.delete(oldestKey);
    }
  }
}

export const AudioPlayerService = new AudioPlayerServiceClass();
