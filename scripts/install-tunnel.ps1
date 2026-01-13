# Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
# Licensed under the FSL-1.1-NC.
# https://github.com/tiflis-io/tiflis-code
#
# Tiflis Code Tunnel Server Installer for Windows
#
# Usage:
#   powershell -ExecutionPolicy Bypass -File install-tunnel.ps1
#   powershell -ExecutionPolicy Bypass -File install-tunnel.ps1 -DryRun
#
# Environment variables:
#   TIFLIS_TUNNEL_VERSION       - Version to install (default: latest)
#   TIFLIS_INSTALL_DIR          - Installation directory (default: %LOCALAPPDATA%\TiflisCode)
#   TIFLIS_TUNNEL_PORT          - Port (default: 3001)
#   TUNNEL_REGISTRATION_API_KEY - API key (min 32 chars)

#Requires -Version 7.0
[CmdletBinding()]
param(
    [switch]$DryRun,
    [switch]$Help
)

# ─────────────────────────────────────────────────────────────
# Configuration
# ─────────────────────────────────────────────────────────────
$script:TiflisTunnelVersion = $env:TIFLIS_TUNNEL_VERSION ?? "latest"
$script:TiflisInstallDir = $env:TIFLIS_INSTALL_DIR ?? (Join-Path $env:LOCALAPPDATA "TiflisCode")
$script:TiflisTunnelPort = $env:TIFLIS_TUNNEL_PORT ?? "3001"

$script:TunnelDir = Join-Path $script:TiflisInstallDir "tunnel"
$script:PackageName = "@tiflis-io/tiflis-code-tunnel"

# ─────────────────────────────────────────────────────────────
# Colors & Output Functions
# ─────────────────────────────────────────────────────────────
function Write-Step {
    param([string]$Message)
    Write-Host "→ $Message" -ForegroundColor Cyan
}

function Write-Success {
    param([string]$Message)
    Write-Host "✓ $Message" -ForegroundColor Green
}

function Write-Error {
    param([string]$Message)
    Write-Host "✗ $Message" -ForegroundColor Red
}

function Write-Warning {
    param([string]$Message)
    Write-Host "⚠ $Message" -ForegroundColor Yellow
}

function Write-Info {
    param([string]$Message)
    Write-Host $Message -ForegroundColor DarkGray
}

function Show-Help {
    Write-Host @"
Usage: powershell -ExecutionPolicy Bypass -File install-tunnel.ps1 [OPTIONS]

Options:
  -DryRun    Show what would be done without making changes
  -Help      Show this help message

Environment variables:
  TUNNEL_REGISTRATION_API_KEY  API key for registration (min 32 chars)
  TIFLIS_TUNNEL_PORT           Port (default: 3001)
  TIFLIS_INSTALL_DIR           Installation directory
"@
}

# ─────────────────────────────────────────────────────────────
# Utility Functions
# ─────────────────────────────────────────────────────────────
function Confirm-Prompt {
    param([string]$Prompt, [bool]$Default = $true)
    $suffix = if ($Default) { "[Y/n]" } else { "[y/N]" }
    $response = Read-Host "$Prompt $suffix"

    if ([string]::IsNullOrWhiteSpace($response)) {
        return $Default
    }
    return $response -match "^[yY]"
}

function Invoke-Prompt {
    param([string]$Prompt, [string]$Default = "")
    $message = if ([string]::IsNullOrWhiteSpace($Default)) { $Prompt } else { "$Prompt [$Default]" }
    $response = Read-Host $message
    return ([string]::IsNullOrWhiteSpace($response)) ? $Default : $response
}

function Invoke-SecretPrompt {
    param([string]$Prompt, [int]$MinLength = 0)
    $response = Read-Host -Prompt $Prompt -AsSecureString
    $plainText = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto(
        [System.Runtime.InteropServices.Marshal]::SecureStringToCoTaskMemUnicode($response)
    )

    if ($MinLength -gt 0 -and $plainText.Length -lt $MinLength) {
        Write-Error "Value must be at least $MinLength characters"
        return $null
    }

    return $plainText
}

