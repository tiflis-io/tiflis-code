# Terminal Implementation Documentation

## Overview

This document describes the terminal emulator implementation in the Tiflis Code iOS app, including architecture decisions, known issues, and lessons learned during development.

**Last Updated:** 2025-01-30  
**Status:** ✅ Implemented with known limitations

---

## Architecture

### iOS App Components

#### TerminalView (SwiftUI)

- **Location:** `apps/TiflisCode/TiflisCode/Features/Terminal/TerminalView.swift`
- **Purpose:** Main SwiftUI view for terminal sessions
- **Key Features:**
  - Uses `@StateObject` to create and manage `TerminalViewModel`
  - **Critical:** Uses `.id(session.id)` modifier to ensure new ViewModel for each session
  - Subscribes to session on `onAppear`, unsubscribes on `onDisappear`
  - Displays `TerminalContentView` when connected

#### TerminalViewModel

- **Location:** `apps/TiflisCode/TiflisCode/Features/Terminal/TerminalViewModel.swift`
- **Purpose:** Manages terminal state, WebSocket communication, and SwiftTerm integration
- **Key Responsibilities:**
  - Manages SwiftTerm `Terminal` instance (computed property with backing storage)
  - Handles session subscription/unsubscription
  - Processes `session.output` and `session.replay.data` messages
  - Manages terminal size and resize events
  - Implements `TerminalDelegate` for input handling

**State Management:**
- `hasLoadedReplay`: Prevents duplicate replay messages
- `isSubscribed`: Tracks subscription state
- `knownSessionIds`: Handles session ID updates (temp → real)
- `swiftTermView`: Reference to SwiftTerm's TerminalView for direct output feeding

#### TerminalContentView (UIViewRepresentable)

- **Location:** `apps/TiflisCode/TiflisCode/Features/Terminal/TerminalContentView.swift`
- **Purpose:** Bridges SwiftTerm's UIKit `TerminalView` to SwiftUI
- **Key Features:**
  - Creates `TerminalViewUIKit` in `makeUIView`
  - Updates terminal size in `updateUIView` (deferred via `Task` to avoid SwiftUI warnings)
  - Sets terminal view reference in ViewModel

#### TerminalViewUIKit (UIKit Wrapper)

- **Location:** `apps/TiflisCode/TiflisCode/Features/Terminal/TerminalViewUIKit.swift`
- **Purpose:** Wraps SwiftTerm's `TerminalView` (UIKit) for use in SwiftUI
- **Key Features:**
  - Maintains reference to both our `Terminal` (for WebSocket) and SwiftTerm's `TerminalView` (for rendering)
  - Calculates terminal size based on view bounds (8pt × 16pt font metrics)
  - Feeds output data to TerminalView's internal terminal

### Backend Components

#### TerminalSession Entity

- **Location:** `packages/workstation/src/domain/entities/terminal-session.ts`
- **Purpose:** Represents a PTY terminal session on the workstation
- **Key Features:**
  - In-memory circular buffer for terminal output (configurable size, default 1000 messages)
  - `addOutputToBuffer()`: Adds messages to buffer (circular when full)
  - `getOutputHistory()`: Retrieves messages sorted by timestamp
  - PTY process management via `node-pty`

#### Terminal Output Buffer

- **Type:** In-memory circular buffer
- **Size:** Configurable via `TERMINAL_OUTPUT_BUFFER_SIZE` env var (default: 1000)
- **Persistence:** Does NOT survive server restarts (by design)
- **Implementation:** Array with circular index when full
- **Sorting:** Always sorts by timestamp when retrieving (ensures correct order)

---

## Current Issues & Limitations

### 1. Terminal State Not Persisted Locally ✅ By Design

**Architectural Decision:** Terminal history is intentionally not saved locally on the iOS app. This is a deliberate design choice, not a limitation.

