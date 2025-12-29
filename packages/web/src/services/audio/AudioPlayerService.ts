// Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
// Licensed under the FSL-1.1-NC.

import { logger } from '@/utils/logger';

const TTS_AUDIO_MIME_TYPE = 'audio/wav';

// Event types for audio state changes
export type AudioEventType = 'play' | 'pause' | 'ended' | 'timeupdate' | 'loadedmetadata' | 'error' | 'loading';

export interface AudioState {
  messageId: string | null;
  isPlaying: boolean;
  isLoading: boolean;
  currentTime: number;
  duration: number;
  error: string | null;
}

type AudioEventListener = (state: AudioState) => void;

class AudioPlayerServiceClass {
  // Cache stores only base64 data, not audio elements
  private audioCache = new Map<string, { base64: string; expiresAt: number; accessedAt: number }>();
  private currentMessageId: string | null = null;
  private isCurrentlyLoading = false;
  private readonly CACHE_DURATION_MS = 15 * 60 * 1000; // 15 minutes
  private readonly MAX_CACHE_SIZE = 50;
  
  // CRITICAL: Single shared audio element for iOS compatibility
  // On iOS, an audio element that was played during user gesture
  // can continue to play programmatically with different src
  private sharedAudio: HTMLAudioElement;
  
  // Web Audio API context for iOS compatibility
  private audioContext: AudioContext | null = null;
  private isUnlocked = false;
  private pendingAutoPlay: { base64Audio: string; messageId: string } | null = null;
  
  // Event listeners for UI updates
  private listeners = new Set<AudioEventListener>();
  private animationFrameId: number | null = null;
  
  constructor() {
    // Create single shared audio element - this is key for iOS
    this.sharedAudio = new Audio();
    this.sharedAudio.preload = 'auto';
    this.setupSharedAudioListeners();
    this.setupAudioUnlock();
  }
  
  /**
   * Setup event listeners on shared audio element
   */
  private setupSharedAudioListeners(): void {
    this.sharedAudio.addEventListener('play', () => {
      this.startProgressTracking();
      this.notifyListeners();
    });
    
    this.sharedAudio.addEventListener('pause', () => {
      this.stopProgressTracking();
      this.notifyListeners();
    });
    
    this.sharedAudio.addEventListener('ended', () => {
      this.stopProgressTracking();
      this.sharedAudio.currentTime = 0;
      this.notifyListeners();
    });
    
    this.sharedAudio.addEventListener('loadedmetadata', () => {
      this.isCurrentlyLoading = false;
      this.notifyListeners();
    });
    
    this.sharedAudio.addEventListener('canplay', () => {
      this.isCurrentlyLoading = false;
      this.notifyListeners();
    });
    
    this.sharedAudio.addEventListener('error', () => {
      this.isCurrentlyLoading = false;
      this.notifyListeners('Failed to load audio');
    });
  }
  
  /**
   * Subscribe to audio state changes
   */
  subscribe(listener: AudioEventListener): () => void {
    this.listeners.add(listener);
    // Immediately send current state
    listener(this.getState());
    return () => {
      this.listeners.delete(listener);
    };
  }
  
  /**
   * Get current audio state
   */
  getState(): AudioState {
    return {
      messageId: this.currentMessageId,
      isPlaying: !this.sharedAudio.paused,
      isLoading: this.isCurrentlyLoading,
      currentTime: this.sharedAudio.currentTime,
      duration: isNaN(this.sharedAudio.duration) ? 0 : this.sharedAudio.duration,
      error: null,
    };
  }
  
  /**
   * Notify all listeners of state change
   */
  private notifyListeners(error?: string): void {
    const state: AudioState = {
      ...this.getState(),
      error: error ?? null,
    };
    this.listeners.forEach(listener => listener(state));
  }
  
  /**
   * Start progress tracking animation
   */
  private startProgressTracking(): void {
    if (this.animationFrameId !== null) return;
    
    const update = () => {
      this.notifyListeners();
      if (!this.sharedAudio.paused) {
        this.animationFrameId = requestAnimationFrame(update);
      } else {
        this.animationFrameId = null;
      }
    };
    this.animationFrameId = requestAnimationFrame(update);
  }
  
  /**
   * Stop progress tracking
   */
  private stopProgressTracking(): void {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }
  
  /**
   * Get or create AudioContext (lazy initialization)
   */
  private getAudioContext(): AudioContext {
    if (!this.audioContext) {
      this.audioContext = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    }
    return this.audioContext;
  }
  
