//
//  ThinkingView.swift
//  TiflisCode
//
//  Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
//  Licensed under the MIT License. See LICENSE file for details.
//

import SwiftUI

/// Displays agent thinking/reasoning block with collapsible content
struct ThinkingView: View {
    let text: String

    @State private var isExpanded = false

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            // Header
            Button {
                withAnimation(.easeInOut(duration: 0.2)) {
                    isExpanded.toggle()
                }
            } label: {
                HStack(spacing: 8) {
                    Image(systemName: "brain")
                        .font(.caption)
                        .foregroundStyle(.secondary)

                    Text("Thinking...")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)

                    Spacer()

                    Image(systemName: isExpanded ? "chevron.up" : "chevron.down")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                .padding(12)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Agent thinking")
            .accessibilityHint("Double tap to \(isExpanded ? "collapse" : "expand") reasoning")

            // Collapsible content
            if isExpanded {
                Text(text)
                    .font(.body)
                    .italic()
                    .foregroundStyle(.secondary)
                    .textSelection(.enabled)
                    .padding(.horizontal, 12)
                    .padding(.bottom, 12)
            }
        }
        .background(Color(.systemGray6))
        .clipShape(RoundedRectangle(cornerRadius: 8))
    }
}

// MARK: - Preview

#Preview("Collapsed") {
    ThinkingView(
        text: "I need to analyze the project structure first. Let me check the existing files and understand the architecture before making any changes. This looks like a Node.js project with TypeScript."
    )
    .padding()
}

#Preview("Long Text") {
    ThinkingView(
        text: """
        I need to understand the current state of the codebase before making changes.

        First, let me check the package.json to understand the project dependencies and scripts.

        Then I'll look at the main entry point to understand how the application is structured.

        Based on what I find, I'll determine the best approach for implementing the requested feature.

        I should also check if there are any existing patterns or conventions in the codebase that I should follow.
        """
    )
    .padding()
}
