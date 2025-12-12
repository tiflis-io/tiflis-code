//
//  TerminalContentView.swift
//  TiflisCode
//
//  Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
//  Licensed under the Functional Source License (FSL-1.1-NC). See LICENSE file for details.
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

        // Schedule initial size update after view is laid out
        // This ensures the terminal gets correct dimensions immediately
        DispatchQueue.main.async {
            if view.bounds.width > 0, view.bounds.height > 0 {
                view.updateSize()
                context.coordinator.previousSize = view.bounds.size
            }
        }

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

        // Store size for next comparison
        context.coordinator.previousSize = currentSize

        // Update terminal size when view size changes
        // This triggers SwiftTerm's sizeChanged delegate callback with correct dimensions
        // The ViewModel is notified via sizeChanged(source:newCols:newRows:) delegate method
        // Do NOT call viewModel.resizeTerminal() here - it would use wrong hardcoded metrics
        uiView.updateSize()
    }
    
    static func dismantleUIView(_ uiView: TerminalViewUIKit, coordinator: Coordinator) {
        // Clean up terminal resources when view is dismantled
        // Note: dismantleUIView is already called on main thread by SwiftUI
        // so we can call cleanup directly without async dispatch
        uiView.suspendDisplayUpdates()
        uiView.cleanup()
    }
    
    // MARK: - Coordinator
    
    final class Coordinator {
        var previousSize: CGSize = .zero
    }
}

