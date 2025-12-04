//
//  ToolCallView.swift
//  TiflisCode
//
//  Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
//  Licensed under the MIT License. See LICENSE file for details.
//

import SwiftUI

/// Displays a tool call with collapsible input/output details
struct ToolCallView: View {
    let name: String
    let input: String?
    let output: String?
    let status: ToolStatus

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
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Tool call: \(displayName), \(status.rawValue)")
            .accessibilityHint("Double tap to \(isExpanded ? "collapse" : "expand") details")

            // Collapsible content
            if isExpanded {
                VStack(alignment: .leading, spacing: 12) {
                    // Input section
                    if let input = input, !input.isEmpty {
                        VStack(alignment: .leading, spacing: 4) {
                            Text("Input:")
                                .font(.caption)
                                .foregroundStyle(.secondary)

                            CodeBlockView(language: "json", code: input)
                        }
                    }

                    // Output section
                    if let output = output, !output.isEmpty {
                        VStack(alignment: .leading, spacing: 4) {
                            Text("Output:")
                                .font(.caption)
                                .foregroundStyle(.secondary)

                            CodeBlockView(language: nil, code: output)
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

#Preview("Expanded by Default") {
    VStack {
        ToolCallView(
            name: "bash",
            input: "{\"command\": \"npm install\"}",
            output: "added 150 packages in 3.2s",
            status: .completed
        )
    }
    .padding()
}
