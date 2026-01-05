# Autonomous Development Architecture — Implementation Guide

> **Status**: MVP Phase 1 Complete — Core components implemented and ready for integration

---

## What's Implemented

### ✅ Core Components

1. **BacklogAgentSession** (`domain/entities/backlog-agent-session.ts`)
   - New session type `backlog-agent` for managing autonomous development directions
   - Tracks agent name, backlog ID, and harness running status
   - Extends base `Session` class

2. **Backlog Schema** (`domain/value-objects/backlog.ts`)
   - Complete Zod schema for `backlog.json` structure
   - Task definition with status, dependencies, priority, complexity
   - Support for external system references (Jira, GitHub, etc.)
   - Helper functions: `createBacklog()`, `createTask()`, `recalculateSummary()`

3. **BacklogHarness** (`infrastructure/agents/backlog-harness.ts`)
   - Autonomous executor iterating through tasks
   - Handles task dependencies and ordering
   - Manages Coding Agent sessions
   - Broadcasting progress as ContentBlocks
   - Events: `task-started`, `task-completed`, `task-failed`, `harness-completed`

4. **BacklogAgentManager** (`infrastructure/agents/backlog-agent-manager.ts`)
   - Orchestrates Backlog Agent sessions
   - Simple command processor for MVP (extensible for LLM later)
   - Commands: `status`, `start`, `stop`, `pause`, `resume`, `add_task`, `list`
   - Maintains conversation history
   - Saves backlog state to `backlog.json`

5. **Supervisor Tools** (`infrastructure/agents/supervisor/tools/backlog-tools.ts`)
   - `create_backlog_session()` — Create new backlog direction
   - `list_backlog_sessions()` — List active backlogs
   - `get_backlog_status()` — Get progress
   - `add_task_to_backlog()` — Add tasks
   - `start_backlog_harness()` — Start execution
   - `stop_backlog_harness()` — Stop execution

---

## What's NOT Yet Implemented

### Phase 2 (MCP Integration)
- Dynamic MCP server loading
- Import tasks from Jira/GitHub/GitLab
- LLM-driven synchronization with external systems

### Phase 3 (Parallel Execution)
- HarnessManager for multiple simultaneous harnesses
- Worktree conflict resolution
- Merge workflow orchestration

### Phase 4 (Enterprise)
- Voice TTS reports
- Automatic merge workflow
- Analytics and metrics

---

## Integration Steps

### Step 1: Update SessionManager

Add support for `backlog-agent` session type in `SessionManager`:

```typescript
// In session-manager.ts
if (params.type === 'backlog-agent') {
  // Create backlog session
  const session = new BacklogAgentSession({
    id: new SessionId(),
    type: 'backlog-agent',
    workspacePath: params.workspacePath,
    workingDir: params.workingDir,
    agentName: params.agentName || 'claude',
    backlogId: params.backlogId || `backlog-${Date.now()}`,
  });

  this.sessions.set(session.id.value, session);
  return session.id.value;
}
```

### Step 2: Create BacklogAgentManager Registry

In the main workstation setup, create a registry for managing backlog sessions:

```typescript
// In workstation initialization
const backlogManagers = new Map<string, BacklogAgentManager>();

// Pass to supervisor when creating it:
const supervisorTools = createSupervisorTools(
  sessionManager,
  agentSessionManager,
  workspaceDiscovery
);

const backlogTools = createBacklogTools(
  sessionManager,
  agentSessionManager,
  backlogManagers
);

const allTools = [
  ...Object.values(supervisorTools),
  ...Object.values(backlogTools),
];
```

### Step 3: Add MessageRouter Handler for Backlog Commands

In `websocket/message-router.ts`, add handler for backlog session commands:

```typescript
private async handleBacklogSessionCommand(
  message: SessionExecuteMessage,
  deviceId: string
): Promise<void> {
  const sessionId = message.session_id;
  const manager = this.backlogManagers.get(sessionId);

  if (!manager) {
    this.sendError(deviceId, 'Backlog session not found');
    return;
  }

  try {
    const blocks = await manager.executeCommand(
      message.payload.prompt || ''
    );

    // Broadcast output
    this.broadcaster.broadcastToSubscribers(sessionId, {
      type: 'session.output',
      session_id: sessionId,
      payload: { blocks, isComplete: true },
    });
  } catch (error) {
    this.sendError(deviceId, `Command failed: ${error}`);
  }
}
```

### Step 4: Add Harness Output Relay

Connect Harness output events to message broadcaster:

```typescript
// In BacklogAgentManager or where harness is created:
harness.on('output', (blocks: ContentBlock[]) => {
  // Broadcast to all subscribers of this backlog session
  this.broadcaster.broadcastToSubscribers(sessionId, {
    type: 'session.output',
    session_id: sessionId,
    payload: { blocks, isComplete: false },
  });
});
```

---

## Usage Example (MVP)

### Via Supervisor (Voice/Chat)

```
User: "Create a new backlog for auth feature on main"

Supervisor: [calls create_backlog_session tool]

Supervisor Response:
"✅ Created backlog session 'auth-main' with claude agent.
 Session ID: sess_12345"

User: "Add task 'Implement login endpoint' to that session"

Supervisor: [calls add_task_to_backlog tool]

Supervisor Response:
"✅ Task added: 'Implement login endpoint'"

User: "Start executing the backlog"

Supervisor: [calls start_backlog_harness tool]

Supervisor Response:
"✅ Harness started for auth-main. 1 tasks to execute.
 I'll report progress here as tasks complete."

--- [Harness runs autonomously] ---

Backlog Agent: "📌 Task 1: Implement login endpoint"
Backlog Agent: "✅ Task completed: Implement login endpoint (15 minutes)"
Backlog Agent: "✅ Harness completed. 1/1 tasks done"
```

### Via Backlog Chat Session

```
User (in Backlog Agent chat): "What's the status?"

Backlog Agent:
"📊 Backlog Status: auth-main

Progress: 1/1 tasks (100%)

Breakdown:
- ✅ Completed: 1
- ⏳ In Progress: 0
- ⏸️ Pending: 0
- ❌ Failed: 0

Agent: claude
Worktree: auth"

User: "Add a new task for tests"

Backlog Agent:
"✅ Task 2 added: 'Write tests for login endpoint'"

User: "Start execution"

Backlog Agent:
"✅ Harness started for auth. 2 tasks to execute."
```

---

## File Structure

```
packages/workstation/src/

├── domain/
│   ├── entities/
│   │   ├── session.ts (updated: SessionType includes 'backlog-agent')
│   │   └── backlog-agent-session.ts (NEW)
│   └── value-objects/
│       └── backlog.ts (NEW: Task, Backlog, TaskSource schemas)

├── infrastructure/
│   ├── agents/
│   │   ├── backlog-agent-manager.ts (NEW)
│   │   ├── backlog-harness.ts (NEW)
│   │   └── supervisor/
│   │       └── tools/
│   │           └── backlog-tools.ts (NEW)
│   └── websocket/
│       └── message-router.ts (UPDATED: add backlog command handler)

└── [other existing files unchanged]
```

---

## Next Steps

### Immediate (Day 1-2)
1. ✅ Review and test the MVP components
2. ✅ Integrate into SessionManager
3. ✅ Add MessageRouter handler for backlog commands
4. ✅ Test end-to-end flow: create → add task → start → execute

### Short Term (Week 1-2)
1. Refine command parsing in BacklogAgentManager (more intelligent)
2. Add proper error handling and recovery
3. Implement file-based backlog persistence
4. Add tests for harness execution loop

### Medium Term (Week 2-3)
1. Integrate with actual LLM for Backlog Agent (replace simple command processor)
2. Add MCP server support (dynamic loading)
3. Implement Jira/GitHub import
4. Add LLM-driven synchronization

### Long Term (Week 3-4)
1. HarnessManager for parallel execution
2. Merge workflow automation
3. Voice/TTS integration
4. Production hardening

---

## Testing

### Manual Test Flow

