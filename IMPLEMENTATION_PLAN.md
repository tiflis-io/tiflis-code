# BacklogAgent Interactive Agent Selection Implementation Plan

## Overview

Currently, BacklogAgent doesn't ask users which coding agent (Claude, Cursor, OpenCode, or custom aliases) should execute tasks when `start_harness` is called. This plan adds interactive agent selection **before Harness execution** using LLM-based natural language dialogue.

## Requirements

1. **Timing**: Ask every time `start_harness` is called (before creating Harness)
2. **Mechanism**: LLM-based natural dialogue via BacklogAgent
3. **User Flow**: User says "start" → Agent asks "Which agent?" → User answers → Agent selects and creates Harness
4. **Agent Aliases**: Support all available agents including custom AGENT_ALIAS_* configs
5. **Session Naming**: Each task iteration gets unique session with descriptive name (Task N/M: Title)
6. **Session Lifecycle**: Keep sessions active post-completion so users can view history

## Architecture Overview

```
User Input (WebSocket)
    ↓
BacklogAgentManager.executeCommand()
    ↓
BacklogAgent.executeCommand() [LLM]
    ↓
Detect "start_harness" intent
    ↓
Check if agent already selected in context
    ├─ NO → Ask user: "Which agent to use?" (LLM generates question)
    │   ↓
    │   User responds in natural language
    │   ↓
    │   LLM parses response & validates agent name
    │   ↓
    │   Store agent name in BacklogAgentManager context
    │
    └─ YES → Use previously selected agent
    ↓
Create BacklogHarness with selected agent
    ↓
BacklogHarness.start()
    ↓
For each pending task:
    ├─ Create new AgentSession with descriptive name
    ├─ Execute task
    ├─ Keep session active post-completion
    └─ Move to next task
```

## Key Components to Modify

### 1. BacklogAgentManager - Add Agent Selection State

**File**: `packages/workstation/src/infrastructure/agents/backlog-agent-manager.ts`

**Changes**:
- Add `private selectedAgent: string | null = null` field to track selected agent for current harness execution
- Add `private agentSelectionInProgress: boolean = false` flag to prevent concurrent selections
- Add `setSelectedAgent(agentName: string): void` method
- Modify `startHarnessCommand()` to:
  - Check if agent is already selected for this harness execution
  - If not → pause execution and ask user
  - After user responds → resume with selected agent

**Key Logic**:
```typescript
private selectedAgent: string | null = null;
private agentSelectionInProgress: boolean = false;

async startHarnessCommand(): Promise<ContentBlock[]> {
  // If agent not selected yet, ask user
  if (!this.selectedAgent && !this.agentSelectionInProgress) {
    this.agentSelectionInProgress = true;
    return this.askForAgentSelection();
  }

  // If selection is in progress, wait for user response
  if (this.agentSelectionInProgress) {
    return [{
      block_type: 'text',
      content: 'Waiting for agent selection...'
    }];
  }

  // Otherwise, proceed with harness creation
  return this.createAndStartHarness();
}
```

### 2. BacklogAgentManager - Add Agent Selection UI

**File**: `packages/workstation/src/infrastructure/agents/backlog-agent-manager.ts`

**New Method**: `askForAgentSelection(): Promise<ContentBlock[]>`

**Implementation**:
- Use LLM to generate a friendly question about agent selection
- Generate list of available agents using `getAvailableAgents()`
- Return text block with question + list of available agents
- System prompt update in BacklogAgent to understand "I want claude" / "use cursor" / etc.

**System Prompt Addition**:
```
Special case: If the user previously sent start_harness but hasn't selected an agent yet,
and the conversation context shows we're asking which agent to use:
- Parse user response for agent keywords (claude, cursor, opencode, or known aliases)
- Extract the selected agent name
- If valid agent found → automatically call start_backlog_harness with that agent
- If invalid → ask again with list of available agents
```

### 3. BacklogAgent - Enhanced Agent Selection Parsing

**File**: `packages/workstation/src/infrastructure/agents/backlog-agent-tools.ts`

**New Tool**: `parse_agent_selection(userResponse: string) → { agentName: string; valid: boolean }`

**Purpose**:
- Parse natural language agent selection responses
- Match against available agents using fuzzy matching
- Return selected agent name or error message

**Examples**:
- "I want claude" → `{ agentName: 'claude', valid: true }`
- "use cursor agent" → `{ agentName: 'cursor', valid: true }`
- "with my zai alias" → `{ agentName: 'zai', valid: true }`
- "some random thing" → `{ agentName: null, valid: false }`

### 4. BacklogAgentManager - Agent Selection Handler

**File**: `packages/workstation/src/infrastructure/agents/backlog-agent-manager.ts`

**New Method**: `handleAgentSelection(userMessage: string): Promise<ContentBlock[]>`

