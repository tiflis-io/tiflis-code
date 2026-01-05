# Backlog Agent UI Specification

> **Overview**: Backlog Agent sessions should appear in a separate section of the sidebar, distinct from regular agent/terminal sessions.

---

## iOS App Architecture

### Sidebar Structure

```
┌─────────────────────────────────┐
│        SIDEBAR (SwiftUI)         │
├─────────────────────────────────┤
│ 📌 SUPERVISOR SESSION            │
│  └─ [Current chat]               │
├─────────────────────────────────┤
│ 🤖 AGENT SESSIONS (Expandable)   │
│  ├─ claude #1 [Active]           │
│  ├─ cursor #2 [Idle]             │
│  └─ opencode #3 [Busy]           │
├─────────────────────────────────┤
│ 🎯 BACKLOG SESSIONS (NEW)        │
│  ├─ auth [18/23] ✓               │
│  ├─ terminal [5/12] ⏳           │
│  └─ + New Backlog                │
├─────────────────────────────────┤
│ 💻 TERMINAL SESSIONS             │
│  └─ bash #1 [Active]             │
└─────────────────────────────────┘
```

### iOS Components to Add

#### 1. **BacklogSessionListSection** (New View)

```swift
struct BacklogSessionListSection: View {
  let backlogSessions: [SessionInfo]
  let selectedSessionId: String?
  let onSelect: (String) -> Void
  let onCreate: () -> Void
  let onDelete: (String) -> Void

  var body: some View {
    Section {
      ForEach(backlogSessions, id: \.session_id) { session in
        BacklogSessionRow(
          session: session,
          isSelected: session.session_id == selectedSessionId,
          onSelect: { onSelect(session.session_id) }
        )
        .swipeActions(edge: .trailing) {
          Button(role: .destructive) {
            onDelete(session.session_id)
          } label: {
            Label("Delete", systemImage: "trash")
          }
        }
      }

      Button(action: onCreate) {
        Label("New Backlog", systemImage: "plus.circle")
      }
    } header: {
      Label("Backlog Sessions", systemImage: "target")
    }
  }
}
```

#### 2. **BacklogSessionRow** (Session Item)

```swift
struct BacklogSessionRow: View {
  let session: SessionInfo
  let isSelected: Bool
  let onSelect: () -> Void

  var body: some View {
    VStack(alignment: .leading, spacing: 4) {
      HStack {
        Text(session.backlogId ?? "Backlog")
          .font(.body)
          .fontWeight(isSelected ? .semibold : .regular)

        Spacer()

        // Progress indicator
        if let summary = session.backlogSummary {
          ProgressView(
            value: Double(summary.completed) / Double(summary.total)
          )
          .frame(width: 50)

          Text("\(summary.completed)/\(summary.total)")
            .font(.caption)
            .foregroundColor(.secondary)
        }
      }

      // Status indicators
      HStack(spacing: 8) {
        if session.harnessRunning ?? false {
          Label("Running", systemImage: "play.circle.fill")
            .font(.caption2)
            .foregroundColor(.green)
        } else {
          Label("Stopped", systemImage: "stop.circle")
            .font(.caption2)
            .foregroundColor(.gray)
        }

        Text(session.agent_name ?? "Unknown agent")
          .font(.caption2)
          .foregroundColor(.secondary)
      }
    }
    .contentShape(Rectangle())
    .onTapGesture(perform: onSelect)
    .background(isSelected ? Color.blue.opacity(0.1) : Color.clear)
  }
}
```

#### 3. **CreateBacklogSessionSheet** (Modal)

```swift
struct CreateBacklogSessionSheet: View {
  @Environment(\.dismiss) var dismiss
  @State private var workspace = ""
  @State private var project = ""
  @State private var worktree = ""
  @State private var selectedAgent = "claude"
  @State private var customBacklogId = ""

  var onCreate: (String, String, String, String, String?) -> Void

  var body: some View {
    NavigationStack {
      Form {
        Section("Workspace") {
          TextField("Workspace", text: $workspace)
          TextField("Project", text: $project)
          TextField("Worktree/Branch", text: $worktree)
        }

        Section("Agent") {
          Picker("Use Agent", selection: $selectedAgent) {
            Text("Claude").tag("claude")
            Text("Cursor").tag("cursor")
            Text("OpenCode").tag("opencode")
          }
        }

        Section("Optional") {
          TextField("Custom Backlog ID", text: $customBacklogId)
        }
      }
      .navigationTitle("Create Backlog")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button("Cancel", action: { dismiss() })
        }

        ToolbarItem(placement: .confirmationAction) {
          Button("Create") {
            onCreate(
              workspace,
              project,
              worktree,
              selectedAgent,
              customBacklogId.isEmpty ? nil : customBacklogId
            )
            dismiss()
          }
          .disabled(workspace.isEmpty || project.isEmpty || worktree.isEmpty)
        }
      }
    }
  }
}
```

