# Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
# Licensed under the FSL-1.1-NC.
# https://github.com/tiflis-io/tiflis-code
#
# Tiflis Code Workstation Server Installer for Windows
#
# Usage:
#   powershell -ExecutionPolicy Bypass -File install-workstation.ps1
#   powershell -ExecutionPolicy Bypass -File install-workstation.ps1 -DryRun
#
# Environment variables:
#   TIFLIS_WORKSTATION_VERSION - Version to install (default: latest)
#   TIFLIS_INSTALL_DIR         - Installation directory (default: %LOCALAPPDATA%\TiflisCode)
#   TUNNEL_URL                 - Tunnel server WebSocket URL (required)
#   TUNNEL_API_KEY             - Tunnel API key (required)
#   WORKSTATION_AUTH_KEY       - Auth key for mobile clients (auto-generated if not set)
#   WORKSPACES_ROOT            - Workspaces directory (default: $HOME\work)

#Requires -Version 7.0
[CmdletBinding()]
param(
    [switch]$DryRun,
    [switch]$Help
)

# ─────────────────────────────────────────────────────────────
# Configuration
# ─────────────────────────────────────────────────────────────
$script:TiflisWorkstationVersion = $env:TIFLIS_WORKSTATION_VERSION ?? "latest"
$script:TiflisInstallDir = $env:TIFLIS_INSTALL_DIR ?? (Join-Path $env:LOCALAPPDATA "TiflisCode")
$script:WorkspaceRoot = $env:WORKSPACES_ROOT ?? (Join-Path $HOME "work")

$script:WorkstationDir = Join-Path $script:TiflisInstallDir "workstation"
$script:PackageName = "@tiflis-io/tiflis-code-workstation"

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
Usage: powershell -ExecutionPolicy Bypass -File install-workstation.ps1 [OPTIONS]

Options:
  -DryRun    Show what would be done without making changes
  -Help      Show this help message

Environment variables:
  TUNNEL_URL                 Tunnel server WebSocket URL (required)
  TUNNEL_API_KEY             Tunnel API key (required)
  WORKSTATION_AUTH_KEY       Auth key for mobile clients
  WORKSPACES_ROOT            Workspaces directory (default: ~/work)
  TIFLIS_INSTALL_DIR         Installation directory (default: %LOCALAPPDATA%\TiflisCode)
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
    param([int]$MinVersion = 24)

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

function Install-NodeJS {
    Write-Step "Installing Node.js..."
    Write-Info "Attempting to install Node.js 24 LTS"

    try {
        # Check if Chocolatey is installed
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

        # Alternative: Use Windows Package Manager (winget)
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

        # Fallback: Manual download
        Write-Warning "Chocolatey or winget not found. Manual installation recommended."
        Write-Info "Download Node.js from: https://nodejs.org/en/download/"
        return $false
    }
    catch {
        Write-Error "Failed to install Node.js: $_"
        return $false
    }
}

