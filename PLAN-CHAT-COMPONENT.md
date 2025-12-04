# Chat Component Implementation Plan

> **Goal**: Unified chat UI for Supervisor and Agent sessions with support for different output formats.

---

## Current Implementation Status

### ✅ Phase 1 Complete (iOS + Server)

#### iOS Models (`Shared/Domain/Models/`)

| File | Status | Notes |
|------|--------|-------|
| `Message.swift` | ✅ Done | Updated with `contentBlocks: [MessageContentBlock]` array |
| `MessageContentBlock.swift` | ✅ Done | All block types: text, code, tool, thinking, status, error, voiceInput, voiceOutput, actionButtons |
| `Session.swift` | ✅ Done | Session types: supervisor, cursor, claude, opencode, terminal |

**Updated Message Model:**
```swift
struct Message: Identifiable, Equatable {
    let id: String
    let sessionId: String
    let role: MessageRole
    var contentBlocks: [MessageContentBlock]  // Structured content blocks
    var isStreaming: Bool
    let createdAt: Date

    var textContent: String { /* Convenience accessor */ }
}
```

#### iOS Content Block Components (`TiflisCode/Components/Chat/`)

| File | Status | Notes |
|------|--------|-------|
| `MessageContentView.swift` | ✅ Done | Dispatcher for all block types |
| `CodeBlockView.swift` | ✅ Done | Monospace, language label, copy button, horizontal scroll |
| `ToolCallView.swift` | ✅ Done | Collapsible card, status indicator, input/output display |
| `ThinkingView.swift` | ✅ Done | Collapsible, italic muted text, brain icon |
| `StatusView.swift` | ✅ Done | Inline with spinner, secondary label color |
| `ErrorView.swift` | ✅ Done | Red accent background, warning icon |
| `MessageBubble.swift` | ✅ Updated | Now uses MessageContentView for block rendering |

#### iOS Services (`TiflisCode/Features/Chat/Services/`)

| File | Status | Notes |
|------|--------|-------|
| `ContentParser.swift` | ✅ Done | Parses `content_blocks` from protocol into `MessageContentBlock` |

#### Server-Side TypeScript (`packages/workstation/`)

| File | Status | Notes |
|------|--------|-------|
| `domain/value-objects/content-block.ts` | ✅ Done | All ContentBlock types with factory functions |
| `protocol/messages.ts` | ✅ Updated | `SessionOutputMessage` now includes `content_blocks?: ContentBlock[]` |
| `infrastructure/agents/agent-output-parser.ts` | ✅ Updated | Emits `ContentBlock[]` instead of flat ChatMessage |
| `infrastructure/agents/agent-session-manager.ts` | ✅ Updated | Uses `StoredMessage` with `blocks: ContentBlock[]` |

#### Protocol Documentation

| File | Status | Notes |
|------|--------|-------|
| `PROTOCOL.md` | ✅ Updated | Version 1.2, full ContentBlock specification in section 6.1 |

#### Views (`TiflisCode/Features/Agent/`)

| File | Status | Notes |
|------|--------|-------|
| `ChatView.swift` | ✅ Done | LazyVStack, ScrollViewReader, auto-scroll, TypingIndicator |
| `ChatViewModel.swift` | ⚠️ Mock | Uses mock data, WebSocket integration pending |

**ChatView Features:**
- ✅ Empty state with agent icon and invitation message
- ✅ LazyVStack with messages
- ✅ ScrollViewReader with auto-scroll on new messages
- ✅ TypingIndicator while loading
- ✅ Toolbar with sidebar toggle, session title, connection indicator
- ✅ Session menu (clear context, terminate)
- ✅ PromptInputBar integration

#### Other Components (`TiflisCode/Components/`)

| File | Status | Notes |
|------|--------|-------|
| `Chat/PromptInputBar.swift` | ✅ Done | TextField, VoiceRecordButton, SendButton |
| `Voice/AudioPlayerView.swift` | ✅ Done | WaveformView, play/pause, progress, time display |
| `Common/ConnectionIndicator.swift` | ✅ Done | Connection status dot |

**MessageBubble Features:**
- ✅ Role-based alignment (user right, assistant left)
- ✅ AssistantAvatar with session-specific icon
- ✅ Voice indicator for transcription/audio messages
- ✅ AudioPlayerView for voice messages
- ✅ Streaming indicator (ProgressView + "Generating...")
- ✅ Timestamp display
- ✅ Text selection enabled
- ✅ **NEW**: Renders all content block types via MessageContentView

