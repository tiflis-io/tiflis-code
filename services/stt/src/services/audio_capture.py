# Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
# Licensed under the FSL-1.1-NC.
"""Audio capture from microphone using sounddevice."""

import queue
import threading
from typing import Optional

import numpy as np
import sounddevice as sd


class AudioCapture:
    """Capture audio from microphone in real-time."""

    def __init__(
        self,
        sample_rate: int = 16000,
        channels: int = 1,
        chunk_duration_ms: int = 32,  # Exactly 32ms = 512 samples at 16kHz for Silero VAD
        device: Optional[int] = None,
    ):
        """
        Initialize audio capture.

        Args:
            sample_rate: Audio sample rate in Hz
            channels: Number of audio channels
            chunk_duration_ms: Duration of each audio chunk in milliseconds (min 32ms for VAD)
            device: Audio input device ID (None for default)
        """
        self.sample_rate = sample_rate
        self.channels = channels
        self.chunk_size = int(sample_rate * chunk_duration_ms / 1000)
        self.device = device

        self._audio_queue: queue.Queue[np.ndarray] = queue.Queue()
        self._stream: Optional[sd.InputStream] = None
        self._running = False
        self._current_level: float = 0.0
        self._level_lock = threading.Lock()

    def _audio_callback(
        self,
        indata: np.ndarray,
        frames: int,
        time_info: dict,
        status: sd.CallbackFlags,
    ) -> None:
        """Callback for audio stream."""
        if status:
            pass  # Could log status flags here

        # Convert to float32 and flatten
        audio = indata.flatten().astype(np.float32)

        # Calculate audio level (RMS)
        rms = np.sqrt(np.mean(audio**2))
        with self._level_lock:
            self._current_level = min(1.0, rms * 10)  # Scale for display

        self._audio_queue.put(audio)

    def start(self) -> None:
        """Start audio capture."""
        if self._running:
            return

        self._running = True
        self._stream = sd.InputStream(
            samplerate=self.sample_rate,
            channels=self.channels,
            dtype=np.float32,
            blocksize=self.chunk_size,
            device=self.device,
            callback=self._audio_callback,
        )
        self._stream.start()

    def stop(self) -> None:
        """Stop audio capture."""
        self._running = False
        if self._stream:
            self._stream.stop()
            self._stream.close()
            self._stream = None

    def get_chunk(self, timeout: float = 0.1) -> Optional[np.ndarray]:
        """
        Get next audio chunk.

        Args:
            timeout: Timeout in seconds

        Returns:
            Audio chunk as numpy array, or None if timeout
        """
        try:
            return self._audio_queue.get(timeout=timeout)
        except queue.Empty:
            return None

    def get_audio_level(self) -> float:
        """Get current audio level (0-1)."""
        with self._level_lock:
            return self._current_level

    @property
    def is_running(self) -> bool:
        """Check if capture is running."""
        return self._running

    def __enter__(self) -> "AudioCapture":
        self.start()
        return self

    def __exit__(self, exc_type, exc_val, exc_tb) -> None:
        self.stop()


def list_devices() -> list[dict]:
    """List available audio input devices."""
    devices = []
    for i, device in enumerate(sd.query_devices()):
        if device["max_input_channels"] > 0:
            devices.append(
                {
                    "id": i,
                    "name": device["name"],
                    "channels": device["max_input_channels"],
                    "sample_rate": device["default_samplerate"],
                }
            )
    return devices


def get_default_device() -> Optional[int]:
    """Get default input device ID."""
    try:
        return sd.default.device[0]
    except Exception:
        return None
