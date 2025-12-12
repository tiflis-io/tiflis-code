# Agent Chat Integration Plan

> **Status:** Ready for implementation
> **Date:** 2025-12-05
> **Focus:** Session context preservation via session_id/--resume

---

## Overview

Integrate the unified ChatView component with all three agent types (Claude, Cursor, OpenCode). The infrastructure is largely implemented — this plan focuses on ensuring session context is preserved across messages and all CLI output formats are correctly parsed.

---

## Configuration Philosophy

### CLI Parameters (передаём всегда)

Минимальный набор параметров для работы headless режима:

| Параметр           | Claude                        | Cursor                        | OpenCode         |
| ------------------ | ----------------------------- | ----------------------------- | ---------------- |
| **Output format**  | `--output-format stream-json` | `--output-format stream-json` | `--format json`  |
| **Print mode**     | `--print -p "prompt"`         | `--print "prompt"`            | `"prompt"`       |
| **Verbose**        | `--verbose`                   | —                             | —                |
| **Session resume** | `--resume <id>`               | `--resume <id>`               | `--session <id>` |
| **Daemon attach**  | —                             | —                             | `--attach <url>` |

### Project Config (хранится в папке проекта)

Все остальные настройки агент подхватывает автоматически из конфигов проекта:

**Claude Code** (`.claude/settings.json`):

```json
{
  "model": "claude-sonnet-4-5-20250514",
  "permissions": {
    "allow": ["Read", "Edit", "Bash"],
    "deny": ["WebFetch"]
  },
  "allowedTools": ["Read", "Edit", "Bash", "Glob", "Grep"],
  "maxTurns": 50
}
```

**OpenCode** (`./opencode.json`):

```json
{
  "model": "anthropic/claude-sonnet-4-5",
  "permission": {
    "edit": "allow",
    "bash": "ask"
  },
  "tools": {
    "write": true,
    "bash": true
  }
}
```

**Cursor** (`.cursor/mcp.json` для MCP серверов)

### Что можно настроить через проектные конфиги

| Параметр                | Claude                          | OpenCode                | Cursor      |
| ----------------------- | ------------------------------- | ----------------------- | ----------- |
| Модель                  | ✓ `model`                       | ✓ `model`               | ✓           |
| Разрешения инструментов | ✓ `permissions`, `allowedTools` | ✓ `permission`, `tools` | ✓ `--force` |
| System prompt           | ✓ `CLAUDE.md`                   | ✓ `instructions`        | —           |
| Max turns               | ✓ `maxTurns`                    | —                       | —           |
| API ключи               | ✓ env vars                      | ✓ `provider.apiKey`     | ✓ env vars  |

**Преимущество:** Пользователь настраивает агента один раз в проекте, и все сессии используют эти настройки автоматически.

---

## Protocol Compatibility

### Using Standard Protocol (v1.2+) — NO CHANGES NEEDED

The existing WebSocket protocol fully supports agent chat integration. All required message types are already implemented:

| Message             | Direction         | Purpose                                          |
| ------------------- | ----------------- | ------------------------------------------------ |
| `session.execute`   | iOS → Workstation | Send prompt to agent                             |
| `session.output`    | Workstation → iOS | Receive streaming response with `content_blocks` |
| `session.subscribe` | iOS → Workstation | Subscribe to session output                      |
| `session.created`   | Workstation → iOS | Session created with `working_dir`               |

### Content Blocks (Already Supported)

All block types are already defined in PROTOCOL.md and implemented:

| block_type | Purpose            | iOS Support     |
| ---------- | ------------------ | --------------- |
| `text`     | Text response      | ✓ ContentParser |
| `code`     | Code with language | ✓ ContentParser |
| `tool`     | Tool call status   | ✓ ContentParser |
| `thinking` | Extended thinking  | ✓ ContentParser |
| `status`   | Progress indicator | ✓ ContentParser |
| `error`    | Error message      | ✓ ContentParser |

### What's NOT in Protocol (Internal to Workstation)

| Feature         | Implementation                             |
| --------------- | ------------------------------------------ |
| CLI session_id  | Stored in `AgentSessionState.cliSessionId` |
| `--resume` flag | Added by `HeadlessAgentExecutor`           |
| Project configs | Auto-loaded by CLI from `working_dir`      |

**Conclusion:** No protocol changes required. All work is contained within workstation package.

---

## Current Architecture

### Data Flow (Already Implemented)

```
iOS: session.execute { session_id, payload: { content: "prompt" } }
    ↓
Workstation: AgentSessionManager.executeCommand()
    ↓
HeadlessAgentExecutor.execute(prompt)
    ↓ spawns CLI with --resume <cliSessionId> if available
Agent CLI (cursor-agent / claude / opencode)
    ↓ stdout JSON stream
AgentOutputParser.parseBuffer() → ParseResult[]
    ↓ extracts session_id, creates ContentBlock[]
AgentSessionManager → emit('blocks', blocks, isComplete)
    ↓
main.ts → broadcasts session.output { content_blocks }
    ↓ WebSocket
iOS: ChatViewModel.handleSessionOutput()
    ↓
ContentParser.parseContentBlocks() → MessageContentBlock[]
    ↓
ChatView renders via MessageBubble
```

