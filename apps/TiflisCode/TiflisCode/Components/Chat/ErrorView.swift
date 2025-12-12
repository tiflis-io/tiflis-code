//
//  ErrorView.swift
//  TiflisCode
//
//  Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
//  Licensed under the Functional Source License (FSL-1.1-NC). See LICENSE file for details.
//

import SwiftUI

/// Displays an error message with red accent
struct ErrorView: View {
    let text: String

    var body: some View {
        HStack(alignment: .top, spacing: 8) {
            Image(systemName: "exclamationmark.triangle.fill")
                .font(.body)
                .foregroundStyle(.red)

            Text(text)
                .font(.body)
                .foregroundStyle(.primary)
                .textSelection(.enabled)
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.red.opacity(0.1))
        .overlay(
            RoundedRectangle(cornerRadius: 8)
                .stroke(Color.red.opacity(0.3), lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: 8))
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Error: \(text)")
    }
}

// MARK: - Preview

#Preview("Error Messages") {
    VStack(spacing: 16) {
        ErrorView(text: "File not found: src/missing.swift")

        ErrorView(text: "Permission denied: Cannot write to /readonly/path")

        ErrorView(text: """
        Build failed with 3 errors:
        - Type 'String' has no member 'foo'
        - Cannot find 'bar' in scope
        - Missing return in function
        """)
    }
    .padding()
}
