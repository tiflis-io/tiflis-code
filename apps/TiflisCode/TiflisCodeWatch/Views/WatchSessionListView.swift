//
//  WatchSessionListView.swift
//  TiflisCodeWatch
//
//  Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
//  Licensed under the Functional Source License (FSL-1.1-NC). See LICENSE file for details.
//

import SwiftUI

/// Unified session list with Supervisor at top, then agent sessions
struct WatchSessionListView: View {
    @EnvironmentObject var appState: WatchAppState
    @Binding var navigationPath: NavigationPath

    var body: some View {
        List {
            // Supervisor row (always first)
            supervisorSection

            // Agent sessions
            if !appState.agentSessions.isEmpty {
                agentSessionsSection
            }
        }
        .listStyle(.carousel)
        .navigationTitle("")
        .toolbar {
            ToolbarItem(placement: .topBarLeading) {
                HStack(spacing: 6) {
                    Text("Tiflis Code")
                        .font(.footnote)
                        .fontWeight(.semibold)
                    Circle()
                        .fill(appState.connectionState.indicatorColor)
                        .frame(width: 6, height: 6)
                }
            }
        }
        .onAppear {
            NSLog("⌚️ WatchSessionListView appeared: sessions=%d, agentSessions=%d, connectionState=%@",
                  appState.sessions.count,
                  appState.agentSessions.count,
                  "\(appState.connectionState)")
        }
    }

    // MARK: - Sections

    private var supervisorSection: some View {
        Section {
            Button {
                navigationPath.append(WatchChatDestination.supervisor)
            } label: {
                WatchSessionRow(
                    icon: AnyView(
                        Image("TiflisLogo")
                            .resizable()
                            .scaledToFit()
                    ),
                    title: "Supervisor",
                    isActive: appState.connectionState.isConnected && appState.workstationOnline,
                    hasUnread: appState.supervisorIsLoading
                )
            }
            .buttonStyle(.plain)
        }
    }

    private var agentSessionsSection: some View {
        Section {
            ForEach(appState.agentSessions) { session in
                Button {
                    navigationPath.append(WatchChatDestination.agent(session))
                } label: {
                    WatchSessionRow(
                        icon: AnyView(sessionIcon(for: session)),
                        title: session.fullDisplayName(relativeTo: appState.workspacesRoot),
                        isActive: session.status == .active,
                        hasUnread: appState.agentIsLoading[session.id] ?? false
                    )
                }
                .buttonStyle(.plain)
            }
        } header: {
            Text("Sessions")
                .font(.caption2)
                .foregroundStyle(.secondary)
        }
    }

    // MARK: - Helper Methods

    @ViewBuilder
    private func sessionIcon(for session: Session) -> some View {
        if let customIcon = session.type.customIcon {
            Image(customIcon)
                .resizable()
                .scaledToFit()
        } else {
            Image(systemName: session.type.sfSymbol)
                .foregroundStyle(iconColor(for: session.type))
        }
    }

    private func iconColor(for type: Session.SessionType) -> Color {
        switch type {
        case .claude:
            return .orange
        case .cursor:
            return .blue
        case .opencode:
            return .green
        default:
            return .secondary
        }
    }
}

/// Row displaying a single session in the list
struct WatchSessionRow: View {
    let icon: AnyView
    let title: String
    let isActive: Bool
    let hasUnread: Bool

    var body: some View {
        HStack(spacing: 8) {
            // Session icon
            icon
                .frame(width: 20, height: 20)

            // Session name with marquee scrolling (includes workspace/project for agents)
            MarqueeText(text: title, font: .system(size: 13), height: 16)

            Spacer()

            // Loading indicator only (status dot removed - it's in header now)
            if hasUnread {
                ProgressView()
                    .scaleEffect(0.5)
            }
        }
        .padding(.vertical, 2)
    }
}

/// Marquee scrolling text for long session names
/// Text starts left-aligned and scrolls left to reveal overflow
struct MarqueeText: View {
    let text: String
    let font: Font
    var height: CGFloat?

    @State private var textWidth: CGFloat = 0
    @State private var containerWidth: CGFloat = 0
    @State private var offset: CGFloat = 0
    @State private var animationTask: Task<Void, Never>?

    private var needsScrolling: Bool {
        textWidth > containerWidth && containerWidth > 0
    }

    init(text: String, font: Font, height: CGFloat? = nil) {
        self.text = text
        self.font = font
        self.height = height
    }