### Session Context Flow (Implemented)

1. **First command:** CLI runs without `--resume`, emits `session_id` in output
2. **Parser extracts session_id:** `extractSessionId()` finds it in various locations
3. **State saved:** `AgentSessionState.cliSessionId` updated (agent-session-manager.ts:427-433)
4. **Next command:** `cliSessionId` passed to executor (agent-session-manager.ts:173-175)
5. **Executor adds flag:** `--resume <session_id>` added to CLI args

---

## CLI Output Formats (Documented)

### Cursor Agent (`cursor-agent --output-format stream-json`)

**Source:** [Cursor Output Format Docs](https://cursor.com/docs/cli/reference/output-format)

NDJSON format:

```json
// System init (first message)
{"type":"system","subtype":"init","apiKeySource":"env","cwd":"/path","session_id":"uuid","model":"model-name","permissionMode":"default"}

// User message
{"type":"user","message":{"role":"user","content":[{"type":"text","text":"prompt"}]},"session_id":"uuid"}

// Assistant response
{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"response"}]},"session_id":"uuid"}

// Tool call started
{"type":"tool_call","subtype":"started","call_id":"id","tool_call":{"readToolCall":{"args":{...}}},"session_id":"uuid"}

// Tool call completed
{"type":"tool_call","subtype":"completed","call_id":"id","tool_call":{"readToolCall":{"args":{},"result":{}}},"session_id":"uuid"}

// Final result
{"type":"result","subtype":"success","duration_ms":1234,"is_error":false,"result":"full text","session_id":"uuid"}
```

**Session continuation:**

```bash
cursor-agent --output-format stream-json --print --resume <session_id> "prompt"
```

### Claude Code (`claude --output-format stream-json`)

**Source:** [Claude Code CLI Docs](https://code.claude.com/docs/en/cli-reference)

JSONL format:

```json
// Result message (completion)
{
  "type": "result",
  "subtype": "success",
  "total_cost_usd": 0.003,
  "is_error": false,
  "duration_ms": 1234,
  "num_turns": 6,
  "result": "response",
  "session_id": "abc123"
}
```

**Key points:**

- Requires `--verbose --print` flags together with `--output-format stream-json`
- Includes `total_cost_usd`, `num_turns` in result message
- Session ID appears in `session_id` field

**Session continuation:**

```bash
claude --verbose --print --output-format stream-json -p "prompt" --resume <session_id>
```

### OpenCode (`opencode run -f json`)

**Source:** [OpenCode CLI Docs](https://opencode.ai/docs/cli/)

```bash
# Non-interactive with JSON output
opencode run -f json "prompt"

# Attach to server (avoids MCP cold boot)
opencode serve  # Terminal 1
opencode run --attach http://localhost:4096 "prompt"  # Terminal 2

# Session continuation options
opencode run -c "next prompt"           # continue last session
opencode run -s <session_id> "prompt"   # continue specific session
```

**Note:** JSON output structure not fully documented — may need runtime verification.

---

## Current Implementation Status

### What's Working ✓

| Component                 | Status    | Notes                                               |
| ------------------------- | --------- | --------------------------------------------------- |
| **AgentSessionManager**   | ✓         | Stores cliSessionId, passes to executor             |
| **HeadlessAgentExecutor** | ✓ Partial | Claude/Cursor `--resume` works, OpenCode missing    |
| **AgentOutputParser**     | ✓ Partial | Text/code/thinking parsed, Cursor tool_call missing |
| **iOS ChatView**          | ✓         | Handles session.output with content_blocks          |
| **iOS ContentParser**     | ✓         | Maps all block types correctly                      |

### Gaps Identified

1. **OpenCode session continuation** — not passing `-s <session_id>` flag
2. **Cursor tool_call parsing** — nested structure not handled
3. **OpenCode session_id extraction** — may use different field name

---

## Implementation Tasks

### Task 1: Fix OpenCode Session Continuation

**Files:**

- `packages/workstation/src/infrastructure/agents/headless-agent-executor.ts`
- `packages/workstation/src/config/constants.ts`

**Changes to constants.ts:**

```typescript
opencode: {
  command: 'opencode',
  runArgs: ['run', '-f', 'json'],  // Add JSON format flag
  serveArgs: ['serve'],
  sessionFlag: '-s',  // Add session continuation flag
  description: 'OpenCode Agent (attach mode)',
  defaultDaemonUrl: 'http://localhost:4200',
  postTerminationWaitMs: 500,
},
```

**Changes to headless-agent-executor.ts (buildOpencodeCommand):**

```typescript
private buildOpencodeCommand(prompt: string): { command: string; args: string[] } {
  const config = AGENT_COMMANDS.opencode;
  const args = [...config.runArgs];

  // Add session continuation flag if we have a session ID
  if (this.cliSessionId) {
    args.push(config.sessionFlag, this.cliSessionId);
  }

  // Add attach URL and prompt
  args.push('--attach', this.opencodeDaemonUrl);
  args.push(prompt);

  return { command: config.command, args };
}
```

### Task 2: Add Cursor tool_call Parsing

**File:** `packages/workstation/src/infrastructure/agents/agent-output-parser.ts`

**Add to mapToContentBlocks() method:**

```typescript
// Handle Cursor-style tool_call events (after existing tool checks)
} else if (type === 'tool_call') {
  const toolBlock = this.parseCursorToolCall(payload);
  if (toolBlock) {
    blocks.push(toolBlock);
  }
}
```

**Add new method:**

```typescript
/**
 * Parse Cursor-style tool_call events.
 *
 * Cursor uses nested structure:
 * {"type":"tool_call","subtype":"started","tool_call":{"readToolCall":{"args":{...}}}}
 */
private parseCursorToolCall(payload: Record<string, unknown>): ContentBlock | null {
  const subtype = this.getString(payload, 'subtype');
  const toolCallObj = payload.tool_call as Record<string, unknown> | undefined;

  if (!toolCallObj) return null;

  // Find tool name from keys like 'readToolCall', 'writeToolCall', 'bashToolCall'
  const toolKey = Object.keys(toolCallObj).find(k => k.endsWith('ToolCall'));
  if (!toolKey) return null;

  const toolName = toolKey.replace('ToolCall', '');
  const toolData = toolCallObj[toolKey] as Record<string, unknown> | undefined;
  const args = toolData?.args;
  const result = toolData?.result;

  // Determine status based on subtype and result presence
  let status: ToolStatus = 'running';
  if (subtype === 'completed') {
    status = result !== undefined ? 'completed' : 'failed';
  }

  return createToolBlock(toolName, status, args, result);
}
```

### Task 3: Extend session_id Extraction for OpenCode

**File:** `packages/workstation/src/infrastructure/agents/agent-output-parser.ts`

**Update extractSessionId():**

```typescript
private extractSessionId(payload: Record<string, unknown>): string | null {
  const candidates = [
    payload.session_id,
    payload.sessionId,
    payload.id,                    // OpenCode may use this
    payload.conversation_id,       // Alternative for OpenCode
    (payload.message as Record<string, unknown> | undefined)?.session_id,
    (payload.message as Record<string, unknown> | undefined)?.sessionId,
    (payload.result as Record<string, unknown> | undefined)?.session_id,
    (payload.result as Record<string, unknown> | undefined)?.sessionId,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim().length > 0) {
      return candidate.trim();
    }
  }

  return null;
}
```

---

## Critical Files Summary

| File                                                                        | Changes Required                                         |
| --------------------------------------------------------------------------- | -------------------------------------------------------- |
| `packages/workstation/src/config/constants.ts`                              | Add `-f json` and `-s` to OpenCode config                |
| `packages/workstation/src/infrastructure/agents/headless-agent-executor.ts` | Update `buildOpencodeCommand()` for session flag         |
| `packages/workstation/src/infrastructure/agents/agent-output-parser.ts`     | Add `parseCursorToolCall()`, extend `extractSessionId()` |

**iOS files — NO CHANGES NEEDED:**

- `apps/TiflisCode/Features/Agent/ChatViewModel.swift` — already handles session.output
- `apps/TiflisCode/Features/Agent/Services/ContentParser.swift` — already maps all block types

---

## Verification Steps

### 1. Claude Session Context Test

```
1. Create Claude session via supervisor
2. Send: "Remember the number 42"
3. Send: "What number did I mention?"
4. ✓ Pass if response contains "42"
```

### 2. Cursor Session Context Test

```
Same as Claude test
```

### 3. OpenCode Session Context Test

```
Same as Claude test (with -s flag being used)
```

### 4. Text/Code Block Rendering Test

```
1. Send prompt that generates code response
2. ✓ Pass if code blocks render with syntax highlighting
3. ✓ Pass if text blocks render as plain text
```

### 5. Tool Call Display Test (Cursor)

```
1. Send prompt that triggers file read/write
2. ✓ Pass if tool calls show with running → completed status
```

---

## Sources

- [Cursor CLI Headless Mode](https://cursor.com/docs/cli/headless)
- [Cursor Output Format](https://cursor.com/docs/cli/reference/output-format)
- [Claude Code CLI Reference](https://code.claude.com/docs/en/cli-reference)
- [Claude Code Headless Mode](https://code.claude.com/docs/en/headless)
- [OpenCode CLI Docs](https://opencode.ai/docs/cli/)
