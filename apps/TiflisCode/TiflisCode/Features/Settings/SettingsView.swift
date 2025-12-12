//
//  SettingsView.swift
//  TiflisCode
//
//  Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
//  Licensed under the Functional Source License (FSL-1.1-NC). See LICENSE file for details.
//

import SwiftUI

/// Application settings view
struct SettingsView: View {
    var onMenuTap: (() -> Void)?
    
    @EnvironmentObject private var appState: AppState
    @Environment(\.horizontalSizeClass) private var horizontalSizeClass
    @AppStorage("tunnelURL") private var tunnelURL = ""
    @AppStorage("tunnelId") private var tunnelId = ""
    @AppStorage("ttsEnabled") private var ttsEnabled = true
    @AppStorage("sttLanguage") private var sttLanguage = "en"
    
    @State private var showQRScanner = false
    @State private var showMagicLinkInput = false
    @State private var magicLink = ""
    @State private var showDisconnectConfirmation = false
    @State private var showCrashLog = false
    @State private var crashLogCopied = false

    private let keychainManager = KeychainManager()
    private let crashReporter = CrashReporter.shared
    
    /// App version from Bundle
    private var appVersion: String {
        let version = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "—"
        let build = Bundle.main.infoDictionary?["CFBundleVersion"] as? String ?? "—"
        return "\(version) (\(build))"
    }
    
    /// Formats version with protocol version inline (e.g., "0.1.0 (1.0.0)")
    private func formatVersionWithProtocol(version: String, protocolVersion: String) -> String {
        if version.isEmpty {
            return "—"
        }
        if protocolVersion.isEmpty {
            return version
        }
        return "\(version) (\(protocolVersion))"
    }
    
    /// Computed color based on both tunnel connection and workstation status
    private var connectionIndicatorColor: Color {
        guard appState.connectionState.isConnected else {
            return appState.connectionState.indicatorColor
        }
        return appState.workstationOnline ? .green : .orange
    }
    
    /// Status text that includes workstation status
    private var connectionStatusText: String {
        guard appState.connectionState.isConnected else {
            return appState.connectionState.statusText
        }
        return appState.workstationOnline ? "Connected" : "Connected (Workstation Offline)"
    }
    
