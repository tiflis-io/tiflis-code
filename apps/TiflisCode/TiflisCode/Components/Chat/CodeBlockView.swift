//
//  CodeBlockView.swift
//  TiflisCode
//
//  Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
//  Licensed under the Functional Source License (FSL-1.1-NC). See LICENSE file for details.
//

import SwiftUI

/// Displays a code block with syntax highlighting, language label, and copy button
struct CodeBlockView: View {
    let language: String?
    let code: String

    /// Max height for code content to prevent huge blocks from breaking scroll
    private let maxContentHeight: CGFloat = 300

    @State private var isCopied = false

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            // Header with language label and copy button
            HStack {
                Text(language ?? "code")
                    .font(.caption)
                    .foregroundStyle(.secondary)

                Spacer()

                Button {
                    copyToClipboard()
                } label: {
                    HStack(spacing: 4) {
                        Image(systemName: isCopied ? "checkmark" : "doc.on.doc")
                            .font(.caption)
                        if isCopied {
                            Text("Copied")
                                .font(.caption)
                        }
                    }
                    .foregroundStyle(isCopied ? .green : .secondary)
                }
                .buttonStyle(.plain)
                .accessibilityLabel(isCopied ? "Copied" : "Copy code")
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .background(Color(.systemGray5))

            // Code content with max height - scrollable if content is too long
            ScrollView {
                Text(code)
                    .font(.system(size: 12, weight: .regular, design: .monospaced))
                    .textSelection(.enabled)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            .frame(maxHeight: maxContentHeight)
            .padding(12)
            .background(Color(.systemGray6))
        }
        .clipShape(RoundedRectangle(cornerRadius: 8))
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Code block, \(language ?? "code")")
        .accessibilityHint("Double tap to copy code")
    }

    private func copyToClipboard() {
        UIPasteboard.general.string = code
        withAnimation {
            isCopied = true
        }

        // Reset after delay
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) {
            withAnimation {
                isCopied = false
            }
        }
    }
}

// MARK: - Preview

#Preview("Swift Code") {
    CodeBlockView(
        language: "swift",
        code: """
        import SwiftUI

        struct ContentView: View {
            @State private var count = 0

            var body: some View {
                Button("Count: \\(count)") {
                    count += 1
                }
            }
        }
        """
    )
    .padding()
}

#Preview("TypeScript Code") {
    CodeBlockView(
        language: "typescript",
        code: """
        import express from 'express';

        const app = express();
        const port = 3000;

        app.get('/', (req, res) => {
          res.send('Hello World!');
        });

        app.listen(port, () => {
          console.log(`Server running at http://localhost:${port}`);
        });
        """
    )
    .padding()
}

#Preview("Long Line") {
    CodeBlockView(
        language: "json",
        code: """
        {"name": "my-app", "version": "1.0.0", "description": "A very long description that should cause horizontal scrolling in the code block view"}
        """
    )
    .padding()
}

#Preview("No Language") {
    CodeBlockView(
        language: nil,
        code: "echo 'Hello World'"
    )
    .padding()
}
