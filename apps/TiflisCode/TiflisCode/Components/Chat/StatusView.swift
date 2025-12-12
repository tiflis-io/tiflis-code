//
//  StatusView.swift
//  TiflisCode
//
//  Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
//  Licensed under the Functional Source License (FSL-1.1-NC). See LICENSE file for details.
//

import SwiftUI

/// Displays inline status message with spinner
struct StatusView: View {
    let text: String

    var body: some View {
        HStack(spacing: 8) {
            ProgressView()
                .scaleEffect(0.7)

            Text(text)
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Status: \(text)")
    }
}

// MARK: - Preview

#Preview("Status Messages") {
    VStack(alignment: .leading, spacing: 16) {
        StatusView(text: "Reading file...")
        StatusView(text: "Analyzing code...")
        StatusView(text: "Running tests...")
        StatusView(text: "Installing dependencies...")
    }
    .padding()
}
