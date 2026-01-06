# BacklogAgent Interactive Agent Selection - Test Scenarios

## Overview

This document describes comprehensive test scenarios for the new interactive agent selection feature in BacklogAgent.

## Test Environment Setup

```bash
# 1. Start the workstation server
pnpm dev

# 2. Create a test backlog with multiple tasks
# Via API or mobile app, create a backlog session with 3+ pending tasks

# 3. Connect mobile client (iOS/Android) or use web client
# At http://localhost:3001/ (web)
```

## Test Scenarios

### 1. Basic Agent Selection Flow

**Scenario 1.1: Direct Agent Name**
```
User: "start executing"
Agent: "Which agent to use? • claude • cursor • opencode"
User: "claude"
Expected: ✅ Harness starts with Claude agent
```

**Scenario 1.2: Agent Name with Word Wrapping**
```
User: "start"
Agent: "Which agent?"
User: "i want to use claude"
Expected: ✅ Matches "claude" from "i want to use claude"
```

**Scenario 1.3: Exact Agent Name Match**
```
User: "start"
Agent: "Which agent?"
User: "cursor"
Expected: ✅ Matches exactly, starts harness
```

### 2. Natural Language Variations

**Scenario 2.1: "Claude Code" Pattern**
```
User: "start harness"
Agent: "Which agent?"
User: "claude code"
Expected: ✅ Recognized as "claude" agent
```

**Scenario 2.2: "Cursor Agent" Pattern**
```
User: "execute tasks"
Agent: "Which agent?"
User: "use cursor agent"
Expected: ✅ Recognized as "cursor" agent
```

**Scenario 2.3: OpenCode Variations**
```
User: "start"
Agent: "Which agent?"
User: "open code"
Expected: ✅ Recognized as "opencode" agent
```

**Scenario 2.4: Hyphenated Variations**
```
User: "start"
Agent: "Which agent?"
User: "claude-code"
Expected: ✅ Recognized as "claude" agent
```

### 3. Custom Alias Support

**Scenario 3.1: Using Custom Alias**
```
Prerequisite: AGENT_ALIAS_ZAI="claude --settings ~/.zai/settings.json" set

User: "start"
Agent: "Which agent? • claude • cursor • opencode • zai (alias) ..."
User: "zai"
Expected: ✅ Harness starts with zai alias
Task Session: "Task 1/5: Implement auth" runs via zai configuration
```

**Scenario 3.2: Alias with Natural Language**
```
Prerequisite: AGENT_ALIAS_CLAUDE_OPUS="claude --model opus" set

User: "start"
Agent: "Which agent? ... • claude-opus (alias) ..."
User: "i want to use my claude-opus setup"
Expected: ✅ Matches claude-opus alias
```

**Scenario 3.3: Multiple Aliases**
```
Prerequisite:
- AGENT_ALIAS_ZAI="claude ..."
- AGENT_ALIAS_CURSOR_PRO="cursor-agent --pro-mode"

User: "start"
Agent: "Which agent? • claude • cursor • opencode • zai (alias) • cursor-pro (alias)"
User: "cursor pro"
Expected: ✅ Recognized as "cursor-pro" alias
```

### 4. Session Naming Verification

**Scenario 4.1: Unique Session Per Task**
```
Setup: 5-task backlog, select "claude"

Expected Sessions Created:
- Session 1: backlog-proj-task-1 | Name: "Task 1/5: Implement auth"
- Session 2: backlog-proj-task-2 | Name: "Task 2/5: Create API endpoints"
- Session 3: backlog-proj-task-3 | Name: "Task 3/5: Add database schema"
- Session 4: backlog-proj-task-4 | Name: "Task 4/5: Write unit tests"
- Session 5: backlog-proj-task-5 | Name: "Task 5/5: Update documentation"

iOS Display: "Claude Code (Task 1/5: Implement auth)"
```

**Scenario 4.2: Task Title with Special Characters**
```
Task Title: "Fix: Auth #123 - Implement OAuth 2.0"
Expected Session Name: "Task 1/3: Fix: Auth #123 - Implement OAuth 2.0"
iOS Display: "Claude Code (Task 1/3: Fix: Auth #123 - Implement OAuth 2.0)"
```

**Scenario 4.3: Long Task Title Truncation (if applicable)**
```
Task Title: "Implement extremely long task title that exceeds normal length"
Expected: Full title preserved in session name
```

### 5. Error Handling

**Scenario 5.1: Invalid Agent Name**
```
User: "start"
Agent: "Which agent? • claude • cursor • opencode"
User: "xyzagent"
Expected:
  ❌ I didn't recognize that agent name. Here are the available options:
  • claude: ...
  • cursor: ...
  • opencode: ...
  Please try again.
```

**Scenario 5.2: Agent Name with Typo (Levenshtein Matching)**
```
User: "start"
Agent: "Which agent?"
User: "cluade"  (typo: should be "claude")
Expected: ✅ Recognized as "claude" if similarity > 60%
```

**Scenario 5.3: Partial Fuzzy Match Rejection**
```
User: "start"
Agent: "Which agent?"
User: "clawed"  (too different from any agent)
Expected: ❌ Not recognized, ask again
```

### 6. Pause/Resume with Agent Selection

**Scenario 6.1: Pause Preserves Agent Selection**
```
User: "start" → selects "claude" → Harness running
User: "pause" (after Task 1 completes)
Expected: selectedAgent = "claude" (preserved)
User: "resume"
Expected: ✅ Harness continues with same "claude" agent
```

**Scenario 6.2: Stop Resets Agent Selection**
```
User: "start" → selects "claude" → Harness running
User: "stop"
Expected:
  selectedAgent = null
  agentSelectionInProgress = false
User: "start" (again)
Expected: ✅ Agent selection prompted again
```