**PromptInputBar Features:**
- ✅ Expandable TextField (1-6 lines)
- ✅ VoiceRecordButton with tap toggle and long-press push-to-talk
- ✅ SendButton with enabled/disabled states
- ✅ Material background

**AudioPlayerView Features:**
- ✅ Play/pause button
- ✅ WaveformView with progress
- ✅ Time display (current/total)
- ✅ Auto-reset on completion

---

### ⏳ Remaining Phase 1 Items

| Feature | Status | Phase |
|---------|--------|-------|
| WebSocket integration in ChatViewModel | ⏳ | 1.2 |
| ActionButtonsView | ⏳ | 1.4 |
| Message context menu | ⏳ | 1.6 |
| Scroll-to-bottom button | ⏳ | 1.6 |

### ⏳ Future (Phase 2+)

| Feature | Phase |
|---------|-------|
| Real STT integration | 2 |
| Real TTS integration | 2 |
| VoiceInputView | 2 |
| VoiceOutputView | 2 |
| Message search | 3 |
| Pull-to-load history | 3 |

---

## Core Problem

Different agents produce different output formats that need unified rendering:

```
┌─────────────────────────────────────────────────────────────┐
│                      AGENT OUTPUTS                          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Cursor/Claude/OpenCode (CLI agents):                       │
│  ├── Streaming JSON lines                                   │
│  ├── Assistant message (text)                               │
│  ├── Tool calls (file read, edit, bash)                     │
│  ├── Thinking/reasoning blocks                              │
│  └── Completion signal                                      │
│                                                             │
│  Supervisor (LangGraph):                                    │
│  ├── Tool calls (list_sessions, create_session, etc.)       │
│  ├── Intermediate steps                                     │
│  ├── Final response                                         │
│  └── Session creation results                               │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Proposed Message Content Model

### Extended Content Types

**Current model is flat** — just `content: String`. Need to support structured content blocks:

```swift
// NEW: Replace single content string with array of blocks
enum MessageContentBlock: Identifiable, Equatable {
    case text(id: String, text: String)
    case code(id: String, language: String?, code: String)
    case toolCall(id: String, name: String, input: String?, output: String?, status: ToolStatus)
    case thinking(id: String, text: String)
    case status(id: String, text: String)
    case error(id: String, text: String)
    case voiceInput(id: String, audioURL: URL?, transcription: String?, duration: TimeInterval)
    case voiceOutput(id: String, audioURL: URL?, text: String, duration: TimeInterval)
    case actionButtons(id: String, buttons: [ActionButton])

    var id: String { /* extract id from associated value */ }
}

enum ToolStatus: String, Codable {
    case running
    case completed
    case failed
}

struct ActionButton: Identifiable, Equatable {
    let id: String
    let title: String
    let icon: String?
    let style: ActionButtonStyle
    let action: ActionType
}

enum ActionButtonStyle {
    case primary, secondary, destructive
}

enum ActionType {
    case sendMessage(String)
    case createSession(SessionType)
    case openURL(URL)
    case custom(String)
}
```

### Updated Message Structure

```swift
struct Message: Identifiable, Equatable {
    let id: String
    let sessionId: String
    let role: MessageRole
    var contentBlocks: [MessageContentBlock]  // NEW: Array of blocks
    var isStreaming: Bool                      // Renamed from isComplete (inverted)
    let createdAt: Date

