// Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
// Licensed under the FSL-1.1-NC.

import { useState, useRef, useCallback, useEffect } from 'react';
import { Mic, Square } from 'lucide-react';
import { cn } from '@/lib/utils';
import { logger } from '@/utils/logger';
import { toastFunctions as toast } from '@/components/ui/toast';
import { AudioPlayerService } from '@/services/audio';

interface VoiceRecordButtonProps {
  onRecordingComplete: (audioBlob: Blob, format: string) => void;
  disabled?: boolean;
  className?: string;
}

export function VoiceRecordButton({
  onRecordingComplete,
  disabled = false,
  className,
}: VoiceRecordButtonProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isHoldModeRef = useRef(false);
  const pointerDownTimeRef = useRef(0);

  const startRecording = useCallback(async () => {
    if (isRecording || isProcessing) return;

    // Stop any playing audio before recording
    AudioPlayerService.stop();

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      // Determine supported format
      let mimeType = 'audio/webm;codecs=opus';
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = 'audio/webm';
        if (!MediaRecorder.isTypeSupported(mimeType)) {
          mimeType = 'audio/mp4';
          if (!MediaRecorder.isTypeSupported(mimeType)) {
            mimeType = '';
          }
        }
      }

      const mediaRecorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const mimeTypeUsed = mediaRecorder.mimeType;
        const blob = new Blob(chunksRef.current, { type: mimeTypeUsed });
        const format = mimeTypeUsed.includes('webm')
          ? 'webm'
          : mimeTypeUsed.includes('mp4')
            ? 'm4a'
            : 'wav';

        // Stop all tracks
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;

        // Only send if we have data
        if (blob.size > 0) {
          setIsProcessing(true);
          onRecordingComplete(blob, format);
          // Reset processing after a short delay
          setTimeout(() => setIsProcessing(false), 500);
        }
      };

      mediaRecorder.start(100);
      setIsRecording(true);

      // Haptic feedback
      if ('vibrate' in navigator) {
        navigator.vibrate(10);
      }
    } catch (error) {
      logger.error('Failed to start recording:', error);
      toast.error(
        'Microphone access denied',
        'Please allow microphone access to record voice messages.'
      );
    }
  }, [isRecording, isProcessing, onRecordingComplete]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
    }

    setIsRecording(false);

    // Haptic feedback
    if ('vibrate' in navigator) {
      navigator.vibrate(10);
    }
  }, []);

  // Mouse/Touch down - start hold detection
  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (disabled || isProcessing) return;

      e.preventDefault();
      pointerDownTimeRef.current = Date.now();
      isHoldModeRef.current = false;

      // If already recording, just track for release
      if (isRecording) return;

      // Start long press timer (150ms)
      longPressTimerRef.current = setTimeout(() => {
        isHoldModeRef.current = true;
        startRecording();
      }, 150);
    },
    [disabled, isProcessing, isRecording, startRecording]
  );

  // Mouse/Touch up - determine action
  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (disabled) return;

      e.preventDefault();
      const holdDuration = Date.now() - pointerDownTimeRef.current;

      // Clear long press timer
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }

      if (isHoldModeRef.current) {
        // Was hold mode - stop recording on release
        stopRecording();
        isHoldModeRef.current = false;
      } else if (holdDuration < 150) {
        // Short tap - toggle recording
        if (isRecording) {
          stopRecording();
        } else {
          startRecording();
        }
      }
    },
    [disabled, isRecording, startRecording, stopRecording]
  );

  // Handle pointer leaving button while pressing
  const handlePointerLeave = useCallback(() => {
    // Clear long press timer
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }

    // If in hold mode, stop recording
    if (isHoldModeRef.current && isRecording) {
      stopRecording();
      isHoldModeRef.current = false;
    }
  }, [isRecording, stopRecording]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  const baseSize = 36;

  return (
    <div
      className={cn(
        'relative flex items-center gap-2 shrink-0',
        className
      )}
    >
      {/* Main button */}
      <button
        type="button"
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerLeave}
        onPointerCancel={handlePointerLeave}
        disabled={disabled || isProcessing}
        className={cn(
          'relative z-10 flex items-center justify-center rounded-full',
          'transition-all duration-150',
          'touch-none select-none',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
          isRecording
            ? 'w-14 h-14 bg-red-500 text-white scale-100'
            : 'w-9 h-9 text-primary hover:bg-muted active:scale-95',
          disabled && 'opacity-50 cursor-not-allowed'
        )}
        aria-label={isRecording ? 'Stop recording' : 'Record voice message'}
      >
        {isRecording ? (
          <Square className="w-5 h-5" fill="currentColor" />
        ) : (
          <Mic
            className="w-5 h-5"
            style={{ width: baseSize * 0.55, height: baseSize * 0.55 }}
          />
        )}
      </button>
    </div>
  );
}
