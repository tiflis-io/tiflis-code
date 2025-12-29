//
//  ContentView.swift
//  TiflisCode
//
//  Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
//  Licensed under the Functional Source License (FSL-1.1-NC). See LICENSE file for details.
//

import SwiftUI

/// Main content view with adaptive navigation
struct ContentView: View {
    @EnvironmentObject private var appState: AppState
    @State private var showCreateSessionSheet = false
    @Environment(\.horizontalSizeClass) private var horizontalSizeClass
    
    /// Check if we should show the connect screen
    /// Show ConnectView when:
    /// 1. No connection config exists (first launch or after disconnect & forget)
    /// 2. Not in screenshot testing mode (screenshots need full app)
    private var shouldShowConnectView: Bool {
        !appState.hasConnectionConfig && !AppState.isScreenshotTesting
    }
    
    var body: some View {
        Group {
            if shouldShowConnectView {
                // Not connected: Show connect screen
                ConnectView()
            } else if horizontalSizeClass == .compact {
                // iPhone: Custom drawer navigation
                DrawerNavigationView(showCreateSessionSheet: $showCreateSessionSheet)
            } else {
                // iPad: Standard split view
                iPadNavigationView(showCreateSessionSheet: $showCreateSessionSheet)
            }
        }
        .sheet(isPresented: $showCreateSessionSheet) {
            CreateSessionSheet()
                .environmentObject(appState)
        }
    }
}

// MARK: - iPad Navigation (Split View)

struct iPadNavigationView: View {
    @EnvironmentObject private var appState: AppState
    @Binding var showCreateSessionSheet: Bool
    @State private var columnVisibility: NavigationSplitViewVisibility = .all
    
    var body: some View {
        NavigationSplitView(columnVisibility: $columnVisibility) {
            SidebarView(showCreateSessionSheet: $showCreateSessionSheet)
        } detail: {
            if appState.isShowingSettings {
                SettingsView()
            } else if let session = appState.selectedSession {
                SessionDetailView(
                    session: session,
                    columnVisibility: $columnVisibility
                )
            } else {
                EmptyStateView()
            }
        }
        .navigationSplitViewStyle(.balanced)
    }
}

// MARK: - iPhone Navigation (Drawer)

struct DrawerNavigationView: View {
    @EnvironmentObject private var appState: AppState
    @Binding var showCreateSessionSheet: Bool

    @State private var isDrawerOpen = false
    @State private var dragOffset: CGFloat = 0

    private let edgeWidth: CGFloat = 20

    /// Check if drawer should be pre-opened for screenshots
    private var shouldPreOpenDrawer: Bool {
        AppState.isScreenshotTesting &&
        ProcessInfo.processInfo.environment["SCREENSHOT_DRAWER_OPEN"] == "1"
    }

    /// Helper to set drawer state - disables animation in screenshot testing mode
    private func setDrawerOpen(_ open: Bool) {
        if AppState.isScreenshotTesting {
            // Skip animation entirely in screenshot testing mode to avoid UI test hangs
            var transaction = Transaction()
            transaction.disablesAnimations = true
            withTransaction(transaction) {
                isDrawerOpen = open
            }
        } else {
            withAnimation(.easeOut(duration: 0.25)) {
                isDrawerOpen = open
            }
        }
    }

    /// Helper to set drag offset with optional animation
    private func setDragOffset(_ offset: CGFloat, animated: Bool = false) {
        if AppState.isScreenshotTesting || !animated {
            var transaction = Transaction()
            transaction.disablesAnimations = true
            withTransaction(transaction) {
                dragOffset = offset
            }
        } else {
            withAnimation(.easeOut(duration: 0.25)) {
                dragOffset = offset
            }
        }
    }

