//
//  View+Extensions.swift
//  TiflisCode
//
//  Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
//  Licensed under the MIT License. See LICENSE file for details.
//

import SwiftUI

// MARK: - Keyboard Handling

extension View {
    /// Dismisses the keyboard
    @MainActor
    func hideKeyboard() {
        UIApplication.shared.sendAction(
            #selector(UIResponder.resignFirstResponder),
            to: nil,
            from: nil,
            for: nil
        )
    }
}

/// A global function to hide keyboard (for use outside of View context)
@MainActor
func hideKeyboard() {
    UIApplication.shared.sendAction(
        #selector(UIResponder.resignFirstResponder),
        to: nil,
        from: nil,
        for: nil
    )
}

// MARK: - Drawer State Environment

private struct IsDrawerOpenKey: EnvironmentKey {
    static let defaultValue = false
}

extension EnvironmentValues {
    var isDrawerOpen: Bool {
        get { self[IsDrawerOpenKey.self] }
        set { self[IsDrawerOpenKey.self] = newValue }
    }
}
