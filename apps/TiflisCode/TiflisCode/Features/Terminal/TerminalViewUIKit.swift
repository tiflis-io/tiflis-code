//
//  TerminalViewUIKit.swift
//  TiflisCode
//
//  Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
//  Licensed under the Functional Source License (FSL-1.1-NC). See LICENSE file for details.
//

import UIKit
import SwiftTerm

/// UIKit wrapper for SwiftTerm's TerminalView
/// Uses only TerminalView's internal Terminal - no duplicate instance needed
/// Supports custom keyboard to solve iOS backspace buffer issues
final class TerminalViewUIKit: UIView {
    private let terminalView: SwiftTerm.TerminalView

    // MARK: - Toolbar Support

    private var terminalToolbar: TerminalToolbarView?

    // Font size for terminal (can be adjusted for Dynamic Type)
    private var fontSize: CGFloat = 14 {
        didSet {
            if oldValue != fontSize {
                configureFonts()
                invalidateFontMetrics()
            }
        }
    }

    
    init() {
        // SwiftTerm TerminalView: Creates its own Terminal instance internally
        // TerminalView implements TerminalDelegate and forwards to terminalDelegate
        // We set terminalDelegate on TerminalView to receive input events
        self.terminalView = SwiftTerm.TerminalView(frame: .zero)

        // Now call super.init()
        super.init(frame: .zero)
        
        // TerminalView manages its own Terminal instance for rendering and input
        // Data flow: WebSocket -> TerminalView.feed() -> TerminalView's internal Terminal
        // Input flow: User input -> TerminalView's Terminal -> TerminalViewDelegate.send()
        
        addSubview(terminalView)
        terminalView.translatesAutoresizingMaskIntoConstraints = false
        NSLayoutConstraint.activate([
            terminalView.topAnchor.constraint(equalTo: topAnchor),
            terminalView.leadingAnchor.constraint(equalTo: leadingAnchor),
            terminalView.trailingAnchor.constraint(equalTo: trailingAnchor),
            terminalView.bottomAnchor.constraint(equalTo: bottomAnchor)
        ])
        
        // Configure terminal view
        configureTerminalView()
        configureFonts()
        configureTerminalOptions()
        configureTextInput()
        configureAccessibility()
        configureTerminalToolbar()

        // Enable advanced features
        enableSixelGraphics()
        enableHyperlinkSupport()

        // Observe theme changes
        observeThemeChanges()

        // Register for trait changes on iOS 17+ (new API)
        // This uses the new UITraitChangeObservable protocol
        if #available(iOS 17.0, *) {
            registerForTraitChanges([UITraitUserInterfaceStyle.self]) { (changedView: Self, _: UITraitCollection) in
                changedView.updateTheme()
            }
        }

