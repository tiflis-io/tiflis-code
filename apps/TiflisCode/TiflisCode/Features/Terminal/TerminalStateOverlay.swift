//
//  TerminalStateOverlay.swift
//  TiflisCode
//
//  Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
//  Licensed under the Functional Source License (FSL-1.1-NC). See LICENSE file for details.
//

import SwiftUI

/// Loading overlay shown during terminal replay
struct TerminalLoadingOverlay: View {
    let text: String

    var body: some View {
        VStack {
            HStack(spacing: 8) {
                ProgressView()
                    .scaleEffect(0.8)
                Text(text)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .background(.ultraThinMaterial)
            .clipShape(RoundedRectangle(cornerRadius: 8))
            Spacer()
        }
        .padding(.top, 8)
    }
}

// MARK: - Previews

#Preview("Loading") {
    ZStack {
        Color.black
        TerminalLoadingOverlay(text: "Loading history...")
    }
}
