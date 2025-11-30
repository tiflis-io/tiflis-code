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
    let viewModel: TerminalViewModel
    
    func makeCoordinator() -> Coordinator {
        Coordinator()
    }
    
    func makeUIView(context: Context) -> TerminalViewUIKit {
        let view = TerminalViewUIKit()
        
        // Set terminal view in view model and configure delegate
        // This sets up terminalDelegate to receive input events
        viewModel.setTerminalView(view.getTerminalView())
        
        // Start display updates when view is created
        view.startDisplayUpdates()
        
        return view
    }
    
    func updateUIView(_ uiView: TerminalViewUIKit, context: Context) {
        let currentSize = uiView.bounds.size
        
        // Read previous size into local variable before any checks
        // This avoids accessing coordinator during view update
        let previousSize = context.coordinator.previousSize
        
        // Only update size if bounds actually changed
        guard currentSize != previousSize, currentSize.width > 0, currentSize.height > 0 else {
            return
        }
        
        // Update terminal size when view size changes
        uiView.updateSize()
        
        // Notify view model of size change
        // Defer to avoid publishing changes during view update
        // Size calculation is now done in TerminalViewUIKit.updateSize() using actual font metrics
        // We still need to calculate here for the ViewModel, but we'll use the same approach
        // For now, use approximate values - the actual resize happens in updateSize()
        let cols = max(1, Int(currentSize.width / 8))
        let rows = max(1, Int(currentSize.height / 16))
        
        // Store size for next comparison
        let sizeToStore = currentSize
        
        // Defer both coordinator update and view model call outside of view update cycle
        Task { @MainActor in
            // Update coordinator's previous size after view update completes
            context.coordinator.previousSize = sizeToStore
            viewModel.resizeTerminal(cols: cols, rows: rows)
        }
    }
    
    static func dismantleUIView(_ uiView: TerminalViewUIKit, coordinator: Coordinator) {
        // Clean up terminal resources when view is dismantled
        uiView.suspendDisplayUpdates()
        // cleanup() is MainActor-isolated, so we need to call it on main actor
        Task { @MainActor in
            uiView.cleanup()
        }
    }
    
    // MARK: - Coordinator
    
    final class Coordinator {
        var previousSize: CGSize = .zero
    }
}

