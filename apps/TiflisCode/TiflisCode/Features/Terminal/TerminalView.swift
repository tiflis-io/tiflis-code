//
//  TerminalView.swift
//  TiflisCode
//
//  Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
//  Licensed under the MIT License. See LICENSE file for details.
//

import SwiftUI

/// Terminal emulator view using SwiftTerm
struct TerminalView: View {
    let session: Session
    @Binding var columnVisibility: NavigationSplitViewVisibility
    var onMenuTap: (() -> Void)?
    @EnvironmentObject private var appState: AppState
    @StateObject private var viewModel: TerminalViewModel
    @State private var showConnectionPopover = false
    @Environment(\.isDrawerOpen) private var isDrawerOpen
    
    init(
        session: Session,
        columnVisibility: Binding<NavigationSplitViewVisibility>,
        onMenuTap: (() -> Void)? = nil,
        connectionService: ConnectionServicing
    ) {
        self.session = session
        self._columnVisibility = columnVisibility
        self.onMenuTap = onMenuTap
        
        // Create view model with dependencies from AppState
        // Note: The session ID might be updated later by AppState when the backend responds
        // The view model will observe session changes via the connectionService
        self._viewModel = StateObject(
            wrappedValue: TerminalViewModel(
                session: session,
                webSocketClient: connectionService.webSocketClient,
                connectionService: connectionService
            )
        )
    }
    
    var body: some View {
        VStack(spacing: 0) {
            if viewModel.isConnected {
                TerminalContentView(
                    terminal: viewModel.terminal,
                    viewModel: viewModel
                )
                .background(Color.black)
            } else {
                VStack(spacing: 16) {
                    Image(systemName: "apple.terminal.fill")
                        .font(.system(size: 48))
                        .foregroundStyle(.secondary)
                    
                    Text("Terminal Disconnected")
                        .font(.headline)
                        .foregroundStyle(.secondary)
                    
                    if let error = viewModel.error {
                        Text(error)
                            .font(.caption)
                            .foregroundStyle(.red)
                            .multilineTextAlignment(.center)
                            .padding(.horizontal)
                    }
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .background(Color.black)
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
            // Subscribe to session when view appears
            // This will automatically request replay from server to restore terminal history
            Task { @MainActor in
                await viewModel.subscribeToSession()
            }
        }
        .onDisappear {
            // Unsubscribe when view disappears to clean up resources
            // State will be reloaded from server when view reappears
            viewModel.unsubscribeFromSession()
        }
    }
}

// MARK: - Preview

#Preview {
    NavigationStack {
        let appState = AppState()
        TerminalView(
            session: .mockTerminalSession,
            columnVisibility: .constant(.all),
            connectionService: appState.connectionService
        )
    }
    .environmentObject(AppState())
}