**Scenario 6.3: Resume Without Stop**
```
User: "start" → "claude" → Task 1 executes
User: "pause" (during Task 1)
User: "resume"
User: "pause" (during Task 2)
User: "resume"
Expected: ✅ Same agent ("claude") continues throughout
```

### 7. Multiple Consecutive Harness Runs

**Scenario 7.1: Switch Agent Between Runs**
```
Run 1:
  User: "start" → "claude"
  Tasks 1-3 execute with claude
  Harness completes naturally

Run 2:
  User: "start" → "cursor"
  Tasks 4-5 execute with cursor
  Harness completes
Expected: ✅ Both runs successful with different agents
```

**Scenario 7.2: Reuse Same Agent**
```
Run 1: start → "claude" → completes
Run 2: start → "claude" → completes
Expected: ✅ Both runs use same agent
```

### 8. Edge Cases

**Scenario 8.1: Empty User Response**
```
User: "start"
Agent: "Which agent?"
User: "" (empty message)
Expected: ❌ Not recognized, ask again
```

**Scenario 8.2: Response with Only Special Characters**
```
User: "start"
Agent: "Which agent?"
User: "!@#$%"
Expected: ❌ Not recognized, ask again
```

**Scenario 8.3: Case Insensitivity**
```
User: "start"
Agent: "Which agent?"
User: "CLAUDE"
Expected: ✅ Recognized as "claude"
```

**Scenario 8.4: Agent Name Embedded in Sentence**
```
User: "start"
Agent: "Which agent?"
User: "I think I should use cursor for this task"
Expected: ✅ Recognized as "cursor"
```

**Scenario 8.5: Multiple Agent Names (First Match)**
```
Available agents: "open", "opencode"
User: "start"
Agent: "Which agent? • open • opencode"
User: "i want opencode"
Expected: ✅ Matches "opencode" (exact longer match or first encountered)
```

## Testing Checklist

### Phase 1: Basic Functionality
- [ ] Agent selection prompts on "start"
- [ ] Direct agent name selection works (claude, cursor, opencode)
- [ ] Invalid agent name shows error and re-prompts
- [ ] Harness starts after valid selection
- [ ] Sessions created with correct naming (Task N/M: title)

### Phase 2: Natural Language
- [ ] "claude code" → recognized as claude
- [ ] "cursor agent" → recognized as cursor
- [ ] "open code" → recognized as opencode
- [ ] Typo matching (Levenshtein) works
- [ ] Case insensitivity works

### Phase 3: Aliases
- [ ] Custom aliases shown in agent list
- [ ] Custom alias selection works
- [ ] Custom alias with natural language works
- [ ] Multiple aliases work independently

### Phase 4: Session Management
- [ ] Each task gets unique session with Task N/M naming
- [ ] Session names visible in iOS/Android/Web UI
- [ ] Sessions remain active after completion
- [ ] Can view history in each session

### Phase 5: Pause/Resume
- [ ] Pause preserves selectedAgent
- [ ] Resume uses same agent
- [ ] Stop resets selectedAgent
- [ ] Next start re-prompts for agent

### Phase 6: Edge Cases
- [ ] Empty response handled
- [ ] Special characters handled
- [ ] Very long task titles handled
- [ ] Multiple agent name parts handled correctly

## Automated Test Structure

```typescript
describe('BacklogAgent Interactive Agent Selection', () => {
  describe('findBestAgentMatch', () => {
    it('should match exact agent names', () => {
      expect(findBestAgentMatch('claude', ['claude', 'cursor', 'opencode'])).toBe('claude');
    });

    it('should match case-insensitively', () => {
      expect(findBestAgentMatch('CLAUDE', ['claude', 'cursor', 'opencode'])).toBe('claude');
    });

    it('should match common variations', () => {
      expect(findBestAgentMatch('claude code', ['claude', 'cursor'])).toBe('claude');
      expect(findBestAgentMatch('cursor agent', ['claude', 'cursor'])).toBe('cursor');
    });

    it('should use Levenshtein distance for typos', () => {
      expect(findBestAgentMatch('cluade', ['claude', 'cursor'])).toBe('claude');
    });

    it('should reject if no good match', () => {
      expect(findBestAgentMatch('xyzagent', ['claude', 'cursor'])).toBeNull();
    });
  });
});
```

## Performance Notes

- Levenshtein distance calculated only for aliases when substring/pattern matching fails
- Matrix size: at most ~20 chars × ~20 chars, negligible performance impact
- Matching completes in < 5ms per user input

## UI/UX Observations

### iOS Display
```
Chat: "Start executing tasks"
Agent: "🤖 **Select a coding agent**
• **claude**: LLM-based code agent
• **cursor**: VS Code with AI
• **opencode**: OpenCode integration
• **zai** (alias): Custom claude setup"

User: "I'll use claude"
Agent: "✅ Great! I'll use **claude** to execute the tasks.
Now starting the harness...
🚀 Harness started for main. 5 task(s) to execute."

Sessions created:
→ Task 1/5: Implement auth
→ Task 2/5: Create API endpoints
...
```

### Android/Web Similar

## Known Limitations

1. **No confirmation dialog for agent selection** - Selecting "claude" immediately starts harness
2. **No agent change mid-harness** - Can only change agent via stop/start cycle
3. **Session order** - Sessions named by internal task ID, not execution order
4. **Alias environment variables** - Assumed constant during harness execution

## Future Enhancements

- [ ] Confirmation dialog before harness start
- [ ] Agent switching without full stop/start
- [ ] Better session ordering UI
- [ ] Per-task agent override
- [ ] Agent performance metrics in UI