**Logic**:
1. Use `parse_agent_selection` tool to extract agent name
2. If valid:
   - Set `this.selectedAgent = agentName`
   - Set `this.agentSelectionInProgress = false`
   - Return confirmation message
   - Automatically trigger harness creation in next cycle
3. If invalid:
   - Return friendly error message with list of available agents
   - Keep `agentSelectionInProgress = true` to prompt again

### 5. BacklogHarness - Unique Session Creation Per Task

**File**: `packages/workstation/src/infrastructure/agents/backlog-harness.ts`

**Changes in `executeTask()` method**:
- Calculate task index: `taskIndex = tasks.findIndex(t => t.id === task.id) + 1`
- Create unique session per task:
  ```typescript
  const taskSessionId = `backlog-${this.backlog.id}-task-${task.id}`;
  const taskAgentName = `Task ${taskIndex}/${totalTasks}: ${task.title}`;

  const session = this.agentSessionManager.createSession(
    selectedAgent,
    this.workingDir,
    taskSessionId,
    taskAgentName  // Descriptive name for UI display
  );
  ```
- Pass selected agent type to harness constructor

**Constructor Change**:
```typescript
constructor(
  backlog: Backlog,
  workingDir: string,
  selectedAgent: string,  // NEW: which agent to use
  agentSessionManager: AgentSessionManager,
  logger: Logger
)
```

### 6. BacklogAgentManager - Pass Agent to Harness

**File**: `packages/workstation/src/infrastructure/agents/backlog-agent-manager.ts`

**In `createAndStartHarness()` method**:
```typescript
private async createAndStartHarness(): Promise<ContentBlock[]> {
  this.harness = new BacklogHarness(
    this.backlog,
    this.workingDir,
    this.selectedAgent!,  // Pass selected agent
    this.agentSessionManager,
    this.logger
  );
  // ... rest of harness creation
}
```

### 7. Conversation Flow - Update System Prompt

**File**: `packages/workstation/src/infrastructure/agents/backlog-agent.ts`

**Update BACKLOG_AGENT_SYSTEM_PROMPT**:

Add special handling for agent selection:
```
SPECIAL CASE - Agent Selection:
When you detect the user wants to start harness (via start_backlog_harness tool),
but no agent has been selected yet:
1. Use get_available_agents tool to fetch all available agents
2. Generate a friendly question asking which agent to use
3. List all available agents with their descriptions
4. Wait for user response

When the user responds with an agent choice:
1. Parse their response to identify the agent name
2. Validate against available agents
3. If valid → confirm and proceed with starting harness
4. If invalid → ask again with full list

Examples of agent selection responses:
- "I want to use claude code"
- "let's run this with cursor"
- "execute with my zai setup"
```

### 8. New Tool - Get Available Agents

**File**: `packages/workstation/src/infrastructure/agents/backlog-agent-tools.ts`

**New Tool**: `get_available_agents() → { agents: Array<{name, description, baseType, isAlias}> }`

**Purpose**:
- Return list of all available agents from `getAvailableAgents()`
- Include descriptions for each agent
- Used by BacklogAgent to generate agent selection UI

## Data Flow

### Scenario: User starts Harness without agent selected

```
User: "start executing tasks"
  ↓
BacklogAgentManager.executeCommand("start executing tasks")
  ↓
BacklogAgent LLM detects "start" intent → calls start_backlog_harness tool
  ↓
Tool implementation in BacklogAgentManager.startHarnessCommand()
  ├─ Check: selectedAgent is null && !agentSelectionInProgress
  │ ├─ YES → askForAgentSelection()
  │ │   ├─ Call get_available_agents()
  │ │   ├─ Generate question via LLM
  │ │   └─ Return ContentBlocks with question + agent list
  │ └─ Set agentSelectionInProgress = true
  ↓
Return question blocks to user
  ↓
BacklogAgentManager.emit('output', blocks)
  ↓
WebSocket → Mobile App
  ↓
User sees question and list of agents
  ↓
User: "I'll use claude code"
  ↓
BacklogAgentManager.executeCommand("I'll use claude code")
  ↓
BacklogAgent LLM processes response
  ├─ Detects agent selection context
  ├─ Calls parse_agent_selection("I'll use claude code")
  └─ Returns {agentName: 'claude', valid: true}
  ↓
handleAgentSelection() called
  ├─ Set selectedAgent = 'claude'
  ├─ Set agentSelectionInProgress = false
  └─ Return confirmation blocks
  ↓
Next executeCommand() call with "start" → creates and starts Harness
```

### Scenario: Task Iteration with Unique Sessions

```
BacklogHarness.start()
  ↓
executeLoop()
  ↓
For each pending task:
  ├─ Task 1: auth
  │ ├─ Create: `backlog-proj-task-1` with agentName = "Task 1/5: Implement auth"
  │ ├─ Execute with this.selectedAgent (e.g., 'claude')
  │ ├─ Keep session active
  │ └─ Return control to Backlog Agent (notify completion)
  │
  ├─ Task 2: api
  │ ├─ Create: `backlog-proj-task-2` with agentName = "Task 2/5: Create API endpoints"
  │ ├─ Execute with same this.selectedAgent
  │ ├─ Keep session active
  │ └─ Return control
  │
  └─ ... continue for all tasks
  ↓
Notify BacklogAgent of completion
```

