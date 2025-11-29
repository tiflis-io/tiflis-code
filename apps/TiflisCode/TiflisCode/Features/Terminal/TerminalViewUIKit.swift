//
//  TerminalViewUIKit.swift
//  TiflisCode
//
//  Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
//  Licensed under the MIT License. See LICENSE file for details.
//

import UIKit
import SwiftTerm

/// UIKit wrapper for SwiftTerm's TerminalView
/// Preserves terminal state when view is removed from hierarchy
final class TerminalViewUIKit: UIView {
    private let terminalView: SwiftTerm.TerminalView
    private let terminal: Terminal
    
    init(terminal: Terminal) {
        // Initialize stored properties before calling super.init()
        self.terminal = terminal
        
        // SwiftTerm TerminalView: Creates its own Terminal instance internally
        // We feed data to TerminalView's terminal using the feed() method
        // TerminalView initializer: TerminalView(frame: CGRect)
        self.terminalView = SwiftTerm.TerminalView(frame: .zero)
        
        // Now call super.init()
        super.init(frame: .zero)
        
        // TerminalView manages its own Terminal instance for rendering
        // We keep our Terminal instance for WebSocket communication
        // Data flow: WebSocket -> our Terminal -> TerminalView's terminal (via feed)
        
        addSubview(terminalView)
        terminalView.translatesAutoresizingMaskIntoConstraints = false
        NSLayoutConstraint.activate([
            terminalView.topAnchor.constraint(equalTo: topAnchor),
            terminalView.leadingAnchor.constraint(equalTo: leadingAnchor),
            terminalView.trailingAnchor.constraint(equalTo: trailingAnchor),
            terminalView.bottomAnchor.constraint(equalTo: bottomAnchor)
        ])
        
        // Configure terminal view appearance
        terminalView.backgroundColor = .black
        terminalView.nativeBackgroundColor = .black
    }
    
    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }
    
    override func layoutSubviews() {
        super.layoutSubviews()
        // Terminal view will handle its own layout
    }
    
    /// Gets the underlying SwiftTerm TerminalView
    func getTerminalView() -> SwiftTerm.TerminalView {
        return self.terminalView
    }
    
    /// Updates terminal size based on view size
    func updateSize() {
        // Calculate terminal size based on font metrics
        // Using monospaced font: 8pt width, 16pt height per character
        let fontWidth: CGFloat = 8
        let fontHeight: CGFloat = 16
        
        let cols = max(1, Int(bounds.width / fontWidth))
        let rows = max(1, Int(bounds.height / fontHeight))
        
        // Resize Terminal instance (for WebSocket communication)
        terminal.resize(cols: cols, rows: rows)
    }
    
    /// Feeds output data to TerminalView's terminal for rendering
    /// This is the proper way to send data to TerminalView
    func feed(_ data: Data) {
        // TerminalView has a feed() method to send data to its internal Terminal
        // Convert Data to ArraySlice<UInt8> for SwiftTerm
        let bytes = Array(data)
        terminalView.feed(byteArray: bytes[...])
    }
}