function New-SecureKey {
    param([int]$Length = 32)
    $chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
    $random = New-Object Random
    $key = ""

    for ($i = 0; $i -lt $Length; $i++) {
        $key += $chars[$random.Next($chars.Length)]
    }

    return $key
}

# ─────────────────────────────────────────────────────────────
# System Check Functions
# ─────────────────────────────────────────────────────────────
function Test-NodeInstalled {
    param([int]$MinVersion = 22)

    try {
        $version = node --version 2>$null | Select-String -Pattern '\d+' -AllMatches | `
            Select-Object -First 1 | ForEach-Object { $_.Matches[0].Value }
        return ([int]$version -ge $MinVersion)
    }
    catch {
        return $false
    }
}

function Get-NodeVersion {
    try {
        return (node --version 2>$null).Trim()
    }
    catch {
        return "not installed"
    }
}

function Test-DockerInstalled {
    try {
        $dockerVersion = docker --version 2>$null
        return $dockerVersion -ne $null
    }
    catch {
        return $false
    }
}

function Test-DockerRunning {
    try {
        docker ps *>$null
        return $true
    }
    catch {
        return $false
    }
}

function Install-NodeJS {
    Write-Step "Installing Node.js..."

    try {
        if (Get-Command choco -ErrorAction SilentlyContinue) {
            if ($DryRun) {
                Write-Info "DRY RUN: Would run: choco install nodejs-lts -y"
            }
            else {
                choco install nodejs-lts -y
                Write-Success "Node.js installed via Chocolatey"
            }
            return $true
        }

        if (Get-Command winget -ErrorAction SilentlyContinue) {
            if ($DryRun) {
                Write-Info "DRY RUN: Would run: winget install OpenJS.NodeJS"
            }
            else {
                winget install OpenJS.NodeJS -e
                Write-Success "Node.js installed via Windows Package Manager"
            }
            return $true
        }

        Write-Warning "Chocolatey or winget not found"
        Write-Info "Download from: https://nodejs.org/en/download/"
        return $false
    }
    catch {
        Write-Error "Failed to install Node.js: $_"
        return $false
    }
}

# ─────────────────────────────────────────────────────────────
# Banner
# ─────────────────────────────────────────────────────────────
function Show-Banner {
    $banner = @"
                        -#####
                        #     #
       -####.                   #     #              -###+.
     .##    .        .. #     #....          -   ##-
    -##    #.       #####     #####+         --    #+.
   +#    ##-.       #              #         .##    ##.
   #    ##.         #              #          .+##   +.
   #   ##           #####     #####+            .#   #-
   #   +-               #     #                  #   #-
   #   +-               #     #                  #   #-
   #   +-       ---.    #     #                  #   #-
   #   +-       + ###.  #     #                  #   #-
   #   +-       +    ##-#     #                  #   #-
   #   +-       -##    ##     #                  #   #-
   #   ##.      .###    #     #.               .+#   #.
   #    ##+     +    ####     #####+          .##    #.
   -##    ##.   +  ##+.  #          #         -#     #+.
    .##     .   -##.+##        #         -    ##-
     .-##  #.            -#########+         -+ -#+.

       T I F L I S   C O D E  ·  Tunnel Installer

  © 2025 Roman Barinov · FSL-1.1-NC · github.com/tiflis-io/tiflis-code
"@
    Write-Host $banner
}

# ─────────────────────────────────────────────────────────────
# Environment Configuration
# ─────────────────────────────────────────────────────────────
function Invoke-ConfigurationWizard {
    Write-Step "Configuration Wizard"
    Write-Host ""

    $config = @{}

    # Get or generate API key
    $apiKey = $env:TUNNEL_REGISTRATION_API_KEY
    while ([string]::IsNullOrWhiteSpace($apiKey) -or $apiKey.Length -lt 32) {
        if ([string]::IsNullOrWhiteSpace($apiKey)) {
            if (Confirm-Prompt "Generate a random API key?") {
                $apiKey = New-SecureKey 32
                Write-Success "Generated API key: $($apiKey.Substring(0, 8))..."
            }
            else {
                $apiKey = Invoke-SecretPrompt "Enter TUNNEL_REGISTRATION_API_KEY (min 32 chars)"
            }
        }

        if ([string]::IsNullOrWhiteSpace($apiKey) -or $apiKey.Length -lt 32) {
            Write-Error "API key must be at least 32 characters"
            $apiKey = ""
        }
    }
    $config.ApiKey = $apiKey

    Write-Host ""
    Write-Info "Summary:"
    Write-Info "  API Key: $($config.ApiKey.Substring(0, 8))..."
    Write-Host ""

    if (-not (Confirm-Prompt "Proceed with installation?")) {
        Write-Info "Installation cancelled"
        exit 0
    }

    return $config
}

# ─────────────────────────────────────────────────────────────
# .env File Creation
# ─────────────────────────────────────────────────────────────
function New-EnvFile {
    param([hashtable]$Config)

    Write-Step "Creating .env file..."

    if (-not $DryRun) {
        $envContent = @"
# Tiflis Code Tunnel Server Configuration
# Generated on $(Get-Date -Format 'o')

# Required: API key for workstation registration (min 32 chars)
TUNNEL_REGISTRATION_API_KEY=$($Config.ApiKey)

# Server settings
PORT=$script:TiflisTunnelPort
HOST=0.0.0.0
NODE_ENV=production
LOG_LEVEL=info
"@

        $envPath = Join-Path $script:TunnelDir ".env"

        if (-not (Test-Path $script:TunnelDir)) {
            New-Item -ItemType Directory -Path $script:TunnelDir -Force | Out-Null
        }

        # Backup existing .env
        if (Test-Path $envPath) {
            $backupPath = "$envPath.backup.$(Get-Date -Format 'yyyyMMddHHmmss')"
            Copy-Item $envPath $backupPath
            Write-Info "Backed up existing .env to $backupPath"
        }

        Set-Content -Path $envPath -Value $envContent -Encoding UTF8
        Write-Success ".env file created"
    }
}

# ─────────────────────────────────────────────────────────────
# NPM Package Installation
# ─────────────────────────────────────────────────────────────
function Install-Package {
    Write-Step "Installing $script:PackageName..."

    if (-not $DryRun) {
        if (-not (Test-Path $script:TunnelDir)) {
            New-Item -ItemType Directory -Path $script:TunnelDir -Force | Out-Null
        }

        Push-Location $script:TunnelDir
        try {
            npm init -y 2>&1 | Out-Null
            npm install "$script:PackageName@$script:TiflisTunnelVersion"
            Write-Success "Package installed"
        }
        finally {
            Pop-Location
        }
    }
}

# ─────────────────────────────────────────────────────────────
# Service Registration
# ─────────────────────────────────────────────────────────────
function Register-Service {
    Write-Step "Setting up Windows service..."

    $serviceName = "TiflisTunnel"
    $displayName = "Tiflis Code Tunnel Server"

    # Check if service exists
    $service = Get-Service -Name $serviceName -ErrorAction SilentlyContinue

    if ($null -ne $service) {
        Write-Info "Service already exists"
        if ($DryRun) {
            Write-Info "DRY RUN: Would restart service"
        }
        else {
            Stop-Service -Name $serviceName -Force
            Start-Service -Name $serviceName
            Write-Success "Service restarted"
        }
        return
    }

    # Try NSSM first
    $nssm = "C:\Program Files\nssm\nssm.exe"

    if (Test-Path $nssm) {
        if ($DryRun) {
            Write-Info "DRY RUN: Would create service with NSSM"
            return
        }

        try {
            $exePath = Join-Path $script:TunnelDir "node_modules" $script:PackageName "dist" "main.js"
            & $nssm install $serviceName "node" "`"$exePath`""
            & $nssm set $serviceName AppDirectory "$script:TunnelDir"
            & $nssm set $serviceName AppNoConsole 1
            & $nssm set $serviceName Start SERVICE_AUTO_START

            Start-Service -Name $serviceName
            Write-Success "Service registered and started"
            return
        }
        catch {
            Write-Warning "Failed to register service with NSSM: $_"
        }
    }

    # Fallback: Task Scheduler
    Write-Warning "NSSM not found. Using Windows Task Scheduler instead."

    if ($DryRun) {
        Write-Info "DRY RUN: Would create scheduled task"
        return
    }

    try {
        $taskName = "Tiflis Tunnel"
        $exePath = Join-Path $script:TunnelDir "node_modules" $script:PackageName "dist" "main.js"
        $action = New-ScheduledTaskAction `
            -Execute "node" `
            -Argument "`"$exePath`"" `
            -WorkingDirectory $script:TunnelDir

        $trigger = New-ScheduledTaskTrigger -AtStartup

        $settings = New-ScheduledTaskSettingsSet `
            -AllowStartIfOnBatteries `
            -StartWhenAvailable `
            -RestartCount 3 `
            -RestartInterval (New-TimeSpan -Minutes 1)

        $principal = New-ScheduledTaskPrincipal `
            -UserId "SYSTEM" `
            -LogonType ServiceAccount `
            -RunLevel Highest

        $task = New-ScheduledTask `
            -Action $action `
            -Trigger $trigger `
            -Settings $settings `
            -Principal $principal `
            -Description "Tiflis Code Tunnel Server"

        Register-ScheduledTask -TaskName $taskName -InputObject $task -Force | Out-Null
        Start-ScheduledTask -TaskName $taskName

        Write-Success "Scheduled task created and started"
    }
    catch {
        Write-Error "Failed to create scheduled task: $_"
    }
}