## Implementation Steps

### Phase 1: Core Agent Selection Infrastructure
1. Add selectedAgent state to BacklogAgentManager
2. Create askForAgentSelection() method
3. Create parse_agent_selection() tool
4. Add get_available_agents() tool
5. Update BacklogAgent system prompt
6. Test: User can select agent interactively

### Phase 2: Harness Integration
7. Add selectedAgent parameter to BacklogHarness constructor
8. Modify executeTask() for unique session creation per task
9. Generate descriptive task names (Task N/M: Title)
10. Test: Each task gets its own session with correct naming

### Phase 3: E2E Testing & Edge Cases
11. Test with base agents (claude, cursor, opencode)
12. Test with custom aliases (AGENT_ALIAS_*)
13. Test concurrent harness executions
14. Test resume/pause with agent selection
15. Test session persistence and history viewing

### Phase 4: Mobile UI (if needed)
16. Update iOS ChatView to handle agent selection question blocks
17. Update Android ChatView for agent selection UI
18. Update Web client if needed

## Edge Cases & Error Handling

### 1. Agent Not Found
- User responds with invalid agent name
- **Handling**: Ask again with full list of available agents
- **Do NOT**: Proceed with harness

### 2. Agent Selection Timeout
- User doesn't respond within reasonable time (e.g., 5 minutes)
- **Handling**: Reset agentSelectionInProgress flag, allow re-asking
- **Do NOT**: Auto-select default agent

### 3. Multiple Start Requests
- User sends "start" multiple times while waiting for agent selection
- **Handling**: Ignore duplicate requests, keep agentSelectionInProgress = true
- **Do NOT**: Queue multiple selections

### 4. Agent Alias Removed
- User previously selected alias, but it's no longer in AGENT_ALIAS_*
- **Handling**: Fall back to asking again
- **Validate**: Check selectedAgent exists in getAvailableAgents() before using

### 5. Session Creation Failures
- AgentSessionManager.createSession() fails for specific agent
- **Handling**: Return error block, offer to select different agent
- **Logging**: Log error with agent name for debugging

## Protocol Changes (if any)

No protocol changes needed:
- Agent selection happens via existing `execute_command` WebSocket messages
- Question/answer flow uses existing ContentBlock types (text, status)
- No new message types or protocol versions required

## Session Naming Examples

When user selects `claude` for a 5-task backlog:

```
Session 1: Task 1/5: Implement user authentication
Session 2: Task 2/5: Create API endpoint for login
Session 3: Task 3/5: Add database schema for users
Session 4: Task 4/5: Write unit tests for auth
Session 5: Task 5/5: Update API documentation
```

iOS display: "Claude Code (Task 1/5: Implement user authentication)"

## Testing Strategy

### Unit Tests
- Test parse_agent_selection with various inputs
- Test agent state transitions (null → selected → null)
- Test get_available_agents returns correct format

### Integration Tests
- Test full flow: start → ask → select → create harness
- Test with different agents (claude, cursor, opencode, aliases)
- Test error cases (invalid agent, timeout, etc.)

### E2E Tests
- Start backlog agent session
- Say "start executing"
- Select different agents
- Verify Harness created with correct agent
- Verify task sessions named correctly

## Known Limitations & Future Improvements

1. **No persistent agent preference**: Asking every time prevents caching, but gives flexibility
2. **No batch operations**: Each task gets a new session (as required)
3. **Session cleanup**: Currently keeping sessions active (as required), may consume resources
4. **Alias validation**: Assumes AGENT_ALIAS_* env vars don't change during runtime

## Files to Modify

| File | Changes | Complexity |
|------|---------|-----------|
| backlog-agent-manager.ts | Add state, methods for selection | Medium |
| backlog-agent.ts | Update system prompt, add tool | Low |
| backlog-agent-tools.ts | New tools: parse_agent_selection, get_available_agents | Medium |
| backlog-harness.ts | Add selectedAgent param, unique session per task | Medium |
| (Optional) iOS ChatView | Handle agent selection question blocks | Low |
| (Optional) Android ChatView | Handle agent selection question blocks | Low |

## Success Criteria

- ✅ User can start Harness by saying "start"
- ✅ BacklogAgent asks "Which agent?" naturally via LLM
- ✅ User responds in natural language ("I want claude")
- ✅ Agent selection is validated against available agents
- ✅ Each task iteration creates unique session with Task N/M naming
- ✅ Sessions remain active for history viewing
- ✅ Works with base agents and custom aliases
- ✅ Works with pause/resume (agent selection persists)
- ✅ No protocol changes required