**Rationale:**
- Single source of truth: Server maintains all terminal state
- Simpler client implementation: No local storage management needed
- Consistent state: All clients see the same terminal history
- Reduced local storage: No need to manage cache size or cleanup

**Current Behavior:**
- On app restart: `sync` protocol restores session list
- On view appear: `TerminalViewModel` requests replay from timestamp 0
- History is loaded fresh from server each time

**Trade-offs:**
- ✅ Works correctly with server-side buffer
- ✅ No local storage management complexity
- ✅ Consistent state across app restarts
- ⚠️ Requires server to maintain buffer (lost on server restart)
- ⚠️ Network required to view history

**Note:** This is the intended behavior. Local caching could be added in the future if needed, but it's not currently a requirement.

### 2. Terminal Cannot Be Cleared Programmatically

**Problem:** SwiftTerm library does not provide a method to clear terminal content.

**Current Workaround:**
- Create new `Terminal` instance when resetting state
- Reset `swiftTermView` reference
- This works but is not ideal (loses internal terminal state)

**Impact:**
- ✅ Works for our use case (loading replay from server)
- ⚠️ Cannot clear terminal without creating new instance
- ⚠️ TerminalView's internal terminal cannot be cleared

**Future Consideration:**
- Investigate SwiftTerm API for clearing/resetting
- May require feature request to SwiftTerm maintainers

### 3. Duplicate Prevention Logic

**Problem:** Need to prevent duplicate messages when loading replay.

**Current Solution:**
- `hasLoadedReplay` flag prevents processing replay messages multiple times
- `handleOutputMessage` ignores new output while replay is loading
- Flag is reset when subscribing/unsubscribing or setting new TerminalView

**Known Edge Cases:**
- If replay arrives after `hasLoadedReplay` is set to `true`, it's ignored
- If multiple replay responses arrive, only first is processed
- Race condition possible if output arrives during replay load

**Future Consideration:**
- More sophisticated deduplication (track message IDs/timestamps)
- Queue output messages during replay load

### 4. Session ID Updates (Temp → Real)

**Problem:** Session IDs start as temporary UUIDs and are updated when backend responds.

**Current Solution:**
- `knownSessionIds` set tracks both temp and real IDs
- `observeSessionUpdates()` listens for `response` and `session.created` messages
- Updates `session.id` when real ID is received
- `handleOutputMessage` accepts messages for any known session ID

**Impact:**
- ✅ Handles session ID updates correctly
- ⚠️ Complex logic with multiple observers
- ⚠️ Potential race conditions if messages arrive out of order

**Future Consideration:**
- Simplify by ensuring backend always uses real IDs immediately
- Or use request ID mapping instead of temp session IDs

### 5. Terminal Size Calculation

**Problem:** Terminal size is calculated using fixed font metrics (8pt × 16pt), which may not match actual rendering.

**Current Implementation:**
```swift
let fontWidth: CGFloat = 8
let fontHeight: CGFloat = 16
let cols = max(1, Int(bounds.width / fontWidth))
let rows = max(1, Int(bounds.height / fontHeight))
```

**Impact:**
- ✅ Works for most cases
- ⚠️ May not match actual font rendering (especially with Dynamic Type)
- ⚠️ Terminal may show fewer/more columns than expected

**Future Consideration:**
- Use actual font metrics from SwiftTerm
- Or query TerminalView for actual character dimensions

### 6. Circular Buffer Ordering

**Problem:** Circular buffer implementation required careful ordering logic.

**Initial Issue:**
- When buffer was full, reconstructing chronological order was complex
- Order could be incorrect if messages were added out of sequence

**Solution:**
- Always sort by timestamp when retrieving from buffer
- Simplified logic: just sort all messages, don't try to reconstruct circular order

**Impact:**
- ✅ Ensures correct chronological order
- ⚠️ Slight performance cost (sorting on every replay request)
- ⚠️ O(n log n) complexity instead of O(n)

**Future Consideration:**
- Could optimize by maintaining sorted order during insertion
- Or use a different data structure (e.g., priority queue)

