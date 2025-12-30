# Terminal Performance Optimization Plan

> **Status**: Implemented
> **Created**: 2025-12-30
> **Goal**: Eliminate flickering, improve throughput, reduce lags in terminal connections

---

## Problem Statement

The terminal connection from iOS/Android/Web clients experiences:
- **Flickering** during active output
- **Slow network throughput**
- **Lags and stuttering**

## Root Cause Analysis

### Current Architecture

```
PTY (node-pty) → Workstation → Tunnel → Client (iOS/Android/Web)
```

**Key Issue**: Each PTY output chunk (often 10-100 bytes) creates a separate `session.output` message, causing:
- **100+ messages/second** during active terminal output
- **100+ WebSocket frames/second** transmitted through tunnel
- **100+ renders/second** on client terminal widgets

### Root Causes

| Issue | Cause | Impact |
|-------|-------|--------|
| **Flickering** | No output batching at workstation | Each small chunk triggers immediate render |
| **Slow throughput** | JSON overhead per tiny message | 10 bytes data + 200 bytes JSON wrapper |
| **Lags** | Client render blocking | 100 messages/sec = 100 DOM updates/sec |

### Data Flow (Before Optimization)

```
PTY Output (raw bytes)
        │
        ▼
┌──────────────────────┐
│ onData() callback    │  ← Called per chunk (e.g., every 10 bytes)
└──────┬───────────────┘
       │
       ▼
┌──────────────────────────────┐
│ addOutputToBuffer()          │  ← One buffer entry per chunk
│ → sequence++                 │
│ → JSON stringify             │
│ → send via tunnel            │
└──────┬───────────────────────┘
       │
       ▼
BOTTLENECK: 1000 chunks = 1000 JSON objects = 1000 WebSocket frames
```

---

## 5-Step Optimization Plan

### Step 1: Server-Side Output Batching (Workstation) ✅

**Problem**: Every PTY `onData()` callback immediately broadcasts a `session.output` message.

**Solution**: Implement a batching layer that accumulates output for 8-16ms before sending.

**Files modified**:
- `packages/workstation/src/infrastructure/terminal/terminal-output-batcher.ts` (new)
- `packages/workstation/src/infrastructure/terminal/pty-manager.ts`
- `packages/workstation/src/config/constants.ts`

**Implementation**:
```typescript
class TerminalOutputBatcher {
  private buffer = '';
  private timeout: NodeJS.Timeout | null = null;
  private readonly maxBatchSize: number;      // Flush at threshold (default 4KB)
  private readonly batchIntervalMs: number;   // Max wait time (default 16ms)

  append(chunk: string) {
    this.buffer += chunk;

    // Immediate flush if buffer is large
    if (this.buffer.length >= this.maxBatchSize) {
      this.flush();
      return;
    }

    // Schedule flush if not already pending
    if (!this.timeout) {
      this.timeout = setTimeout(() => this.flush(), this.batchIntervalMs);
    }
  }

  flush() {
    if (this.timeout) {
      clearTimeout(this.timeout);
      this.timeout = null;
    }
    if (this.buffer) {
      this.onFlush(this.buffer);
      this.buffer = '';
    }
  }
}
```

**Configuration** (environment variables):
- `TERMINAL_BATCH_INTERVAL_MS` - Max time to wait before flushing (default: 64ms)
- `TERMINAL_BATCH_MAX_SIZE` - Max bytes before immediate flush (default: 4096)

**Expected Impact**: Reduce message count by **10-100x** (from 100/sec to 6-10/sec)

---

### Step 2: Client-Side Write Batching ✅

**Problem**: Each `session.output` message triggers an immediate `terminal.write()` call, causing excessive redraws.

**Solution**: Batch incoming terminal data and write in animation frames.

**Files modified**:
- `packages/web/src/components/terminal/TerminalView.tsx`
- `apps/TiflisCode/TiflisCode/Features/Terminal/TerminalViewModel.swift`
- `apps/TiflisCodeAndroid/app/src/main/java/com/tiflis/code/` (Kotlin terminal handling)

