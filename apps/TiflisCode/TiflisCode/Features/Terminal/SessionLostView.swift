//
//  SessionLostView.swift
//  TiflisCode
//
//  Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
//  Licensed under the Functional Source License (FSL-1.1-NC). See LICENSE file for details.
//

import SwiftUI

/// View displayed when a terminal session has ended or is no longer available
struct SessionLostView: View {
    /// Callback when user wants to create a new terminal session
    let onCreateNew: () -> Void

    var body: some View {
        VStack(spacing: 20) {
            Image(systemName: "terminal.fill")
                .font(.system(size: 56))
                .foregroundStyle(.secondary)

            Text("Terminal Session Ended")
                .font(.title2)
                .fontWeight(.semibold)

            Text("The terminal process is no longer running.\nThis can happen when the workstation restarts.")
                .font(.body)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 32)

            Button(action: onCreateNew) {
                Label("Create New Terminal", systemImage: "plus")
            }
            .buttonStyle(.borderedProminent)
            .padding(.top, 8)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(.regularMaterial)
    }
}

// MARK: - Preview

#Preview("Session Lost") {
    SessionLostView {
        print("Create new terminal tapped")
    }
}