1. Create backlog session:
   ```
   POST /api/create-session
   {
     "session_type": "backlog-agent",
     "workspace": "tiflis",
     "project": "tiflis-code",
     "worktree": "feature-test",
     "agent": "claude"
   }
   ```

2. Add tasks via chat:
   ```
   Session: send message "add task 'Test task' with description"
   ```

3. Start harness:
   ```
   Session: send message "start"
   ```

4. Monitor progress:
   ```
   Subscribe to session messages via WebSocket
   Should see: task-started, task-completed, harness-completed events
   ```

### Unit Tests (TODO)
- BacklogHarness task iteration
- BacklogAgentManager command parsing
- BacklogAgent supervisor tools
- Backlog schema validation

---

## Key Design Decisions

### 1. Chat-Based Communication
- All Harness output goes to Backlog Agent chat
- No push notifications in MVP
- Simple, centralized interaction model

### 2. Stateless Commands (MVP)
- BacklogAgentManager uses simple command parsing, not LLM
- Extensible: can replace with actual LLM later
- Fast prototyping and testing

### 3. File-Based State
- Backlog persisted to `backlog.json` in worktree
- No separate database needed for MVP
- Git-friendly: can track progress in version control

### 4. Synchronous Task Execution
- Harness waits for task completion before moving to next
- No parallel task execution within single harness
- Simplifies state management

### 5. Flexible Architecture
- Supervisor tools = main entry point
- BacklogAgentManager can be replaced with full LLM agent
- MCP integration can be added without changing core loop

---

## Architecture Diagram

```
┌──────────────────────┐
│  Mobile Client       │
│  (Voice/Chat)        │
└──────────┬───────────┘
           │
           ▼
┌──────────────────────────┐
│   Supervisor Agent       │
│  (LangGraph)             │
│  ├─ backlog_tools        │
│  └─ other_tools          │
└──────────┬───────────────┘
           │
      ┌────┴─────────────────────┬──────────────────────┐
      ▼                          ▼                       ▼
[create_backlog]    [start_backlog_harness]   [stop_backlog_harness]
      │                          │                       │
      ▼                          ▼                       ▼
┌──────────────────────────────────────────────────────────┐
│          BacklogAgentManager Registry                    │
│  (Map<sessionId, BacklogAgentManager>)                   │
└──────────────────────┬───────────────────────────────────┘
                       │
                       ▼
        ┌──────────────────────────┐
        │  BacklogAgentManager     │
        │  ├─ session              │
        │  ├─ backlog.json         │
        │  ├─ executeCommand()     │
        │  └─ harness (on demand)  │
        └────────────┬─────────────┘
                     │
                     ▼
        ┌──────────────────────────┐
        │  BacklogHarness          │
        │  ├─ tasks iteration      │
        │  ├─ dependency check     │
        │  ├─ spawn coding agent   │
        │  └─ broadcast progress   │
        └────────────┬─────────────┘
                     │
                     ▼
        ┌──────────────────────────┐
        │  Coding Agent Session    │
        │  (claude/cursor/opencode)│
        │  (executes task)         │
        └──────────────────────────┘

Output Flow:
Coding Agent → Harness → BacklogAgentManager → WebSocket → Chat UI
```

---

## Troubleshooting

### Backlog session not found
- Ensure `create_backlog_session` was called first
- Check session ID is passed correctly to subsequent commands

### Harness not executing
- Verify agent session was created (`create_backlog_session` should do this)
- Check working directory exists
- Review logs for subprocess errors

### Tasks not progressing
- Backlog might be in `paused` state — call `resume`
- Check task dependencies are satisfied
- Verify agent session is still active

---

## References

- Architecture: `AUTONOMOUS_DEVELOPMENT_ARCHITECTURE_v2.md`
- Domain Model: `packages/workstation/src/domain/`
- Backlog Schema: `packages/workstation/src/domain/value-objects/backlog.ts`
- Harness: `packages/workstation/src/infrastructure/agents/backlog-harness.ts`
- Manager: `packages/workstation/src/infrastructure/agents/backlog-agent-manager.ts`
