@echo off
REM Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
REM Licensed under the FSL-1.1-NC.
REM https://github.com/tiflis-io/tiflis-code
REM
REM Tiflis Code Workstation Server Installer for Windows
REM
REM Usage:
REM   install-workstation.bat
REM   install-workstation.bat --help

setlocal enabledelayedexpansion

if "%1"=="--help" (
    echo Usage: install-workstation.bat [OPTIONS]
    echo.
    echo Options:
    echo   --help     Show this help message
    echo.
    echo This script will launch the PowerShell installer.
    echo Environment variables:
    echo   TUNNEL_URL              Tunnel server WebSocket URL
    echo   TUNNEL_API_KEY          Tunnel API key
    echo   WORKSTATION_AUTH_KEY    Auth key for mobile clients
    echo   WORKSPACES_ROOT         Workspaces directory
    echo.
    exit /b 0
)

REM Check if PowerShell 7+ is available
where /q pwsh
if !errorlevel! equ 0 (
    echo Launching PowerShell Core installer...
    pwsh -NoProfile -ExecutionPolicy Bypass -File "%~dp0install-workstation.ps1" %*
    exit /b !errorlevel!
)

REM Fallback to Windows PowerShell (older)
where /q powershell
if !errorlevel! equ 0 (
    echo Launching Windows PowerShell installer...
    powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install-workstation.ps1" %*
    exit /b !errorlevel!
)

echo Error: PowerShell not found
echo Please install PowerShell 7 or later from: https://github.com/PowerShell/PowerShell/releases
exit /b 1