# ─────────────────────────────────────────────────────────────
# Main Installation
# ─────────────────────────────────────────────────────────────
function Invoke-Installation {
    Write-Step "Checking Node.js..."

    if (-not (Test-NodeInstalled 22)) {
        Write-Warning "Node.js >= 22 is required"
        if (Confirm-Prompt "Install Node.js automatically?") {
            if (-not (Install-NodeJS)) {
                Write-Error "Node.js installation failed"
                exit 1
            }
            $env:PATH = [System.Environment]::GetEnvironmentVariable("PATH", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("PATH", "User")
        }
        else {
            Write-Error "Node.js >= 22 is required"
            exit 1
        }
    }

    Write-Success "Node.js $(Get-NodeVersion) detected"

    # Check for existing installation
    $skipConfig = $false
    $envPath = Join-Path $script:TunnelDir ".env"

    if (Test-Path $envPath) {
        Write-Info "Existing installation detected at $script:TunnelDir"

        if (Confirm-Prompt "Keep existing configuration and only update?") {
            $skipConfig = $true
            Write-Success "Will keep existing configuration"
        }
    }

    # Create directories
    Write-Step "Creating directories..."
    if (-not $DryRun) {
        if (-not (Test-Path $script:TunnelDir)) {
            New-Item -ItemType Directory -Path $script:TunnelDir -Force | Out-Null
        }
    }

    # Configuration
    if (-not $skipConfig) {
        $config = Invoke-ConfigurationWizard
        New-EnvFile -Config $config
    }
    else {
        Write-Success "Keeping existing .env configuration"
    }

    # Install package
    Install-Package

    # Register service
    Register-Service

    # Success
    Write-Host ""
    Write-Success "Tunnel server installed successfully!"
    Write-Host ""

    Write-Info "Configuration: $(Join-Path $script:TunnelDir '.env')"
    Write-Info "Logs:          Event Viewer -> Windows Logs -> Application"
    Write-Host ""

    Write-Info "Service Commands:"
    Write-Info "  Status:   Get-Service TiflisTunnel"
    Write-Info "  Logs:     Get-EventLog -LogName Application -Source 'TiflisTunnel' -Newest 50"
    Write-Info "  Stop:     Stop-Service -Name TiflisTunnel"
    Write-Info "  Start:    Start-Service -Name TiflisTunnel"
    Write-Info "  Restart:  Restart-Service -Name TiflisTunnel"
    Write-Host ""

    Write-Info "Next steps:"
    Write-Info "  1. Configure DNS for your domain"
    Write-Info "  2. Install workstation: powershell -ExecutionPolicy Bypass -File install-workstation.ps1"
    Write-Host ""
}

# ─────────────────────────────────────────────────────────────
# Main Entry
# ─────────────────────────────────────────────────────────────
if ($Help) {
    Show-Help
    exit 0
}

if ($DryRun) {
    Write-Warning "Running in dry-run mode - no changes will be made"
    Write-Host ""
}

Show-Banner
Write-Step "Detecting platform... Windows"

Invoke-Installation
