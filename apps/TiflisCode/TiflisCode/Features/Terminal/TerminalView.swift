//
//  TerminalView.swift
//  TiflisCode
//
//  Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
//  Licensed under the MIT License. See LICENSE file for details.
//

import SwiftUI

/// Terminal emulator view
/// Note: This is a placeholder. The actual implementation will use SwiftTerm library.
struct TerminalView: View {
    let session: Session
    @Binding var columnVisibility: NavigationSplitViewVisibility
    var onMenuTap: (() -> Void)?
    @EnvironmentObject private var appState: AppState
    @State private var terminalOutput: [TerminalLine] = []
    @State private var currentInput = ""
    @State private var showConnectionPopover = false
    @FocusState private var isInputFocused: Bool
    
    var body: some View {
        VStack(spacing: 0) {
            // Terminal content
            ScrollViewReader { proxy in
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 0) {
                        ForEach(terminalOutput) { line in
                            TerminalLineView(line: line)
                                .id(line.id)
                        }
                        
                        // Current input line
                        HStack(spacing: 0) {
                            Text("$ ")
                                .foregroundStyle(.green)
                            
                            TextField("", text: $currentInput)
                                .textFieldStyle(.plain)
                                .foregroundStyle(.white)
                                .focused($isInputFocused)
                                .onSubmit {
                                    executeCommand()
                                }
                        }
                        .font(.system(.body, design: .monospaced))
                        .padding(.horizontal, 12)
                        .padding(.vertical, 4)
                        .id("input")
                    }
                }
                .background(Color.black)
                .contentShape(Rectangle())
                .onTapGesture {
                    hideKeyboard()
                }
                .onChange(of: terminalOutput.count) { _, _ in
                    withAnimation {
                        proxy.scrollTo("input", anchor: .bottom)
                    }
                }
            }
        }
        .navigationBarTitleDisplayMode(.inline)
        .navigationBarBackButtonHidden(true)
        .toolbar {
            ToolbarItem(placement: .topBarLeading) {
                Button {
                    if let onMenuTap = onMenuTap {
                        // iPhone: open drawer
                        onMenuTap()
                    } else {
                        // iPad: toggle sidebar visibility
                        withAnimation {
                            columnVisibility = columnVisibility == .all ? .detailOnly : .all
                        }
                    }
                } label: {
                    Image(systemName: "sidebar.leading")
                }
            }
            
            ToolbarItem(placement: .principal) {
                VStack(spacing: 2) {
                    Text("Terminal")
                        .font(.headline)
                    if let subtitle = session.subtitle {
                        Text(subtitle)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
            }
            
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    showConnectionPopover = true
                } label: {
                    ConnectionIndicator()
                }
                .popover(isPresented: $showConnectionPopover) {
                    ConnectionPopover()
                }
            }
            
            ToolbarItem(placement: .topBarTrailing) {
                Menu {
                    Button {
                        terminalOutput.removeAll()
                    } label: {
                        Label("Clear Terminal", systemImage: "trash")
                    }
                    
                    Button(role: .destructive) {
                        appState.terminateSession(session)
                    } label: {
                        Label("Terminate Session", systemImage: "xmark.circle")
                    }
                } label: {
                    Image(systemName: "ellipsis.circle")
                }
            }
        }
        .toolbarBackground(.visible, for: .navigationBar)
        .onAppear {
            loadInitialOutput()
            isInputFocused = true
        }
    }
    
    private func loadInitialOutput() {
        terminalOutput = [
            TerminalLine(content: "Welcome to Tiflis Code Terminal", type: .system),
            TerminalLine(content: "Connected to workstation: MacBook Pro", type: .system),
            TerminalLine(content: "Working directory: tiflis/tiflis-code", type: .system),
            TerminalLine(content: "", type: .output),
            TerminalLine(content: "$ ls -la", type: .input),
            TerminalLine(content: "total 128", type: .output),
            TerminalLine(content: "drwxr-xr-x  15 user  staff   480 Nov 29 10:30 .", type: .output),
            TerminalLine(content: "drwxr-xr-x   8 user  staff   256 Nov 28 14:22 ..", type: .output),
            TerminalLine(content: "-rw-r--r--   1 user  staff  3521 Nov 29 10:30 CLAUDE.md", type: .output),
            TerminalLine(content: "drwxr-xr-x   4 user  staff   128 Nov 29 10:30 packages", type: .output),
            TerminalLine(content: "", type: .output)
        ]
    }
    
    private func executeCommand() {
        guard !currentInput.isEmpty else { return }
        
        // Add command to output
        terminalOutput.append(TerminalLine(content: "$ \(currentInput)", type: .input))
        
        // Simulate command execution
        let command = currentInput
        currentInput = ""
        
        // Add mock output based on command
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.2) {
            let output = mockCommandOutput(for: command)
            for line in output {
                terminalOutput.append(TerminalLine(content: line, type: .output))
            }
        }
    }
    
    private func mockCommandOutput(for command: String) -> [String] {
        switch command.lowercased() {
        case "pwd":
            return ["tiflis/tiflis-code"]
        case "whoami":
            return ["user"]
        case "date":
            return [Date().formatted()]
        case let cmd where cmd.hasPrefix("echo "):
            return [String(cmd.dropFirst(5))]
        case "clear":
            terminalOutput.removeAll()
            return []
        default:
            return ["Command executed: \(command)"]
        }
    }
}

/// Represents a line in the terminal output
struct TerminalLine: Identifiable {
    let id = UUID()
    let content: String
    let type: LineType
    
    enum LineType {
        case input
        case output
        case error
        case system
    }
}

/// View for rendering a single terminal line
struct TerminalLineView: View {
    let line: TerminalLine
    
    var body: some View {
        Text(line.content)
            .font(.system(.body, design: .monospaced))
            .foregroundStyle(textColor)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 12)
            .padding(.vertical, 1)
            .textSelection(.enabled)
    }
    
    private var textColor: Color {
        switch line.type {
        case .input:
            return .white
        case .output:
            return .white.opacity(0.9)
        case .error:
            return .red
        case .system:
            return .cyan
        }
    }
}

// MARK: - Preview

#Preview {
    NavigationStack {
        TerminalView(session: .mockTerminalSession, columnVisibility: .constant(.all))
    }
    .environmentObject(AppState())
}
