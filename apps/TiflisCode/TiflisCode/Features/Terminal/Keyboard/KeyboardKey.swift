//
//  KeyboardKey.swift
//  TiflisCode
//
//  Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
//  Licensed under the Functional Source License (FSL-1.1-NC). See LICENSE file for details.
//

import UIKit

// MARK: - Key Type

/// Keyboard key type
enum KeyType: Equatable {
    /// Letter/symbol key
    case character(String)
    
    /// Special key (Backspace, Enter, Space, etc.)
    case special(SpecialKeyType)
    
    /// Modifier (Shift, Ctrl, Alt)
    case modifier(ModifierKeyType)
    
    /// Layout switcher
    case layoutSwitch(KeyboardLayout)
    
    /// Get display text
    var displayText: String {
        switch self {
        case .character(let char):
            return char
        case .special(let type):
            return type.displayText
        case .modifier(let type):
            return type.displayText
        case .layoutSwitch(let layout):
            return layout.switchButtonTitle
        }
    }
    
    /// Is this a functional key (not a letter)?
    var isFunctional: Bool {
        switch self {
        case .character:
            return false
        case .special, .modifier, .layoutSwitch:
            return true
        }
    }
}

/// Special key types
enum SpecialKeyType: Equatable {
    case backspace
    case enter
    case space
    case tab
    case escape
    case delete
    case arrowUp
    case arrowDown
    case arrowLeft
    case arrowRight
    case home
    case end
    case pageUp
    case pageDown
    case dismiss
    case languageSwitch
    case microphone
    case dash
    case slash
    case tilde

    var displayText: String {
        switch self {
        case .backspace: return ""  // Uses SF Symbol
        case .enter: return ""  // Uses SF Symbol
        case .space: return ""  // Uses SF Symbol
        case .tab: return ""  // Uses SF Symbol
        case .escape: return "esc"
        case .delete: return "⌦"
        case .arrowUp: return ""  // Uses SF Symbol
        case .arrowDown: return ""  // Uses SF Symbol
        case .arrowLeft: return ""  // Uses SF Symbol
        case .arrowRight: return ""  // Uses SF Symbol
        case .home: return "Home"
        case .end: return "End"
        case .pageUp: return "PgUp"
        case .pageDown: return "PgDn"
        case .dismiss: return ""  // Uses SF Symbol
        case .languageSwitch: return ""  // Uses SF Symbol
        case .microphone: return ""  // Uses SF Symbol
        case .dash: return "-"
        case .slash: return "/"
        case .tilde: return "~"
        }
    }

    /// SF Symbol name for keys that use symbols
    var sfSymbolName: String? {
        switch self {
        case .backspace: return "delete.backward"
        case .enter: return "return.left"
        case .space: return "space"
        case .tab: return "arrow.right.to.line.compact"
        case .arrowUp: return "arrow.up"
        case .arrowDown: return "arrow.down"
        case .arrowLeft: return "arrow.left"
        case .arrowRight: return "arrow.right"
        case .dismiss: return "keyboard.chevron.compact.down"
        case .languageSwitch: return "globe"
        case .microphone: return "mic.fill"
        default: return nil
        }
    }
    
    /// Byte sequence for terminal
    /// - Parameters:
    ///   - modifiers: Current modifier state
    func byteSequence(modifiers: ModifierState = ModifierState()) -> [UInt8] {
        switch self {
        case .backspace: return [0x08]
        case .enter: return [0x0D]
        case .space: return [0x20]
        case .tab: return [0x09]
        case .escape: return [0x1B]
        case .delete: return [0x7F]
        // Arrow keys: Always use application cursor mode sequences (ESC O X)
        // This ensures consistent behavior in TUI apps like htop, vim, etc.
        case .arrowUp: return [0x1B, 0x4F, 0x41]
        case .arrowDown: return [0x1B, 0x4F, 0x42]
        case .arrowRight: return [0x1B, 0x4F, 0x43]
        case .arrowLeft: return [0x1B, 0x4F, 0x44]
        case .home: return [0x1B, 0x5B, 0x48]
        case .end: return [0x1B, 0x5B, 0x46]
        case .pageUp: return [0x1B, 0x5B, 0x35, 0x7E]
        case .pageDown: return [0x1B, 0x5B, 0x36, 0x7E]
        case .dismiss: return []
        case .languageSwitch: return []
        case .microphone: return []  // No terminal bytes (UI action only)
        case .dash: return [0x2D]  // ASCII -
        case .slash: return [0x2F]  // ASCII /
        case .tilde: return [0x7E]  // ASCII ~
        }
    }

