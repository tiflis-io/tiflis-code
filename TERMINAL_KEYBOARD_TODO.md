# Terminal Keyboard & Terminal Issues TODO

## Issue 1: Missing Control Key in Custom Keyboard

### Problem
The custom keyboard top bar is missing a Control key, which is essential for many console applications.

### Requirements
1. **Add Control key** to the top toolbar of the custom terminal keyboard
2. **Toggle functionality**: Control key should act as a modifier that can be toggled on/off
3. **Dynamic button replacement**: When Control is pressed:
   - Replace buttons on the right side with commonly used terminal keys
   - Show ESC, TAB, and other terminal-specific keys
   - TAB should already exist, reposition if needed
   - Add CROT (likely means Ctrl+R, Ctrl+O, Ctrl+T - need clarification)
4. **Return to normal mode**: When Control is pressed again (toggle off), return buttons to their original state

### Implementation Notes
- Control key should have special icon (already designed)
- Right-side buttons in the toolbar need to be dynamically replaceable
- State management for Control key toggle status
- Visual indication when Control is active

## Issue 2: Terminal Buffer Size & Stability Issues

### Problem
Terminal applications exhibit unstable behavior with small buffer sizes, leading to display issues.

### Symptoms
1. **Screen instability**: Terminal doesn't stabilize properly with few rows
2. **Temporary fix**: Hiding keyboard or increasing screen size sometimes helps
3. **Infinite scrolling**: In some applications (like plz-based tools), terminal gets stuck in infinite up/down scrolling
4. **Application-specific**: Issues appear with long-running terminal operations that output a lot of content

### Investigation Areas
1. **Buffer size configuration**: Check if terminal buffer is too small for certain applications
2. **SwiftTerm configuration**: Review terminal emulation settings
3. **Scroll handling**: Fix scrollback buffer behavior
4. **PTTY size reporting**: Ensure terminal size is correctly reported to applications
5. **Race conditions**: Check for issues during rapid terminal output

### Testing Scenarios
- Applications with long-running operations
- Tools with continuous output streams
- Scenarios requiring scrollback functionality
- Different terminal window sizes