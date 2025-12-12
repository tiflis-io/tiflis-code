//
//  ActionButtonsView.swift
//  TiflisCode
//
//  Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
//  Licensed under the Functional Source License (FSL-1.1-NC). See LICENSE file for details.
//

import SwiftUI

/// Displays a horizontal scrollable row of action buttons
struct ActionButtonsView: View {
    let buttons: [ActionButton]
    var onAction: ((ActionType) -> Void)?

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(buttons) { button in
                    ActionButtonView(button: button) {
                        onAction?(button.action)
                    }
                }
            }
        }
    }
}

/// Individual action button
struct ActionButtonView: View {
    let button: ActionButton
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 4) {
                if let icon = button.icon {
                    Image(systemName: icon)
                        .font(.caption)
                }

                Text(button.title)
                    .font(.subheadline)
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 8)
            .foregroundStyle(foregroundColor)
            .background(backgroundColor)
            .clipShape(Capsule())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(button.title)
        .accessibilityHint("Double tap to \(button.title.lowercased())")
    }

    private var foregroundColor: Color {
        switch button.style {
        case .primary:
            return .white
        case .secondary:
            return .primary
        case .destructive:
            return .white
        }
    }

    private var backgroundColor: Color {
        switch button.style {
        case .primary:
            return .accentColor
        case .secondary:
            return Color(.systemGray5)
        case .destructive:
            return .red
        }
    }
}

// MARK: - Preview

#Preview("Action Buttons") {
    VStack(spacing: 20) {
        ActionButtonsView(
            buttons: [
                ActionButton(title: "Open in Cursor", icon: "arrow.up.right", style: .primary, action: .custom("open_cursor")),
                ActionButton(title: "Run Tests", icon: "play.fill", style: .secondary, action: .custom("run_tests")),
                ActionButton(title: "Create PR", icon: "arrow.triangle.pull", style: .secondary, action: .custom("create_pr"))
            ]
        )

        ActionButtonsView(
            buttons: [
                ActionButton(title: "Create File", icon: "plus.circle", style: .primary, action: .custom("create")),
                ActionButton(title: "Skip", icon: "xmark", style: .secondary, action: .custom("skip"))
            ]
        )

        ActionButtonsView(
            buttons: [
                ActionButton(title: "Retry", icon: "arrow.clockwise", style: .secondary, action: .custom("retry")),
                ActionButton(title: "Cancel", icon: "xmark.circle", style: .destructive, action: .custom("cancel"))
            ]
        )
    }
    .padding()
}

#Preview("Single Button") {
    ActionButtonsView(
        buttons: [
            ActionButton(title: "Continue", icon: "arrow.right", style: .primary, action: .custom("continue"))
        ]
    )
    .padding()
}

#Preview("Many Buttons (Scroll)") {
    ActionButtonsView(
        buttons: [
            ActionButton(title: "Option 1", style: .secondary, action: .custom("1")),
            ActionButton(title: "Option 2", style: .secondary, action: .custom("2")),
            ActionButton(title: "Option 3", style: .secondary, action: .custom("3")),
            ActionButton(title: "Option 4", style: .secondary, action: .custom("4")),
            ActionButton(title: "Option 5", style: .secondary, action: .custom("5"))
        ]
    )
    .padding()
}
