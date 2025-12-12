//
//  CancelView.swift
//  TiflisCode
//
//  Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
//  Licensed under the Functional Source License (FSL-1.1-NC). See LICENSE file for details.
//

import SwiftUI

/// Displays a cancellation message with subtle styling
struct CancelView: View {
    let text: String

    var body: some View {
        HStack(alignment: .center, spacing: 8) {
            Image(systemName: "stop.circle")
                .font(.body)
                .foregroundStyle(.secondary)

            Text(text)
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color(.systemGray5).opacity(0.5))
        .clipShape(RoundedRectangle(cornerRadius: 8))
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Cancelled: \(text)")
    }
}

// MARK: - Preview

#Preview("Cancel Messages") {
    VStack(spacing: 16) {
        CancelView(text: "Cancelled by user")

        CancelView(text: "Operation cancelled")

        CancelView(text: "Request cancelled")
    }
    .padding()
}