    /// Supports auto-repeat
    var supportsAutoRepeat: Bool {
        switch self {
        case .backspace, .delete, .arrowUp, .arrowDown, .arrowLeft, .arrowRight, .space:
            return true
        default:
            return false
        }
    }
}

/// Modifier types
enum ModifierKeyType: Equatable {
    case shift
    case capsLock
    case control
    case alt

    var displayText: String {
        switch self {
        case .shift: return ""  // Uses SF Symbol
        case .capsLock: return "⇪"
        case .control: return ""  // Uses SF Symbol
        case .alt: return "⌥"
        }
    }

    /// Icon for active state
    var activeDisplayText: String {
        switch self {
        case .shift: return ""  // Uses SF Symbol (shift.fill)
        case .capsLock: return "⇪"
        case .control: return ""  // Uses SF Symbol
        case .alt: return "⌥"
        }
    }

    /// SF Symbol name for modifier keys
    var sfSymbolName: String? {
        switch self {
        case .shift: return "shift"
        case .control: return "control"
        default: return nil
        }
    }

    /// SF Symbol name for active state
    var activeSfSymbolName: String? {
        switch self {
        case .shift: return "shift.fill"
        case .control: return "control"
        default: return nil
        }
    }
}

// MARK: - Key Width

/// Key width relative to standard letter key
enum KeyWidth {
    /// Standard letter key width (calculated dynamically)
    case standard
    
    /// Shift/Backspace key (1.0x standard width, but fixed)
    case shift
    
    /// Layout switcher key (123/ABC)
    case layoutSwitch
    
    /// Space bar (fills remaining space)
    case space
    
    /// Return key
    case returnKey
    
    /// Custom width in points
    case fixed(CGFloat)
}

// MARK: - Key Configuration

/// Keyboard key configuration
struct KeyConfiguration {
    let type: KeyType
    let width: KeyWidth
    let secondaryText: String?
    
    init(type: KeyType, width: KeyWidth = .standard, secondaryText: String? = nil) {
        self.type = type
        self.width = width
        self.secondaryText = secondaryText
    }
    
    /// Quick creation of letter key
    static func letter(_ char: String) -> KeyConfiguration {
        return KeyConfiguration(type: .character(char.lowercased()))
    }
    
    /// Quick creation of symbol key
    static func symbol(_ char: String, secondary: String? = nil) -> KeyConfiguration {
        return KeyConfiguration(type: .character(char), secondaryText: secondary)
    }
}

// MARK: - Keyboard Key Delegate

/// Delegate for handling keyboard events
@MainActor
protocol KeyboardKeyDelegate: AnyObject {
    func keyDidPress(_ key: KeyboardKeyView, type: KeyType)
    func keyDidRelease(_ key: KeyboardKeyView, type: KeyType)
    func keyDidLongPress(_ key: KeyboardKeyView, type: KeyType)
}

// MARK: - Keyboard Key View

/// Keyboard key that exactly matches native iOS
final class KeyboardKeyView: UIView {
    
    // MARK: - Properties

    weak var delegate: KeyboardKeyDelegate?

    let configuration: KeyConfiguration
    private var theme: KeyboardTheme = .light
    private var isPressed = false
    private var isModifierActive = false

    /// Flag to indicate this is a bottom row button (transparent background)
    var isBottomRowButton = false {
        didSet {
            if isBottomRowButton {
                // Update icon size constraints for bottom row buttons (1.2x larger)
                imageWidthConstraint?.constant = 26  // 20 * 1.3 for better visibility
                imageHeightConstraint?.constant = 26
            }
        }
    }

