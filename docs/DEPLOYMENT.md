# 🚀 Tiflis Code — Deployment Guide

Complete deployment guide for Tiflis Code tunnel and workstation servers in production environments.

## 📋 Overview

Tiflis Code consists of two main components:

| Component | Purpose | Technology |
|-----------|---------|------------|
| **Tunnel Server** | WebSocket reverse proxy for public access | Node.js, Fastify, ws |
| **Workstation Server** | AI agent manager and terminal access | Node.js, LangChain, node-pty |

## ⚡ Quick Install (One-Liner)

### Tunnel Server

```bash
# Docker Compose (recommended for servers)
curl -fsSL https://code.tiflis.io/install-tunnel.sh | bash

# Native Node.js
curl -fsSL https://code.tiflis.io/install-tunnel.sh | bash -s -- --native

# Dry run (preview without changes)
curl -fsSL https://code.tiflis.io/install-tunnel.sh | bash -s -- --dry-run
```

### Workstation Server

#### macOS / Linux

```bash
# Interactive setup
curl -fsSL https://code.tiflis.io/install-workstation.sh | bash

# Non-interactive (provide env vars)
TUNNEL_URL=wss://tunnel.example.com/ws \
TUNNEL_API_KEY=your-api-key \
curl -fsSL https://code.tiflis.io/install-workstation.sh | bash

# Dry run (preview without changes)
curl -fsSL https://code.tiflis.io/install-workstation.sh | bash -s -- --dry-run
```

#### Windows

```powershell
# Interactive setup
powershell -ExecutionPolicy Bypass -File install-workstation.ps1

# Non-interactive (provide env vars)
$env:TUNNEL_URL = "wss://tunnel.example.com"
$env:TUNNEL_API_KEY = "your-api-key"
$env:WORKSTATION_AUTH_KEY = "your-auth-key"
powershell -ExecutionPolicy Bypass -File install-workstation.ps1

# Using batch wrapper (from Command Prompt)
install-workstation.bat
```

#### WSL2 (Windows Subsystem for Linux)

```bash
# Run inside WSL2
wsl -d Ubuntu
curl -fsSL https://code.tiflis.io/install-workstation.sh | bash
```

### What the Scripts Do

1. **Platform Detection** - Detect OS and architecture (macOS, Linux, WSL, Windows)
2. **Prerequisites Check** - Verify Docker, Node.js >= 22, build tools are installed
3. **Configuration Wizard** - Interactive prompts (or use environment variables)
4. **Service Registration** - Create system service (systemd/launchd/NSSM/Task Scheduler)
5. **Package Installation** - Install npm dependencies from npm registry
6. **Service Startup** - Start the server and display connection information

### Platform-Specific Details

#### Windows Installation

The Windows installer includes several features:

- **Automatic Node.js Installation** via Chocolatey or Windows Package Manager
- **NSSM Support** for robust service management (recommended)
- **Task Scheduler Fallback** if NSSM is not available
- **PowerShell 7+ with Windows PowerShell 5.1 fallback**
- **Secure .env Management** with automatic backups
- **Dry-run Mode** for testing without making changes

Prerequisites:
- Windows 10/11 (Build 19041+)
- PowerShell 5.1+ (built-in)
- Node.js 24 LTS (auto-installed if missing)
- Optional: NSSM for service management (`choco install nssm`)

### Native Speech Services Installer

```bash
# Interactive setup for local STT/TTS services
curl -fsSL https://code.tiflis.io/install-native-services.sh | bash

# Features:
# - Automatic GPU detection (CUDA/ROCm/Metal)
# - NVIDIA driver installation (Linux)
# - Python 3.11+ environment setup
# - HuggingFace token configuration
# - Systemd service creation
```

### Installation Directory

#### Linux / macOS

Both scripts install to `~/.tiflis-code/`:

