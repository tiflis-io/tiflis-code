//
//  ContentView.swift
//  TiflisCode
//
//  Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
//  Licensed under the MIT License. See LICENSE file for details.
//

import SwiftUI

/// Main content view with adaptive navigation
struct ContentView: View {
    @EnvironmentObject private var appState: AppState
    @State private var showCreateSessionSheet = false
    @Environment(\.horizontalSizeClass) private var horizontalSizeClass
    
    var body: some View {
        Group {
            if horizontalSizeClass == .compact {
                // iPhone: Custom drawer navigation
                DrawerNavigationView(showCreateSessionSheet: $showCreateSessionSheet)
            } else {
                // iPad: Standard split view
                iPadNavigationView(showCreateSessionSheet: $showCreateSessionSheet)
            }
        }
        .sheet(isPresented: $showCreateSessionSheet) {
            CreateSessionSheet()
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
    
    var body: some View {
        GeometryReader { geometry in
            let drawerWidth = geometry.size.width
            
            ZStack(alignment: .leading) {
                // Main content
                NavigationStack {
                    if appState.isShowingSettings {
                        SettingsView(onMenuTap: { 
                            hideKeyboard()
                            withAnimation(.easeOut(duration: 0.25)) { isDrawerOpen = true } 
                        })
                    } else if let session = appState.selectedSession {
                        SessionDetailView(
                            session: session,
                            columnVisibility: .constant(.detailOnly),
                            onMenuTap: { 
                                hideKeyboard()
                                withAnimation(.easeOut(duration: 0.25)) { isDrawerOpen = true } 
                            }
                        )
                    } else {
                        EmptyStateView()
                    }
                }
                .frame(width: geometry.size.width)
                .allowsHitTesting(!isDrawerOpen)
                .environment(\.isDrawerOpen, isDrawerOpen)
                
                // Drawer (full width)
                NavigationStack {
                    SidebarView(
                        showCreateSessionSheet: $showCreateSessionSheet,
                        onDismiss: {
                            withAnimation(.easeOut(duration: 0.25)) {
                                isDrawerOpen = false
                            }
                        }
                    )
                    .onChange(of: appState.selectedSessionId) { _, _ in
                        withAnimation(.easeOut(duration: 0.25)) {
                            isDrawerOpen = false
                        }
                    }
                }
                .frame(width: drawerWidth)
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
                        
                        withAnimation(.easeOut(duration: 0.25)) {
                            if isDrawerOpen {
                                // Close if dragged left enough or fast enough
                                if translation < -drawerWidth / 3 || velocity < -500 {
                                    isDrawerOpen = false
                                }
                            } else {
                                // Open ONLY if started from left edge AND dragged right enough
                                if startX < edgeWidth && (translation > drawerWidth / 3 || velocity > 500) {
                                    hideKeyboard()
                                    isDrawerOpen = true
                                }
                            }
                            dragOffset = 0
                        }
                    }
            )
            .onChange(of: isDrawerOpen) { oldValue, newValue in
                if newValue {
                    // Drawer opened - hide keyboard
                    hideKeyboard()
                }
                // When drawer closes, TerminalView will restore focus via onChange
            }
        }
    }
    
    private func drawerOffsetValue(drawerWidth: CGFloat) -> CGFloat {
        if isDrawerOpen {
            return dragOffset // 0 when open, negative when dragging to close
        } else {
            return -drawerWidth + dragOffset // Hidden by default, positive when dragging to open
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
                    onMenuTap: onMenuTap
                )
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
