//
//  ToolCallView.swift
//  TiflisCode
//
//  Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
//  Licensed under the Functional Source License (FSL-1.1-NC). See LICENSE file for details.
//

import SwiftUI

/// Displays a tool call with collapsible input/output (max height when expanded)
struct ToolCallView: View {
    let name: String
    let input: String?
    let output: String?
    let status: ToolStatus

    /// Max height for content sections when expanded
    private let maxContentHeight: CGFloat = 200

    @State private var isExpanded = false

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            // Header - tappable to expand/collapse
            HStack(spacing: 8) {
                // Status icon
                statusIcon

                // Tool name
                Text(displayName)
                    .font(.subheadline.weight(.medium))
                    .foregroundStyle(.primary)

                Spacer()

                // Expand/collapse chevron
                Image(systemName: isExpanded ? "chevron.up" : "chevron.down")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            .padding(12)
            .contentShape(Rectangle())
            .onTapGesture {
                isExpanded.toggle()
            }
            .accessibilityLabel("Tool call: \(displayName), \(status.rawValue)")
            .accessibilityHint("Double tap to \(isExpanded ? "collapse" : "expand") details")

            // Collapsible content with max height
            if isExpanded {
                VStack(alignment: .leading, spacing: 12) {
                    // Input section
                    if let input = input, !input.isEmpty {
                        VStack(alignment: .leading, spacing: 4) {
                            Text("Input:")
                                .font(.caption)
                                .foregroundStyle(.secondary)

                            ScrollView {
                                Text(input)
                                    .font(.system(size: 11, weight: .regular, design: .monospaced))
                                    .textSelection(.enabled)
                                    .frame(maxWidth: .infinity, alignment: .leading)
                            }
                            .frame(maxHeight: maxContentHeight)
                            .padding(8)
                            .background(Color(.systemGray6))
                            .clipShape(RoundedRectangle(cornerRadius: 6))
                        }
                    }

                    // Output section
                    if let output = output, !output.isEmpty {
                        VStack(alignment: .leading, spacing: 4) {
                            Text("Output:")
                                .font(.caption)
                                .foregroundStyle(.secondary)

                            ScrollView {
                                Text(markdownAttributedString(from: unescapeString(output)))
                                    .font(.footnote)
                                    .textSelection(.enabled)
                                    .frame(maxWidth: .infinity, alignment: .leading)
                            }
                            .frame(maxHeight: maxContentHeight)
                            .padding(8)
                            .background(Color(.systemBackground).opacity(0.5))
                            .clipShape(RoundedRectangle(cornerRadius: 6))
                        }
                    }
                }
                .padding(.horizontal, 12)
                .padding(.bottom, 12)
            }
        }
        .background(Color.orange.opacity(0.1))
        .clipShape(RoundedRectangle(cornerRadius: 8))
    }

    @ViewBuilder
    private var statusIcon: some View {
        switch status {
        case .running:
            ProgressView()
                .scaleEffect(0.7)
                .frame(width: 16, height: 16)

        case .completed:
            Image(systemName: "checkmark.circle.fill")
                .font(.caption)
                .foregroundStyle(.green)

        case .failed:
            Image(systemName: "xmark.circle.fill")
                .font(.caption)
                .foregroundStyle(.red)
        }
    }

    private var displayName: String {
        // Convert snake_case to readable format
        name.replacingOccurrences(of: "_", with: " ").capitalized
    }

    /// Unescape JSON-encoded string (convert \n to newlines, \" to quotes, etc.)
    private func unescapeString(_ str: String) -> String {
        // If the string looks like a JSON string (starts and ends with quotes), try to decode it
        if str.hasPrefix("\"") && str.hasSuffix("\"") {
            if let data = str.data(using: .utf8),
               let decoded = try? JSONDecoder().decode(String.self, from: data) {
                return decoded
            }
        }

        // Otherwise just replace common escape sequences
        return str
            .replacingOccurrences(of: "\\n", with: "\n")
            .replacingOccurrences(of: "\\\"", with: "\"")
            .replacingOccurrences(of: "\\t", with: "\t")
            .replacingOccurrences(of: "\\\\", with: "\\")
    }

    /// Parse markdown string to AttributedString with full block element support
    private func markdownAttributedString(from text: String) -> AttributedString {
        // Try to parse as full markdown (supports tables, headings, lists, etc.)
        if let attributed = try? AttributedString(
            markdown: text,
            options: .init(interpretedSyntax: .full)
        ) {
            return attributed
        }
        return AttributedString(text)
    }
}

// MARK: - Preview

#Preview("Running") {
    ToolCallView(
        name: "read_file",
        input: "{\"path\": \"src/main.swift\"}",
        output: nil,
        status: .running
    )
    .padding()
}

#Preview("Completed") {
    ToolCallView(
        name: "read_file",
        input: "{\"path\": \"package.json\"}",
        output: """
        {
          "name": "my-app",
          "version": "1.0.0",
          "dependencies": {
            "express": "^4.18.0"
          }
        }
        """,
        status: .completed
    )
    .padding()
}

#Preview("Failed") {
    ToolCallView(
        name: "write_file",
        input: "{\"path\": \"/readonly/file.txt\", \"content\": \"test\"}",
        output: "Error: Permission denied",
        status: .failed
    )
    .padding()
}

#Preview("Long Output") {
    ToolCallView(
        name: "read_file",
        input: "{\"path\": \"src/main.swift\"}",
        output: (1...50).map { "Line \($0): Some code content here that might be quite long" }.joined(separator: "\n"),
        status: .completed
    )
    .padding()
}
