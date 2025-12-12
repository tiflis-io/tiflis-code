//
//  CrashLogView.swift
//  TiflisCode
//
//  Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
//  Licensed under the Functional Source License (FSL-1.1-NC). See LICENSE file for details.
//

import SwiftUI

/// View to display and copy crash logs
struct CrashLogView: View {
    @Environment(\.dismiss) private var dismiss
    @State private var crashLog: String = ""
    @State private var copied = false
    @State private var showClearConfirmation = false

    private let crashReporter = CrashReporter.shared

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                if crashLog.isEmpty {
                    ContentUnavailableView(
                        "No Crash Log",
                        systemImage: "checkmark.circle",
                        description: Text("No crashes have been recorded.")
                    )
                } else {
                    // Crash log content
                    ScrollView {
                        Text(crashLog)
                            .font(.system(.caption, design: .monospaced))
                            .textSelection(.enabled)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding()
                    }
                    .background(Color(uiColor: .secondarySystemBackground))

                    // Action buttons
                    VStack(spacing: 12) {
                        Button {
                            UIPasteboard.general.string = crashLog
                            copied = true

                            // Reset copied state after 2 seconds
                            DispatchQueue.main.asyncAfter(deadline: .now() + 2) {
                                copied = false
                            }
                        } label: {
                            HStack {
                                Image(systemName: copied ? "checkmark" : "doc.on.doc")
                                Text(copied ? "Copied!" : "Copy to Clipboard")
                            }
                            .frame(maxWidth: .infinity)
                        }
                        .buttonStyle(.borderedProminent)

                        Button {
                            shareCrashLog()
                        } label: {
                            HStack {
                                Image(systemName: "square.and.arrow.up")
                                Text("Share")
                            }
                            .frame(maxWidth: .infinity)
                        }
                        .buttonStyle(.bordered)

                        Button(role: .destructive) {
                            showClearConfirmation = true
                        } label: {
                            HStack {
                                Image(systemName: "trash")
                                Text("Clear Crash Log")
                            }
                            .frame(maxWidth: .infinity)
                        }
                        .buttonStyle(.bordered)
                    }
                    .padding()
                }
            }
            .navigationTitle("Crash Log")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Done") {
                        dismiss()
                    }
                }
            }
            .alert("Clear Crash Log?", isPresented: $showClearConfirmation) {
                Button("Clear", role: .destructive) {
                    crashReporter.clearPreviousCrashLog()
                    crashLog = ""
                    dismiss()
                }
                Button("Cancel", role: .cancel) {}
            } message: {
                Text("This will permanently delete the crash log.")
            }
            .onAppear {
                crashLog = crashReporter.getPreviousCrashLog() ?? ""
            }
        }
    }

    private func shareCrashLog() {
        let activityVC = UIActivityViewController(
            activityItems: [crashLog],
            applicationActivities: nil
        )

        // Get the key window scene for iPad popover presentation
        if let windowScene = UIApplication.shared.connectedScenes.first as? UIWindowScene,
           let window = windowScene.windows.first,
           let rootVC = window.rootViewController {
            // iPad requires sourceView for popover
            activityVC.popoverPresentationController?.sourceView = window
            activityVC.popoverPresentationController?.sourceRect = CGRect(
                x: window.bounds.midX,
                y: window.bounds.midY,
                width: 0,
                height: 0
            )
            activityVC.popoverPresentationController?.permittedArrowDirections = []

            rootVC.present(activityVC, animated: true)
        }
    }
}

#Preview {
    CrashLogView()
}
