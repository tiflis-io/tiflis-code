@echo off
REM Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
REM Licensed under the FSL-1.1-NC.
REM https://github.com/tiflis-io/tiflis-code
REM
REM Tiflis Code Tunnel Server Installer for Windows
REM
REM Usage:
REM   install-tunnel.bat
REM   install-tunnel.bat --help

setlocal enabledelayedexpansion

if "%1"=="--help" (
    echo Usage: install-tunnel.bat [OPTIONS]
    echo.
    echo Options:
    echo   --help     Show this help message
    echo.
    echo This script will launch the PowerShell installer.
    echo Environment variables:
    echo   TUNNEL_REGISTRATION_API_KEY  API key for registration
    echo   TIFLIS_TUNNEL_PORT           Port (default: 3001^)
    echo.
    exit /b 0
)

REM Check if PowerShell 7+ is available
where /q pwsh
if !errorlevel! equ 0 (
    echo Launching PowerShell Core installer...
    pwsh -NoProfile -ExecutionPolicy Bypass -File "%~dp0install-tunnel.ps1" %*
    exit /b !errorlevel!
)

REM Fallback to Windows PowerShell
where /q powershell
if !errorlevel! equ 0 (
    echo Launching Windows PowerShell installer...
    powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install-tunnel.ps1" %*
    exit /b !errorlevel!
)

echo Error: PowerShell not found
echo Please install PowerShell 7 or later from: https://github.com/PowerShell/PowerShell/releases
exit /b 1
