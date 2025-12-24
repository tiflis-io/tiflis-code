#!/usr/bin/env python3
# Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
# Licensed under the FSL-1.1-NC.
"""Real-time Speech-to-Text CLI with Whisper and Silero VAD."""

import argparse
import signal
import sys

from rich.console import Console

from src.services.audio_capture import AudioCapture, list_devices
from src.services.vad import SpeechState, VoiceActivityDetector
from src.transcribers.factory import create_transcriber, get_available_models, get_model_sizes
from src.utils.platform_detect import detect_platform
from src.utils.stats import SessionStats, create_transcription_stats
from src.utils.ui import Status, TranscriptionUI, print_loading_message


def parse_args() -> argparse.Namespace:
    """Parse command line arguments."""
    parser = argparse.ArgumentParser(description="Real-time Speech-to-Text with Whisper and VAD")
    parser.add_argument(
        "--model",
        type=str,
        default="large-v3",
        choices=get_model_sizes(),
        help="Whisper model size (default: large-v3)",
    )
    parser.add_argument(
        "--backend",
        type=str,
        default=None,
        choices=["auto", "mlx", "faster-whisper"],
        help="Transcription backend (default: auto-detect)",
    )
    parser.add_argument(
        "--list-models",
        action="store_true",
        help="List available models and exit",
    )
    parser.add_argument(
        "--language",
        type=str,
        default=None,
        help="Language code for transcription (default: auto-detect)",
    )
    parser.add_argument(
        "--audio-device",
        type=int,
        default=None,
        help="Audio input device ID (default: system default)",
    )
    parser.add_argument(
        "--list-devices",
        action="store_true",
        help="List available audio devices and exit",
    )
    parser.add_argument(
        "--vad-threshold",
        type=float,
        default=0.5,
        help="VAD speech probability threshold (default: 0.5)",
    )
    parser.add_argument(
        "--min-silence-ms",
        type=int,
        default=500,
        help="Minimum silence duration to end speech (default: 500ms)",
    )
    return parser.parse_args()


def main() -> int:
    """Main entry point."""
    args = parse_args()
    console = Console()

    # List models and exit if requested
    if args.list_models:
        platform_info = detect_platform()
        console.print(
            f"\n[bold]Platform:[/bold] {platform_info.os.value}/{platform_info.architecture.value}"
        )
        console.print(f"[bold]Accelerator:[/bold] {platform_info.accelerator.value}")
        console.print(f"[bold]Backend:[/bold] {platform_info.backend.value}\n")

        available_models = get_available_models(args.backend)
        console.print("[bold]Available Whisper models:[/bold]\n")
        for model, desc in available_models.items():
            marker = "[green]*[/green]" if model == "large-v3" else " "
            console.print(f"  {marker} [cyan]{model:18}[/cyan] {desc}")
        console.print("\n[dim]  * = default[/dim]")
        console.print("\n[bold]Usage:[/bold] tiflis-stt-cli --model small")
        return 0

    # List devices and exit if requested
    if args.list_devices:
        console.print("\n[bold]Available audio input devices:[/bold]\n")
        devices = list_devices()
        for dev in devices:
            console.print(f"  [{dev['id']}] {dev['name']}")
            console.print(f"      Channels: {dev['channels']}, Sample Rate: {dev['sample_rate']}")
        return 0

    # Initialize components
    console.print("[yellow]Loading Whisper model...[/yellow]")
    transcriber = create_transcriber(
        model_size=args.model,
        language=args.language,
        backend=args.backend,
    )
    console.print(f"[green]Model ready: {args.model}[/green]")

    print_loading_message("Loading Silero VAD...")
    vad = VoiceActivityDetector(
        threshold=args.vad_threshold,
        min_silence_duration_ms=args.min_silence_ms,
    )
    console.print("[green]VAD loaded[/green]")

    # Initialize UI and stats
    ui = TranscriptionUI()
    stats = SessionStats()
    ui.set_stats(stats)

    # Initialize audio capture
    audio = AudioCapture(device=args.audio_device)

    # Handle Ctrl+C gracefully
    running = True

    def signal_handler(sig, frame):
        nonlocal running
        running = False

    signal.signal(signal.SIGINT, signal_handler)

    console.print("\n[bold green]Starting real-time transcription...[/bold green]")
    console.print("[dim]Press Ctrl+C to stop[/dim]\n")

    try:
        with audio:
            live = ui.start()
            with live:
                ui.set_status(Status.LISTENING)

                while running:
                    # Get audio chunk
                    chunk = audio.get_chunk(timeout=0.05)
                    if chunk is None:
                        ui.refresh()
                        continue

                    # Update audio level
                    ui.set_audio_level(audio.get_audio_level())

                    # Process through VAD
                    state, completed_segment = vad.process(chunk)

                    # Update status based on VAD state
                    if state == SpeechState.SPEAKING:
                        ui.set_status(Status.SPEAKING)
                    elif state == SpeechState.SILENCE and completed_segment is None:
                        ui.set_status(Status.LISTENING)

                    # Handle completed speech segment
                    if completed_segment is not None:
                        ui.set_status(Status.PROCESSING)
                        ui.refresh()

                        # Transcribe
                        result = transcriber.transcribe(completed_segment)

                        if result.text.strip():
                            # Update stats
                            trans_stats = create_transcription_stats(
                                audio_duration=result.audio_duration,
                                transcription_time=result.transcription_time,
                                text=result.text,
                            )
                            stats.add_transcription(trans_stats)
                            ui.set_stats(stats)

                            # Add to UI
                            ui.add_transcription(result.text)

                        ui.set_status(Status.LISTENING)

                    ui.refresh()

    except Exception as e:
        console.print(f"\n[red]Error: {e}[/red]")
        return 1
    finally:
        ui.stop()

    # Print session summary
    console.print("\n[bold]Session Summary:[/bold]")
    console.print(f"  Total transcriptions: {stats.transcription_count}")
    console.print(f"  Total words: {stats.total_words}")
    console.print(f"  Total audio: {stats.total_audio_duration:.1f}s")
    console.print(f"  Average RTF: {stats.average_rtf:.2f}x")
    console.print(f"  Session duration: {stats.session_duration:.1f}s")

    return 0


if __name__ == "__main__":
    sys.exit(main())
