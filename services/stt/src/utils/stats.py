# Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
# Licensed under the FSL-1.1-NC.
"""Performance statistics tracking for STT application."""

import time
from dataclasses import dataclass, field
from typing import Optional

import psutil


@dataclass
class TranscriptionStats:
    """Statistics for a single transcription."""

    audio_duration: float  # seconds
    transcription_time: float  # seconds
    text: str
    word_count: int

    @property
    def rtf(self) -> float:
        """Real-Time Factor: transcription_time / audio_duration."""
        if self.audio_duration > 0:
            return self.transcription_time / self.audio_duration
        return 0.0


@dataclass
class SessionStats:
    """Aggregate statistics for the entire session."""

    total_audio_duration: float = 0.0
    total_transcription_time: float = 0.0
    total_words: int = 0
    transcription_count: int = 0
    session_start: float = field(default_factory=time.time)
    last_transcription: Optional[TranscriptionStats] = None

    def add_transcription(self, stats: TranscriptionStats) -> None:
        """Add a transcription's stats to the session totals."""
        self.total_audio_duration += stats.audio_duration
        self.total_transcription_time += stats.transcription_time
        self.total_words += stats.word_count
        self.transcription_count += 1
        self.last_transcription = stats

    @property
    def average_rtf(self) -> float:
        """Average Real-Time Factor across all transcriptions."""
        if self.total_audio_duration > 0:
            return self.total_transcription_time / self.total_audio_duration
        return 0.0

    @property
    def words_per_minute(self) -> float:
        """Words per minute based on audio duration."""
        if self.total_audio_duration > 0:
            return (self.total_words / self.total_audio_duration) * 60
        return 0.0

    @property
    def session_duration(self) -> float:
        """Total session duration in seconds."""
        return time.time() - self.session_start


class SystemMonitor:
    """Monitor system resource usage."""

    def __init__(self):
        self._process = psutil.Process()

    def get_cpu_percent(self) -> float:
        """Get current CPU usage percentage."""
        return self._process.cpu_percent()

    def get_memory_gb(self) -> float:
        """Get current memory usage in GB."""
        return self._process.memory_info().rss / (1024**3)

    def get_system_cpu_percent(self) -> float:
        """Get system-wide CPU usage."""
        return psutil.cpu_percent()

    def get_system_memory_percent(self) -> float:
        """Get system-wide memory usage percentage."""
        return psutil.virtual_memory().percent


def count_words(text: str) -> int:
    """Count words in text."""
    return len(text.split()) if text.strip() else 0


def create_transcription_stats(
    audio_duration: float,
    transcription_time: float,
    text: str,
) -> TranscriptionStats:
    """Create TranscriptionStats from raw values."""
    return TranscriptionStats(
        audio_duration=audio_duration,
        transcription_time=transcription_time,
        text=text,
        word_count=count_words(text),
    )