**Web Implementation (xterm.js)**:
```typescript
// Use requestAnimationFrame for batched writes
const pendingDataRef = useRef('');
const rafIdRef = useRef<number | null>(null);

const queueTerminalWrite = useCallback((data: string) => {
  pendingDataRef.current += data;

  if (rafIdRef.current === null) {
    rafIdRef.current = requestAnimationFrame(() => {
      if (terminalRef.current && pendingDataRef.current) {
        terminalRef.current.write(pendingDataRef.current);
      }
      pendingDataRef.current = '';
      rafIdRef.current = null;
    });
  }
}, []);
```

**iOS Implementation (SwiftTerm)**:
```swift
private var pendingTerminalOutput = ""
private var terminalRenderTask: Task<Void, Never>?
private let terminalBatchInterval: UInt64 = 8_000_000  // 8ms in nanoseconds

func queueTerminalOutput(_ data: String) {
    pendingTerminalOutput += data

    if terminalRenderTask == nil {
        terminalRenderTask = Task { @MainActor [weak self] in
            try? await Task.sleep(nanoseconds: self?.terminalBatchInterval ?? 8_000_000)
            guard let self = self else { return }
            if !self.pendingTerminalOutput.isEmpty {
                self.feedTerminal(self.pendingTerminalOutput)
                self.pendingTerminalOutput = ""
            }
            self.terminalRenderTask = nil
        }
    }
}
```

**Expected Impact**: Reduce redraws from **100/sec to 60/sec** (aligned to display refresh)

---

### Step 3: Binary Protocol for Terminal Data (Future Enhancement)

**Problem**: JSON encoding adds ~200 bytes overhead per message; tunnel parses JSON to inject `device_id`.

**Solution**: Use binary framing for terminal data with pre-computed headers.

**Protocol Extension**:
```
[1 byte: message type] [4 bytes: session_id length] [session_id] [4 bytes: sequence] [payload]

Type 0x01 = terminal output
Type 0x02 = terminal input
Type 0x03 = terminal resize
```

**Status**: Deferred - JSON batching provides sufficient improvement

**Expected Impact**: **30-50% reduction** in bandwidth and CPU for high-throughput scenarios

---

### Step 4: Adaptive Batching Based on Output Rate ✅

**Problem**: Fixed batch intervals don't adapt to output patterns (slow typing vs. fast `cat file.txt`).

**Solution**: Implement adaptive batching that:
- Low activity: Send immediately (< 100 bytes/100ms) for responsive feel
- High activity: Batch aggressively (16ms intervals) for throughput
- Burst detection: Extend batch window during continuous output

**Implementation** (in `TerminalOutputBatcher`):
```typescript
class TerminalOutputBatcher {
  private outputRate = 0;  // bytes/second estimate
  private lastActivityTime = Date.now();

  append(chunk: string) {
    this.buffer += chunk;
    const now = Date.now();
    const elapsed = now - this.lastActivityTime;

    // Update rate estimate (exponential moving average)
    const instantRate = chunk.length / Math.max(elapsed, 1) * 1000;
    this.outputRate = this.outputRate * 0.7 + instantRate * 0.3;
    this.lastActivityTime = now;

    // Adaptive batch interval based on output rate
    const batchInterval = this.outputRate > 1000
      ? this.batchIntervalMs  // High throughput: use full batch interval
      : Math.min(4, this.batchIntervalMs);  // Low throughput: quick response

    // Size-based immediate flush
    if (this.buffer.length >= this.maxBatchSize) {
      this.flush();
      return;
    }

    // Schedule flush with adaptive interval
    if (!this.timeout) {
      this.timeout = setTimeout(() => this.flush(), batchInterval);
    }
  }
}
```

**Expected Impact**: Best of both worlds - **responsive typing + smooth high-throughput output**