        // Observe Dynamic Type changes
        observeDynamicTypeChanges()
    }
    
    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }
    
    override func layoutSubviews() {
        super.layoutSubviews()
        // Terminal view will handle its own layout
    }
    
    // MARK: - Trait Collection Changes
    
    // For iOS 17+, traitCollectionDidChange is deprecated
    // We use registerForTraitChanges in init() for iOS 17+
    // This method is kept for iOS 16 and below compatibility
    @available(iOS, deprecated: 17.0, message: "Use registerForTraitChanges for iOS 17+")
    override func traitCollectionDidChange(_ previousTraitCollection: UITraitCollection?) {
        super.traitCollectionDidChange(previousTraitCollection)
        
        // Only handle trait changes on iOS 16 and below
        // iOS 17+ uses registerForTraitChanges registered in init()
        guard #unavailable(iOS 17.0) else { return }
        
        // Update theme when appearance changes
        if let previous = previousTraitCollection,
           traitCollection.hasDifferentColorAppearance(comparedTo: previous) {
            updateTheme()
        }
    }
    
    /// Gets the underlying SwiftTerm TerminalView
    func getTerminalView() -> SwiftTerm.TerminalView {
        return self.terminalView
    }
    
    // MARK: - Configuration
    
    /// Configures terminal view appearance and basic settings
    private func configureTerminalView() {
        // Set initial theme based on current appearance
        updateTheme()
    }
    
    /// Configures fonts for terminal using SwiftTerm's setFonts method
    private func configureFonts() {
        let normalFont = UIFont.monospacedSystemFont(ofSize: fontSize, weight: .regular)
        let boldFont = UIFont.monospacedSystemFont(ofSize: fontSize, weight: .semibold)
        
        // Create italic variants using UIFontDescriptor
        var normalFontDescriptor = normalFont.fontDescriptor
        var boldFontDescriptor = boldFont.fontDescriptor
        
        let italicSymbolicTraits = normalFontDescriptor.symbolicTraits.union(.traitItalic)
        normalFontDescriptor = normalFontDescriptor.withSymbolicTraits(italicSymbolicTraits) ?? normalFontDescriptor
        let italicFont = UIFont(descriptor: normalFontDescriptor, size: fontSize)
        
        let boldItalicSymbolicTraits = boldFontDescriptor.symbolicTraits.union(.traitItalic)
        boldFontDescriptor = boldFontDescriptor.withSymbolicTraits(boldItalicSymbolicTraits) ?? boldFontDescriptor
        let boldItalicFont = UIFont(descriptor: boldFontDescriptor, size: fontSize)
        
        // Configure fonts using SwiftTerm's recommended method
        terminalView.setFonts(
            normal: normalFont,
            bold: boldFont,
            italic: italicFont,
            boldItalic: boldItalicFont
        )
    }
    
    /// Configures terminal options (scrollback, cursor style, etc.)
    func configureTerminalOptions(terminalConfig: TerminalConfig? = nil) {
        let terminal = terminalView.getTerminal()

        // Use server-provided buffer size, fallback to 1000 for stable TUI app behavior
        // Increased from 100 to prevent display issues with terminal apps that expect larger buffers
        let scrollbackLines = terminalConfig?.bufferSize ?? 1000

        // Configure terminal options following best practices
        // Note: TerminalOptions only supports basic options, not mouse reporting
        terminal.options = TerminalOptions(
            cols: terminal.cols,
            rows: terminal.rows,
            cursorStyle: .blinkBlock,  // Blinking block cursor
            scrollback: scrollbackLines,  // Server-configured scrollback lines
            enableSixelReported: true  // Enable Sixel graphics support
        )

        print("[TerminalViewUIKit] Configured with \(scrollbackLines) scrollback lines")

        // Configure backspace behavior
        // When true, backspace sends Control-H (^H, ASCII 8)
        // When false, backspace sends DEL (ASCII 127)
        terminalView.backspaceSendsControlH = true

        // Enable scrolling for scrollback buffer
        // SwiftTerm's TerminalView inherits from UIScrollView
        terminalView.isScrollEnabled = true
        terminalView.alwaysBounceVertical = true
        terminalView.showsVerticalScrollIndicator = true
        terminalView.showsHorizontalScrollIndicator = false
    }
    
    /// Optimizes text input settings for terminal use
    private func configureTextInput() {
        // Note: keyboardType is read-only on TerminalView, so we can't set it
        // TerminalView handles keyboard input internally
        
        // Disable text input features that interfere with terminal
        terminalView.autocapitalizationType = .none
        terminalView.autocorrectionType = .no
        terminalView.spellCheckingType = .no
        terminalView.smartQuotesType = .no
        terminalView.smartDashesType = .no
        terminalView.smartInsertDeleteType = .no

        // Configure keyboard appearance to match system theme
        terminalView.keyboardAppearance = traitCollection.userInterfaceStyle == .dark ? .dark : .light
    }
    
    /// Configures accessibility support
    private func configureAccessibility() {
        terminalView.isAccessibilityElement = true
        terminalView.accessibilityLabel = "Terminal"
        terminalView.accessibilityHint = "Double tap to interact with terminal"
        terminalView.accessibilityTraits = [.staticText]
    }

    /// Configures terminal toolbar as inputAccessoryView above standard iOS keyboard
    private func configureTerminalToolbar() {
        // Calculate toolbar frame
        let screenWidth = UIScreen.main.bounds.width
        let toolbarHeight = KeyboardMetrics.terminalToolbarHeight
        let toolbarFrame = CGRect(x: 0, y: 0, width: screenWidth, height: toolbarHeight)

        // Create toolbar instance
        let toolbar = TerminalToolbarView(frame: toolbarFrame)
        toolbar.delegate = self

        // Store reference
        self.terminalToolbar = toolbar

        // Apply theme based on current appearance
        let theme = KeyboardTheme.theme(for: traitCollection.userInterfaceStyle)
        toolbar.applyTheme(theme)

        // Use standard iOS keyboard with our toolbar above it
        terminalView.inputView = nil  // Use standard keyboard
        terminalView.inputAccessoryView = toolbar

        #if DEBUG
        print("[TerminalViewUIKit] Terminal toolbar configured: frame=\(toolbarFrame)")
        #endif
    }
    
    /// Called when terminal becomes first responder - reload input views
    func terminalDidBecomeFirstResponder() {
        terminalView.reloadInputViews()
        
        #if DEBUG
        print("[TerminalViewUIKit] Terminal became first responder, input views reloaded")
        #endif
    }

    /// Toggle between custom and system keyboard

    /// Updates theme based on current system appearance
    /// Automatically follows system dark/light mode settings
    private func updateTheme() {
        // Use system appearance to determine theme
        // This ensures terminal matches user's system-wide theme preference
        switch traitCollection.userInterfaceStyle {
        case .dark:
            configureDarkTheme()
            terminalView.keyboardAppearance = .dark
        case .light:
            configureLightTheme()
            terminalView.keyboardAppearance = .light
        case .unspecified:
            // Default to light theme if unspecified
            configureLightTheme()
            terminalView.keyboardAppearance = .light
        @unknown default:
            configureLightTheme()
            terminalView.keyboardAppearance = .light
        }
    }
    
    /// Configures dark theme colors following best practices
    /// Uses system colors that adapt to dark mode
    private func configureDarkTheme() {
        // Use label color for dark theme foreground (white/light gray, good contrast on dark background)
        // UIColor.label adapts to dark mode automatically, providing white text on dark backgrounds
        let foregroundColor = UIColor.label
        terminalView.nativeForegroundColor = foregroundColor
        terminalView.nativeBackgroundColor = UIColor.systemBackground
        terminalView.selectedTextBackgroundColor = UIColor.systemBlue.withAlphaComponent(0.3)
        terminalView.caretColor = UIColor.systemBlue
        terminalView.caretTextColor = foregroundColor
        terminalView.backgroundColor = UIColor.systemBackground
    }
    
    /// Configures light theme colors following best practices
    /// Uses system colors that adapt to light mode
    private func configureLightTheme() {
        // Use system label color for light theme (adapts to light mode)
        terminalView.nativeForegroundColor = UIColor.label
        terminalView.nativeBackgroundColor = UIColor.systemBackground
        terminalView.selectedTextBackgroundColor = UIColor.systemBlue.withAlphaComponent(0.2)
        terminalView.caretColor = UIColor.systemBlue
        terminalView.caretTextColor = UIColor.label
        terminalView.backgroundColor = UIColor.systemBackground
    }
    
    /// Observes theme changes via notifications
    private func observeThemeChanges() {
        // Theme changes are handled via traitCollectionDidChange
        // This method is here for potential future use with custom theme notifications
    }
    
    /// Observes Dynamic Type changes
    private func observeDynamicTypeChanges() {
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(handleContentSizeCategoryChange),
            name: UIContentSizeCategory.didChangeNotification,
            object: nil
        )
    }
    
    @objc private func handleContentSizeCategoryChange() {
        // Update font size based on Dynamic Type
        let preferredFont = UIFont.preferredFont(forTextStyle: .body)
        fontSize = preferredFont.pointSize
        
        // Update accessibility value
        updateAccessibilityValue()
    }
    
    /// Updates accessibility value with current terminal content
    private func updateAccessibilityValue() {
        // Note: terminal.buffer.lines is internal, so we can't access it directly
        // For now, we'll use a simple accessibility value
        // In the future, we could implement a custom method to get current line text
        terminalView.accessibilityValue = "Terminal output"
    }
    
    // MARK: - Size Management
    
    /// Cached font metrics for performance
    /// Uses actual terminal font metrics (monospaced, configurable size)
    private var cachedFontMetrics: (width: CGFloat, height: CGFloat)?

    /// Full-screen height for terminal sizing (ignores keyboard)
    /// Tracks maximum height seen - when keyboard appears, bounds shrink but we keep using this
    /// This prevents terminal resize when keyboard shows/hides, eliminating TUI flickering
    private var fullScreenHeight: CGFloat = 0

    /// Updates terminal size based on view size
    /// Uses actual terminal font metrics from configured terminal font
    /// IMPORTANT: Uses full-screen height, ignoring keyboard-induced size changes
    func updateSize() {
        #if DEBUG
        let sizeCalcStartTime = Date()
        #endif

        // Get or calculate font metrics
        let fontMetrics: (width: CGFloat, height: CGFloat)

        if let cached = cachedFontMetrics {
            fontMetrics = cached
        } else {
            // Use actual terminal font for metrics calculation
            let terminalFont = UIFont.monospacedSystemFont(ofSize: fontSize, weight: .regular)

            // Calculate character width from font metrics
            // For monospaced fonts, all characters have the same width
            // Use 'M' as a representative character for width calculation
            let testChar = "M"
            let fontAttributes = [NSAttributedString.Key.font: terminalFont]
            let charSize = testChar.size(withAttributes: fontAttributes)
            let fontWidth = max(charSize.width, 8) // Minimum 8pt fallback

            // Calculate line height from font metrics
            let fontHeight = max(terminalFont.lineHeight, 16) // Minimum 16pt fallback

            fontMetrics = (width: fontWidth, height: fontHeight)
            cachedFontMetrics = fontMetrics

            #if DEBUG
            print("[TerminalViewUIKit] Font metrics calculated: \(String(format: "%.1f", fontWidth))×\(String(format: "%.1f", fontHeight))pt (font size: \(fontSize)pt)")
            #endif
        }

        let cols = max(1, Int(bounds.width / fontMetrics.width))

        // CRITICAL: Use full-screen height, not current bounds.height
        // When keyboard appears, SwiftUI shrinks the view bounds, but we want terminal
        // to keep its full-screen size. We track maximum height seen and always use it.
        // This prevents resize when keyboard shows/hides → no TUI redraws → no flickering
        // Terminal content below visible area is simply covered by keyboard.
        // SwiftTerm auto-scrolls to keep cursor visible.
        if bounds.height > fullScreenHeight {
            fullScreenHeight = bounds.height
            #if DEBUG
            print("[TerminalViewUIKit] Full screen height updated: \(String(format: "%.0f", fullScreenHeight))pt")
            #endif
        }

        let rows = max(1, Int(fullScreenHeight / fontMetrics.height))

        // Resize TerminalView's internal terminal
        // TerminalView.resize() handles both the terminal and view updates
        terminalView.resize(cols: cols, rows: rows)

        #if DEBUG
        let sizeCalcDuration = Date().timeIntervalSince(sizeCalcStartTime)
        if sizeCalcDuration > 0.001 { // Only log if it takes more than 1ms
            print("[TerminalViewUIKit] Size calculation: \(cols)×\(rows) (bounds: \(String(format: "%.0f", bounds.height))pt, fullScreen: \(String(format: "%.0f", fullScreenHeight))pt), \(String(format: "%.3f", sizeCalcDuration * 1000))ms")
        }
        #endif
    }
    
    /// Invalidates cached font metrics (call when font changes or Dynamic Type updates)
    func invalidateFontMetrics() {
        cachedFontMetrics = nil
    }
    
    // MARK: - Memory Management
    
    /// Suspends display updates when view is not visible
    /// Call this when view disappears to save resources
    /// Note: suspendDisplayUpdates is internal in SwiftTerm, so we can't call it directly
    func suspendDisplayUpdates() {
        // SwiftTerm's suspendDisplayUpdates is internal, so we can't use it
        // The view will handle this automatically when not visible
    }
    
    /// Resumes display updates when view becomes visible
    /// Call this when view appears to resume rendering
    /// Note: startDisplayUpdates is internal in SwiftTerm, so we can't call it directly
    func startDisplayUpdates() {
        // SwiftTerm's startDisplayUpdates is internal, so we can't use it
        // The view will handle this automatically when visible
    }
    
    /// Cleans up terminal resources
    /// Call this when view is being deallocated
    /// Note: Must be called on main thread (which is guaranteed by SwiftUI's dismantleUIView)
    func cleanup() {
        // Notify SwiftTerm that UI is closed
        terminalView.updateUiClosed()

        // Remove notification observers
        NotificationCenter.default.removeObserver(self)

        // Remove toolbar reference to break retain cycle
        terminalToolbar?.delegate = nil
        terminalToolbar = nil

        // Clear terminal delegate to prevent callbacks to deallocated view model
        terminalView.terminalDelegate = nil
    }

    // MARK: - Terminal Delegate Support

    /// Set the terminal delegate to receive input events
    func setTerminalDelegate(_ delegate: SwiftTerm.TerminalViewDelegate?) {
        terminalView.terminalDelegate = delegate
    }

    /// Get the current terminal delegate
    func getTerminalDelegate() -> SwiftTerm.TerminalViewDelegate? {
        return terminalView.terminalDelegate
    }
    
    // MARK: - Data Feeding
    
    /// Feeds output data to TerminalView's terminal for rendering
    /// This is the proper way to send data to TerminalView
    func feed(_ data: Data) {
        // TerminalView has a feed() method to send data to its internal Terminal
        // Convert Data to ArraySlice<UInt8> for SwiftTerm
        // Note: For String content, use String.utf8BytesSlice directly instead
        let bytes = Array(data)
        terminalView.feed(byteArray: bytes[...])
        
        // Update accessibility value after feeding data
        updateAccessibilityValue()
    }
    
    // MARK: - Advanced Features
    
    /// Enables Sixel Graphics Support
    /// Sixel is a bitmap graphics format supported by many terminal emulators
    /// SwiftTerm automatically handles Sixel rendering when enableSixelReported is true
    private func enableSixelGraphics() {
        // Sixel support is enabled via TerminalOptions.enableSixelReported
        // which is set in configureTerminalOptions()
        // SwiftTerm automatically renders Sixel images in the terminal view
        // No additional configuration needed - images are displayed inline
    }
    
    /// Enables Hyperlink Support
    /// Hyperlinks in terminal output can be tapped to open URLs
    /// SwiftTerm automatically detects hyperlinks via OSC 8 escape sequences
    private func enableHyperlinkSupport() {
        // Hyperlink support is enabled by default in SwiftTerm
        // URLs are automatically detected and styled when applications emit OSC 8 sequences
        // The urlAttributes dictionary is used internally by SwiftTerm to style hyperlinks
        // We don't need to configure it manually - SwiftTerm handles it automatically
        
        // Hyperlink tap handling is done via TerminalViewDelegate.requestOpenLink
        // This is implemented in TerminalViewModel which opens URLs in Safari
    }
    
  }

// MARK: - TerminalToolbarDelegate

extension TerminalViewUIKit: TerminalToolbarDelegate {

    func toolbar(_ toolbar: TerminalToolbarView, didSendInput data: Data) {
        // Send input directly to SwiftTerm terminal delegate
        if let delegate = terminalView.terminalDelegate {
            delegate.send(source: terminalView, data: Array(data)[...])
        }

        #if DEBUG
        let hexString = data.map { String(format: "%02X", $0) }.joined(separator: " ")
        print("[TerminalViewUIKit] Toolbar input: \(hexString)")
        #endif
    }

    func toolbarDidRequestDismiss(_ toolbar: TerminalToolbarView) {
        // Dismiss the keyboard
        _ = terminalView.resignFirstResponder()

        #if DEBUG
        print("[TerminalViewUIKit] Keyboard dismissal requested")
        #endif
    }
}

