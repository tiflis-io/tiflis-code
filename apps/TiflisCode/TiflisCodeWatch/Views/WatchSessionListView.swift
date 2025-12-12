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
                    subtitle: nil,
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
                        title: session.displayName,
                        subtitle: sessionSubtitle(for: session),
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

    private func sessionSubtitle(for session: Session) -> String? {
        if let workspace = session.workspace, let project = session.project {
            if let worktree = session.worktree {
                return "\(workspace)/\(project)--\(worktree)"
            }
            return "\(workspace)/\(project)"
        }
        return nil
    }
}

/// Row displaying a single session in the list
struct WatchSessionRow: View {
    let icon: AnyView
    let title: String
    let subtitle: String?
    let isActive: Bool
    let hasUnread: Bool

    var body: some View {
        HStack(spacing: 8) {
            // Session icon
            icon
                .frame(width: 20, height: 20)

            VStack(alignment: .leading, spacing: 1) {
                // Session name
                Text(title)
                    .font(.system(size: 13))
                    .lineLimit(1)

                // Project/workspace info
                if let subtitle = subtitle {
                    Text(subtitle)
                        .font(.system(size: 10))
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }
            }

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
struct MarqueeText: View {
    let text: String
    let font: Font

    @State private var textWidth: CGFloat = 0
    @State private var containerWidth: CGFloat = 0
    @State private var offset: CGFloat = 0
    @State private var animationId = UUID()

    private var needsScrolling: Bool {
        textWidth > containerWidth && containerWidth > 0
    }

    var body: some View {
        GeometryReader { geometry in
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
                    }
                )
                .offset(x: needsScrolling ? offset : 0)
        }
        .frame(height: fontHeight)
        .clipped()
        .onChange(of: text) { _, _ in
            resetAnimation()
        }
    }

    private var fontHeight: CGFloat {
        switch font {
        case .caption:
            return 16
        case .caption2:
            return 14
        default:
            return 16
        }
    }

    private func startAnimationIfNeeded() {
        guard needsScrolling else { return }

        let scrollDistance = textWidth - containerWidth + 20
        let duration = Double(scrollDistance) / 20.0

        // Start with delay, then animate
        Task {
            try? await Task.sleep(for: .seconds(1.5))
            guard !Task.isCancelled else { return }

            withAnimation(.linear(duration: duration)) {
                offset = -scrollDistance
            }

            // Wait and reset
            try? await Task.sleep(for: .seconds(duration + 2))
            guard !Task.isCancelled else { return }

            withAnimation(.none) {
                offset = 0
            }

            // Restart animation
            try? await Task.sleep(for: .seconds(0.5))
            guard !Task.isCancelled else { return }

            startAnimationIfNeeded()
        }
    }

    private func resetAnimation() {
        offset = 0
        animationId = UUID()
        textWidth = 0
        containerWidth = 0
    }
}

#Preview {
    NavigationStack {
        WatchSessionListView(navigationPath: .constant(NavigationPath()))
            .environmentObject(WatchAppState())
    }
}