---

### Step 5: Flow Control and Backpressure (Future Enhancement)

**Problem**: If client can't render fast enough, messages queue up causing memory growth and eventual lag.

**Solution**: Implement flow control between workstation and clients.

**Protocol Addition** (in `session.subscribe` response):
```json
{
  "type": "session.subscribed",
  "flow_control": {
    "window_size": 65536,
    "ack_interval": 32768
  }
}
```

**Status**: Deferred - Client batching eliminates most backpressure issues

**Expected Impact**: **Eliminates memory growth and lag** under sustained high-throughput

---

## Implementation Priority

| Step | Effort | Impact | Status |
|------|--------|--------|--------|
| **Step 1: Server batching** | Low | Very High | ✅ Complete |
| **Step 2: Client batching** | Medium | High | ✅ Complete |
| **Step 4: Adaptive batching** | Medium | Medium | ✅ Complete |
| **Step 3: Binary protocol** | High | Medium | ⏳ Deferred |
| **Step 5: Flow control** | High | Medium | ⏳ Deferred |

---

## Configuration Reference

### Workstation Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `TERMINAL_BATCH_INTERVAL_MS` | 64 | Max milliseconds to wait before flushing output batch |
| `TERMINAL_BATCH_MAX_SIZE` | 4096 | Max bytes before immediate flush |
| `TERMINAL_OUTPUT_BUFFER_SIZE` | 10000 | Number of messages to retain in history buffer |

### Tuning Guidelines

- **Interactive sessions** (typing, vim): Default 64ms works well with adaptive batching (8ms for low throughput)
- **High-throughput** (logs, builds): Consider increasing batch size to 8192
- **Low-latency networks**: Can reduce batch interval to 32ms
- **High-latency networks**: Increase batch interval to 100ms for better throughput

---

## Files Modified

### Workstation
- `packages/workstation/src/infrastructure/terminal/terminal-output-batcher.ts` - New batching class
- `packages/workstation/src/infrastructure/terminal/pty-manager.ts` - Integrate batcher
- `packages/workstation/src/config/constants.ts` - Add batch configuration

### Web Client
- `packages/web/src/components/terminal/TerminalView.tsx` - RAF-based write batching

### iOS Client
- `apps/TiflisCode/TiflisCode/Features/Terminal/TerminalViewModel.swift` - Async write batching

### Android Client
- `apps/TiflisCodeAndroid/app/src/main/java/com/tiflis/code/ui/terminal/TerminalViewModel.kt` - Coroutine-based batching

### Documentation
- `docs/TERMINAL_OPTIMIZATION_PLAN.md` - This document
- `docs/TYPESCRIPT_SERVER_STACK.md` - Updated configuration reference
- `PROTOCOL.md` - Added batching notes

---

## Performance Metrics

### Before Optimization
- Messages per second: 100-500 during active output
- WebSocket frames: 100-500/sec
- Client redraws: 100-500/sec
- Perceived latency: 50-200ms with flickering

### After Optimization (Expected)
- Messages per second: 6-60 (batched)
- WebSocket frames: 6-60/sec
- Client redraws: 60/sec max (synced to display)
- Perceived latency: <16ms, smooth rendering

---

## Testing Checklist

- [ ] Run `cat large_file.txt` - should render smoothly without flickering
- [ ] Type in vim/nano - should feel responsive (<16ms latency)
- [ ] Run `htop` or similar - animations should be smooth
- [ ] Multiple clients - all should receive same batched output
- [ ] Reconnection - replay should work with batched history
- [ ] Resize terminal - should still work correctly

---

## References

- [PROTOCOL.md](../PROTOCOL.md) - WebSocket protocol specification
- [TERMINAL_IMPLEMENTATION.md](TERMINAL_IMPLEMENTATION.md) - iOS terminal implementation
- [TYPESCRIPT_SERVER_STACK.md](TYPESCRIPT_SERVER_STACK.md) - Server configuration
