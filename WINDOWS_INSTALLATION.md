# Tiflis Code Windows Installation Guide

Complete installation guide for Tiflis Code on Windows.

## Prerequisites

### Required

- **Windows 10/11 (Build 19041+)** - Modern versions with PowerShell support
- **PowerShell 5.1 or higher** - Built-in on Windows 10/11
- **Node.js 24 LTS** - For workstation (installer will prompt)
  - Download: https://nodejs.org/en/download/
  - Or use: `choco install nodejs-lts` (with Chocolatey)
  - Or use: `winget install OpenJS.NodeJS` (Windows Package Manager)

### Optional

- **NSSM (Non-Sucking Service Manager)** - For better service management
  - Install: `choco install nssm` (via Chocolatey)
  - Or download: https://nssm.cc/download

## Installation

### 1. Tunnel Server (Remote Server)

The tunnel server runs on your remote server (Linux, macOS, or Windows Server).

#### Quick Start (Docker Recommended)

```powershell
# Download and run installer
Invoke-WebRequest -Uri "https://code.tiflis.io/install-tunnel.ps1" -OutFile "install-tunnel.ps1"
PowerShell -ExecutionPolicy Bypass -File "install-tunnel.ps1"
```

#### Manual Installation

```powershell
# Open PowerShell as Administrator
powershell -ExecutionPolicy Bypass -File install-tunnel.ps1
```

The installer will:
1. Check Node.js (v22+) and install if needed
2. Prompt for API key (minimum 32 characters)
3. Create `.env` configuration file
4. Install npm packages
5. Register Windows service (via NSSM or Task Scheduler)
6. Start the tunnel server

**Environment Variables**

```powershell
# Optional - set before running installer
$env:TUNNEL_REGISTRATION_API_KEY = "your-32-character-api-key"
$env:TIFLIS_TUNNEL_PORT = "3001"
$env:TIFLIS_INSTALL_DIR = "$env:LOCALAPPDATA\TiflisCode"
```

### 2. Workstation Server (Your Computer)

The workstation server runs on your development machine.

#### Quick Start

```powershell
# From the scripts directory
powershell -ExecutionPolicy Bypass -File install-workstation.ps1
```

Or use the batch wrapper:

```cmd
# Run from Command Prompt or PowerShell
install-workstation.bat
```

The installer will:
1. Check Node.js (v24+) and install if needed
2. Prompt for tunnel connection details
3. Create `.env` configuration file
4. Install npm packages
5. Register Windows service
6. Start the workstation server

**Environment Variables**

```powershell
$env:TUNNEL_URL = "wss://your-tunnel-domain.com"
$env:TUNNEL_API_KEY = "your-api-key-from-tunnel-setup"
$env:WORKSTATION_AUTH_KEY = "your-auth-key-or-auto-generated"
$env:WORKSPACES_ROOT = "C:\Users\YourName\work"
$env:TIFLIS_INSTALL_DIR = "$env:LOCALAPPDATA\TiflisCode"
```

## Configuration

### Location

Default configuration file location:

```
%LOCALAPPDATA%\TiflisCode\workstation\.env
%LOCALAPPDATA%\TiflisCode\tunnel\.env
```

Example on Windows:
- `C:\Users\YourName\AppData\Local\TiflisCode\workstation\.env`
- `C:\Users\YourName\AppData\Local\TiflisCode\tunnel\.env`

### Workstation Configuration Example

```env
# Tunnel connection
TUNNEL_URL=wss://tunnel.example.com
TUNNEL_API_KEY=your-api-key-here

# Local settings
WORKSTATION_AUTH_KEY=generated-auth-key
WORKSTATION_NAME=MY-COMPUTER
WORKSPACES_ROOT=C:\Users\YourName\work

# Server
PORT=3002
HOST=127.0.0.1
NODE_ENV=production
LOG_LEVEL=info

# Optional: AI Providers
# AGENT_PROVIDER=openai
# AGENT_API_KEY=sk-...
# AGENT_MODEL_NAME=gpt-4o-mini
```

## Service Management

### Using Services (NSSM/Scheduler)

#### With NSSM

```powershell
# View service status
Get-Service TiflisWorkstation
Get-Service TiflisTunnel

# Start service
Start-Service -Name TiflisWorkstation
Stop-Service -Name TiflisWorkstation
Restart-Service -Name TiflisWorkstation
```

#### With Task Scheduler

1. Open Task Scheduler (`tasksched.msc`)
2. Find "Tiflis Workstation" or "Tiflis Tunnel" task
3. Right-click and select:
   - **Run** to start
   - **End** to stop
   - **Disable/Enable** to control startup