    // MARK: - Constraints

    private var imageWidthConstraint: NSLayoutConstraint?
    private var imageHeightConstraint: NSLayoutConstraint?

    // MARK: - UI Components

    /// Main key with background and shadow
    private let backgroundView: UIView = {
        let view = UIView()
        view.translatesAutoresizingMaskIntoConstraints = false
        view.layer.cornerRadius = KeyboardMetrics.keyCornerRadius
        return view
    }()
    
    /// Main key text
    private let primaryLabel: UILabel = {
        let label = UILabel()
        label.translatesAutoresizingMaskIntoConstraints = false
        label.textAlignment = .center
        label.adjustsFontSizeToFitWidth = true
        label.minimumScaleFactor = 0.7
        return label
    }()

    /// SF Symbol for key (used instead of text for some keys)
    private let primaryImageView: UIImageView = {
        let imageView = UIImageView()
        imageView.translatesAutoresizingMaskIntoConstraints = false
        imageView.contentMode = .scaleAspectFit
        imageView.isHidden = true
        return imageView
    }()

    /// Secondary text (symbol above number)
    private let secondaryLabel: UILabel = {
        let label = UILabel()
        label.translatesAutoresizingMaskIntoConstraints = false
        label.textAlignment = .center
        label.font = UIFont.systemFont(ofSize: 10)
        label.isHidden = true
        return label
    }()
    
    // MARK: - Auto-Repeat

    /// Timer for auto-repeat functionality
    /// Note: Uses nonisolated(unsafe) to allow cleanup in deinit
    /// This is safe because Timer is invalidated on the same thread it was created (main)
    nonisolated(unsafe) private var autoRepeatTimer: Timer?
    private var autoRepeatStartTime: CFTimeInterval = 0
    
    // MARK: - Initialization
    