#### 4. **BacklogAgentChatView** (Main Chat Interface)

```swift
struct BacklogAgentChatView: View {
  let sessionId: String
  let backlogId: String

  @State private var messages: [ChatMessage] = []
  @State private var inputText = ""
  @State private var isLoading = false

  var body: some View {
    VStack(spacing: 0) {
      // Header with status
      VStack(alignment: .leading, spacing: 8) {
        HStack {
          VStack(alignment: .leading, spacing: 4) {
            Text(backlogId)
              .font(.headline)

            HStack(spacing: 8) {
              Circle()
                .fill(Color.green)
                .frame(width: 8)

              Text("Harness Running")
                .font(.caption)
                .foregroundColor(.secondary)
            }
          }

          Spacer()

          // Control buttons
          HStack(spacing: 12) {
            Button(action: pauseHarness) {
              Image(systemName: "pause.circle")
            }

            Button(action: stopHarness) {
              Image(systemName: "stop.circle")
            }
          }
        }
        .padding()
      }
      .background(Color(.systemGray6))

      // Chat messages
      ScrollViewReader { proxy in
        ScrollView {
          VStack(alignment: .leading, spacing: 12) {
            ForEach(messages) { message in
              ChatMessageView(message: message)
                .id(message.id)
            }
          }
          .padding()
        }
        .onChange(of: messages.count) { _, _ in
          if let lastId = messages.last?.id {
            proxy.scrollTo(lastId, anchor: .bottom)
          }
        }
      }

      // Input area
      HStack(spacing: 12) {
        TextField("status, start, stop...", text: $inputText)
          .textFieldStyle(.roundedBorder)
          .disabled(isLoading)

        Button(action: sendMessage) {
          Image(systemName: "arrow.up.circle.fill")
        }
        .disabled(inputText.trimmingCharacters(in: .whitespaces).isEmpty || isLoading)
      }
      .padding()
    }
    .onAppear(perform: loadMessages)
  }

  private func sendMessage() {
    let trimmed = inputText.trimmingCharacters(in: .whitespaces)
    guard !trimmed.isEmpty else { return }

    inputText = ""
    isLoading = true

    // Send to backlog session
    // supervisor.backlog_command(sessionId, trimmed)
  }

  private func pauseHarness() {
    // supervisor.pause_backlog_harness(sessionId)
  }

  private func stopHarness() {
    // supervisor.stop_backlog_harness(sessionId)
  }

  private func loadMessages() {
    // Load from session history
  }
}
```

#### 5. **Update SidebarView**

```swift
struct SidebarView: View {
  @StateObject var viewModel: SidebarViewModel

  var body: some View {
    List {
      // Supervisor section
      SupervisorSessionSection(...)

      // Agent sessions section
      AgentSessionListSection(...)

      // ✨ NEW: Backlog sessions section
      BacklogSessionListSection(
        backlogSessions: viewModel.backlogSessions,
        selectedSessionId: viewModel.selectedSessionId,
        onSelect: viewModel.selectSession(_:),
        onCreate: viewModel.showCreateBacklogSheet(),
        onDelete: viewModel.deleteBacklogSession(_:)
      )

      // Terminal sessions section
      TerminalSessionListSection(...)
    }
    .sheet(isPresented: $viewModel.showCreateBacklog) {
      CreateBacklogSessionSheet(
        onCreate: viewModel.createBacklogSession
      )
    }
  }
}
```

---

## Web Client Architecture

### Sidebar Structure (Next.js/React)

