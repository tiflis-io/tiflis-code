//
//  TerminalToolbarView.swift
//  TiflisCode
//
//  Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
//  Licensed under the Functional Source License (FSL-1.1-NC). See LICENSE file for details.
//

import UIKit

// MARK: - Terminal Toolbar Delegate

/// Delegate for toolbar input events
@MainActor
protocol TerminalToolbarDelegate: AnyObject {
    /// Send bytes to terminal
    func toolbar(_ toolbar: TerminalToolbarView, didSendInput data: Data)

    /// Request keyboard dismissal
    func toolbarDidRequestDismiss(_ toolbar: TerminalToolbarView)
}

// MARK: - Terminal Toolbar View

/// Toolbar with terminal-specific keys (Esc, Tab, Ctrl, arrows, etc.)
/// Used as inputAccessoryView above the standard iOS keyboard
final class TerminalToolbarView: UIView {

    // MARK: - Properties

    weak var delegate: TerminalToolbarDelegate?

    private var theme: KeyboardTheme = .light
    private var modifierState = ModifierState()

    /// Toolbar buttons
    private var toolbarButtons: [KeyboardKeyView] = []

    /// Reference to the toolbar stack view for dynamic rebuilding
    private var toolbarStack: UIStackView!

    /// Haptic feedback
    private let impactGenerator = UIImpactFeedbackGenerator(style: .light)

    // MARK: - Toolbar Configurations

    /// Normal mode toolbar configuration
    private let normalModeConfigs: [KeyConfiguration] = [
        KeyConfiguration(type: .special(.dismiss)),
        KeyConfiguration(type: .modifier(.control)),
        KeyConfiguration(type: .special(.escape)),
        KeyConfiguration(type: .special(.tab)),
        KeyConfiguration(type: .special(.dash)),
        KeyConfiguration(type: .special(.slash)),
        KeyConfiguration(type: .special(.tilde)),
        KeyConfiguration(type: .special(.arrowLeft)),
        KeyConfiguration(type: .special(.arrowDown)),
        KeyConfiguration(type: .special(.arrowUp)),
        KeyConfiguration(type: .special(.arrowRight)),
        KeyConfiguration(type: .special(.backspace))
    ]

    /// Control mode toolbar configuration (when Ctrl is active)
    /// Keys: C, R, L, O, K, B, W, X - common control combinations for terminal agents
    private let controlModeConfigs: [KeyConfiguration] = [
        KeyConfiguration(type: .special(.dismiss)),
        KeyConfiguration(type: .modifier(.control)),
        KeyConfiguration(type: .character("C")),  // Ctrl+C (0x03) - Interrupt/Cancel
        KeyConfiguration(type: .character("R")),  // Ctrl+R (0x12) - History search
        KeyConfiguration(type: .character("L")),  // Ctrl+L (0x0C) - Clear screen
        KeyConfiguration(type: .character("O")),  // Ctrl+O (0x0F) - Toggle output
        KeyConfiguration(type: .character("K")),  // Ctrl+K (0x0B) - Kill line
        KeyConfiguration(type: .character("B")),  // Ctrl+B (0x02) - Background
        KeyConfiguration(type: .character("W")),  // Ctrl+W (0x17) - Delete word
        KeyConfiguration(type: .character("X")),  // Ctrl+X (0x18) - Cancel/Leader
        KeyConfiguration(type: .special(.backspace))
    ]

    // MARK: - Initialization

    override init(frame: CGRect) {
        super.init(frame: frame)
        setupUI()
        registerTraitChangeObservers()
    }

    required init?(coder: NSCoder) {
        super.init(coder: coder)
        setupUI()
        registerTraitChangeObservers()
    }

