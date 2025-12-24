# Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
# Licensed under the FSL-1.1-NC.
"""Voice Activity Detection using Silero VAD."""

from collections import deque
from enum import Enum
from typing import Optional

import numpy as np
import torch


class SpeechState(Enum):
    """Current speech state."""

    SILENCE = "silence"
    SPEAKING = "speaking"


class VoiceActivityDetector:
    """Silero VAD wrapper for detecting speech segments."""

    def __init__(
        self,
        sample_rate: int = 16000,
        threshold: float = 0.5,
        min_speech_duration_ms: int = 250,
        min_silence_duration_ms: int = 500,
        pre_buffer_duration_ms: int = 300,
    ):
        """
        Initialize VAD.

        Args:
            sample_rate: Audio sample rate (must be 8000 or 16000)
            threshold: Speech probability threshold (0-1)
            min_speech_duration_ms: Minimum speech duration to trigger
            min_silence_duration_ms: Minimum silence to end speech segment
            pre_buffer_duration_ms: Audio to keep before speech detection (captures first words)
        """
        self.sample_rate = sample_rate
        self.threshold = threshold
        self.min_speech_samples = int(sample_rate * min_speech_duration_ms / 1000)
        self.min_silence_samples = int(sample_rate * min_silence_duration_ms / 1000)
        self.pre_buffer_samples = int(sample_rate * pre_buffer_duration_ms / 1000)

        # Load Silero VAD model
        self.model, _ = torch.hub.load(
            repo_or_dir="snakers4/silero-vad",
            model="silero_vad",
            force_reload=False,
            trust_repo=True,
        )
        self.model.eval()

        # State tracking
        self._state = SpeechState.SILENCE
        self._speech_samples = 0
        self._silence_samples = 0
        self._audio_buffer: list[np.ndarray] = []

        # Pre-buffer: keeps last N ms of audio to capture speech start
        self._pre_buffer: deque[np.ndarray] = deque()
        self._pre_buffer_current_samples = 0

    def _add_to_pre_buffer(self, chunk: np.ndarray) -> None:
        """Add chunk to pre-buffer, maintaining max size."""
        self._pre_buffer.append(chunk)
        self._pre_buffer_current_samples += len(chunk)

        # Remove old chunks if buffer is too large
        while self._pre_buffer_current_samples > self.pre_buffer_samples and self._pre_buffer:
            old_chunk = self._pre_buffer.popleft()
            self._pre_buffer_current_samples -= len(old_chunk)

    def _get_pre_buffer_audio(self) -> list[np.ndarray]:
        """Get all audio from pre-buffer."""
        return list(self._pre_buffer)

    def _clear_pre_buffer(self) -> None:
        """Clear the pre-buffer."""
        self._pre_buffer.clear()
        self._pre_buffer_current_samples = 0

    def reset(self) -> None:
        """Reset VAD state."""
        self.model.reset_states()
        self._state = SpeechState.SILENCE
        self._speech_samples = 0
        self._silence_samples = 0
        self._audio_buffer = []
        self._clear_pre_buffer()

    @property
    def state(self) -> SpeechState:
        """Current speech state."""
        return self._state

    def process(self, audio_chunk: np.ndarray) -> tuple[SpeechState, Optional[np.ndarray]]:
        """
        Process an audio chunk and detect speech.

        Args:
            audio_chunk: Audio samples as float32 numpy array

        Returns:
            Tuple of (current_state, completed_speech_segment or None)
        """
        # Ensure correct dtype
        if audio_chunk.dtype != np.float32:
            audio_chunk = audio_chunk.astype(np.float32)

        # Normalize if needed
        if np.abs(audio_chunk).max() > 1.0:
            audio_chunk = audio_chunk / 32768.0

        # Get speech probability
        audio_tensor = torch.from_numpy(audio_chunk)
        speech_prob = self.model(audio_tensor, self.sample_rate).item()

        is_speech = speech_prob >= self.threshold
        completed_segment = None

        if self._state == SpeechState.SILENCE:
            # Always add to pre-buffer when in silence
            self._add_to_pre_buffer(audio_chunk)

            if is_speech:
                self._speech_samples += len(audio_chunk)

                if self._speech_samples >= self.min_speech_samples:
                    # Speech confirmed! Include pre-buffer to capture first words
                    self._audio_buffer = self._get_pre_buffer_audio()
                    self._clear_pre_buffer()
                    self._state = SpeechState.SPEAKING
                    self._silence_samples = 0
            else:
                # Reset speech counter if not enough consecutive speech
                self._speech_samples = 0

        elif self._state == SpeechState.SPEAKING:
            self._audio_buffer.append(audio_chunk)

            if not is_speech:
                self._silence_samples += len(audio_chunk)

                if self._silence_samples >= self.min_silence_samples:
                    # End of speech segment
                    completed_segment = np.concatenate(self._audio_buffer)
                    self._state = SpeechState.SILENCE
                    self._speech_samples = 0
                    self._silence_samples = 0
                    self._audio_buffer = []
                    self.model.reset_states()
            else:
                self._silence_samples = 0

        return self._state, completed_segment

    def get_buffered_duration(self) -> float:
        """Get duration of buffered audio in seconds."""
        total_samples = sum(len(chunk) for chunk in self._audio_buffer)
        return total_samples / self.sample_rate