```tsx
// components/Sidebar/SessionList.tsx

export function SessionList() {
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      {/* Supervisor Section */}
      <div>
        <h3 className="text-xs font-semibold text-gray-500 uppercase">Supervisor</h3>
        {/* ... */}
      </div>

      {/* Agent Sessions Section */}
      <div>
        <h3 className="text-xs font-semibold text-gray-500 uppercase">Agents</h3>
        {/* ... */}
      </div>

      {/* ✨ NEW: Backlog Sessions Section */}
      <BacklogSessionListSection
        sessions={sessions.filter(s => s.session_type === 'backlog-agent')}
        selectedSessionId={selectedSessionId}
        onSelect={setSelectedSessionId}
      />

      {/* Terminal Sessions Section */}
      <div>
        <h3 className="text-xs font-semibold text-gray-500 uppercase">Terminal</h3>
        {/* ... */}
      </div>
    </div>
  );
}
```

### React Components

#### 1. **BacklogSessionListSection.tsx**

```tsx
import { SessionInfo } from '@/types/protocol';
import { BacklogSessionRow } from './BacklogSessionRow';
import { CreateBacklogButton } from './CreateBacklogButton';

interface Props {
  sessions: SessionInfo[];
  selectedSessionId: string | null;
  onSelect: (sessionId: string) => void;
}

export function BacklogSessionListSection({
  sessions,
  selectedSessionId,
  onSelect
}: Props) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between px-2">
        <h3 className="text-xs font-semibold text-gray-500 uppercase">
          🎯 Backlog
        </h3>
        <CreateBacklogButton />
      </div>

      <div className="space-y-1">
        {sessions.map(session => (
          <BacklogSessionRow
            key={session.session_id}
            session={session}
            isSelected={session.session_id === selectedSessionId}
            onSelect={() => onSelect(session.session_id)}
          />
        ))}

        {sessions.length === 0 && (
          <p className="text-xs text-gray-500 px-2">No backlogs</p>
        )}
      </div>
    </div>
  );
}
```

#### 2. **BacklogSessionRow.tsx**

```tsx
interface Props {
  session: SessionInfo;
  isSelected: boolean;
  onSelect: () => void;
}

export function BacklogSessionRow({ session, isSelected, onSelect }: Props) {
  const agentIcon = {
    claude: '🤖',
    cursor: '📝',
    opencode: '⚡',
  }[session.agent_name || 'claude'] || '🤖';

  const summary = (session as any).backlogSummary;
  const progress = summary
    ? (summary.completed / summary.total * 100).toFixed(0)
    : 0;

  const harnessRunning = (session as any).harnessRunning;

  return (
    <div
      onClick={onSelect}
      className={`
        px-3 py-2 rounded cursor-pointer transition-colors
        ${isSelected
          ? 'bg-blue-100 text-blue-900'
          : 'hover:bg-gray-100'}
      `}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span>{agentIcon}</span>
            <span className="text-sm font-medium truncate">
              {(session as any).backlogId || 'Backlog'}
            </span>
          </div>

          {summary && (
            <div className="mt-1 text-xs text-gray-600">
              <div className="w-full bg-gray-200 rounded-full h-1.5">
                <div
                  className="bg-green-500 h-1.5 rounded-full transition-all"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <span className="text-xs mt-0.5">
                {summary.completed}/{summary.total}
              </span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-1">
          {harnessRunning && (
            <span className="inline-block w-2 h-2 bg-green-500 rounded-full animate-pulse" />
          )}
          <span className="text-xs text-gray-500">
            {harnessRunning ? '▶' : '⏹'}
          </span>
        </div>
      </div>
    </div>
  );
}
```

#### 3. **CreateBacklogButton.tsx**

```tsx
'use client';

import { useState } from 'react';
import { CreateBacklogDialog } from './CreateBacklogDialog';

export function CreateBacklogButton() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="p-1 hover:bg-gray-200 rounded"
        title="Create new backlog"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
      </button>

      <CreateBacklogDialog open={open} onOpenChange={setOpen} />
    </>
  );
}
```

#### 4. **CreateBacklogDialog.tsx**

