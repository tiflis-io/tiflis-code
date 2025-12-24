# Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
# Licensed under the FSL-1.1-NC.
"""Rich terminal UI for real-time STT display."""

from collections import deque
from enum import Enum
from typing import Optional

from rich.console import Console, Group
from rich.layout import Layout
from rich.live import Live
from rich.panel import Panel
from rich.table import Table
from rich.text import Text

from src.utils.stats import SessionStats, SystemMonitor


class Status(Enum):
    """Application status."""

    INITIALIZING = "initializing"
    LISTENING = "listening"
    SPEAKING = "speaking"
    PROCESSING = "processing"


STATUS_STYLES = {
    Status.INITIALIZING: ("yellow", "Initializing..."),
    Status.LISTENING: ("red", "Listening"),
    Status.SPEAKING: ("green", "Speaking"),
    Status.PROCESSING: ("blue", "Processing"),
}


class TranscriptionUI:
    """Rich-based terminal UI for STT application."""

    def __init__(self, max_history: int = 10):
        """
        Initialize UI.

        Args:
            max_history: Maximum number of transcriptions to display
        """
        self.console = Console()
        self.max_history = max_history

        self._status = Status.INITIALIZING
        self._audio_level = 0.0
        self._transcriptions: deque[str] = deque(maxlen=max_history)
        self._stats: Optional[SessionStats] = None
        self._system_monitor = SystemMonitor()
        self._live: Optional[Live] = None

    def set_status(self, status: Status) -> None:
        """Set current status."""
        self._status = status

    def set_audio_level(self, level: float) -> None:
        """Set audio level (0-1)."""
        self._audio_level = max(0.0, min(1.0, level))

    def add_transcription(self, text: str) -> None:
        """Add a transcription to history."""
        if text.strip():
            self._transcriptions.append(text.strip())

    def set_stats(self, stats: SessionStats) -> None:
        """Set session statistics."""
        self._stats = stats

    def _build_status_panel(self) -> Panel:
        """Build the status panel."""
        style, label = STATUS_STYLES[self._status]

        # Status indicator
        status_text = Text()
        status_text.append("Status: ", style="bold")
        status_text.append(f"[{label}]", style=f"bold {style}")

        # Audio level bar
        bar_width = 30
        filled = int(self._audio_level * bar_width)
        bar = "\u2588" * filled + "\u2591" * (bar_width - filled)
        level_pct = int(self._audio_level * 100)

        level_text = Text()
        level_text.append("Audio:  ", style="bold")
        level_text.append(bar, style="green" if self._audio_level > 0.1 else "dim")
        level_text.append(f" ({level_pct}%)", style="dim")

        content = Group(status_text, level_text)
        return Panel(content, title="Status", border_style="blue")

    def _build_transcription_panel(self) -> Panel:
        """Build the transcription history panel."""
        if not self._transcriptions:
            content = Text("(waiting for speech...)", style="dim italic")
        else:
            lines = []
            for text in self._transcriptions:
                line = Text()
                line.append("> ", style="green bold")
                line.append(text)
                lines.append(line)
            content = Group(*lines)

        return Panel(content, title="Transcription", border_style="green")

    def _build_stats_panel(self) -> Panel:
        """Build the statistics panel."""
        table = Table(show_header=False, box=None, padding=(0, 1))
        table.add_column("Metric", style="bold")
        table.add_column("Value", justify="right")

        if self._stats and self._stats.last_transcription:
            last = self._stats.last_transcription
            table.add_row(
                "Recognition Speed", f"{last.transcription_time:.2f}s (RTF: {last.rtf:.2f}x)"
            )
            table.add_row("Audio Duration", f"{last.audio_duration:.1f}s")
        else:
            table.add_row("Recognition Speed", "\u2014")
            table.add_row("Audio Duration", "\u2014")

        if self._stats:
            table.add_row("Words/min", f"{self._stats.words_per_minute:.0f}")
            table.add_row("Total Words", str(self._stats.total_words))
        else:
            table.add_row("Words/min", "\u2014")
            table.add_row("Total Words", "\u2014")

        # System stats
        table.add_row("", "")  # Separator
        cpu = self._system_monitor.get_cpu_percent()
        mem = self._system_monitor.get_memory_gb()
        table.add_row("CPU Usage", f"{cpu:.0f}%")
        table.add_row("Memory", f"{mem:.2f} GB")

        return Panel(table, title="Statistics", border_style="yellow")

    def build_layout(self) -> Layout:
        """Build the full UI layout."""
        layout = Layout()

        layout.split_column(
            Layout(name="header", size=1),
            Layout(name="status", size=5),
            Layout(name="transcription"),
            Layout(name="stats", size=10),
        )

        # Header
        header = Text("Real-time Speech-to-Text", style="bold magenta", justify="center")
        layout["header"].update(header)

        # Panels
        layout["status"].update(self._build_status_panel())
        layout["transcription"].update(self._build_transcription_panel())
        layout["stats"].update(self._build_stats_panel())

        return layout

    def start(self) -> Live:
        """Start live display and return the Live context."""
        self._live = Live(
            self.build_layout(),
            console=self.console,
            refresh_per_second=10,
            screen=True,
        )
        return self._live

    def refresh(self) -> None:
        """Refresh the display."""
        if self._live:
            self._live.update(self.build_layout())

    def stop(self) -> None:
        """Stop live display."""
        if self._live:
            self._live.stop()
            self._live = None


def print_loading_message(message: str) -> None:
    """Print a loading message to console."""
    console = Console()
    console.print(f"[yellow]{message}[/yellow]")