    var body: some View {
        GeometryReader { geometry in
            let drawerWidth = geometry.size.width

            ZStack(alignment: .leading) {
                // Main content
                NavigationStack {
                    if appState.isShowingSettings {
                        SettingsView(onMenuTap: {
                            hideKeyboard()
                            setDrawerOpen(true)
                        })
                    } else if let session = appState.selectedSession {
                        SessionDetailView(
                            session: session,
                            columnVisibility: .constant(.detailOnly),
                            onMenuTap: {
                                hideKeyboard()
                                setDrawerOpen(true)
                            }
                        )
                    } else {
                        EmptyStateView()
                    }
                }
                .frame(width: geometry.size.width)
                .allowsHitTesting(!isDrawerOpen)
                .environment(\.isDrawerOpen, isDrawerOpen)

                // Drawer (full width with solid background)
                // Add extra width buffer to ensure full coverage (safe area + list insets)
                ZStack(alignment: .leading) {
                    // Solid opaque background to cover main content completely
                    Color(.systemGroupedBackground)

                    NavigationStack {
                        SidebarView(
                            showCreateSessionSheet: $showCreateSessionSheet,
                            onDismiss: {
                                setDrawerOpen(false)
                            }
                        )
                        .onChange(of: appState.selectedSessionId) { _, _ in
                            // Don't close drawer on silent session changes (e.g., terminating from sidebar)
                            if !appState.isSilentSessionChange {
                                setDrawerOpen(false)
                            }
                        }
                    }
                    .frame(width: drawerWidth)
                }
                .frame(width: drawerWidth + 50) // Extra buffer for safe area
                .offset(x: drawerOffsetValue(drawerWidth: drawerWidth))
                .allowsHitTesting(drawerOffsetValue(drawerWidth: drawerWidth) > -drawerWidth * 0.9)
            }
            .gesture(
                DragGesture()
                    .onChanged { value in
                        let startX = value.startLocation.x
                        let translation = value.translation.width

                        if isDrawerOpen {
                            // Closing: allow drag from anywhere
                            if translation < 0 {
                                dragOffset = max(translation, -drawerWidth)
                            }
                        } else {
                            // Opening: ONLY from left edge (strict check)
                            if startX < edgeWidth && translation > 0 {
                                dragOffset = min(translation, drawerWidth)
                            } else {
                                // Ignore swipes from other areas
                                dragOffset = 0
                            }
                        }
                    }
                    .onEnded { value in
                        let startX = value.startLocation.x
                        let velocity = value.velocity.width
                        let translation = value.translation.width

                        if isDrawerOpen {
                            // Close if dragged left enough or fast enough
                            if translation < -drawerWidth / 3 || velocity < -500 {
                                setDrawerOpen(false)
                            }
                        } else {
                            // Open ONLY if started from left edge AND dragged right enough
                            if startX < edgeWidth && (translation > drawerWidth / 3 || velocity > 500) {
                                hideKeyboard()
                                setDrawerOpen(true)
                            }
                        }
                        setDragOffset(0, animated: !AppState.isScreenshotTesting)
                    }
            )
            .onChange(of: isDrawerOpen) { oldValue, newValue in
                if newValue {
                    // Drawer opened - hide keyboard
                    hideKeyboard()
                }
                // When drawer closes, TerminalView will restore focus via onChange
            }
            .onAppear {
                // Pre-open drawer for navigation screenshot
                if shouldPreOpenDrawer {
                    isDrawerOpen = true
                }
            }
        }
    }
    
    private func drawerOffsetValue(drawerWidth: CGFloat) -> CGFloat {
        // Include the extra buffer (50pt) to fully hide the drawer when closed
        let fullDrawerWidth = drawerWidth + 50
        if isDrawerOpen {
            return dragOffset // 0 when open, negative when dragging to close
        } else {
            return -fullDrawerWidth + dragOffset // Hidden completely, positive when dragging to open
        }
    }
}

// MARK: - Session Detail View

/// Routes to the appropriate view based on session type
struct SessionDetailView: View {
    let session: Session
    @Binding var columnVisibility: NavigationSplitViewVisibility
    var onMenuTap: (() -> Void)? = nil
    @EnvironmentObject private var appState: AppState
    
    var body: some View {
        Group {
            switch session.type {
            case .supervisor, .cursor, .claude, .opencode:
                ChatView(
                    session: session,
                    columnVisibility: $columnVisibility,
                    onMenuTap: onMenuTap,
                    connectionService: appState.connectionService,
                    appState: appState
                )
                .id(session.id)  // Force SwiftUI to create new ViewModel for each session
            case .terminal:
                TerminalView(
                    session: session,
                    columnVisibility: $columnVisibility,
                    onMenuTap: onMenuTap,
                    connectionService: appState.connectionService
                )
                .id(session.id)  // Force SwiftUI to create new ViewModel for each session
            }
        }
    }
}

// MARK: - Empty State

/// View displayed when no session is selected
struct EmptyStateView: View {
    var body: some View {
        VStack(spacing: 16) {
            Image(systemName: "brain")
                .font(.system(size: 64))
                .foregroundStyle(.secondary)
            
            Text("Select a Session")
                .font(.title2)
                .fontWeight(.medium)
            
            Text("Choose a session from the sidebar or create a new one")
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
        }
        .padding()
    }
}

// MARK: - Preview

#Preview {
    ContentView()
        .environmentObject(AppState())
}