---

## Key Architectural Decisions

### 1. Server-Side State Only ✅ By Design

**Decision:** Terminal history is stored only on the server, not locally on the iOS app.

**Rationale:**
- Simplifies client implementation (no local storage management)
- Single source of truth (server maintains all state)
- Reduces local storage requirements (no cache size limits)
- Consistent state across app restarts and multiple devices
- History survives app restarts (as long as server is running)

**Trade-offs:**
- ✅ Cleaner architecture (no cache synchronization)
- ✅ No local storage management complexity
- ⚠️ Requires network for history
- ⚠️ Lost if server restarts (buffer is in-memory)
- ⚠️ Slight delay when loading history

**Status:** This is the intended architecture. Local caching is not planned unless requirements change.

### 2. Always Request Full Replay

**Decision:** When subscribing to a terminal session, always request replay from timestamp 0.

**Rationale:**
- Ensures consistent state after app restart
- Simpler logic (no need to track last timestamp)
- Guarantees all history is loaded

**Trade-offs:**
- May load duplicate data if already loaded
- Slightly more network traffic
- Mitigated by `hasLoadedReplay` flag

### 3. Separate Terminal Instances

**Decision:** Use separate `Terminal` instance for WebSocket communication and SwiftTerm's `TerminalView` for rendering.

**Rationale:**
- SwiftTerm's `TerminalView` creates its own internal `Terminal`
- Our `Terminal` instance is used for delegate callbacks (input)
- Data flows: WebSocket → our Terminal → TerminalView's terminal (via `feed()`)

**Trade-offs:**
- Two terminal instances (slight memory overhead)
- Need to feed data to TerminalView explicitly
- But allows proper separation of concerns

### 4. ViewModel Per Session

**Decision:** Each terminal session gets its own `TerminalViewModel` instance.

**Rationale:**
- Ensured by `.id(session.id)` modifier on `TerminalView`
- Prevents state leakage between sessions
- Clean lifecycle management

**Trade-offs:**
- More memory usage (one ViewModel per session)
- But necessary for correct behavior

### 5. Nonisolated TerminalDelegate Methods

**Decision:** `TerminalDelegate` methods are marked `nonisolated` to allow calling from SwiftTerm's non-main-actor context.

**Rationale:**
- SwiftTerm calls delegate methods from background threads
- `TerminalViewModel` is `@MainActor`
- Bridge via `Task { @MainActor in ... }` for state updates

**Implementation:**
```swift
nonisolated func send(source: Terminal, data: ArraySlice<UInt8>) {
    Task { @MainActor [weak self] in
        guard let self = self else { return }
        self.sendInput(dataToSend)
    }
}

nonisolated func requestTerminalSize(source: Terminal) -> (cols: Int, rows: Int) {
    return threadSafeTerminalSize  // nonisolated(unsafe) property
}
```

**Trade-offs:**
- Requires careful thread-safety considerations
- `nonisolated(unsafe)` for terminal size (acceptable for read-only)
- But necessary for SwiftTerm integration

---

## Protocol Integration

### WebSocket Messages

#### Outgoing (Client → Server)

| Message | Purpose | Payload |
|---------|---------|---------|
| `session.subscribe` | Subscribe to terminal session | `session_id` |
| `session.unsubscribe` | Unsubscribe from session | `session_id` |
| `session.input` | Send terminal input | `data: string` |
| `session.resize` | Resize terminal | `cols: number, rows: number` |
| `session.replay` | Request history replay | `since_timestamp: number, limit: number` |
| `sync` | Request state sync (after app restart) | — |

#### Incoming (Server → Client)

| Message | Purpose | Payload |
|---------|---------|---------|
| `session.output` | Terminal output data | `content_type: "terminal", content: string, timestamp: number` |
| `session.replay.data` | Replayed history | `messages: Array<{content, timestamp}>` |
| `session.created` | Session created broadcast | `session_id, session_type, workspace, project` |
| `session.terminated` | Session terminated | `session_id` |
| `sync.state` | State sync response | `sessions: Array, subscriptions: Array` |

