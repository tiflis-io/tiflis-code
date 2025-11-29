//
//  TerminalContentView.swift
//  TiflisCode
//
//  Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
//  Licensed under the MIT License. See LICENSE file for details.
//

import SwiftUI
import SwiftTerm

/// SwiftUI bridge for TerminalViewUIKit
struct TerminalContentView: UIViewRepresentable {
    let terminal: Terminal
    let viewModel: TerminalViewModel
    
    func makeUIView(context: Context) -> TerminalViewUIKit {
        let view = TerminalViewUIKit(terminal: terminal)
        
        // Set terminal view in view model
        viewModel.setTerminalView(view.getTerminalView())
        
        return view
    }
    
    func updateUIView(_ uiView: TerminalViewUIKit, context: Context) {
        // Update terminal size when view size changes
        uiView.updateSize()
        
        // Notify view model of size change
        // Defer to avoid publishing changes during view update
        let cols = max(1, Int(uiView.bounds.width / 8))
        let rows = max(1, Int(uiView.bounds.height / 16))
        
        // Use Task to defer the state update outside of the view update cycle
        Task { @MainActor in
            viewModel.resizeTerminal(cols: cols, rows: rows)
        }
    }
}