    // Convenience for simple text messages
    var textContent: String {
        contentBlocks.compactMap {
            if case .text(_, let text) = $0 { return text }
            return nil
        }.joined(separator: "\n")
    }
}
```

---

## Visual Design Specifications

> **Reference**: All visual implementations MUST follow patterns established in `docs/MOBILE_APP_LOGIC.md`

### Design Principles

1. **Native iOS Look** — Use system colors, SF Symbols, standard spacing
2. **Theme-Aware** — Support light/dark mode via `@Environment(\.colorScheme)`
3. **Accessibility** — VoiceOver labels, Dynamic Type, minimum 44pt touch targets
4. **Consistency** — Match existing MessageBubble, PromptInputBar, AudioPlayerView styles

### Color Palette (System Colors)

| Element | Light Mode | Dark Mode | Usage |
|---------|------------|-----------|-------|
| User bubble background | `Color.accentColor.opacity(0.15)` | Same | User messages |
| Assistant bubble background | `Color(.systemGray6)` | Same | Assistant messages |
| Code block background | `Color(.systemGray6)` | Same | Code blocks |
| Code block header | `Color(.systemGray5)` | Same | Language label bar |
| Error background | `Color.red.opacity(0.1)` | Same | Error messages |
| Error accent | `Color.red` | Same | Error icon/border |
| Thinking background | `Color(.systemGray6)` | Same | Thinking blocks |
| Thinking text | `Color(.secondaryLabel)` | Same | Muted style |
| Tool call background | `Color.orange.opacity(0.1)` | Same | Tool invocation cards |
| Tool call accent | `Color.orange` | Same | Tool icon |
| Status text | `Color(.secondaryLabel)` | Same | Status indicators |
| Action button primary | `Color.accentColor` | Same | Primary actions |
| Action button secondary | `Color(.systemGray5)` | Same | Secondary actions |
| Action button destructive | `Color.red` | Same | Delete/cancel |

### Typography

| Element | Font | Size |
|---------|------|------|
| Message text | `.body` | System default |
| Code text | `.system(.body, design: .monospaced)` | System default |
| Code language label | `.caption` | System default |
| Timestamp | `.caption2` | System default |
| Tool name | `.subheadline.weight(.medium)` | System default |
| Thinking text | `.body` + italic | System default |
| Status text | `.caption` | System default |
| Button text | `.subheadline` | System default |

### Spacing & Layout

| Element | Value |
|---------|-------|
| Message bubble padding | `12pt` |
| Message bubble corner radius | `16pt` |
| Code block corner radius | `8pt` |
| Message vertical spacing | `16pt` (in LazyVStack) |
| Content block spacing | `8pt` (within message) |
| Avatar size | `32x32pt` |
| Avatar corner radius | `8pt` |
| Button minimum height | `44pt` |
| Collapsible header padding | `12pt` |

### Component Specifications

#### CodeBlockView

```
┌─────────────────────────────────────────────────────────┐
│ swift                                          [Copy]   │ ← Header: systemGray5, caption font
├─────────────────────────────────────────────────────────┤
│ import SwiftUI                                          │ ← Content: systemGray6, monospace
│ import Foundation                                       │
│                                                         │
└─────────────────────────────────────────────────────────┘
  └─ Corner radius: 8pt
  └─ Horizontal scroll for long lines
  └─ Copy button: SF Symbol "doc.on.doc"
```

#### ToolCallView

```
┌─────────────────────────────────────────────────────────┐
│ 🔧 read_file                               [▼ Expand]   │ ← Header: orange accent, chevron
├─────────────────────────────────────────────────────────┤
│ Input:                                                  │ ← Collapsible content
│ ┌─────────────────────────────────────────────────────┐ │
│ │ {"path": "src/main.swift"}                          │ │ ← Code block for JSON
│ └─────────────────────────────────────────────────────┘ │
│ Output:                                                 │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ import SwiftUI...                                   │ │
│ └─────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
  └─ Background: orange.opacity(0.1)
  └─ Icon: SF Symbol "wrench.and.screwdriver"
  └─ Default state: collapsed (show only header)
  └─ Status indicator: spinner if running, checkmark if completed, xmark if failed
```

#### ThinkingView

```
┌─────────────────────────────────────────────────────────┐
│ 💭 Thinking...                             [▼ Expand]   │ ← Header: muted, chevron
├─────────────────────────────────────────────────────────┤
│ I need to check the imports in the file first.         │ ← Italic, secondaryLabel color
│ Let me analyze the structure...                        │
└─────────────────────────────────────────────────────────┘
  └─ Background: systemGray6
  └─ Icon: SF Symbol "brain" or "bubble.left.and.bubble.right"
  └─ Text style: italic
  └─ Default state: collapsed
```

#### StatusView

```
┌───────────────────────────────────────┐
│ ⏳ Reading file...                    │ ← Inline, no box
└───────────────────────────────────────┘
  └─ Icon: ProgressView() spinner
  └─ Text: secondaryLabel, caption font
  └─ No background (inline in message)
```

#### ErrorView

```
┌─────────────────────────────────────────────────────────┐
│ ⚠️ Error: File not found                               │
│                                                         │
│ The file 'src/missing.swift' does not exist.           │
└─────────────────────────────────────────────────────────┘
  └─ Background: red.opacity(0.1)
  └─ Border: red.opacity(0.3), 1pt
  └─ Icon: SF Symbol "exclamationmark.triangle.fill"
  └─ Corner radius: 8pt