### Message Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    Terminal Session Lifecycle                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. User opens terminal                                          │
│     → TerminalView.onAppear                                     │
│     → TerminalViewModel.subscribeToSession()                    │
│     → Send: session.subscribe                                    │
│     → Send: session.replay (since_timestamp: 0)                 │
│                                                                  │
│  2. Server responds                                             │
│     → Receive: session.replay.data                               │
│     → TerminalViewModel.handleReplayMessage()                   │
│     → Feed messages to TerminalView (via feed())                │
│                                                                  │
│  3. User types in terminal                                       │
│     → TerminalDelegate.send()                                    │
│     → TerminalViewModel.sendInput()                             │
│     → Send: session.input                                        │
│                                                                  │
│  4. Server sends output                                          │
│     → Receive: session.output (via forward.session_output)      │
│     → TerminalViewModel.handleOutputMessage()                   │
│     → Feed to TerminalView                                       │
│                                                                  │
│  5. User navigates away                                          │
│     → TerminalView.onDisappear                                  │
│     → TerminalViewModel.unsubscribeFromSession()               │
│     → Send: session.unsubscribe                                  │
│                                                                  │
│  6. User returns to terminal                                     │
│     → TerminalView.onAppear (new ViewModel if session changed)  │
│     → Repeat from step 1                                         │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Testing Considerations

### Unit Tests Needed

1. **TerminalViewModel:**
   - Session subscription/unsubscription
   - Replay message handling (duplicate prevention)
   - Output message handling
   - Terminal size calculation
   - Session ID updates

2. **TerminalSession (Backend):**
   - Circular buffer behavior (full/not full)
   - Message ordering (timestamp sorting)
   - Buffer size limits
   - Message filtering by timestamp

### Integration Tests Needed

1. **End-to-End Terminal Flow:**
   - Create terminal → type command → see output
   - Navigate away → return → history loads
   - App restart → sessions restored → history loads
   - Multiple terminals → switch between → correct output

2. **Network Resilience:**
   - Disconnect during terminal use → reconnect → state restored
   - Server restart → buffer lost → graceful handling
   - Slow network → replay loading → no duplicates

---

## Performance Considerations

### Memory Usage

- **Terminal Buffer (Backend):** Configurable (default 1000 messages)
- **TerminalViewModel (iOS):** ~1-2 KB per session
- **SwiftTerm TerminalView:** ~100-200 KB (includes scrollback buffer)
- **Total per Terminal Session:** ~200 KB

### Network Traffic

- **Replay Request:** ~100 bytes
- **Replay Response:** Depends on buffer size (typically 10-50 KB for 1000 messages)
- **Output Messages:** ~50-200 bytes per message (depends on content)
- **Input Messages:** ~10-100 bytes per keystroke/command

### Optimization Opportunities

1. **Incremental Replay:**
   - Track last loaded timestamp locally
   - Request only new messages on return
   - Reduces network traffic

2. **Message Compression:**
   - Compress terminal output before sending
   - Especially useful for large outputs (e.g., `cat large-file.txt`)

3. **Buffer Size Tuning:**
   - Adjust `TERMINAL_OUTPUT_BUFFER_SIZE` based on usage
   - Larger buffer = more history but more memory

---

## Known Bugs & Workarounds

### Bug 1: Terminal Content Not Cleared on Reset

**Symptom:** When returning to terminal, old content may briefly appear before replay loads.

**Root Cause:** SwiftTerm doesn't provide a clear method, and creating new Terminal instance doesn't clear TerminalView's internal terminal.

**Workaround:** Reset `swiftTermView` reference and create new `Terminal` instance. New data overwrites old content.

**Status:** ⚠️ Acceptable workaround, but not ideal