  /**
   * Mobile browsers require user interaction before audio can play.
   */
  private setupAudioUnlock(): void {
    const unlock = async () => {
      if (this.isUnlocked) return;
      
      try {
        // Method 1: Resume AudioContext
        const ctx = this.getAudioContext();
        if (ctx.state === 'suspended') {
          await ctx.resume();
        }
        
        // Method 2: Play silent audio on shared element
        // This is critical for iOS - it "unlocks" this specific element
        this.sharedAudio.src = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA';
        this.sharedAudio.volume = 0.01;
        
        try {
          await this.sharedAudio.play();
          this.sharedAudio.pause();
          this.sharedAudio.currentTime = 0;
          this.sharedAudio.volume = 1;
        } catch {
          // May fail, but AudioContext might work
        }
        
        this.isUnlocked = true;
        logger.log('Audio unlocked via user interaction');
        
        // If there's pending auto-play, execute it now
        if (this.pendingAutoPlay) {
          const { base64Audio, messageId } = this.pendingAutoPlay;
          this.pendingAutoPlay = null;
          // Small delay to ensure unlock is complete
          setTimeout(() => {
            this.playAudio(base64Audio, messageId, true);
          }, 50);
        }
        
        document.removeEventListener('touchstart', unlock);
        document.removeEventListener('touchend', unlock);
        document.removeEventListener('click', unlock);
        document.removeEventListener('keydown', unlock);
      } catch (e) {
        logger.warn('Audio unlock failed, will retry:', e);
      }
    };
    
    document.addEventListener('touchstart', unlock, { once: false, passive: true });
    document.addEventListener('touchend', unlock, { once: false, passive: true });
    document.addEventListener('click', unlock, { once: false, passive: true });
    document.addEventListener('keydown', unlock, { once: false, passive: true });
  }
  
  /**
   * Check if audio is unlocked for auto-play
   */
  isAudioUnlocked(): boolean {
    return this.isUnlocked;
  }
  
  /**
   * Manually unlock audio (call from user gesture handlers like record button)
   * This is the most reliable way to unlock on iOS
   */
  async unlockIfNeeded(): Promise<void> {
    if (this.isUnlocked) return;
    
    try {
      // Resume AudioContext
      const ctx = this.getAudioContext();
      if (ctx.state === 'suspended') {
        await ctx.resume();
      }
      
      // Play silent audio on shared element - this unlocks it for future use
      this.sharedAudio.src = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA';
      this.sharedAudio.volume = 0.01;
      
      await this.sharedAudio.play();
      this.sharedAudio.pause();
      this.sharedAudio.currentTime = 0;
      this.sharedAudio.volume = 1;
      
      this.isUnlocked = true;
      logger.log('Audio manually unlocked');
      
      // If there's pending auto-play, play it now (we're in user gesture context)
      if (this.pendingAutoPlay) {
        const { base64Audio, messageId } = this.pendingAutoPlay;
        this.pendingAutoPlay = null;
        this.playAudio(base64Audio, messageId, true);
      }
    } catch (e) {
      logger.warn('Manual audio unlock failed:', e);
      // Still mark as unlocked - user can try manual play
      this.isUnlocked = true;
    }
  }

  /**
   * Check if we're on a mobile device that requires unlock
   */
  private isMobileDevice(): boolean {
    return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
  }
  
  /**
   * Play audio from base64 data
   */
  playAudio(base64Audio: string, messageId: string, autoPlay: boolean): void {
    logger.log(`playAudio: messageId=${messageId}, autoPlay=${autoPlay}, isUnlocked=${this.isUnlocked}, isMobile=${this.isMobileDevice()}`);
    
    // Cache the audio data
    this.cacheAudio(base64Audio, messageId);
    
    // On mobile, queue for later if not unlocked and autoPlay requested
    // On desktop, we can try to play directly
    if (autoPlay && !this.isUnlocked && this.isMobileDevice()) {
      logger.log('Mobile: Audio not unlocked yet, queuing for auto-play');
      this.pendingAutoPlay = { base64Audio, messageId };
      return;
    }
    
    // Stop current audio
    this.stop();
    
    // Set new source and play
    this.currentMessageId = messageId;
    this.isCurrentlyLoading = true;
    this.notifyListeners();
    
    this.sharedAudio.src = `data:${TTS_AUDIO_MIME_TYPE};base64,${base64Audio}`;
    
    if (autoPlay) {
      // Try to play
      this.sharedAudio.play().then(() => {
        // Success - mark as unlocked for future plays
        this.isUnlocked = true;
      }).catch(e => {
        if (e.name === 'NotAllowedError') {
          logger.log('Auto-play blocked by browser policy, user can play manually');
          // Queue for later on mobile
          if (this.isMobileDevice()) {
            this.pendingAutoPlay = { base64Audio, messageId };
          }
        } else {
          logger.warn('Play failed:', e.name, e.message);
        }
        this.isCurrentlyLoading = false;
        this.notifyListeners();
      });
    } else {
      // Just load for manual play later
      this.sharedAudio.load();
    }
  }
  