```

#### ActionButtonsView

```
┌─────────────────────────────────────────────────────────┐
│ [📁 Open in Cursor]  [🔧 Run Tests]  [📝 Create PR]    │
└─────────────────────────────────────────────────────────┘
  └─ Layout: horizontal scroll or wrap
  └─ Button style: capsule shape
  └─ Primary: accentColor background, white text
  └─ Secondary: systemGray5 background, label color text
  └─ Destructive: red background, white text
  └─ Spacing between buttons: 8pt
  └─ Button padding: horizontal 16pt, vertical 8pt
```

#### Streaming Cursor

```
Text content here█
                 └─ Blinking cursor: Rectangle 2x16pt
                 └─ Animation: opacity 0↔1, duration 0.5s, repeat forever
                 └─ Color: primary label color
```

### Icons (SF Symbols)

| Component | Icon | Fallback |
|-----------|------|----------|
| Code copy | `doc.on.doc` | — |
| Code copied | `checkmark` | — |
| Tool call | `wrench.and.screwdriver` | — |
| Tool running | `ProgressView()` | — |
| Tool completed | `checkmark.circle.fill` | — |
| Tool failed | `xmark.circle.fill` | — |
| Thinking | `brain` | `bubble.left.and.bubble.right` |
| Status spinner | `ProgressView()` | — |
| Error | `exclamationmark.triangle.fill` | — |
| Expand | `chevron.down` | — |
| Collapse | `chevron.up` | — |
| Send message | `arrow.up.circle.fill` | — |
| Create session | `plus.circle.fill` | — |
| Open URL | `arrow.up.right` | — |

### Animation Guidelines

| Animation | Duration | Curve |
|-----------|----------|-------|
| Collapse/Expand | `0.2s` | `.easeInOut` |
| Streaming cursor blink | `0.5s` | `.easeInOut`, repeat forever |
| Button press feedback | `0.1s` | `.easeOut` |
| Scroll to bottom | `0.2s` | `.easeOut` |
| Copy confirmation | `1.0s` | delay before reset |

### Accessibility

| Component | VoiceOver Label | Hint |
|-----------|-----------------|------|
| CodeBlockView | "Code block, {language}" | "Double tap to copy code" |
| ToolCallView | "Tool call: {name}, {status}" | "Double tap to expand details" |
| ThinkingView | "Agent thinking" | "Double tap to expand reasoning" |
| ErrorView | "Error: {message}" | — |
| ActionButton | "{title}" | "Double tap to {action}" |
| Copy button | "Copy code" | — |
| Expand button | "Expand" / "Collapse" | — |

---

## UI Components

### Content Block Components

| Block Type | Component | UI Description |
|------------|-----------|----------------|
| `text` | `TextContentView` | Plain text, selectable |
| `code` | `CodeBlockView` | Monospace, language label, copy button |
| `toolCall` | `ToolCallView` | Collapsible card with icon, input/output |
| `thinking` | `ThinkingView` | Collapsible, muted/italic text |
| `status` | `StatusView` | Inline with spinner icon |
| `error` | `ErrorView` | Red accent, error icon |
| `voiceInput` | `VoiceInputView` | Waveform + transcription (uses existing AudioPlayerView) |
| `voiceOutput` | `VoiceOutputView` | Play button + waveform (uses existing AudioPlayerView) |
| `actionButtons` | `ActionButtonsView` | Horizontal button group |

### Message Bubble Structure

```
┌─────────────────────────────────────────┐
│ 🤖 Claude                               │  ← AssistantAvatar (existing)
├─────────────────────────────────────────┤
│                                         │
│ ⚙️ Reading file...                      │  ← StatusView
│                                         │
│ ▶ Tool: read_file                       │  ← ToolCallView (collapsed)
│   └─ src/main.swift                     │
│                                         │
│ 💭 Thinking...                          │  ← ThinkingView (collapsed)
│   └─ "I need to check..."               │
│                                         │
│ Here's what I found:                    │  ← TextContentView
│                                         │
│ ┌─────────────────────────────────────┐ │
│ │ swift                        [Copy] │ │  ← CodeBlockView
│ │ import SwiftUI                      │ │
│ └─────────────────────────────────────┘ │
│                                         │
│ [📁 Open File]  [▶ Run]                 │  ← ActionButtonsView
│                                         │
│                              10:42 AM   │  ← Timestamp (existing)
└─────────────────────────────────────────┘
```

---

## Implementation Phases

### Phase 1: Complete Chat UI (MVP)

**Goal**: Full chat functionality with all content types EXCEPT STT/TTS

#### 1.1 Models & Architecture
- [ ] Define `MessageContentBlock` enum (text, code, toolCall, thinking, status, error, actionButtons)
- [ ] Update `Message` model to use `contentBlocks: [MessageContentBlock]`
- [ ] Create `ContentParser` service for agent output → blocks

**New files:**
- `Shared/Domain/Models/MessageContentBlock.swift`
- `TiflisCode/Features/Chat/Services/ContentParser.swift`

#### 1.2 WebSocket Integration
- [ ] Subscribe to session messages in ChatViewModel
- [ ] Parse `session.output` messages into `MessageContentBlock`
- [ ] Handle streaming updates (append to last message)
- [ ] Handle completion (`is_complete: true`)
- [ ] Send messages via `session.execute`

**Modify:**
- `ChatViewModel.swift` — WebSocket subscription, message handling

#### 1.3 Content Block Components
- [ ] `MessageContentView` — Switch on block type, render appropriate component
- [ ] `CodeBlockView` — Monospace, language label, copy button
- [ ] `ToolCallView` — Collapsible card with icon, input/output display
- [ ] `ThinkingView` — Collapsible reasoning block, muted style
- [ ] `StatusView` — Inline status with spinner/icon
- [ ] `ErrorView` — Red accent, error icon

**New files:**
- `Components/Chat/MessageContentView.swift`
- `Components/Chat/CodeBlockView.swift`
- `Components/Chat/ToolCallView.swift`
- `Components/Chat/ThinkingView.swift`
- `Components/Chat/StatusView.swift`
- `Components/Chat/ErrorView.swift`

#### 1.4 Action Buttons
- [ ] `ActionButtonsView` component
- [ ] Handle button actions (send message, create session, open URL)
- [ ] Button styles (primary, secondary, destructive)

**New files:**
- `Components/Chat/ActionButtonsView.swift`

#### 1.5 Update Existing Components
- [ ] Update `MessageBubble.swift` to use `MessageContentView`
- [ ] Update `MessageContent` to render `contentBlocks` array

**Modify:**
- `Components/Chat/MessageBubble.swift`

#### 1.6 Enhanced UX
- [ ] Message context menu (copy message, copy code)
- [ ] Scroll-to-bottom button when not at bottom
- [ ] Streaming cursor animation

---

### Phase 2: Voice Integration (Future)

**Goal**: Real STT/TTS integration

**Tasks:**
- [ ] Integrate with workstation STT endpoint
- [ ] Integrate with workstation TTS endpoint
- [ ] Auto-play TTS for voice-initiated messages
- [ ] Real-time recording waveform visualization
- [ ] `VoiceInputView` component (waveform + transcription)
- [ ] `VoiceOutputView` component (play button + text)

**Modify:**
- `ChatViewModel.swift` — Voice handling
- `AudioPlayerView.swift` — Real audio playback from URLs

### Phase 3: Advanced Features (Future)

**Tasks:**
- [ ] Pull-to-load-more history
- [ ] Search messages
- [ ] Message editing
- [ ] Message deletion with confirmation
- [ ] Hands-free voice mode

---

## File Structure (Final)

```
apps/TiflisCode/
├── Shared/
│   └── Domain/
│       └── Models/
│           ├── Message.swift              # UPDATE: contentBlocks
│           ├── MessageContentBlock.swift  # NEW (Phase 1.1)
│           └── Session.swift              # Existing
│
├── TiflisCode/
│   ├── Features/
│   │   └── Chat/                          # RENAME from Agent/
│   │       ├── ChatView.swift             # Existing (minor updates)
│   │       ├── ChatViewModel.swift        # UPDATE: WebSocket (Phase 1.2)
│   │       └── Services/
│   │           └── ContentParser.swift    # NEW (Phase 1.1)
│   │
│   └── Components/
│       ├── Chat/
│       │   ├── MessageBubble.swift        # UPDATE (Phase 1.5)
│       │   ├── MessageContentView.swift   # NEW (Phase 1.3)
│       │   ├── PromptInputBar.swift       # Existing
│       │   ├── CodeBlockView.swift        # NEW (Phase 1.3)
│       │   ├── ToolCallView.swift         # NEW (Phase 1.3)
│       │   ├── ThinkingView.swift         # NEW (Phase 1.3)
│       │   ├── StatusView.swift           # NEW (Phase 1.3)
│       │   ├── ErrorView.swift            # NEW (Phase 1.3)
│       │   ├── ActionButtonsView.swift    # NEW (Phase 1.4)
│       │   ├── VoiceInputView.swift       # NEW (Phase 2)
│       │   └── VoiceOutputView.swift      # NEW (Phase 2)
│       │
│       └── Voice/
│           └── AudioPlayerView.swift      # Existing (UPDATE Phase 2)
```

---

## Protocol Considerations

### ✅ Implemented `session.output` message (Protocol v1.2)

```typescript
interface SessionOutputMessage {
  type: 'session.output';
  session_id: string;
  payload: {
    content_type: 'agent' | 'terminal' | 'transcription';
    content: string;                    // Backward compat for terminal
    content_blocks?: ContentBlock[];    // NEW: Structured blocks for agent output
    timestamp: number;
    is_complete?: boolean;
    audio?: string;
  };
}