function Install-ServiceSupport {
    Write-Step "Setting up service support..."

    $nssm = "C:\Program Files\nssm\nssm.exe"

    if (Test-Path $nssm) {
        Write-Success "NSSM already installed"
        return $true
    }

    Write-Info "NSSM (Non-Sucking Service Manager) not found"

    if (Get-Command choco -ErrorAction SilentlyContinue) {
        Write-Info "Installing NSSM via Chocolatey..."
        if (-not $DryRun) {
            choco install nssm -y
            Write-Success "NSSM installed"
            return $true
        }
    }

    Write-Warning "NSSM not available. Service registration may not work."
    Write-Info "Install manually or use Chocolatey: choco install nssm"
    return $false
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

       T I F L I S   C O D E  ·  Workstation Installer

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

    # Tunnel URL
    $tunnelUrl = $env:TUNNEL_URL
    while ([string]::IsNullOrWhiteSpace($tunnelUrl)) {
        $tunnelUrl = Invoke-Prompt "Tunnel URL (wss://...)"
        if ([string]::IsNullOrWhiteSpace($tunnelUrl)) {
            Write-Error "Tunnel URL is required"
        }
    }
    $config.TunnelUrl = $tunnelUrl

    # Tunnel API Key
    $tunnelApiKey = $env:TUNNEL_API_KEY
    while ([string]::IsNullOrWhiteSpace($tunnelApiKey)) {
        $tunnelApiKey = Invoke-SecretPrompt "Tunnel API key (min 32 chars)"
        if ($null -eq $tunnelApiKey -or $tunnelApiKey.Length -lt 32) {
            Write-Error "API key must be at least 32 characters"
            $tunnelApiKey = ""
        }
    }
    $config.TunnelApiKey = $tunnelApiKey

    # Workstation Auth Key
    $authKey = $env:WORKSTATION_AUTH_KEY
    if ([string]::IsNullOrWhiteSpace($authKey)) {
        if (Confirm-Prompt "Generate a random workstation auth key?") {
            $authKey = New-SecureKey 24
            Write-Success "Generated auth key: $($authKey.Substring(0, 8))..."
        }
        else {
            while ([string]::IsNullOrWhiteSpace($authKey)) {
                $authKey = Invoke-SecretPrompt "Workstation auth key (min 16 chars)"
                if ($null -eq $authKey -or $authKey.Length -lt 16) {
                    Write-Error "Auth key must be at least 16 characters"
                    $authKey = ""
                }
            }
        }
    }
    $config.AuthKey = $authKey

    # Workspaces Root
    $workspacesRoot = Invoke-Prompt "Workspaces directory" $script:WorkspaceRoot
    $config.WorkspacesRoot = $workspacesRoot

    Write-Host ""
    Write-Info "Summary:"
    Write-Info "  Tunnel URL:     $($config.TunnelUrl)"
    Write-Info "  Tunnel API Key: $($config.TunnelApiKey.Substring(0, 8))..."
    Write-Info "  Auth Key:       $($config.AuthKey.Substring(0, 8))..."
    Write-Info "  Workspaces:     $($config.WorkspacesRoot)"
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
    param(
        [hashtable]$Config
    )

    Write-Step "Creating .env file..."

    if (-not $DryRun) {
        $envContent = @"
# Tiflis Code Workstation Configuration
# Generated on $(Get-Date -Format 'o')

# Tunnel connection (required)
TUNNEL_URL=$($Config.TunnelUrl)
TUNNEL_API_KEY=$($Config.TunnelApiKey)

# Workstation settings
WORKSTATION_AUTH_KEY=$($Config.AuthKey)
WORKSTATION_NAME=$env:COMPUTERNAME
WORKSPACES_ROOT=$($Config.WorkspacesRoot)
DATA_DIR=$script:WorkstationDir\data

# Server settings
PORT=3002
HOST=127.0.0.1
NODE_ENV=production
LOG_LEVEL=info

# AI Agent (optional - uncomment and configure)
# AGENT_PROVIDER=openai
# AGENT_API_KEY=your-openai-key
# AGENT_MODEL_NAME=gpt-4o-mini

# Speech-to-Text (optional)
# STT_PROVIDER=openai
# STT_API_KEY=your-openai-key

# Text-to-Speech (optional)
# TTS_PROVIDER=openai
# TTS_API_KEY=your-openai-key
# TTS_VOICE=nova
"@

        $envPath = Join-Path $script:WorkstationDir ".env"

        # Create directory if it doesn't exist
        if (-not (Test-Path $script:WorkstationDir)) {
            New-Item -ItemType Directory -Path $script:WorkstationDir -Force | Out-Null
        }

        # Backup existing .env if present
        if (Test-Path $envPath) {
            $backupPath = "$envPath.backup.$(Get-Date -Format 'yyyyMMddHHmmss')"
            Copy-Item $envPath $backupPath
            Write-Info "Backed up existing .env to $backupPath"
        }

        Set-Content -Path $envPath -Value $envContent -Encoding UTF8

        # Set file permissions to read-only for current user (Windows security)
        $acl = Get-Acl $envPath
        $acl.SetAccessRuleProtection($true, $false)
        Set-Acl -Path $envPath -AclObject $acl

        Write-Success ".env file created"
    }
}

# ─────────────────────────────────────────────────────────────
# NPM Package Installation
# ─────────────────────────────────────────────────────────────
function Install-Package {
    Write-Step "Installing $script:PackageName..."

    if (-not $DryRun) {
        if (-not (Test-Path $script:WorkstationDir)) {
            New-Item -ItemType Directory -Path $script:WorkstationDir -Force | Out-Null
        }

        Push-Location $script:WorkstationDir
        try {
            npm init -y 2>&1 | Out-Null

            # Set package.json type to module for ESM
            $packageJson = Get-Content "package.json" -Raw | ConvertFrom-Json
            $packageJson.type = "module"
            $packageJson | ConvertTo-Json | Set-Content "package.json"

            npm install "$script:PackageName@$script:TiflisWorkstationVersion"
            Write-Success "Package installed"
        }
        finally {
            Pop-Location
        }
    }
}

