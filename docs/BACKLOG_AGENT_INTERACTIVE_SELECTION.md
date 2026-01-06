# BacklogAgent Interactive Agent Selection

## Overview

The BacklogAgent now supports interactive agent selection when starting the Harness. Users can choose which coding agent (Claude, Cursor, OpenCode, or custom aliases) should execute the backlog tasks.

**Key Features:**
- ✅ Interactive prompts - Agent asks "Which agent to use?"
- ✅ Natural language - Understands "I want claude code", "use cursor", etc.
- ✅ Fuzzy matching - Handles typos and variations
- ✅ Custom aliases - Supports AGENT_ALIAS_* configurations
- ✅ Unique sessions - Each task gets its own session with descriptive naming
- ✅ No protocol changes - Works with existing WebSocket protocol

## User Flow

### Starting the Harness

```
User: "start executing my tasks"
     ↓
BacklogAgent: "🤖 Select a coding agent to execute the harness tasks:
             • claude: LLM-based code agent
             • cursor: VS Code with AI
             • opencode: OpenCode integration
             Please respond with the agent name (e.g., 'claude', 'cursor', or alias)"
     ↓
User: "I want to use claude code"
     ↓
BacklogAgent: "✅ Great! I'll use claude to execute the tasks.
             Now starting the harness...
             🚀 Harness started. 5 task(s) to execute."
     ↓
Harness Creates Sessions:
  • Task 1/5: Implement authentication
  • Task 2/5: Create API endpoints
  • Task 3/5: Add database schema
  • Task 4/5: Write unit tests
  • Task 5/5: Update documentation
```

### Natural Language Variations

The system understands various ways to express agent selection:

```
Direct name:        "claude"
With framework:     "claude code", "cursor agent", "open code"
With hyphen:        "claude-code", "cursor-agent"
In sentence:        "I want to use claude", "please use cursor"
With typos:         "cluade", "cusor" (if similarity > 60%)
Case insensitive:   "CLAUDE", "CuRsOr"
```

### Custom Aliases

If you have configured custom agent aliases:

```bash
export AGENT_ALIAS_ZAI="claude --settings ~/.zai/settings.json"
export AGENT_ALIAS_CLAUDE_OPUS="claude --model opus"
export AGENT_ALIAS_CURSOR_PRO="cursor-agent --pro-mode"
```

The BacklogAgent will show them in the list:

```
BacklogAgent: "Select a coding agent:
             • claude: LLM-based code agent
             • cursor: VS Code with AI
             • opencode: OpenCode integration
             • zai (alias): Custom claude setup
             • claude-opus (alias): Claude with Opus model
             • cursor-pro (alias): Cursor in pro mode"
```

And understand them in user responses:

```
User: "I'll use my zai setup"
BacklogAgent: "✅ Great! I'll use zai (alias) to execute the tasks."
```

## Session Naming and Tracking

When the Harness starts, each task execution creates a unique agent session with descriptive naming:

### Session Structure

```
Session ID:    backlog-{backlogId}-task-{taskId}
Agent Name:    Task {index}/{total}: {taskTitle}
Display Name:  Claude Code (Task 1/5: Implement auth)
```

### Example Session Names

For a 5-task backlog using Claude agent:

| Task | Session ID | Agent Name | Display in iOS |
|------|-----------|-----------|-----------------|
| 1 | backlog-proj-task-1 | Task 1/5: Implement auth | Claude Code (Task 1/5: Implement auth) |
| 2 | backlog-proj-task-2 | Task 2/5: Create API endpoints | Claude Code (Task 2/5: Create API endpoints) |
| 3 | backlog-proj-task-3 | Task 3/5: Add database schema | Claude Code (Task 3/5: Add database schema) |
| 4 | backlog-proj-task-4 | Task 4/5: Write unit tests | Claude Code (Task 4/5: Write unit tests) |
| 5 | backlog-proj-task-5 | Task 5/5: Update documentation | Claude Code (Task 5/5: Update documentation) |

### Session History

Sessions remain active after task completion, allowing users to:
- Review task execution history
- See full conversation with the agent
- Copy code or solutions from previous tasks
- Check commit messages and implementation details

Sessions can be accessed from:
- **iOS**: Sidebar → Session list
- **Android**: Drawer → Session list
- **Web**: Sidebar navigation

## Pause and Resume Behavior

### Agent Selection Persistence

**Pause:**
```
User: "pause" (during Task 2)
Result: Current task completes, harness pauses
Agent selection: ✅ PRESERVED
```

When resumed, the harness continues with the same agent that was selected.

**Resume:**
```
User: "resume"
Result: Harness continues with originally selected agent
Tasks 3-5: Execute with same agent (e.g., claude)
```

### Stopping and Restarting

