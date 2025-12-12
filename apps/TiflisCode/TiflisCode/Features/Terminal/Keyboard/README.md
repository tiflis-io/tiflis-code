# Terminal Keyboard

## Overview

Terminal keyboard integration using the standard iOS keyboard with a custom toolbar for terminal-specific keys.

## Architecture

```
Terminal/Keyboard/
├── TerminalToolbarView.swift  # Toolbar above standard iOS keyboard
├── KeyboardKey.swift          # Key component with touch handling
├── KeyboardTheme.swift        # Themes and metrics
└── README.md
```

## Terminal Toolbar

The toolbar appears above the standard iOS keyboard with terminal-specific keys:

```
⌨↓ | Esc | Tab | Ctrl | - | / | ~ | ← | ↓ | ↑ | → | ⌫
```

### Toolbar Keys

| Key  | Action           | Bytes            |
| ---- | ---------------- | ---------------- |
| ⌨↓   | Dismiss keyboard | -                |
| Esc  | Escape           | 0x1B             |
| Tab  | Tab              | 0x09             |
| Ctrl | Control modifier | -                |
| -    | Dash             | 0x2D             |
| /    | Slash            | 0x2F             |
| ~    | Tilde            | 0x7E             |
| ←    | Arrow Left       | ESC[D or ESC O D |
| ↓    | Arrow Down       | ESC[B or ESC O B |
| ↑    | Arrow Up         | ESC[A or ESC O A |
| →    | Arrow Right      | ESC[C or ESC O C |
| ⌫    | Backspace        | 0x08             |

### Arrow Key Modes

Arrow keys automatically detect terminal cursor mode:

- **Normal mode**: `ESC [ A/B/C/D`
- **Application cursor mode** (htop, vim, etc.): `ESC O A/B/C/D`

### Long Press Actions

| Key         | Action                     |
| ----------- | -------------------------- |
| ⌫ Backspace | Delete word (Ctrl+W, 0x17) |
| Esc         | Interrupt (Ctrl+C, 0x03)   |

## Usage

```swift
// In TerminalViewUIKit
let toolbar = TerminalToolbarView()
toolbar.delegate = self
terminalView.inputAccessoryView = toolbar
```

### Delegate

```swift
protocol TerminalToolbarDelegate: AnyObject {
    func toolbar(_ toolbar: TerminalToolbarView, didSendInput data: Data)
    func toolbarDidRequestDismiss(_ toolbar: TerminalToolbarView)
    func toolbarApplicationCursorMode(_ toolbar: TerminalToolbarView) -> Bool
}
```

## Theme Support

Automatic adaptation to system theme:

- **Light Theme**: Light gray background
- **Dark Theme**: Dark background matching iOS keyboard

## License

Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
Licensed under the FSL-1.1-NC. See LICENSE file for details.