    /// Register for trait changes on iOS 17+ (new API)
    private func registerTraitChangeObservers() {
        if #available(iOS 17.0, *) {
            registerForTraitChanges([UITraitUserInterfaceStyle.self]) { (changedView: Self, _: UITraitCollection) in
                let newTheme = KeyboardTheme.theme(for: changedView.traitCollection.userInterfaceStyle)
                changedView.applyTheme(newTheme)
            }
        }
    }

    override var intrinsicContentSize: CGSize {
        return CGSize(width: UIView.noIntrinsicMetric, height: KeyboardMetrics.terminalToolbarHeight)
    }

    override func didMoveToWindow() {
        super.didMoveToWindow()

        // Apply correct theme when added to window
        if window != nil {
            let detectedTheme = KeyboardTheme.theme(for: traitCollection.userInterfaceStyle)
            applyTheme(detectedTheme)
        }
    }

    // MARK: - Setup

    private func setupUI() {
        backgroundColor = theme.toolbarBackgroundColor
        autoresizingMask = [.flexibleWidth]

        toolbarStack = UIStackView()
        toolbarStack.translatesAutoresizingMaskIntoConstraints = false
        toolbarStack.axis = .horizontal
        toolbarStack.distribution = .fillEqually
        toolbarStack.spacing = 6
        toolbarStack.alignment = .fill

        addSubview(toolbarStack)

        NSLayoutConstraint.activate([
            toolbarStack.topAnchor.constraint(equalTo: topAnchor, constant: 4),
            toolbarStack.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 4),
            toolbarStack.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -4),
            toolbarStack.bottomAnchor.constraint(equalTo: bottomAnchor, constant: -4)
        ])

        // Build toolbar with normal mode configuration
        rebuildToolbar(controlMode: false)

        impactGenerator.prepare()
    }

    // MARK: - Dynamic Toolbar Rebuild

    /// Rebuilds the toolbar with either normal or control mode buttons
    private func rebuildToolbar(controlMode: Bool) {
        // Remove existing buttons
        for button in toolbarButtons {
            button.removeFromSuperview()
        }
        toolbarButtons.removeAll()

        // Choose configuration based on mode
        let configs = controlMode ? controlModeConfigs : normalModeConfigs

        // Build new buttons
        for config in configs {
            let button = KeyboardKeyView(configuration: config)
            button.delegate = self
            button.applyTheme(theme)
            toolbarStack.addArrangedSubview(button)
            toolbarButtons.append(button)
        }

        // Update Control button state to reflect active status
        updateModifierButtons()
    }

    // MARK: - Theme

    func applyTheme(_ theme: KeyboardTheme) {
        self.theme = theme
        backgroundColor = theme.toolbarBackgroundColor

        for button in toolbarButtons {
            button.applyTheme(theme)
        }
    }

    @available(iOS, deprecated: 17.0, message: "Use registerForTraitChanges for iOS 17+")
    override func traitCollectionDidChange(_ previousTraitCollection: UITraitCollection?) {
        super.traitCollectionDidChange(previousTraitCollection)

        guard #unavailable(iOS 17.0) else { return }

        if traitCollection.hasDifferentColorAppearance(comparedTo: previousTraitCollection) {
            let newTheme = KeyboardTheme.theme(for: traitCollection.userInterfaceStyle)
            applyTheme(newTheme)
        }
    }

    // MARK: - Modifier State

    private func toggleModifier(_ type: ModifierKeyType) {
        switch type {
        case .control:
            modifierState.control.toggle()
            // Rebuild toolbar with control mode keys when Control is active
            rebuildToolbar(controlMode: modifierState.control)
        case .shift:
            modifierState.shift.toggle()
        case .capsLock:
            modifierState.capsLock.toggle()
        case .alt:
            modifierState.alt.toggle()
        }

        updateModifierButtons()
    }

    private func updateModifierButtons() {
        for button in toolbarButtons {
            if case .modifier(let type) = button.configuration.type {
                switch type {
                case .control:
                    button.setModifierActive(modifierState.control)
                case .shift:
                    button.setModifierActive(modifierState.shift)
                case .capsLock:
                    button.setModifierActive(modifierState.capsLock)
                case .alt:
                    button.setModifierActive(modifierState.alt)
                }
            }
        }
    }

    // MARK: - Input Processing

    private func sendInput(for type: KeyType) {
        let bytes: [UInt8]

        switch type {
        case .character(let char):
            let processed = modifierState.apply(to: char.first ?? Character(" "))
            bytes = Array(processed.utf8)

        case .special(let specialType):
            bytes = specialType.byteSequence(modifiers: modifierState)

        case .modifier:
            return

        case .layoutSwitch:
            return
        }

        if !bytes.isEmpty {
            delegate?.toolbar(self, didSendInput: Data(bytes))
        }
    }
}

// MARK: - KeyboardKeyDelegate

extension TerminalToolbarView: KeyboardKeyDelegate {

    func keyDidPress(_ key: KeyboardKeyView, type: KeyType) {
        impactGenerator.impactOccurred()

        switch type {
        case .modifier(let modType):
            toggleModifier(modType)

        case .special(.dismiss):
            delegate?.toolbarDidRequestDismiss(self)

        case .character:
            sendInput(for: type)
            // Reset Control mode after sending a control character
            if modifierState.control {
                modifierState.control = false
                rebuildToolbar(controlMode: false)
            }

        case .special:
            sendInput(for: type)

        case .layoutSwitch:
            break
        }
    }

    func keyDidRelease(_ key: KeyboardKeyView, type: KeyType) {
        // Nothing to do on release for toolbar
    }

    func keyDidLongPress(_ key: KeyboardKeyView, type: KeyType) {
        switch type {
        case .special(.backspace):
            // Long press backspace - delete word (Ctrl+W)
            delegate?.toolbar(self, didSendInput: Data([0x17]))

        case .special(.escape):
            // Long press Esc - interrupt (Ctrl+C)
            delegate?.toolbar(self, didSendInput: Data([0x03]))

        default:
            break
        }
    }
}