```tsx
'use client';

import { useState } from 'react';
import { useWebSocket } from '@/hooks/useWebSocket';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateBacklogDialog({ open, onOpenChange }: Props) {
  const { send } = useWebSocket();
  const [workspace, setWorkspace] = useState('');
  const [project, setProject] = useState('');
  const [worktree, setWorktree] = useState('');
  const [agent, setAgent] = useState('claude');
  const [backlogId, setBacklogId] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleCreate = async () => {
    setIsLoading(true);
    try {
      const message = {
        type: 'supervisor.create_session',
        payload: {
          session_type: 'backlog-agent',
          workspace,
          project,
          worktree,
          backlog_agent: agent,
          backlog_id: backlogId || undefined,
        },
      };

      await send(message);
      onOpenChange(false);

      // Reset form
      setWorkspace('');
      setProject('');
      setWorktree('');
      setAgent('claude');
      setBacklogId('');
    } finally {
      setIsLoading(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center">
      <div className="bg-white rounded-lg shadow-lg p-6 w-96">
        <h2 className="text-xl font-bold mb-4">Create Backlog</h2>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium">Workspace</label>
            <input
              type="text"
              value={workspace}
              onChange={(e) => setWorkspace(e.target.value)}
              className="w-full border rounded px-3 py-2"
              placeholder="e.g., tiflis"
            />
          </div>

          <div>
            <label className="block text-sm font-medium">Project</label>
            <input
              type="text"
              value={project}
              onChange={(e) => setProject(e.target.value)}
              className="w-full border rounded px-3 py-2"
              placeholder="e.g., tiflis-code"
            />
          </div>

          <div>
            <label className="block text-sm font-medium">Worktree/Branch</label>
            <input
              type="text"
              value={worktree}
              onChange={(e) => setWorktree(e.target.value)}
              className="w-full border rounded px-3 py-2"
              placeholder="e.g., feature-auth"
            />
          </div>

          <div>
            <label className="block text-sm font-medium">Agent</label>
            <select
              value={agent}
              onChange={(e) => setAgent(e.target.value)}
              className="w-full border rounded px-3 py-2"
            >
              <option value="claude">Claude</option>
              <option value="cursor">Cursor</option>
              <option value="opencode">OpenCode</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium">Custom ID (optional)</label>
            <input
              type="text"
              value={backlogId}
              onChange={(e) => setBacklogId(e.target.value)}
              className="w-full border rounded px-3 py-2"
              placeholder="auto-generated if empty"
            />
          </div>
        </div>

        <div className="flex gap-2 mt-6">
          <button
            onClick={() => onOpenChange(false)}
            className="flex-1 px-4 py-2 border rounded hover:bg-gray-100"
            disabled={isLoading}
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            className="flex-1 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
            disabled={!workspace || !project || !worktree || isLoading}
          >
            {isLoading ? 'Creating...' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  );
}
```

---

## Protocol Updates

### SessionInfo Extended

```typescript
export interface SessionInfo {
  session_id: string;
  session_type: SessionType;
  status: SessionStatus;
  workspace?: string;
  project?: string;
  worktree?: string;
  working_dir: string;
  created_at: number;
  agent_name?: string;

  // ✨ NEW: Backlog-specific fields
  backlogId?: string;
  harnessRunning?: boolean;
  backlogSummary?: {
    total: number;
    completed: number;
    failed: number;
    in_progress: number;
    pending: number;
  };
}
```

---

## Message Handlers

### Backlog Command Message

```typescript
export interface BacklogCommandMessage {
  type: 'session.execute';
  session_id: string;  // Backlog session ID
  payload: {
    prompt: string;  // User command (status, start, add task, etc.)
  };
}
```

### Backlog Output Message

```typescript
export interface SessionOutputMessage {
  type: 'session.output';
  session_id: string;
  payload: {
    blocks: ContentBlock[];  // Status, progress, task updates
    isComplete: boolean;
  };
}
```

---

## Integration Checklist

- [ ] Update `SessionInfo` protocol with backlog fields
- [ ] Add `BacklogSessionListSection` to iOS `SidebarView`
- [ ] Implement iOS backlog creation sheet
- [ ] Implement iOS backlog chat view
- [ ] Add backlog components to Web sidebar
- [ ] Implement web backlog creation dialog
- [ ] Add backlog chat view to web client
- [ ] Update WebSocket message handlers for `session.execute` (backlog)
- [ ] Test end-to-end: create → chat → start → monitor progress

---

## Notes

- Backlog sessions should have their own visual style/icon (🎯) to distinguish from agents
- Progress bar should update in real-time as tasks complete
- Harness status indicator (▶️/⏹️) shows if execution is running
- Commands in backlog chat are simple strings (`status`, `start`, `stop`, `pause`, `resume`, `add task...`)
- All backlog session state persists in `backlog.json` in the worktree
