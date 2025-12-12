//
//  ThinkingView.swift
//  TiflisCode
//
//  Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
//  Licensed under the Functional Source License (FSL-1.1-NC). See LICENSE file for details.
//

import SwiftUI

/// Displays agent thinking/reasoning block with collapsible content (max height when expanded)
struct ThinkingView: View {
    let text: String

    /// Max height for thinking content when expanded
    private let maxContentHeight: CGFloat = 150

    @State private var isExpanded = false

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            // Header - tappable to expand/collapse
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
            .onTapGesture {
                isExpanded.toggle()
            }
            .accessibilityLabel("Agent thinking")
            .accessibilityHint("Double tap to \(isExpanded ? "collapse" : "expand") reasoning")

            // Collapsible content with max height
            if isExpanded {
                ScrollView {
                    Text(text)
                        .font(.body)
                        .italic()
                        .foregroundStyle(.secondary)
                        .textSelection(.enabled)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
                .frame(maxHeight: maxContentHeight)
                .padding(.horizontal, 12)
                .padding(.bottom, 12)
            }
        }
        .background(Color(.systemGray6))
        .clipShape(RoundedRectangle(cornerRadius: 8))
    }
}

// MARK: - Preview

#Preview("Short") {
    ThinkingView(
        text: "I need to analyze the project structure first. Let me check the existing files."
    )
    .padding()
}

#Preview("Long Text") {
    ThinkingView(
        text: (1...20).map { "Line \($0): Analyzing the codebase structure and dependencies..." }.joined(separator: "\n")
    )
    .padding()
}