### Manual Service Management

```powershell
# Create manual service wrapper if needed
$serviceDir = "$env:LOCALAPPDATA\TiflisCode\workstation"
$envFile = "$serviceDir\.env"

# Load environment and run directly
Get-Content $envFile | ForEach-Object {
    if ($_ -match '([^=]+)=(.*)') {
        [Environment]::SetEnvironmentVariable($matches[1], $matches[2])
    }
}

cd $serviceDir
node .\node_modules\@tiflis-io\tiflis-code-workstation\dist\main.js
```

## Logs

### Location

```
%LOCALAPPDATA%\TiflisCode\workstation\logs\
%LOCALAPPDATA%\TiflisCode\tunnel\logs\
```

Example:
- `C:\Users\YourName\AppData\Local\TiflisCode\workstation\logs\workstation.log`

### View Logs

#### For Task Scheduler

```powershell
# View Event Log
Get-EventLog -LogName Application -Source "TiflisWorkstation" -Newest 50 | Format-Table TimeGenerated, Message

# View Event Viewer GUI
eventvwr.msc
# Navigate to: Windows Logs → Application
```

#### Direct File

```powershell
# View log file
Get-Content "$env:LOCALAPPDATA\TiflisCode\workstation\logs\workstation.log" -Tail 50 -Wait
```

## Troubleshooting

### PowerShell Execution Policy

If you see an error about execution policies:

```powershell
# Temporarily allow for current session
PowerShell -ExecutionPolicy Bypass -File install-workstation.ps1

# Or permanently set (not recommended)
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

### Node.js Not Found

```powershell
# Refresh PATH after installation
$env:PATH = [System.Environment]::GetEnvironmentVariable("PATH", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("PATH", "User")

# Or restart PowerShell/terminal
```

### Service Not Starting

1. Check logs:
   ```powershell
   Get-EventLog -LogName Application -Newest 100 | Where-Object Source -eq "TiflisWorkstation"
   ```

2. Check service status:
   ```powershell
   Get-Service TiflisWorkstation | Format-List *
   ```

3. Run manually to see errors:
   ```powershell
   cd "$env:LOCALAPPDATA\TiflisCode\workstation"
   node .\node_modules\@tiflis-io\tiflis-code-workstation\dist\main.js
   ```

### NSSM Installation Issues

```powershell
# Install Chocolatey if not present
Set-ExecutionPolicy Bypass -Scope Process -Force
[System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072
iex ((New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))

# Then install NSSM
choco install nssm -y
```

### Port Already in Use

If port 3002 (workstation) or 3001 (tunnel) is already in use:

1. Find what's using the port:
   ```powershell
   netstat -ano | findstr :3002
   tasklist | findstr <PID>
   ```

2. Change port in `.env`:
   ```env
   PORT=3003
   ```

## Uninstallation

### Remove Service

```powershell
# With NSSM
nssm remove TiflisWorkstation confirm
nssm remove TiflisTunnel confirm

# With Task Scheduler
Unregister-ScheduledTask -TaskName "Tiflis Workstation" -Confirm:$false
Unregister-ScheduledTask -TaskName "Tiflis Tunnel" -Confirm:$false
```

### Remove Installation

```powershell
# Stop service first
Stop-Service -Name TiflisWorkstation -Force
Stop-Service -Name TiflisTunnel -Force

# Remove directory
Remove-Item -Path "$env:LOCALAPPDATA\TiflisCode" -Recurse -Force
```

## Advanced Configuration

### Custom Installation Directory

```powershell
$env:TIFLIS_INSTALL_DIR = "C:\Apps\TiflisCode"
powershell -ExecutionPolicy Bypass -File install-workstation.ps1
```

### Custom Workspaces Root

```env
WORKSPACES_ROOT=D:\Projects\work
```

### Environment Variables for Non-Interactive Install

```powershell
$env:TUNNEL_URL = "wss://tunnel.example.com"
$env:TUNNEL_API_KEY = "your-32-char-api-key"
$env:WORKSTATION_AUTH_KEY = "your-auth-key"
$env:WORKSPACES_ROOT = "C:\Users\YourName\work"

powershell -ExecutionPolicy Bypass -File install-workstation.ps1
```

## Support

For issues and questions:
- GitHub Issues: https://github.com/tiflis-io/tiflis-code/issues
- Documentation: https://github.com/tiflis-io/tiflis-code

## License

FSL-1.1-NC © 2025 Roman Barinov