### Bug 2: Race Condition in Replay Loading

**Symptom:** If output arrives during replay load, it may be ignored or cause duplicates.

**Root Cause:** `hasLoadedReplay` flag prevents output processing during replay, but timing is not perfect.

**Workaround:** Ignore output messages while `hasLoadedReplay == false`. Once replay is loaded, accept new output.

**Status:** ⚠️ Works but could be improved with message queuing

### Bug 3: Terminal Size Calculation May Be Inaccurate

**Symptom:** Terminal may show incorrect number of columns/rows, especially with Dynamic Type enabled.

**Root Cause:** Fixed font metrics (8pt × 16pt) don't match actual rendering.

**Workaround:** Current implementation works for most cases. May need adjustment based on actual font metrics.

**Status:** ⚠️ Acceptable for now, may need refinement

---

## Future Improvements

### High Priority

1. ~~**Local History Caching:**~~ **Not Required**
   - Server-side state is the intended architecture
   - Local caching is not planned unless requirements change
   - Current implementation (server-only) is by design

2. **Incremental Replay:**
   - Track last loaded timestamp
   - Request only new messages
   - Reduces network traffic

3. **Better Duplicate Prevention:**
   - Track message IDs or timestamps
   - Queue messages during replay load
   - More robust than simple flag

### Medium Priority

1. **Terminal Clearing API:**
   - Investigate SwiftTerm for clear method
   - Or implement workaround that actually clears content
   - Improves user experience

2. **Dynamic Font Size Support:**
   - Use actual font metrics from SwiftTerm
   - Support Dynamic Type
   - More accurate terminal sizing

3. **Performance Optimization:**
   - Optimize circular buffer (maintain sorted order)
   - Compress terminal output
   - Batch replay messages

### Low Priority

1. **Terminal Themes:**
   - Support different color schemes
   - User-configurable appearance
   - Better visual customization

2. **Terminal History Search:**
   - Search through terminal history
   - Filter by timestamp or content
   - Useful for debugging

3. **Terminal Export:**
   - Export terminal history to file
   - Share terminal output
   - Useful for documentation

---

## Lessons Learned

### 1. SwiftTerm Integration Complexity

**Lesson:** SwiftTerm's architecture (separate Terminal and TerminalView instances) requires careful state management.

**Takeaway:**
- TerminalView creates its own Terminal internally
- Need to feed data to TerminalView, not our Terminal instance
- Delegate methods called from non-main-actor context require careful bridging

### 2. State Management in SwiftUI

**Lesson:** `@StateObject` lifecycle can be tricky with navigation.

**Takeaway:**
- Use `.id()` modifier to force new ViewModel creation
- Don't assume ViewModel is destroyed on navigation
- Always unsubscribe in `onDisappear`

### 3. Circular Buffer Ordering

**Lesson:** Maintaining chronological order in circular buffer is non-trivial.

**Takeaway:**
- Always sort by timestamp when retrieving
- Don't try to reconstruct order from circular structure
- Simpler is better (sorting is acceptable performance cost)

### 4. Replay vs. Live Output

**Lesson:** Need clear separation between replay (historical) and live output.

**Takeaway:**
- Use flags to prevent processing during replay load
- Ignore live output while replay is loading
- Once replay is loaded, accept new output

### 5. Session ID Management

**Lesson:** Temporary session IDs add complexity.

**Takeaway:**
- Track both temp and real IDs
- Update session ID when backend responds
- Accept messages for any known session ID

---

## References

- [SwiftTerm Documentation](https://github.com/migueldeicaza/SwiftTerm)
- [PROTOCOL.md](../PROTOCOL.md) - WebSocket protocol specification
- [CLAUDE.md](../CLAUDE.md) - Project architecture and best practices
- [MOBILE_APP_LOGIC.md](./MOBILE_APP_LOGIC.md) - Mobile app architecture

---

**Document Status:** Active - Updated as implementation evolves

