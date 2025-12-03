//
//  TerminalToolbarView.swift
//  TiflisCode
//
//  Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
//  Licensed under the MIT License. See LICENSE file for details.
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

    /// Query if terminal is in application cursor mode (for arrow keys)
    func toolbarApplicationCursorMode(_ toolbar: TerminalToolbarView) -> Bool
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

    /// Haptic feedback
    private let impactGenerator = UIImpactFeedbackGenerator(style: .light)

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

        let toolbarStack = UIStackView()
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

        // Toolbar buttons: Dismiss, Esc, Tab, -, /, ~, ← ↓ ↑ →, Backspace
        let toolbarConfigs: [KeyConfiguration] = [
            KeyConfiguration(type: .special(.dismiss)),
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

        for config in toolbarConfigs {
            let button = KeyboardKeyView(configuration: config)
            button.delegate = self
            button.applyTheme(theme)
            toolbarStack.addArrangedSubview(button)
            toolbarButtons.append(button)
        }

        impactGenerator.prepare()
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

        // Query application cursor mode for arrow keys
        let applicationCursor = delegate?.toolbarApplicationCursorMode(self) ?? false

        switch type {
        case .character(let char):
            let processed = modifierState.apply(to: char.first ?? Character(" "))
            bytes = Array(processed.utf8)

        case .special(let specialType):
            bytes = specialType.byteSequence(modifiers: modifierState, applicationCursor: applicationCursor)

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

        case .character, .special:
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