// ContentBlock types (see PROTOCOL.md section 6.1)
type ContentBlock = TextBlock | CodeBlock | ToolBlock | ThinkingBlock
                  | StatusBlock | ErrorBlock | VoiceInputBlock
                  | VoiceOutputBlock | ActionButtonsBlock;

interface TextBlock {
  id: string;
  block_type: 'text';
  content: string;
}

interface CodeBlock {
  id: string;
  block_type: 'code';
  content: string;
  metadata: { language?: string; };
}

interface ToolBlock {
  id: string;
  block_type: 'tool';
  content: string;
  metadata: {
    tool_name: string;
    tool_input?: string;
    tool_output?: string;
    tool_status: 'running' | 'completed' | 'failed';
  };
}
// ... see PROTOCOL.md for full specification
```

---

## ✅ Resolved Questions

1. **Parsing location**: ✅ Workstation parses CLI JSON → ContentBlocks. iOS receives structured blocks.
2. **Streaming granularity**: ✅ Each `session.output` contains `content_blocks[]` array. Append to message.
3. **Tool call lifecycle**: ✅ `tool_status` field: 'running' → 'completed' | 'failed'. UI updates accordingly.
4. **Action button protocol**: ✅ `ActionButtonsBlock` with `buttons[]` array containing action definitions.

---

## Success Criteria

| Metric | Target |
|--------|--------|
| Scroll FPS | 60 FPS with 500+ messages |
| Input latency | < 16ms |
| Memory per session | < 5MB |
| Code block render | < 50ms |
| WebSocket → UI latency | < 100ms |

---

## Next Steps

### Phase 1 Implementation Progress

```
1.1 Models & Architecture ✅ DONE
    ├── MessageContentBlock.swift ✅
    ├── Update Message.swift ✅
    └── ContentParser.swift ✅
           │
           ▼
1.2 WebSocket Integration ⏳ PENDING
    └── ChatViewModel.swift (subscribe, parse, send)
           │
           ▼
1.3 Content Block Components ✅ DONE
    ├── MessageContentView.swift ✅
    ├── CodeBlockView.swift ✅
    ├── ToolCallView.swift ✅
    ├── ThinkingView.swift ✅
    ├── StatusView.swift ✅
    └── ErrorView.swift ✅
           │
           ▼
1.4 Action Buttons ⏳ PENDING
    └── ActionButtonsView.swift
           │
           ▼
1.5 Update Existing ✅ DONE
    └── MessageBubble.swift ✅
           │
           ▼
1.6 Enhanced UX ⏳ PENDING
    ├── Context menu
    ├── Scroll-to-bottom
    └── Streaming cursor
           │
           ▼
      ⏳ Phase 1 ~75% Complete

Server-Side (Protocol v1.2) ✅ DONE
    ├── content-block.ts ✅
    ├── messages.ts ✅
    ├── agent-output-parser.ts ✅
    ├── agent-session-manager.ts ✅
    └── PROTOCOL.md ✅
```

### Files Created: 8 (iOS) + 1 (Server)
### Files Modified: 4 (iOS) + 3 (Server)