    var body: some View {
        Form {
            // Connection Section
            Section {
                // 1. Connection status
                HStack {
                    Circle()
                        .fill(connectionIndicatorColor)
                        .frame(width: 12, height: 12)
                    
                    Text(connectionStatusText)
                    
                    Spacer()
                    
                    if appState.connectionState.isConnected {
                        Button("Disconnect") {
                            showDisconnectConfirmation = true
                        }
                        .buttonStyle(.borderedProminent)
                        .tint(.red)
                    }
                }
                
                if appState.connectionState.isConnected {
                    // 2. Workstation name
                    HStack {
                        Text("Workstation")
                        Spacer()
                        Text(appState.workstationName.isEmpty ? "—" : appState.workstationName)
                            .foregroundStyle(.secondary)
                    }
                    
                    // 3. Tunnel
                    HStack {
                        Text("Tunnel")
                        Spacer()
                        Text(tunnelURL)
                            .foregroundStyle(.secondary)
                            .lineLimit(1)
                    }
                    
                    // 4. Tunnel ID
                    HStack {
                        Text("Tunnel ID")
                        Spacer()
                        Text(tunnelId.isEmpty ? "—" : tunnelId)
                            .foregroundStyle(.secondary)
                            .font(.system(.body, design: .monospaced))
                    }
                    
                    // 5. Tunnel version (with protocol version inline)
                    HStack {
                        Text("Tunnel Version")
                        Spacer()
                        Text(formatVersionWithProtocol(
                            version: appState.tunnelVersion,
                            protocolVersion: appState.tunnelProtocolVersion
                        ))
                        .foregroundStyle(.secondary)
                    }
                    
                    // 6. Workstation version (with protocol version inline)
                    HStack {
                        Text("Workstation Version")
                        Spacer()
                        Text(formatVersionWithProtocol(
                            version: appState.workstationVersion,
                            protocolVersion: appState.workstationProtocolVersion
                        ))
                        .foregroundStyle(.secondary)
                    }
                } else {
                    // Show connection options when disconnected
                    Button {
                        showQRScanner = true
                    } label: {
                        Label("Scan QR Code", systemImage: "qrcode.viewfinder")
                    }
                    
                    Button {
                        showMagicLinkInput = true
                    } label: {
                        Label("Paste Magic Link", systemImage: "link")
                    }
                }
            } header: {
                Text("Connection")
            }
            
            // Voice & Speech Section
            Section("Voice & Speech") {
                Toggle("Text-to-Speech", isOn: $ttsEnabled)
                
                Picker("Speech Language", selection: $sttLanguage) {
                    Text("English").tag("en")
                    Text("Russian").tag("ru")
                }
            }
            
            // About Section
            Section("About") {
                HStack {
                    Text("Version")
                    Spacer()
                    Text(appVersion)
                        .foregroundStyle(.secondary)
                }
                
                HStack {
                    Text("Author")
                    Spacer()
                    Text("Roman Barinov")
                        .foregroundStyle(.secondary)
                }
                
                Link(destination: URL(string: "https://github.com/tiflis-io/tiflis-code")!) {
                    HStack {
                        Text("GitHub Repository")
                        Spacer()
                        Image(systemName: "arrow.up.right.square")
                            .foregroundStyle(.secondary)
                    }
                }
                
                HStack {
                    Text("License")
                    Spacer()
                    Text("FSL-1.1-NC")
                        .foregroundStyle(.secondary)
                }
            }
            
            // Legal Section
            Section {
                Link(destination: URL(string: "https://github.com/tiflis-io/tiflis-code/blob/main/PRIVACY.md")!) {
                    HStack {
                        Text("Privacy Policy")
                        Spacer()
                        Image(systemName: "arrow.up.right.square")
                            .foregroundStyle(.secondary)
                    }
                }

                Link(destination: URL(string: "https://github.com/tiflis-io/tiflis-code/blob/main/TERMS.md")!) {
                    HStack {
                        Text("Terms of Service")
                        Spacer()
                        Image(systemName: "arrow.up.right.square")
                            .foregroundStyle(.secondary)
                    }
                }
            }

            // Debug Section
            Section("Debug") {
                if crashReporter.hasPreviousCrashLog {
                    Button {
                        showCrashLog = true
                    } label: {
                        HStack {
                            Image(systemName: "exclamationmark.triangle.fill")
                                .foregroundStyle(.red)
                            Text("View Crash Log")
                            Spacer()
                            Image(systemName: "chevron.right")
                                .foregroundStyle(.secondary)
                        }
                    }
                    .foregroundStyle(.primary)
                } else {
                    HStack {
                        Image(systemName: "checkmark.circle.fill")
                            .foregroundStyle(.green)
                        Text("No crashes detected")
                            .foregroundStyle(.secondary)
                    }
                }
            }
        }
        .navigationTitle("Settings")
        .navigationBarTitleDisplayMode(.inline)
        .navigationBarBackButtonHidden(true)
        .toolbar {
            // Show sidebar toggle only on compact width (iPhone, iPad portrait)
            if horizontalSizeClass == .compact {
                ToolbarItem(placement: .topBarLeading) {
                    Button {
                        onMenuTap?()
                    } label: {
                        Image(systemName: "sidebar.leading")
                    }
                }
            }
        }
        .sheet(isPresented: $showQRScanner) {
            QRScannerView { result in
                handleMagicLink(result)
                showQRScanner = false
            }
        }
        .alert("Magic Link", isPresented: $showMagicLinkInput) {
            TextField("tiflis://connect?...", text: $magicLink)
                .textInputAutocapitalization(.never)
            
            Button("Connect") {
                if !magicLink.isEmpty {
                    handleMagicLink(magicLink)
                    magicLink = ""
                }
            }
            
            Button("Cancel", role: .cancel) {
                magicLink = ""
            }
        } message: {
            Text("Paste the connection link from your workstation")
        }
        .alert("Disconnect", isPresented: $showDisconnectConfirmation) {
            Button("Disconnect", role: .destructive) {
                appState.disconnect()
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("Are you sure you want to disconnect from the workstation?")
        }
        .sheet(isPresented: $showCrashLog) {
            CrashLogView()
        }
    }
    
    private func handleMagicLink(_ link: String) {
        // Parse magic link in format: tiflis://connect?data=<base64_encoded_json>
        guard let url = URL(string: link),
              url.scheme == "tiflis",
              url.host == "connect",
              let components = URLComponents(url: url, resolvingAgainstBaseURL: false),
              let queryItems = components.queryItems,
              let dataItem = queryItems.first(where: { $0.name == "data" }),
              let base64Data = dataItem.value,
              let jsonData = Data(base64Encoded: base64Data) else {
            return
        }
        
        guard let payload = try? JSONDecoder().decode(MagicLinkPayload.self, from: jsonData) else {
            return
        }
        
        // Store credentials
        tunnelId = payload.tunnel_id
        tunnelURL = payload.url

        // Store auth key in Keychain (with UserDefaults fallback)
        do {
            try keychainManager.saveAuthKey(payload.key)
        } catch {
            // Manual UserDefaults fallback on keychain failure
            UserDefaults.standard.set(payload.key, forKey: "debug_auth_key")
        }

        // Sync credentials to Watch via WatchConnectivity
        WatchConnectivityManager.shared.updateApplicationContext()

        // Auto-connect after setting credentials
        appState.connect()
    }
}

/// Magic link payload structure
private struct MagicLinkPayload: Codable {
    let tunnel_id: String
    let url: String
    let key: String
}

// MARK: - Preview

#Preview {
    NavigationStack {
        SettingsView()
    }
    .environmentObject(AppState())
}

#Preview("Authenticated") {
    NavigationStack {
        SettingsView()
    }
    .environmentObject({
        let state = AppState()
        state.connectionState = .authenticated
        return state
    }())
}