**Stop:**
```
User: "stop"
Result: Harness stops immediately
Agent selection: ❌ RESET to null
```

When starting again, you'll be prompted to select an agent:

```
User: "start"
BacklogAgent: "Select a coding agent..." (full prompt again)
User: "cursor"
```

## Complete Workflow Example

### Session 1: Initial Run with Claude

```
Mobile App:
  User: "hey, start executing the backlog"

BacklogAgent: "🤖 Select a coding agent to execute the harness tasks:
             • claude: LLM-based code agent
             • cursor: VS Code with AI
             • opencode: OpenCode integration
             Please respond with the agent name"

User: "I want claude code"

BacklogAgent: "✅ Great! I'll use claude to execute the tasks.
             Now starting the harness...
             🚀 Harness started for main. 5 task(s) to execute."

Sidebar Updates:
  ✓ Task 1/5: Implement authentication (claude)
  ✓ Task 2/5: Create API endpoints (claude)
  [In progress] Task 3/5: Add database schema (claude)

User: "pause after this task completes"

BacklogAgent: "⏸️ Harness paused (current task will complete)."

[After Task 3 completes]

User: "show my progress"

BacklogAgent: "📊 Backlog Status: proj-123
             Progress: 3/5 tasks completed (60%)
             Breakdown:
             ✅ Completed: 3
             ⏸️ In Progress: 0
             ⬜ Pending: 2
             ❌ Failed: 0
             Harness Status: ⏸️ Paused"

User: "resume"

Sidebar Updates:
  ✓ Task 1/5: Implement authentication (claude)
  ✓ Task 2/5: Create API endpoints (claude)
  ✓ Task 3/5: Add database schema (claude)
  ✓ Task 4/5: Write unit tests (claude)
  [In progress] Task 5/5: Update documentation (claude)

[After Task 5 completes]

BacklogAgent: "🎉 Harness completed!
             All tasks executed successfully
             Duration: 15 minutes 23 seconds
             Completed: 5 | Failed: 0"
```

### Session 2: Resume with Different Agent

```
User: "I want to fix some failing tests. Start harness again."

BacklogAgent: "Select a coding agent:
             • claude: LLM-based code agent
             • cursor: VS Code with AI
             • opencode: OpenCode integration"

User: "this time use cursor"

BacklogAgent: "✅ Great! I'll use cursor to execute the tasks.
             Now starting the harness...
             🚀 Harness started. 0 pending task(s) remaining."

BacklogAgent: "All tasks have already been completed in the previous run.
             Would you like to:
             1. Reset task statuses and re-run with cursor?
             2. Add new tasks to the backlog?
             3. Review completed tasks?"
```

## Error Handling

### Invalid Agent Selection

```
User: "start"

BacklogAgent: "Select a coding agent:
             • claude: LLM-based code agent
             • cursor: VS Code with AI
             • opencode: OpenCode integration"

User: "xyzagent"

BacklogAgent: "❌ I didn't recognize that agent name.
             Here are the available options:
             • claude: LLM-based code agent
             • cursor: VS Code with AI
             • opencode: OpenCode integration
             Please try again."

User: "I'll use cursor"
[Harness starts normally]
```

### No Pending Tasks

```
User: "start"

BacklogAgent: "❌ No pending tasks to execute.
             Add tasks first using 'add task' command."
```

### Agent Configuration Issues

```
User: "start"

BacklogAgent: "Select a coding agent: • claude • cursor • opencode"

User: "claude"

BacklogAgent: "✅ Selected claude. Starting harness...

[Harness starts but agent fails to spawn]

BacklogAgent: "🔴 Harness error: Failed to spawn claude agent.
             Please check:
             1. Is 'claude' command in PATH?
             2. Check Agent API key (AGENT_API_KEY)?
             3. Review workstation logs for details"
```

## Configuration

### Environment Variables

```bash
# Base Agent API
export AGENT_API_KEY="sk-..."
export AGENT_PROVIDER="openai"
export AGENT_MODEL_NAME="gpt-4"

# Custom Agent Aliases
export AGENT_ALIAS_ZAI="claude --settings ~/.zai/settings.json"
export AGENT_ALIAS_CLAUDE_OPUS="claude --model opus"
export AGENT_ALIAS_CURSOR_PRO="cursor-agent --pro-mode"

# Hide base agents if desired
# export HIDE_BASE_AGENT_CLAUDE=true
# export HIDE_BASE_AGENT_CURSOR=true
```

### Enabling/Disabling Agents

Base agents can be hidden:

```bash
export HIDE_BASE_AGENT_CURSOR=true
```

Then BacklogAgent will only show:
```
• claude: LLM-based code agent
• opencode: OpenCode integration
• zai (alias): Custom setup
```

