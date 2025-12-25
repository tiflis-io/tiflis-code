// Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
// Licensed under the FSL-1.1-NC.

import { useState, useRef, useCallback, useEffect } from 'react';
import { Mic, Square, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface VoiceRecordButtonProps {
  onRecordingComplete: (audioBlob: Blob, format: string) => void;
  disabled?: boolean;
  className?: string;
}

/**
 * Pulsing ring animation for recording indicator (matches iOS PulsingRing)
 */
function PulsingRing({ delay, isAnimating }: { delay: number; isAnimating: boolean }) {
  return (
    <div
      className={cn(
        'absolute inset-0 rounded-full border-2 border-red-500',
        isAnimating && 'animate-ping'
      )}
      style={{
        animationDelay: `${delay}s`,
        animationDuration: '1.2s',
        opacity: isAnimating ? 0.6 : 0,
      }}
    />
  );
}

export function VoiceRecordButton({
  onRecordingComplete,
  disabled = false,
  className,
}: VoiceRecordButtonProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isPressing, setIsPressing] = useState(false);
  const [isHoldMode, setIsHoldMode] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const longPressTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressTriggeredRef = useRef(false);

  const isActiveRecording = isRecording || isHoldMode;

  // Base and expanded sizes matching iOS
  const baseSize = 36;
  const expandedSize = 72;
  const currentSize = isActiveRecording ? expandedSize : isPressing && !disabled ? baseSize * 1.2 : baseSize;

  const startRecording = useCallback(async () => {
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
        setIsProcessing(true);
        const blob = new Blob(chunksRef.current, { type: mediaRecorder.mimeType });
        const format = mediaRecorder.mimeType.includes('webm')
          ? 'webm'
          : mediaRecorder.mimeType.includes('mp4')
            ? 'm4a'
            : 'wav';

        // Stop all tracks
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;

        onRecordingComplete(blob, format);
        setIsProcessing(false);
      };

      mediaRecorder.start(100); // Collect data every 100ms
      setIsRecording(true);
    } catch (error) {
      console.error('Failed to start recording:', error);
      alert('Failed to access microphone. Please ensure microphone permissions are granted.');
    }
  }, [onRecordingComplete]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && (isRecording || isHoldMode)) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      setIsHoldMode(false);
    }
  }, [isRecording, isHoldMode]);

  // Handle pointer down - start long press detection
  const handlePointerDown = useCallback(() => {
    if (disabled || isProcessing) return;

    setIsPressing(true);
    longPressTriggeredRef.current = false;

    // Start long press timer (150ms like iOS)
    longPressTimeoutRef.current = setTimeout(() => {
      if (!longPressTriggeredRef.current && !isRecording && !disabled) {
        longPressTriggeredRef.current = true;
        setIsHoldMode(true);
        startRecording();
      }
    }, 150);
  }, [disabled, isProcessing, isRecording, startRecording]);

  // Handle pointer up - determine action based on mode
  const handlePointerUp = useCallback(() => {
    if (disabled) {
      setIsPressing(false);
      longPressTriggeredRef.current = false;
      return;
    }

    const wasHoldMode = isHoldMode;
    const wasLongPressTriggered = longPressTriggeredRef.current;

    setIsPressing(false);
    longPressTriggeredRef.current = false;

    // Clear any pending long press timeout
    if (longPressTimeoutRef.current) {
      clearTimeout(longPressTimeoutRef.current);
      longPressTimeoutRef.current = null;
    }

    if (wasHoldMode) {
      // End hold-to-record
      setIsHoldMode(false);
      stopRecording();
    } else if (!wasLongPressTriggered) {
      // Short tap - toggle mode
      if (isRecording) {
        stopRecording();
      } else {
        startRecording();
      }
    }
  }, [disabled, isHoldMode, isRecording, startRecording, stopRecording]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (longPressTimeoutRef.current) {
        clearTimeout(longPressTimeoutRef.current);
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  return (
    <div
      className={cn(
        'relative flex items-center justify-center shrink-0',
        className
      )}
      style={{ width: baseSize, height: baseSize }}
    >
      {/* Pulsing rings when recording */}
      {isActiveRecording && (
        <>
          <div
            className="absolute"
            style={{ width: expandedSize, height: expandedSize }}
          >
            <PulsingRing delay={0} isAnimating={isActiveRecording} />
          </div>
          <div
            className="absolute"
            style={{ width: expandedSize, height: expandedSize }}
          >
            <PulsingRing delay={0.4} isAnimating={isActiveRecording} />
          </div>
          <div
            className="absolute"
            style={{ width: expandedSize, height: expandedSize }}
          >
            <PulsingRing delay={0.8} isAnimating={isActiveRecording} />
          </div>
        </>
      )}

      {/* Glow background when recording */}
      {isActiveRecording && (
        <div
          className="absolute rounded-full bg-red-500/15 blur-lg"
          style={{ width: expandedSize * 1.2, height: expandedSize * 1.2 }}
        />
      )}

      {/* Main button */}
      <button
        type="button"
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        disabled={disabled || isProcessing}
        className={cn(
          'relative z-10 flex items-center justify-center rounded-full transition-all duration-200',
          'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
          isActiveRecording && 'bg-red-500',
          !isActiveRecording && !disabled && 'bg-muted hover:bg-muted/80',
          disabled && 'cursor-not-allowed opacity-50 bg-muted'
        )}
        style={{ width: currentSize, height: currentSize }}
        title={isRecording ? 'Stop recording' : 'Start voice recording'}
      >
        {isProcessing ? (
          <Loader2
            className="animate-spin text-muted-foreground"
            style={{ width: currentSize * 0.5, height: currentSize * 0.5 }}
          />
        ) : isActiveRecording ? (
          <Square
            className="text-white"
            style={{ width: currentSize * 0.35, height: currentSize * 0.35 }}
            fill="currentColor"
          />
        ) : (
          <Mic
            className={disabled ? 'text-muted-foreground/50' : 'text-foreground'}
            style={{ width: currentSize * 0.55, height: currentSize * 0.55 }}
          />
        )}
      </button>
    </div>
  );
}