```
~/.tiflis-code/
├── tunnel/
│   ├── .env
│   ├── docker-compose.yml  # Docker mode
│   ├── node_modules/       # Native mode
│   └── logs/
├── workstation/
│   ├── .env
│   ├── node_modules/
│   ├── data/
│   │   └── tiflis.db
│   └── logs/
└── services/
    ├── stt/                # Speech-to-Text service
    │   ├── .venv/
    │   ├── models/
    │   └── logs/
    └── tts/                # Text-to-Speech service
        ├── .venv/
        ├── models/
        └── logs/
```

#### Windows

Windows installer uses `%LOCALAPPDATA%\TiflisCode\`:

```
C:\Users\YourName\AppData\Local\TiflisCode\
├── tunnel\
│   ├── .env
│   ├── node_modules\
│   └── logs\
└── workstation\
    ├── .env
    ├── node_modules\
    ├── data\
    │   └── tiflis.db
    └── logs\
```

## 🏗️ Architecture

```
┌─────────────────┐    HTTPS/WSS    ┌─────────────────┐    WS    ┌─────────────────────┐
│  Mobile Client  │ ◄──────────────► │  Tunnel Server  │ ◄───────► │  Workstation Server │
│  (iOS/watchOS)  │                  │   (Public VPS)  │          │   (User's Machine)  │
│                 │                  │  + Web Client   │          │                     │
└─────────────────┘                  └─────────────────┘          └─────────────────────┘
                                                                            │
                                                                            │ HTTP
                                                                            ▼
                                                                   ┌─────────────────────┐
                                                                   │  Speech Services    │
                                                                   │  ├─ STT (Whisper)   │
                                                                   │  └─ TTS (Kokoro)    │
                                                                   └─────────────────────┘
```

## 🪟 Windows Native Installation

### System Requirements

| Component | Requirement |
|-----------|------------|
| **OS** | Windows 10/11 (Build 19041+) |
| **PowerShell** | 5.1+ (built-in) |
| **Node.js** | 24 LTS (auto-installed if missing) |
| **Package Manager** | Chocolatey or Windows Package Manager (optional) |
| **Service Manager** | NSSM or Windows Task Scheduler |

### Installation Steps

#### 1. Download Installer

```powershell
# Download from GitHub releases or web server
Invoke-WebRequest -Uri "https://code.tiflis.io/install-workstation.ps1" `
  -OutFile "install-workstation.ps1"

# Or use the batch wrapper
# Invoke-WebRequest -Uri "https://code.tiflis.io/install-workstation.bat" `
#   -OutFile "install-workstation.bat"
```

#### 2. Run Installer

```powershell
# Interactive mode (recommended)
powershell -ExecutionPolicy Bypass -File install-workstation.ps1

# Or with environment variables (non-interactive)
$env:TUNNEL_URL = "wss://tunnel.example.com"
$env:TUNNEL_API_KEY = "your-api-key-32-chars"
$env:WORKSTATION_AUTH_KEY = "your-auth-key"
$env:WORKSPACES_ROOT = "C:\Users\YourName\work"
powershell -ExecutionPolicy Bypass -File install-workstation.ps1

# Dry-run mode (preview without changes)
powershell -ExecutionPolicy Bypass -File install-workstation.ps1 -DryRun
```

### Installation Details

The Windows installer automatically:

1. **Checks Node.js** - Verifies Node.js 24+ is installed
   - Uses Chocolatey if available
   - Falls back to Windows Package Manager (winget)
   - Prompts for manual installation if neither is available

2. **Creates Directories**
   ```
   %LOCALAPPDATA%\TiflisCode\
   ├── workstation\
   │   ├── .env
   │   ├── node_modules\
   │   ├── data\
   │   └── logs\
   ```

3. **Configuration** - Interactive prompts for:
   - Tunnel server URL (wss://...)
   - Tunnel API key (minimum 32 characters)
   - Workstation auth key (auto-generated or custom)
   - Workspaces root directory

4. **Service Registration** - Creates Windows service:
   - **Primary**: NSSM (Non-Sucking Service Manager) - if available
   - **Fallback**: Windows Task Scheduler - automatic startup
   - Service name: `TiflisWorkstation`
   - Runs on system startup

5. **Environment File** - Creates `.env` with:
   ```env
   TUNNEL_URL=wss://tunnel.example.com
   TUNNEL_API_KEY=your-api-key
   WORKSTATION_AUTH_KEY=your-auth-key
   WORKSTATION_NAME=YOUR-COMPUTER-NAME
   WORKSPACES_ROOT=C:\Users\YourName\work
   ```

### Service Management

#### Check Service Status

```powershell
# View service
Get-Service TiflisWorkstation

# Start service
Start-Service -Name TiflisWorkstation

# Stop service
Stop-Service -Name TiflisWorkstation

# Restart service
Restart-Service -Name TiflisWorkstation
```

#### View Logs

```powershell
# Event Viewer logs
Get-EventLog -LogName Application -Source "TiflisWorkstation" -Newest 50

# Or open Event Viewer
eventvwr.msc
# Navigate: Windows Logs → Application
```

#### Manual Startup

If service issues occur, run manually for debugging:

```powershell
cd "$env:LOCALAPPDATA\TiflisCode\workstation"
node .\node_modules\@tiflis-io\tiflis-code-workstation\dist\main.js
```

### Environment Variables

Set before running installer for non-interactive setup:

```powershell
# Tunnel connection (required)
$env:TUNNEL_URL = "wss://tunnel.example.com"
$env:TUNNEL_API_KEY = "your-32-character-api-key"

# Workstation settings (optional)
$env:WORKSTATION_AUTH_KEY = "your-auth-key-or-leave-for-auto-generation"
$env:WORKSPACES_ROOT = "C:\Users\YourName\work"
$env:TIFLIS_INSTALL_DIR = "$env:LOCALAPPDATA\TiflisCode"

# Then run
powershell -ExecutionPolicy Bypass -File install-workstation.ps1
```

### Troubleshooting

#### PowerShell Execution Policy Error

```powershell
# Temporarily bypass for current session
powershell -ExecutionPolicy Bypass -File install-workstation.ps1

# Or set policy (not recommended)
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

#### Node.js Not Found After Installation

```powershell
# Refresh PATH environment variable
$env:PATH = [System.Environment]::GetEnvironmentVariable("PATH", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("PATH", "User")

# Or restart PowerShell/Command Prompt
```

#### Service Not Starting

```powershell
# Check service status details
Get-Service TiflisWorkstation | Format-List *

# View system event logs
Get-EventLog -LogName Application -Newest 50 | Where-Object Source -eq "TiflisWorkstation"

# Run manually to see errors
cd "$env:LOCALAPPDATA\TiflisCode\workstation"
node .\node_modules\@tiflis-io\tiflis-code-workstation\dist\main.js
```

#### Port Already in Use

```powershell
# Find process using port 3002
netstat -ano | findstr :3002
tasklist | findstr <PID>

# Change port in .env file
# Edit: $env:LOCALAPPDATA\TiflisCode\workstation\.env
# Set: PORT=3003
```

#### NSSM Installation Issues

```powershell
# Install Chocolatey if needed
Set-ExecutionPolicy Bypass -Scope Process -Force
iex ((New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))

# Then install NSSM
choco install nssm -y
```

### Uninstall

```powershell
# Stop service
Stop-Service -Name TiflisWorkstation -Force

# Remove service (if NSSM)
nssm remove TiflisWorkstation confirm

# Or remove scheduled task (if Task Scheduler)
Unregister-ScheduledTask -TaskName "Tiflis Workstation" -Confirm:$false

# Remove installation directory
Remove-Item -Path "$env:LOCALAPPDATA\TiflisCode" -Recurse -Force
```

---

## 🐳 Docker Deployment (Recommended)

### Tunnel Server

#### Option 1: Docker Compose with Traefik

```yaml
# docker-compose.traefik.yml
version: '3.8'

services:
  tunnel:
    image: ghcr.io/tiflis-io/tiflis-code-tunnel:latest
    container_name: tiflis-tunnel
    restart: unless-stopped
    environment:
      - NODE_ENV=production
      - TUNNEL_REGISTRATION_API_KEY=${TUNNEL_REGISTRATION_API_KEY}
      - PORT=3000
      - HOST=0.0.0.0
      - TRUST_PROXY=true
      - LOG_LEVEL=info
      - PUBLIC_BASE_URL=${PUBLIC_BASE_URL:-https://tunnel.yourdomain.com}
    networks:
      - tiflis
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.tiflis-tunnel.rule=Host(`tunnel.yourdomain.com`)"
      - "traefik.http.routers.tiflis-tunnel.entrypoints=websecure"
      - "traefik.http.routers.tiflis-tunnel.tls.certresolver=letsencrypt"
      - "traefik.http.services.tiflis-tunnel.loadbalancer.server.port=3000"
      - "traefik.http.routers.tiflis-tunnel.middlewares=cors-headers"

  traefik:
    image: traefik:v3.0
    container_name: tiflis-traefik
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
      - ./acme.json:/acme.json
      - ./traefik.yml:/traefik.yml:ro
    networks:
      - tiflis
    command:
      - "--api.insecure=true"
      - "--providers.docker=true"
      - "--providers.docker.exposedbydefault=false"
      - "--entrypoints.web.address=:80"
      - "--entrypoints.websecure.address=:443"
      - "--certificatesresolvers.letsencrypt.acme.httpchallenge=true"
      - "--certificatesresolvers.letsencrypt.acme.httpchallenge.entrypoint=web"
      - "--certificatesresolvers.letsencrypt.acme.email=letsencrypt@yourdomain.com"
      - "--certificatesresolvers.letsencrypt.acme.storage=/acme.json"

networks:
  tiflis:
    driver: bridge
```

#### Option 2: Docker Compose with Nginx

```yaml
# docker-compose.nginx.yml
version: '3.8'

services:
  tunnel:
    image: ghcr.io/tiflis-io/tiflis-code-tunnel:latest
    container_name: tiflis-tunnel
    restart: unless-stopped
    environment:
      - NODE_ENV=production
      - TUNNEL_REGISTRATION_API_KEY=${TUNNEL_REGISTRATION_API_KEY}
      - PORT=3000
      - HOST=0.0.0.0
      - TRUST_PROXY=true
      - LOG_LEVEL=info
      - PUBLIC_BASE_URL=${PUBLIC_BASE_URL:-https://tunnel.yourdomain.com}
    expose:
      - "3000"

  nginx:
    image: nginx:alpine
    container_name: tiflis-nginx
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf:ro
      - ./ssl:/etc/nginx/ssl:ro
    depends_on:
      - tunnel
```

### Workstation Server

```yaml
# docker-compose.workstation.yml
version: '3.8'

services:
  workstation:
    image: ghcr.io/tiflis-io/tiflis-code-workstation:latest
    container_name: tiflis-workstation
    restart: unless-stopped
    environment:
      - NODE_ENV=production
      - TUNNEL_URL=${TUNNEL_URL}
      - TUNNEL_API_KEY=${TUNNEL_API_KEY}
      - WORKSTATION_AUTH_KEY=${WORKSTATION_AUTH_KEY}
      - PORT=3002
      - HOST=0.0.0.0
      - LOG_LEVEL=info
      - WORKSPACES_ROOT=/workspaces
      - AGENT_PROVIDER=${AGENT_PROVIDER:-openai}
      - AGENT_API_KEY=${AGENT_API_KEY}
      - AGENT_MODEL_NAME=${AGENT_MODEL_NAME:-gpt-4}
    volumes:
      - ./workspaces:/workspaces
      - ${HOME}/.ssh:/home/node/.ssh:ro
    ports:
      - "3002:3002"
    user: "1000:1000"  # Run as non-root user
```

## ⚙️ Configuration

### Environment Variables

#### Tunnel Server (.env)

```bash
# Required
TUNNEL_REGISTRATION_API_KEY=your-secure-registration-key-min-32-chars
PORT=3000
HOST=0.0.0.0
NODE_ENV=production

# Optional
TRUST_PROXY=true                    # Enable if behind reverse proxy
LOG_LEVEL=info                     # debug, info, warn, error
PUBLIC_BASE_URL=https://tunnel.yourdomain.com
WS_PATH=/ws                        # WebSocket endpoint path
```

#### Workstation Server (.env)

```bash
# Required
TUNNEL_URL=wss://tunnel.yourdomain.com/ws
TUNNEL_API_KEY=your-secure-registration-key
WORKSTATION_AUTH_KEY=your-local-auth-key
WORKSPACES_ROOT=/workspaces

# Agent Configuration
AGENT_PROVIDER=openai              # openai, anthropic, cerebras, etc.
AGENT_API_KEY=your-llm-api-key
AGENT_MODEL_NAME=gpt-4              # gpt-4, claude-3-opus, etc.

# Optional
PORT=3002
HOST=0.0.0.0
LOG_LEVEL=info
NODE_ENV=production

# Speech/Text-to-Speech (Optional)
STT_PROVIDER=openai                # openai, deepgram, local
STT_API_KEY=your-stt-api-key       # Not required for local provider
STT_BASE_URL=http://localhost:5000 # For local provider
TTS_PROVIDER=openai                # openai, elevenlabs, local
TTS_API_KEY=your-tts-api-key       # Not required for local provider
TTS_BASE_URL=http://localhost:5001 # For local provider
```

## 🔒 SSL/TLS Setup

### Option 1: Let's Encrypt with Traefik (Recommended)

Traefik automatically handles SSL certificate generation and renewal:

```yaml
# traefik.yml
api:
  dashboard: true

entryPoints:
  web:
    address: ":80"
    http:
      redirections:
        entryPoint:
          to: websecure
          scheme: https

  websecure:
    address: ":443"

certificatesResolvers:
  letsencrypt:
    acme:
      email: letsencrypt@yourdomain.com
      storage: acme.json
      httpChallenge:
        entryPoint: web
```

### Option 2: Manual SSL with Nginx

```nginx
# nginx.conf
events {
    worker_connections 1024;
}

http {
    upstream tunnel {
        server tunnel:3000;
    }

    # HTTP to HTTPS redirect
    server {
        listen 80;
        server_name tunnel.yourdomain.com;
        return 301 https://$server_name$request_uri;
    }

    # HTTPS with WebSocket support
    server {
        listen 443 ssl http2;
        server_name tunnel.yourdomain.com;

        ssl_certificate /etc/nginx/ssl/cert.pem;
        ssl_certificate_key /etc/nginx/ssl/key.pem;
        ssl_protocols TLSv1.2 TLSv1.3;
        ssl_ciphers HIGH:!aNULL:!MD5;

        # WebSocket proxy configuration
        location /ws {
            proxy_pass http://tunnel;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection "upgrade";
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_read_timeout 86400;
            proxy_send_timeout 86400;
        }

        # Regular HTTP endpoints
        location / {
            proxy_pass http://tunnel;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
        }
    }
}
```

## 📊 Monitoring & Health Checks

### Health Endpoints

Both servers expose health check endpoints:

```bash
# Tunnel Server
GET /health          # Detailed health status
GET /healthz         # Simple liveness probe
GET /readyz          # Readiness probe

# Workstation Server
GET /health          # Detailed health status
GET /healthz         # Simple liveness probe
GET /readyz          # Readiness probe
GET /connection-info # Connection status and magic link
```

### Monitoring Configuration

#### Docker Health Checks

```yaml
# docker-compose.yml
services:
  tunnel:
    healthcheck:
      test: ["CMD", "wget", "--no-verbose", "--tries=1", "--spider", "http://localhost:3000/healthz"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s

  workstation:
    healthcheck:
      test: ["CMD", "wget", "--no-verbose", "--tries=1", "--spider", "http://localhost:3002/healthz"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
```

#### Prometheus Metrics (Optional)

Add monitoring by scraping health endpoints:

```yaml
# prometheus.yml
scrape_configs:
  - job_name: 'tiflis-tunnel'
    static_configs:
      - targets: ['tunnel.yourdomain.com:3000']
    metrics_path: '/health'
    scrape_interval: 30s

  - job_name: 'tiflis-workstation'
    static_configs:
      - targets: 'localhost:3002'
    metrics_path: '/health'
    scrape_interval: 30s
```

## 🛠️ Deployment Steps

### 1. Prepare Environment

```bash
# Clone repository
git clone https://github.com/tiflis-io/tiflis-code.git
cd tiflis-code

# Create environment files
cp packages/tunnel/env.example .env.tunnel
cp packages/workstation/env.example .env.workstation

# Edit environment files
nano .env.tunnel
nano .env.workstation
```

### 2. Deploy Tunnel Server

```bash
# With Traefik
docker-compose -f docker-compose.traefik.yml up -d

# Or with Nginx
docker-compose -f docker-compose.nginx.yml up -d
```

### 3. Deploy Workstation Server

```bash
# On the user's machine
docker-compose -f docker-compose.workstation.yml up -d
```

### 4. Verify Deployment

```bash
# Check tunnel health
curl https://tunnel.yourdomain.com/health

# Check workstation health
curl http://localhost:3002/health

# Test WebSocket connection
wscat -c wss://tunnel.yourdomain.com/ws
```

## 🔧 Production Checklist

### Security

- [ ] Use strong, unique API keys (min 32 characters)
- [ ] Enable HTTPS/TLS for all connections
- [ ] Configure firewall rules
- [ ] Use non-root containers
- [ ] Enable rate limiting on reverse proxy
- [ ] Monitor access logs

### Performance

- [ ] Configure appropriate WebSocket timeouts
- [ ] Set up connection monitoring
- [ ] Configure backup persistence for workstation data
- [ ] Test concurrent connections

### Reliability

- [ ] Enable container restart policies
- [ ] Configure health checks
- [ ] Set up log rotation
- [ ] Configure backup procedures
- [ ] Monitor disk space usage

### Monitoring

- [ ] Set up alerting for health check failures
- [ ] Monitor WebSocket connection counts
- [ ] Track error rates and response times
- [ ] Set up log aggregation

## 🆘 Troubleshooting

### Common Issues

#### WebSocket Connection Failures

```bash
# Check tunnel server status
curl https://tunnel.yourdomain.com/health

# Verify WebSocket endpoint
wscat -c wss://tunnel.yourdomain.com/ws

# Check nginx proxy configuration
docker exec tiflis-nginx nginx -t
```

#### Authentication Errors

```bash
# Verify API keys match
grep TUNNEL_REGISTRATION_API_KEY .env.tunnel
grep TUNNEL_API_KEY .env.workstation

# Check tunnel logs
docker logs tiflis-tunnel

# Check workstation logs
docker logs tiflis-workstation
```

#### SSL Certificate Issues

```bash
# Check certificate expiry
openssl s_client -connect tunnel.yourdomain.com:443 -servername tunnel.yourdomain.com

# Renew Let's Encrypt certificates
docker-compose restart traefik
```

### Performance Issues

```bash
# Monitor resource usage
docker stats

# Check connection counts
curl https://tunnel.yourdomain.com/health | jq '.connections'

# Analyze logs for errors
docker logs tiflis-tunnel --tail 100 | grep ERROR
```

## 📚 Additional Resources

- [Protocol Documentation](../PROTOCOL.md)
- [Local Development Guide](LOCAL_DEVELOPMENT.md)
- [Docker Configuration Reference](../packages/tunnel/deploy/)
- [GitHub Actions Workflows](../.github/workflows/)

## 🆘 Support

For deployment issues:

1. Check [GitHub Issues](https://github.com/tiflis-io/tiflis-code/issues)
2. Review troubleshooting section above
3. Enable debug logging: `LOG_LEVEL=debug`
4. Check container logs for detailed error messages

---

*This guide covers production deployment. For development setup, see [LOCAL_DEVELOPMENT.md](LOCAL_DEVELOPMENT.md).*