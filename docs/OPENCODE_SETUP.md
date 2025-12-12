# OpenCode Agent Setup Guide

> Complete guide for configuring OpenCode agent with Tiflis Code workstation

**Last Updated:** 2025-12-11

---

## Overview

OpenCode uses a **daemon architecture** where:

1. A persistent daemon runs with `opencode serve`
2. Multiple client sessions connect with `opencode run --attach`
3. The Tiflis Code workstation **auto-starts** the daemon when configured

## Quick Setup

### 1. Install OpenCode

```bash
# Install OpenCode CLI globally
npm install -g @opencode/cli

# Verify installation
opencode --version
```

### 2. Configure Environment

Add to your workstation `.env` file:

```bash
# Required: Enable OpenCode daemon auto-start
OPENCODE_DAEMON_URL=http://localhost:4200

# Optional: Custom OpenCode alias with model selection
AGENT_ALIAS_OPENCODE=opencode --model anthropic/claude-sonnet-4-5
```

### 3. Start Workstation

```bash
cd packages/workstation
pnpm dev
```

The workstation will:

- Auto-start OpenCode daemon on port 4200
- Register "opencode" (or your custom alias) as available agent
- Handle session context preservation automatically

## Configuration Options

### OpenCode Daemon URL

```bash
# Default (recommended)
OPENCODE_DAEMON_URL=http://localhost:4200

# Custom port
OPENCODE_DAEMON_URL=http://localhost:50055

# Custom host (for network access)
OPENCODE_DAEMON_URL=http://0.0.0.0:4200
```

### Agent Aliases

Define custom OpenCode configurations:

```bash
# Basic OpenCode
AGENT_ALIAS_OPENCODE=opencode

# OpenCode with Claude model
AGENT_ALIAS_OPENCODE_CLAUDE=opencode --model anthropic/claude-sonnet-4-5

# OpenCode with GPT model
AGENT_ALIAS_OPENCODE_GPT=opencode --model openai/gpt-4o

# OpenCode with custom settings
AGENT_ALIAS_OPENCODE_CUSTOM=opencode --model anthropic/claude-sonnet-4-5 --temperature 0.5
```

## Session Context Preservation

The workstation automatically handles OpenCode session continuity:

1. **First Command**: `opencode run --attach <url> --format json "prompt"`
2. **Session ID**: Extracted from OpenCode response
3. **Subsequent Commands**: `opencode run --attach <url> --session <id> --format json "prompt"`

No manual configuration required - the workstation manages session IDs automatically.

## CLI Command Structure

The workstation generates OpenCode commands in this format:

```bash
# Initial command (no session)
opencode run --attach http://localhost:4200 --format json --model anthropic/claude-sonnet-4-5 "what is the number?"

# Follow-up command (with session)
opencode run --attach http://localhost:4200 --session ses_abc123 --format json --model anthropic/claude-sonnet-4-5 "what did I just ask?"
```

## Troubleshooting

### Daemon Won't Start

**Symptoms**: "OpenCode daemon failed to start" in logs

**Solutions**:

1. Verify OpenCode installation: `opencode --version`
2. Check port availability: `lsof -i :4200`
3. Check daemon URL format in `.env`

### Session Context Lost

**Symptoms**: Agent doesn't remember previous prompts

**Solutions**:

1. Ensure `--format json` is used (configured by default)
2. Check for session ID in OpenCode response logs
3. Verify daemon isn't restarting between commands

### Connection Refused

**Symptoms**: "Connection refused" when creating sessions

**Solutions**:

1. Verify daemon is running: `curl http://localhost:4200/health`
2. Check firewall settings
3. Ensure `OPENCODE_DAEMON_URL` matches daemon host/port

## Advanced Configuration

### Custom Daemon Parameters

The daemon starts with these default flags:

```bash
opencode serve --port 4200 --hostname localhost
```

To customize, modify `src/infrastructure/agents/opencode-daemon.ts` or set environment variables.

### Multiple OpenCode Instances

For multiple OpenCode configurations:

1. Use different ports in `OPENCODE_DAEMON_URL`
2. Create multiple agent aliases
3. Each alias will use the configured daemon URL

## Example Configurations

### Development Setup

```bash
# .env file
OPENCODE_DAEMON_URL=http://localhost:4200
AGENT_ALIAS_OPENCODE=opencode --model anthropic/claude-sonnet-4-5
```

### Production Setup

```bash
# .env file
OPENCODE_DAEMON_URL=http://0.0.0.0:4200
AGENT_ALIAS_OPENCODE_PROD=opencode --model anthropic/claude-sonnet-4-5 --temperature 0
```

### Multi-Model Setup

```bash
# .env file
OPENCODE_DAEMON_URL=http://localhost:4200
AGENT_ALIAS_OPENCODE_CLAUDE=opencode --model anthropic/claude-sonnet-4-5
AGENT_ALIAS_OPENCODE_GPT=opencode --model openai/gpt-4o
AGENT_ALIAS_OPENCODE_FAST=opencode --model anthropic/claude-3-haiku
```

## Integration with Supervisor

Once configured, the supervisor can create OpenCode sessions:

```
User: Create an OpenCode session to refactor the auth module

Supervisor: I'll create an OpenCode session for you.
[Creates session with AGENT_ALIAS_OPENCODE_CLAUDE]

User: What files are in the auth directory?

OpenCode: [Lists files with context from previous question]
```

## References

- [OpenCode CLI Documentation](https://opencode.ai/docs/cli/)
- [Agent Chat Integration Plan](AGENT_CHAT_INTEGRATION_PLAN.md)
- [Environment Configuration](../env.example)
