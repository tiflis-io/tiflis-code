// Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
// Licensed under the FSL-1.1-NC.

import { FC } from "react";
import { Button } from "@/components/ui/button";
import { Mic, MicOff } from "lucide-react";
import { useVoiceRecorder } from "./use-voice-recorder";

interface VoiceRecordButtonProps {
  onRecordingComplete: (audioBlob: Blob, format: string) => void;
  disabled?: boolean;
}

export const VoiceRecordButton: FC<VoiceRecordButtonProps> = ({
  onRecordingComplete,
  disabled = false,
}) => {
  const {
    startRecording,
    stopRecording,
    isRecording: micRecording,
    recordingTime,
    audioLevel: _audioLevel,
  } = useVoiceRecorder({
    onRecordingComplete,
  });

  const handleToggleRecording = () => {
    if (micRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  const isCurrentlyRecording = micRecording;

  return (
    <Button
      type="button"
      variant={isCurrentlyRecording ? "destructive" : "outline"}
      size="sm"
      onClick={handleToggleRecording}
      disabled={disabled}
      className="relative"
    >
      {isCurrentlyRecording ? (
        <MicOff className="h-4 w-4" />
      ) : (
        <Mic className="h-4 w-4" />
      )}
      {isCurrentlyRecording && (
        <span className="ml-2 text-xs">
          {Math.floor(recordingTime)}s
        </span>
      )}
    </Button>
  );
};