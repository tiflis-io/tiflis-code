# Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
# Licensed under the FSL-1.1-NC.
"""
Platform detection module for STT service.
Detects OS, architecture, and available hardware accelerators.
"""

import os
import platform
import subprocess
from dataclasses import dataclass
from enum import Enum
from typing import Optional


class OperatingSystem(Enum):
    LINUX = "linux"
    DARWIN = "darwin"  # macOS
    WINDOWS = "windows"
    UNKNOWN = "unknown"


class Architecture(Enum):
    X86_64 = "x86_64"
    ARM64 = "arm64"
    UNKNOWN = "unknown"


class Accelerator(Enum):
    METAL = "metal"  # Apple Silicon GPU
    CUDA = "cuda"  # NVIDIA GPU
    CPU = "cpu"  # CPU only


class TranscriberBackend(Enum):
    MLX = "mlx"  # Apple Silicon only
    FASTER_WHISPER = "faster-whisper"  # CUDA or CPU


@dataclass
class PlatformInfo:
    """Information about the current platform."""

    os: OperatingSystem
    architecture: Architecture
    accelerator: Accelerator
    backend: TranscriberBackend
    cuda_version: Optional[str] = None
    gpu_name: Optional[str] = None


def detect_os() -> OperatingSystem:
    """Detect the current operating system."""
    system = platform.system().lower()
    if system == "linux":
        return OperatingSystem.LINUX
    elif system == "darwin":
        return OperatingSystem.DARWIN
    elif system == "windows":
        return OperatingSystem.WINDOWS
    return OperatingSystem.UNKNOWN


def detect_architecture() -> Architecture:
    """Detect CPU architecture."""
    machine = platform.machine().lower()
    if machine in ("x86_64", "amd64"):
        return Architecture.X86_64
    elif machine in ("arm64", "aarch64"):
        return Architecture.ARM64
    return Architecture.UNKNOWN


def is_apple_silicon() -> bool:
    """Check if running on Apple Silicon (M1/M2/M3+)."""
    return detect_os() == OperatingSystem.DARWIN and detect_architecture() == Architecture.ARM64


def detect_cuda() -> tuple[bool, Optional[str], Optional[str]]:
    """
    Detect if CUDA is available.
    Returns: (is_available, cuda_version, gpu_name)
    """
    # Check via environment variable override
    if os.environ.get("CUDA_VISIBLE_DEVICES") == "-1":
        return False, None, None

    # Try to detect CUDA via nvidia-smi
    try:
        result = subprocess.run(
            ["nvidia-smi", "--query-gpu=name,driver_version", "--format=csv,noheader"],
            capture_output=True,
            text=True,
            timeout=5,
        )
        if result.returncode == 0 and result.stdout.strip():
            lines = result.stdout.strip().split("\n")
            if lines:
                parts = lines[0].split(", ")
                gpu_name = parts[0] if parts else None

                # Get CUDA version
                cuda_result = subprocess.run(
                    ["nvidia-smi", "--query-gpu=driver_version", "--format=csv,noheader"],
                    capture_output=True,
                    text=True,
                    timeout=5,
                )
                cuda_version = (
                    cuda_result.stdout.strip().split("\n")[0]
                    if cuda_result.returncode == 0
                    else None
                )

                return True, cuda_version, gpu_name
    except (FileNotFoundError, subprocess.TimeoutExpired, Exception):
        pass

    # Try to detect via PyTorch
    try:
        import torch

        if torch.cuda.is_available():
            cuda_version = torch.version.cuda
            gpu_name = torch.cuda.get_device_name(0) if torch.cuda.device_count() > 0 else None
            return True, cuda_version, gpu_name
    except ImportError:
        pass

    return False, None, None


def detect_accelerator() -> tuple[Accelerator, Optional[str], Optional[str]]:
    """
    Detect the best available hardware accelerator.
    Returns: (accelerator, version_info, device_name)
    """
    # Check for Apple Silicon first
    if is_apple_silicon():
        return Accelerator.METAL, None, "Apple Silicon"

    # Check for CUDA
    cuda_available, cuda_version, gpu_name = detect_cuda()
    if cuda_available:
        return Accelerator.CUDA, cuda_version, gpu_name

    # Fall back to CPU
    cpu_info = platform.processor() or "Unknown CPU"
    return Accelerator.CPU, None, cpu_info


def get_optimal_backend(accelerator: Accelerator) -> TranscriberBackend:
    """Determine the optimal transcriber backend for the given accelerator."""
    if accelerator == Accelerator.METAL:
        return TranscriberBackend.MLX
    else:
        # CUDA and CPU both use faster-whisper
        return TranscriberBackend.FASTER_WHISPER


def detect_platform() -> PlatformInfo:
    """
    Detect full platform information.
    Returns a PlatformInfo dataclass with all detected information.
    """
    os_type = detect_os()
    arch = detect_architecture()
    accelerator, version, device_name = detect_accelerator()
    backend = get_optimal_backend(accelerator)

    return PlatformInfo(
        os=os_type,
        architecture=arch,
        accelerator=accelerator,
        backend=backend,
        cuda_version=version if accelerator == Accelerator.CUDA else None,
        gpu_name=device_name,
    )


def get_backend_from_env() -> Optional[TranscriberBackend]:
    """
    Get backend override from environment variable.
    Returns None if no override is set.
    """
    backend_env = os.environ.get("STT_BACKEND", "auto").lower()

    if backend_env == "auto":
        return None
    elif backend_env == "mlx":
        return TranscriberBackend.MLX
    elif backend_env in ("faster-whisper", "faster_whisper", "fw"):
        return TranscriberBackend.FASTER_WHISPER
    elif backend_env == "cuda":
        return TranscriberBackend.FASTER_WHISPER
    elif backend_env == "cpu":
        return TranscriberBackend.FASTER_WHISPER

    return None


def get_effective_backend() -> TranscriberBackend:
    """
    Get the effective backend to use, considering environment overrides.
    """
    # Check for environment override
    override = get_backend_from_env()
    if override is not None:
        return override

    # Auto-detect
    platform_info = detect_platform()
    return platform_info.backend


def print_platform_info():
    """Print detected platform information (for debugging)."""
    info = detect_platform()
    print(f"Operating System: {info.os.value}")
    print(f"Architecture: {info.architecture.value}")
    print(f"Accelerator: {info.accelerator.value}")
    print(f"Backend: {info.backend.value}")
    if info.gpu_name:
        print(f"GPU/Device: {info.gpu_name}")
    if info.cuda_version:
        print(f"CUDA Version: {info.cuda_version}")


if __name__ == "__main__":
    print_platform_info()