    init(configuration: KeyConfiguration) {
        self.configuration = configuration
        super.init(frame: .zero)
        setupView()
    }
    
    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }
    
    // MARK: - Setup
    
    private func setupView() {
        translatesAutoresizingMaskIntoConstraints = false

        // Add background view
        addSubview(backgroundView)
        backgroundView.addSubview(primaryLabel)
        backgroundView.addSubview(primaryImageView)
        backgroundView.addSubview(secondaryLabel)
        
        // Background constraints
        NSLayoutConstraint.activate([
            backgroundView.topAnchor.constraint(equalTo: topAnchor),
            backgroundView.leadingAnchor.constraint(equalTo: leadingAnchor),
            backgroundView.trailingAnchor.constraint(equalTo: trailingAnchor),
            backgroundView.bottomAnchor.constraint(equalTo: bottomAnchor, constant: -KeyboardMetrics.keyShadowOffsetY)
        ])
        
        // Main text constraints
        NSLayoutConstraint.activate([
            primaryLabel.centerXAnchor.constraint(equalTo: backgroundView.centerXAnchor),
            primaryLabel.centerYAnchor.constraint(equalTo: backgroundView.centerYAnchor),
            primaryLabel.leadingAnchor.constraint(greaterThanOrEqualTo: backgroundView.leadingAnchor, constant: 4),
            primaryLabel.trailingAnchor.constraint(lessThanOrEqualTo: backgroundView.trailingAnchor, constant: -4)
        ])

        // SF Symbol constraints (same position as text)
        imageWidthConstraint = primaryImageView.widthAnchor.constraint(equalToConstant: 20)
        imageHeightConstraint = primaryImageView.heightAnchor.constraint(equalToConstant: 20)

        NSLayoutConstraint.activate([
            primaryImageView.centerXAnchor.constraint(equalTo: backgroundView.centerXAnchor),
            primaryImageView.centerYAnchor.constraint(equalTo: backgroundView.centerYAnchor),
            imageWidthConstraint!,
            imageHeightConstraint!
        ])

        // Secondary text constraints
        NSLayoutConstraint.activate([
            secondaryLabel.centerXAnchor.constraint(equalTo: backgroundView.centerXAnchor),
            secondaryLabel.topAnchor.constraint(equalTo: backgroundView.topAnchor, constant: 2)
        ])
        
        // Setup view based on key type
        setupAppearance()
        setupGestures()
    }
    
    private func setupAppearance() {
        // Font depends on key type
        switch configuration.type {
        case .character:
            primaryLabel.font = UIFont.systemFont(ofSize: 22, weight: .regular)
        case .special(let type):
            switch type {
            case .enter:
                primaryLabel.font = UIFont.systemFont(ofSize: 16, weight: .regular)
            case .backspace, .delete:
                primaryLabel.font = UIFont.systemFont(ofSize: 22, weight: .light)
            case .escape, .tab:
                // Toolbar buttons - consistent font size
                primaryLabel.font = UIFont.systemFont(ofSize: 15, weight: .regular)
            default:
                primaryLabel.font = UIFont.systemFont(ofSize: 15, weight: .regular)
            }
        case .modifier(let type):
            // Ctrl in toolbar should match Esc/Tab size
            switch type {
            case .control:
                primaryLabel.font = UIFont.systemFont(ofSize: 15, weight: .regular)
            default:
                primaryLabel.font = UIFont.systemFont(ofSize: 20, weight: .regular)
            }
        case .layoutSwitch:
            primaryLabel.font = UIFont.systemFont(ofSize: 15, weight: .regular)
        }
        
        // Update text
        updateDisplayText()
        
        // Show secondary text if exists
        if let secondary = configuration.secondaryText, !secondary.isEmpty {
            secondaryLabel.text = secondary
            secondaryLabel.isHidden = false
        }
    }
    
    private func setupGestures() {
        // Tap gesture
        let tap = UITapGestureRecognizer(target: self, action: #selector(handleTap))
        addGestureRecognizer(tap)
        
        // Long press for auto-repeat and special actions
        let longPress = UILongPressGestureRecognizer(target: self, action: #selector(handleLongPress(_:)))
        longPress.minimumPressDuration = 0.4
        addGestureRecognizer(longPress)
        
        // Touch tracking for visual feedback
        isUserInteractionEnabled = true
    }
    
    // MARK: - Touch Handling
    
    override func touchesBegan(_ touches: Set<UITouch>, with event: UIEvent?) {
        super.touchesBegan(touches, with: event)
        setPressed(true)
        
        // Send key press event (for modifiers)
        delegate?.keyDidPress(self, type: configuration.type)
        
        // Start auto-repeat for supported keys
        if case .special(let type) = configuration.type, type.supportsAutoRepeat {
            startAutoRepeat()
        }
    }
    
    override func touchesEnded(_ touches: Set<UITouch>, with event: UIEvent?) {
        super.touchesEnded(touches, with: event)
        setPressed(false)
        stopAutoRepeat()
        
        delegate?.keyDidRelease(self, type: configuration.type)
    }
    
    override func touchesCancelled(_ touches: Set<UITouch>, with event: UIEvent?) {
        super.touchesCancelled(touches, with: event)
        setPressed(false)
        stopAutoRepeat()
    }
    
    // MARK: - Actions
    
    @objc private func handleTap() {
        // Already handled in touchesBegan/Ended
    }
    
    @objc private func handleLongPress(_ gesture: UILongPressGestureRecognizer) {
        if gesture.state == .began {
            delegate?.keyDidLongPress(self, type: configuration.type)
        }
    }
    
    // MARK: - Auto-Repeat
    
    private func startAutoRepeat() {
        autoRepeatStartTime = CACurrentMediaTime()
        autoRepeatTimer = Timer.scheduledTimer(withTimeInterval: 0.05, repeats: true) { [weak self] _ in
            // Timer callback may run on arbitrary thread, dispatch to main
            DispatchQueue.main.async {
                self?.checkAutoRepeat()
            }
        }
    }

    private func stopAutoRepeat() {
        autoRepeatTimer?.invalidate()
        autoRepeatTimer = nil
    }

    private func checkAutoRepeat() {
        let elapsed = CACurrentMediaTime() - autoRepeatStartTime

        // Start repeat after 500ms, then every 50ms
        if elapsed > 0.5 {
            delegate?.keyDidPress(self, type: configuration.type)
        }
    }
    
    // MARK: - Visual State
    
    private func setPressed(_ pressed: Bool) {
        guard pressed != isPressed else { return }
        isPressed = pressed
        
        UIView.animate(withDuration: 0.05) {
            self.updateBackgroundColor()
        }
    }
    
    /// Set modifier state (for Shift, Ctrl, etc.)
    func setModifierActive(_ active: Bool) {
        isModifierActive = active
        updateBackgroundColor()

        // Update icon for modifier button when active
        if case .modifier(let type) = configuration.type {
            print("🔧 setModifierActive for \(type) - active: \(active)")
            if let symbolName = active ? type.activeSfSymbolName : type.sfSymbolName {
                // Use SF Symbol
                print("   Using SF Symbol: \(symbolName)")
                primaryLabel.isHidden = true
                primaryImageView.isHidden = false
                let config = UIImage.SymbolConfiguration(pointSize: 18, weight: .regular)
                primaryImageView.image = UIImage(systemName: symbolName, withConfiguration: config)
                print("   Image set: \(primaryImageView.image != nil)")
            } else {
                // Use text
                print("   Using text instead")
                primaryLabel.isHidden = false
                primaryImageView.isHidden = true
                primaryLabel.text = active ? type.activeDisplayText : type.displayText
            }
        }
    }
    
    /// Update display text (when Shift changes)
    func updateDisplayText(uppercase: Bool = false) {
        // Check if SF Symbol exists for special key
        if case .special(let type) = configuration.type, let symbolName = type.sfSymbolName {
            // Use SF Symbol
            primaryLabel.isHidden = true
            primaryImageView.isHidden = false
            // Bottom row buttons (globe, mic) get 1.2x larger icons: 18 * 1.2 = 21.6
            let pointSize: CGFloat = isBottomRowButton ? 21.6 : 18
            let config = UIImage.SymbolConfiguration(pointSize: pointSize, weight: .regular)
            primaryImageView.image = UIImage(systemName: symbolName, withConfiguration: config)
        }
        // Check if SF Symbol exists for modifier
        else if case .modifier(let type) = configuration.type {
            // Choose symbol based on active state
            let symbolName = isModifierActive ? type.activeSfSymbolName : type.sfSymbolName
            if let symbolName = symbolName {
                // Use SF Symbol (considering active state)
                primaryLabel.isHidden = true
                primaryImageView.isHidden = false
                let config = UIImage.SymbolConfiguration(pointSize: 18, weight: .regular)
                primaryImageView.image = UIImage(systemName: symbolName, withConfiguration: config)
            } else {
                // Fallback to text if no symbol
                primaryLabel.isHidden = false
                primaryImageView.isHidden = true
                primaryLabel.text = isModifierActive ? type.activeDisplayText : type.displayText
            }
        }
        // Check if SF Symbol exists for layout switcher
        else if case .layoutSwitch(let layout) = configuration.type, let symbolName = layout.sfSymbolName {
            // Use SF Symbol
            primaryLabel.isHidden = true
            primaryImageView.isHidden = false
            let config = UIImage.SymbolConfiguration(pointSize: 24, weight: .regular)
            primaryImageView.image = UIImage(systemName: symbolName, withConfiguration: config)
        }
        // Use text
        else {
            primaryLabel.isHidden = false
            primaryImageView.isHidden = true

            let text: String
            switch configuration.type {
            case .character(let char):
                // Apply Georgian shift mapping if needed
                if uppercase {
                    text = applyShiftMapping(to: char)
                } else {
                    text = char.lowercased()
                }
            default:
                text = configuration.type.displayText
            }

            primaryLabel.text = text
        }
    }

    /// Apply shift mapping for Georgian and other special characters
    private func applyShiftMapping(to char: String) -> String {
        guard let firstChar = char.first else { return char }

        // Georgian letters - iOS keyboard shift mapping
        switch firstChar {
        // Row 1: ქ წ ე რ ტ ყ უ ი ო პ
        case "ქ": return "ქ"  // ქ → ქ (no change)
        case "წ": return "ჭ"  // წ → ჭ
        case "ე": return "ე"  // ე → ე (no change)
        case "რ": return "ღ"  // რ → ღ
        case "ტ": return "თ"  // ტ → თ
        case "ყ": return "ყ"  // ყ → ყ (no change)
        case "უ": return "უ"  // უ → უ (no change)
        case "ი": return "ი"  // ი → ი (no change)
        case "ო": return "ო"  // ო → ო (no change)
        case "პ": return "პ"  // პ → პ (no change)

        // Row 2: ა ს დ ფ გ ჰ ჯ კ ლ
        case "ა": return "ა"  // ა → ა (no change)
        case "ს": return "შ"  // ს → შ
        case "დ": return "დ"  // დ → დ (no change)
        case "ფ": return "ფ"  // ფ → ფ (no change)
        case "გ": return "გ"  // გ → გ (no change)
        case "ჰ": return "ჰ"  // ჰ → ჰ (no change)
        case "ჯ": return "ჟ"  // ჯ → ჟ
        case "კ": return "კ"  // კ → კ (no change)
        case "ლ": return "ლ"  // ლ → ლ (no change)

        // Row 3: ზ ხ ც ვ ბ ნ მ
        case "ზ": return "ძ"  // ზ → ძ
        case "ხ": return "ხ"  // ხ → ხ (no change)
        case "ც": return "ჩ"  // ც → ჩ
        case "ვ": return "ვ"  // ვ → ვ (no change)
        case "ბ": return "ბ"  // ბ → ბ (no change)
        case "ნ": return "ნ"  // ნ → ნ (no change)
        case "მ": return "მ"  // მ → მ (no change)

        // Non-Georgian letters - use standard uppercase
        default:
            return char.uppercased()
        }
    }

    // MARK: - Theme
    
    func applyTheme(_ theme: KeyboardTheme) {
        self.theme = theme
        updateBackgroundColor()

        // Text
        primaryLabel.textColor = theme.keyTextColor
        secondaryLabel.textColor = theme.keySecondaryTextColor

        // SF Symbol color - semi-transparent for bottom row buttons
        if isBottomRowButton {
            primaryImageView.tintColor = theme.keyTextColor.withAlphaComponent(0.5)
        } else {
            primaryImageView.tintColor = theme.keyTextColor
        }

        // Shadow
        layer.shadowColor = theme.keyShadowColor.cgColor
        layer.shadowOffset = CGSize(width: 0, height: KeyboardMetrics.keyShadowOffsetY)
        layer.shadowRadius = KeyboardMetrics.keyShadowRadius
        layer.shadowOpacity = KeyboardMetrics.keyShadowOpacity
    }
    
    private func updateBackgroundColor() {
        // Bottom row buttons are always transparent
        if isBottomRowButton {
            backgroundView.backgroundColor = .clear
            // Bottom row icons are semi-transparent (0.5 alpha) matching iOS standard
            primaryImageView.tintColor = theme.keyTextColor.withAlphaComponent(0.5)
            layer.shadowOpacity = 0  // No shadow for transparent buttons
            return
        }

        if isPressed {
            backgroundView.backgroundColor = theme.pressedKeyBackgroundColor
        } else if isModifierActive {
            backgroundView.backgroundColor = theme.modifierActiveBackgroundColor
            primaryLabel.textColor = theme.modifierActiveTextColor
            primaryImageView.tintColor = theme.modifierActiveTextColor
        } else if configuration.type.isFunctional {
            backgroundView.backgroundColor = theme.functionKeyBackgroundColor
            primaryLabel.textColor = theme.keyTextColor
            primaryImageView.tintColor = theme.keyTextColor
        } else {
            backgroundView.backgroundColor = theme.letterKeyBackgroundColor
            primaryLabel.textColor = theme.keyTextColor
            primaryImageView.tintColor = theme.keyTextColor
        }
    }
    
    // MARK: - Cleanup

    deinit {
        // Timer invalidation is safe from any thread
        autoRepeatTimer?.invalidate()
        autoRepeatTimer = nil
    }
}