## Architecture Details

### State Management

```typescript
// BacklogAgentManager maintains:
private selectedAgent: string | null;           // Current agent choice
private agentSelectionInProgress: boolean;      // Waiting for user response

// Flow:
startHarnessCommand()
  ├─ Check if agent already selected
  ├─ If no → askForAgentSelection()
  │         └─ Return question, set agentSelectionInProgress = true
  ├─ executeCommand() with user response
  │  └─ handleAgentSelection()
  │     ├─ Validate agent name via findBestAgentMatch()
  │     ├─ Set selectedAgent = validated name
  │     ├─ Set agentSelectionInProgress = false
  │     └─ createAndStartHarness() with selectedAgent
  └─ On harness completion/stop → reset selectedAgent
```

### Matching Algorithm

The `findBestAgentMatch()` method uses 4 progressive passes:

1. **Exact Match**: "claude" == "claude"
2. **Substring Match**: "claude" in "use claude code"
3. **Pattern Matching**: "claude code" → "claude"
4. **Levenshtein Distance**: "cluade" ~= "claude" (if similarity > 60%)

### Session Creation

For each task:
```typescript
const taskIndex = tasks.findIndex(t => t.id === task.id) + 1;
const totalTasks = tasks.length;
const sessionId = `backlog-${backlogId}-task-${taskId}`;
const agentName = `Task ${taskIndex}/${totalTasks}: ${task.title}`;

agentSessionManager.createSession(
  selectedAgent,    // e.g., "claude", "cursor", "zai"
  workingDir,
  sessionId,
  agentName        // Displayed as: "Claude Code (Task 1/5: ...)"
);
```

## Advanced Usage

### Scripting/Automation

While primarily designed for interactive use, automation is possible:

```bash
# Via tunnel API
curl -X POST http://localhost:3001/ws \
  -H "Content-Type: application/json" \
  -d '{
    "type": "execute_backlog_command",
    "message": "start executing tasks with claude"
  }'
```

### Custom Agent Integration

To integrate a custom agent:

1. Create an alias in environment:
   ```bash
   export AGENT_ALIAS_MYAGENT="myagent-cli --config ~/.myagent"
   ```

2. BacklogAgent will automatically show it in selection:
   ```
   • myagent (alias): myagent-cli with custom config
   ```

3. User can select:
   ```
   User: "use my custom myagent"
   ```

### Multi-Agent Orchestration

Run same backlog with different agents:

```
Run 1: claude   (AI code generation)
Run 2: cursor   (Interactive refinement)
Run 3: myagent  (Custom analysis)
```

Each creates separate sessions visible in sidebar, allowing comparison of approaches.

## Troubleshooting

### Agent Selection Not Appearing

**Problem**: "start" command doesn't show agent selection prompt

**Solution**:
1. Check BacklogAgent is initialized: `status` command
2. Verify pending tasks exist: `list` command
3. Check logs for BacklogAgent errors
4. Ensure AGENT_API_KEY is set

### Agent Not Recognized

**Problem**: User response "I want claude" not recognized

**Solution**:
1. Check available agents: BacklogAgent shows list in prompt
2. Try exact name: "claude" instead of variations
3. Check for typos in custom aliases
4. View logs: Full user message logged for debugging

### Sessions Not Created

**Problem**: Tasks execute but no sessions appear in sidebar

**Solution**:
1. Check AgentSessionManager.createSession() logs
2. Verify agentName is valid (not null/undefined)
3. Check for encoding issues in task titles
4. Verify session ID format: `backlog-{id}-task-{taskId}`

### Agent Starts but Fails Mid-Task

**Problem**: Task starts with selected agent but fails execution

**Solution**:
1. Check selected agent's availability: `which claude`
2. Verify agent-specific environment variables
3. Check task prompt for invalid syntax
4. Review agent-specific error logs

## Related Documentation

- [IMPLEMENTATION_PLAN.md](../IMPLEMENTATION_PLAN.md) - Architecture and design
- [AGENT_SELECTION_TEST_SCENARIOS.md](../AGENT_SELECTION_TEST_SCENARIOS.md) - Testing guide
- [PROTOCOL.md](../PROTOCOL.md) - WebSocket protocol details
- [docs/TYPESCRIPT_SERVER_STACK.md](TYPESCRIPT_SERVER_STACK.md) - Server architecture

## Feedback and Issues

For issues or suggestions:
1. Check test scenarios: [AGENT_SELECTION_TEST_SCENARIOS.md](../AGENT_SELECTION_TEST_SCENARIOS.md)
2. Review architecture: [IMPLEMENTATION_PLAN.md](../IMPLEMENTATION_PLAN.md)
3. Report issues with detailed logs from workstation