# ─────────────────────────────────────────────────────────────
# Service Registration (Windows)
# ─────────────────────────────────────────────────────────────
function Register-Service {
    Write-Step "Setting up service..."

    $serviceName = "TiflisWorkstation"
    $displayName = "Tiflis Code Workstation Server"

    # Check if service already exists
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

    # Try using NSSM (Non-Sucking Service Manager) for better control
    $nssm = "C:\Program Files\nssm\nssm.exe"

    if (Test-Path $nssm) {
        if ($DryRun) {
            Write-Info "DRY RUN: Would create service with NSSM"
            return
        }

        try {
            $exePath = Join-Path $script:WorkstationDir "node_modules" $script:PackageName "dist" "main.js"
            $envFile = Join-Path $script:WorkstationDir ".env"

            & $nssm install $serviceName "node" "`"$exePath`""
            & $nssm set $serviceName AppDirectory "$script:WorkstationDir"
            & $nssm set $serviceName AppEnvironmentExtra "WORKSTATION_DIR=$script:WorkstationDir"
            & $nssm set $serviceName AppNoConsole 1
            & $nssm set $serviceName Start SERVICE_AUTO_START
            & $nssm set $serviceName Type SERVICE_WIN32_OWN_PROCESS

            Start-Service -Name $serviceName
            Write-Success "Service registered and started"
            return
        }
        catch {
            Write-Warning "Failed to register service with NSSM: $_"
        }
    }

    # Fallback: Use Task Scheduler
    Write-Warning "NSSM not found. Using Windows Task Scheduler instead."

    if ($DryRun) {
        Write-Info "DRY RUN: Would create scheduled task"
        return
    }

    try {
        $taskName = "Tiflis Workstation"
        $exePath = Join-Path $script:WorkstationDir "node_modules" $script:PackageName "dist" "main.js"
        $action = New-ScheduledTaskAction `
            -Execute "node" `
            -Argument "`"$exePath`"" `
            -WorkingDirectory $script:WorkstationDir

        $trigger = New-ScheduledTaskTrigger -AtStartup

        $settings = New-ScheduledTaskSettingsSet `
            -AllowStartIfOnBatteries `
            -StartWhenAvailable `
            -RunOnlyIfNetworkAvailable `
            -RestartCount 3 `
            -RestartInterval (New-TimeSpan -Minutes 1)

        $principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType ServiceAccount -RunLevel Highest

        $task = New-ScheduledTask `
            -Action $action `
            -Trigger $trigger `
            -Settings $settings `
            -Principal $principal `
            -Description "Tiflis Code Workstation Server"

        Register-ScheduledTask -TaskName $taskName -InputObject $task -Force | Out-Null
        Start-ScheduledTask -TaskName $taskName

        Write-Success "Scheduled task created and started"
    }
    catch {
        Write-Error "Failed to create scheduled task: $_"
    }
}

# ─────────────────────────────────────────────────────────────
# Main Installation Function
# ─────────────────────────────────────────────────────────────
function Invoke-Installation {
    Write-Step "Checking Node.js..."

    if (-not (Test-NodeInstalled 24)) {
        Write-Warning "Node.js >= 24 is required"
        if (Confirm-Prompt "Install Node.js automatically?") {
            if (-not (Install-NodeJS)) {
                Write-Error "Node.js installation failed"
                Write-Info "Please install manually from: https://nodejs.org"
                exit 1
            }
            # Refresh PATH
            $env:PATH = [System.Environment]::GetEnvironmentVariable("PATH", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("PATH", "User")
        }
        else {
            Write-Error "Node.js >= 24 is required"
            exit 1
        }
    }

    Write-Success "Node.js $(Get-NodeVersion) detected"

    # Check for existing installation
    $skipConfig = $false
    $envPath = Join-Path $script:WorkstationDir ".env"

    if (Test-Path $envPath) {
        Write-Info "Existing installation detected at $script:WorkstationDir"

        if (Confirm-Prompt "Keep existing configuration and only update the package?") {
            $skipConfig = $true
            Write-Success "Will keep existing configuration"
        }
    }

    # Create directories
    Write-Step "Creating directories..."
    if (-not $DryRun) {
        @(
            (Join-Path $script:WorkstationDir "logs"),
            (Join-Path $script:WorkstationDir "data"),
            $script:WorkspaceRoot
        ) | ForEach-Object {
            if (-not (Test-Path $_)) {
                New-Item -ItemType Directory -Path $_ -Force | Out-Null
            }
        }
    }

    # Configuration
    $config = @{}
    if (-not $skipConfig) {
        $config = Invoke-ConfigurationWizard
        New-EnvFile -Config $config
    }
    else {
        Write-Success "Keeping existing .env configuration"
    }

    # Install npm package
    Install-Package

    # Register service
    Register-Service

    # Success message
    Write-Host ""
    if ($skipConfig) {
        Write-Success "Workstation updated successfully!"
    }
    else {
        Write-Success "Workstation installed successfully!"
    }
    Write-Host ""

    # Display information
    Write-Info "Configuration: $(Join-Path $script:WorkstationDir '.env')"
    Write-Info "Logs:          $(Join-Path $script:WorkstationDir 'logs')"
    Write-Info "Data:          $(Join-Path $script:WorkstationDir 'data')"
    Write-Host ""

    Write-Info "Service Commands:"
    Write-Info "  Status:   Get-Service TiflisWorkstation"
    Write-Info "  Logs:     Get-EventLog -LogName Application -Source 'TiflisWorkstation' -Newest 50"
    Write-Info "  Stop:     Stop-Service -Name TiflisWorkstation"
    Write-Info "  Start:    Start-Service -Name TiflisWorkstation"
    Write-Info "  Restart:  Restart-Service -Name TiflisWorkstation"
    Write-Host ""

    # Check if service is running
    if (-not $DryRun) {
        Start-Sleep -Seconds 2
        $service = Get-Service -Name "TiflisWorkstation" -ErrorAction SilentlyContinue
        if ($null -ne $service -and $service.Status -eq "Running") {
            Write-Host "  Connection info available at: http://localhost:3002/connect"
        }
    }
    Write-Host ""
}

# ─────────────────────────────────────────────────────────────
# Main Entry Point
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