    var body: some View {
        GeometryReader { geometry in
            HStack(spacing: 0) {
                Text(text)
                    .font(font)
                    .lineLimit(1)
                    .fixedSize(horizontal: true, vertical: false)
                    .background(
                        GeometryReader { textGeometry in
                            Color.clear
                                .onAppear {
                                    textWidth = textGeometry.size.width
                                    containerWidth = geometry.size.width
                                    startAnimationIfNeeded()
                                }
                                .onChange(of: geometry.size.width) { _, newWidth in
                                    containerWidth = newWidth
                                    restartAnimation()
                                }
                        }
                    )
                    .offset(x: offset)
                Spacer(minLength: 0)
            }
        }
        .frame(height: height ?? fontHeight)
        .clipped()
        .onChange(of: text) { _, _ in
            restartAnimation()
        }
        .onDisappear {
            animationTask?.cancel()
        }
    }

    private var fontHeight: CGFloat {
        16 // Default for watchOS small text
    }

    private func startAnimationIfNeeded() {
        guard needsScrolling else { return }

        let scrollDistance = textWidth - containerWidth + 10 // Small padding at end

        // Start with delay, then animate left
        animationTask = Task { @MainActor in
            try? await Task.sleep(for: .seconds(2.0)) // Pause before scrolling
            guard !Task.isCancelled else { return }

            // Scroll left to show overflow
            withAnimation(.linear(duration: Double(scrollDistance) / 25.0)) {
                offset = -scrollDistance
            }

            // Pause at end
            try? await Task.sleep(for: .seconds(Double(scrollDistance) / 25.0 + 1.5))
            guard !Task.isCancelled else { return }

            // Reset instantly
            withAnimation(.none) {
                offset = 0
            }

            // Pause before restarting
            try? await Task.sleep(for: .seconds(1.0))
            guard !Task.isCancelled else { return }

            startAnimationIfNeeded()
        }
    }

    private func restartAnimation() {
        animationTask?.cancel()
        offset = 0
        textWidth = 0
        Task { @MainActor in
            try? await Task.sleep(for: .milliseconds(100))
            startAnimationIfNeeded()
        }
    }
}

/// Compact marquee text for navigation bars with fixed max width
struct CompactMarqueeText: View {
    let text: String
    let font: Font
    let maxWidth: CGFloat

    @State private var textWidth: CGFloat = 0
    @State private var offset: CGFloat = 0
    @State private var animationTask: Task<Void, Never>?

    private var needsScrolling: Bool {
        textWidth > maxWidth
    }

    var body: some View {
        HStack(spacing: 0) {
            Text(text)
                .font(font)
                .lineLimit(1)
                .fixedSize(horizontal: true, vertical: false)
                .background(
                    GeometryReader { textGeometry in
                        Color.clear
                            .onAppear {
                                textWidth = textGeometry.size.width
                                startAnimationIfNeeded()
                            }
                    }
                )
                .offset(x: offset)
            Spacer(minLength: 0)
        }
        .frame(width: maxWidth, alignment: .leading)
        .clipped()
        .onChange(of: text) { _, _ in
            restartAnimation()
        }
        .onDisappear {
            animationTask?.cancel()
        }
    }

    private func startAnimationIfNeeded() {
        guard needsScrolling else { return }

        let scrollDistance = textWidth - maxWidth + 8

        animationTask = Task { @MainActor in
            try? await Task.sleep(for: .seconds(1.5))
            guard !Task.isCancelled else { return }

            withAnimation(.linear(duration: Double(scrollDistance) / 20.0)) {
                offset = -scrollDistance
            }

            try? await Task.sleep(for: .seconds(Double(scrollDistance) / 20.0 + 1.5))
            guard !Task.isCancelled else { return }

            withAnimation(.none) {
                offset = 0
            }

            try? await Task.sleep(for: .seconds(0.8))
            guard !Task.isCancelled else { return }

            startAnimationIfNeeded()
        }
    }

    private func restartAnimation() {
        animationTask?.cancel()
        offset = 0
        textWidth = 0
        Task { @MainActor in
            try? await Task.sleep(for: .milliseconds(100))
            startAnimationIfNeeded()
        }
    }
}

#Preview {
    NavigationStack {
        WatchSessionListView(navigationPath: .constant(NavigationPath()))
            .environmentObject(WatchAppState())
    }
}
