//
//  TiflisCodeWatchApp.swift
//  TiflisCodeWatch
//
//  Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
//  Licensed under the MIT License. See LICENSE file for details.
//

import SwiftUI

@main
struct TiflisCodeWatchApp: App {
    var body: some Scene {
        WindowGroup {
            WatchContentView()
        }
    }
}

/// Main content view for watchOS app
struct WatchContentView: View {
    @State private var selectedTab = 0
    
    var body: some View {
        TabView(selection: $selectedTab) {
            // Supervisor view
            WatchSupervisorView()
                .tag(0)
            
            // Session list
            WatchSessionListView()
                .tag(1)
        }
        .tabViewStyle(.verticalPage)
    }
}

/// Supervisor interaction view for watchOS
struct WatchSupervisorView: View {
    @State private var isRecording = false
    
    var body: some View {
        VStack(spacing: 16) {
            // Status indicator
            HStack {
                Circle()
                    .fill(.green)
                    .frame(width: 8, height: 8)
                Text("Connected")
                    .font(.caption2)
            }
            
            Spacer()
            
            // Voice button
            Button {
                isRecording.toggle()
            } label: {
                Image(systemName: isRecording ? "stop.circle.fill" : "mic.circle.fill")
                    .font(.system(size: 48))
                    .foregroundStyle(isRecording ? Color.red : Color.accentColor)
            }
            .buttonStyle(.plain)
            
            Text(isRecording ? "Listening..." : "Tap to speak")
                .font(.caption)
                .foregroundStyle(.secondary)
            
            Spacer()
        }
        .navigationTitle("Supervisor")
    }
}

/// Session list view for watchOS
struct WatchSessionListView: View {
    var body: some View {
        List {
            Section("Active Sessions") {
                NavigationLink {
                    WatchAgentChatView(agentName: "Claude")
                } label: {
                    HStack {
                        Image(systemName: "brain.head.profile")
                            .foregroundStyle(.orange)
                        Text("Claude")
                    }
                }
                
                NavigationLink {
                    WatchAgentChatView(agentName: "Cursor")
                } label: {
                    HStack {
                        Image(systemName: "cursorarrow.rays")
                            .foregroundStyle(.blue)
                        Text("Cursor")
                    }
                }
            }
        }
        .navigationTitle("Sessions")
    }
}

/// Agent chat view for watchOS
struct WatchAgentChatView: View {
    let agentName: String
    @State private var isRecording = false
    
    var body: some View {
        VStack(spacing: 12) {
            // Last message preview
            Text("Ready to assist with your code.")
                .font(.caption)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal)
            
            Spacer()
            
            // Voice button
            Button {
                isRecording.toggle()
            } label: {
                Image(systemName: isRecording ? "stop.circle.fill" : "mic.circle.fill")
                    .font(.system(size: 44))
                    .foregroundStyle(isRecording ? Color.red : Color.accentColor)
            }
            .buttonStyle(.plain)
            
            Text(isRecording ? "Listening..." : "Tap to speak")
                .font(.caption2)
                .foregroundStyle(.secondary)
        }
        .navigationTitle(agentName)
    }
}

// MARK: - Preview

#Preview {
    WatchContentView()
}

