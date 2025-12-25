// Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
// Licensed under the FSL-1.1-NC.

/**
 * Audio player service with caching support
 * Matches iOS AudioPlayerService behavior
 */
class AudioPlayerServiceClass {
  private audioCache = new Map<string, { audio: HTMLAudioElement; expiresAt: number }>();
  private currentAudio: HTMLAudioElement | null = null;
  private currentMessageId: string | null = null;
  private readonly CACHE_DURATION_MS = 15 * 60 * 1000; // 15 minutes

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
      this.currentAudio = cached.audio;
      this.currentMessageId = messageId;
      if (autoPlay) {
        this.currentAudio.play().catch((e) => {
          console.warn('Failed to auto-play audio:', e);
        });
      }
      return;
    }

    // Create new audio element
    const audio = new Audio(`data:audio/mp3;base64,${base64Audio}`);
    audio.addEventListener('ended', () => {
      this.currentAudio = null;
      this.currentMessageId = null;
    });

    // Cache the audio
    this.audioCache.set(messageId, {
      audio,
      expiresAt: Date.now() + this.CACHE_DURATION_MS,
    });

    this.currentAudio = audio;
    this.currentMessageId = messageId;

    if (autoPlay) {
      audio.play().catch((e) => {
        console.warn('Failed to auto-play audio:', e);
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
}

export const AudioPlayerService = new AudioPlayerServiceClass();