  /**
   * Cache audio data for later
   */
  private cacheAudio(base64Audio: string, messageId: string): void {
    if (this.audioCache.has(messageId)) return;
    
    if (this.audioCache.size >= this.MAX_CACHE_SIZE) {
      this.evictLRU();
    }
    
    const now = Date.now();
    this.audioCache.set(messageId, {
      base64: base64Audio,
      expiresAt: now + this.CACHE_DURATION_MS,
      accessedAt: now,
    });
    
    this.cleanupCache();
  }
  
  /**
   * Play audio by messageId (for manual play from UI)
   */
  playByMessageId(messageId: string): boolean {
    const cached = this.audioCache.get(messageId);
    if (cached && Date.now() < cached.expiresAt) {
      cached.accessedAt = Date.now();
      this.playAudio(cached.base64, messageId, true);
      return true;
    }
    return false;
  }
  
  /**
   * Toggle play/pause for current audio
   */
  togglePlay(): void {
    if (this.sharedAudio.paused) {
      this.sharedAudio.play().catch(e => {
        logger.warn('Toggle play failed:', e);
      });
    } else {
      this.sharedAudio.pause();
    }
  }
  
  /**
   * Seek to position (0-1)
   */
  seek(position: number): void {
    if (!this.sharedAudio.duration) return;
    this.sharedAudio.currentTime = position * this.sharedAudio.duration;
    this.notifyListeners();
  }
  
  /**
   * Seek to specific time
   */
  seekToTime(time: number): void {
    this.sharedAudio.currentTime = time;
    this.notifyListeners();
  }
  
  /**
   * Reset to start
   */
  resetToStart(): void {
    this.sharedAudio.currentTime = 0;
    this.notifyListeners();
  }

  /**
   * Get cached audio base64
   */
  getAudioBase64(messageId: string): string | null {
    const cached = this.audioCache.get(messageId);
    if (cached && Date.now() < cached.expiresAt) {
      return cached.base64;
    }
    return null;
  }
  
  /**
   * Get audio element (for compatibility - returns shared element if messageId matches)
   */
  getAudio(messageId: string): HTMLAudioElement | null {
    if (this.currentMessageId === messageId) {
      return this.sharedAudio;
    }
    // If cached, we can load it
    if (this.hasAudio(messageId)) {
      return this.sharedAudio;
    }
    return null;
  }

  /**
   * Check if audio is cached
   */
  hasAudio(messageId: string): boolean {
    const cached = this.audioCache.get(messageId);
    return cached !== undefined && Date.now() < cached.expiresAt;
  }

  /**
   * Register external audio element (for compatibility)
   */
  registerAudio(_audio: HTMLAudioElement, messageId?: string): void {
    if (messageId) {
      this.currentMessageId = messageId;
    }
    this.notifyListeners();
  }

  /**
   * Unregister audio element (for compatibility)
   */
  unregisterAudio(_audio: HTMLAudioElement): void {
    // No-op for shared audio
  }

  /**
   * Stop current audio
   */
  stop(): void {
    this.stopProgressTracking();
    this.sharedAudio.pause();
    this.sharedAudio.currentTime = 0;
    this.currentMessageId = null;
    this.isCurrentlyLoading = false;
    this.notifyListeners();
  }

  /**
   * Stop all audio
   */
  stopAll(): void {
    this.stop();
  }

  /**
   * Check if playing
   */
  isPlaying(): boolean {
    return !this.sharedAudio.paused;
  }

  /**
   * Get current message ID
   */
  getCurrentMessageId(): string | null {
    return this.currentMessageId;
  }

  /**
   * Clean up expired cache
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
   * Evict LRU entry
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
      this.audioCache.delete(oldestKey);
    }
  }
}

export const AudioPlayerService = new AudioPlayerServiceClass();
