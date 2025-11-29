//
//  SettingsView.swift
//  TiflisCode
//
//  Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
//  Licensed under the MIT License. See LICENSE file for details.
//

import SwiftUI

/// Application settings view
struct SettingsView: View {
    var onMenuTap: (() -> Void)?
    
    @EnvironmentObject private var appState: AppState
    @AppStorage("tunnelURL") private var tunnelURL = ""
    @AppStorage("tunnelId") private var tunnelId = ""
    @AppStorage("ttsEnabled") private var ttsEnabled = true
    @AppStorage("sttLanguage") private var sttLanguage = "en"
    
    @State private var showQRScanner = false
    @State private var showMagicLinkInput = false
    @State private var magicLink = ""
    
    private let keychainManager = KeychainManager()
    
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
                // Connection status
                HStack {
                    Circle()
                        .fill(connectionIndicatorColor)
                        .frame(width: 12, height: 12)
                    
                    Text(connectionStatusText)
                    
                    Spacer()
                    
                    if appState.connectionState.isConnected {
                        Button("Disconnect") {
                            appState.disconnect()
                        }
                        .buttonStyle(.borderedProminent)
                        .tint(.red)
                    }
                }
                
                if appState.connectionState.isConnected {
                    // Show connection info when connected
                    HStack {
                        Text("Workstation")
                        Spacer()
                        Text("MacBook Pro")
                            .foregroundStyle(.secondary)
                    }
                    
                    HStack {
                        Text("Tunnel ID")
                        Spacer()
                        Text(tunnelId.isEmpty ? "—" : tunnelId)
                            .foregroundStyle(.secondary)
                            .font(.system(.body, design: .monospaced))
                    }
                    
                    HStack {
                        Text("Version")
                        Spacer()
                        Text("0.1.0")
                            .foregroundStyle(.secondary)
                    }
                    
                    HStack {
                        Text("Tunnel")
                        Spacer()
                        Text(tunnelURL)
                            .foregroundStyle(.secondary)
                            .lineLimit(1)
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
                    Text("1.0.0 (1)")
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
                    Text("MIT")
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
        }
        .navigationTitle("Settings")
        .navigationBarTitleDisplayMode(.inline)
        .navigationBarBackButtonHidden(true)
        .toolbar {
            ToolbarItem(placement: .topBarLeading) {
                Button {
                    onMenuTap?()
                } label: {
                    Image(systemName: "sidebar.leading")
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
              let jsonData = Data(base64Encoded: base64Data),
              let payload = try? JSONDecoder().decode(MagicLinkPayload.self, from: jsonData) else {
            return
        }
        
        // Store credentials
        tunnelId = payload.tunnel_id
        tunnelURL = payload.url
        
        // Store auth key in Keychain
        do {
            try keychainManager.saveAuthKey(payload.key)
        } catch {
            print("Failed to save auth key to Keychain: \(error)")
            return
        }
        
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

/// QR code scanner view
/// Note: This is a placeholder. The actual implementation will use AVFoundation.
struct QRScannerView: View {
    let onScan: (String) -> Void
    @Environment(\.dismiss) private var dismiss
    
    var body: some View {
        NavigationStack {
            VStack(spacing: 24) {
                Image(systemName: "qrcode.viewfinder")
                    .font(.system(size: 100))
                    .foregroundStyle(.secondary)
                
                Text("Point your camera at a QR code")
                    .font(.headline)
                
                Text("The QR code should be displayed on your workstation's terminal when you run the workstation server.")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal)
                
                // Mock scan button for preview
                Button("Simulate Scan") {
                    // Generate base64-encoded payload for preview
                    let payload = MagicLinkPayload(
                        tunnel_id: "Z6q62aKz-F96",
                        url: "wss://tunnel.tiflis.io/ws",
                        key: "demo-key"
                    )
                    if let jsonData = try? JSONEncoder().encode(payload),
                       let base64Data = jsonData.base64EncodedString().addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) {
                        onScan("tiflis://connect?data=\(base64Data)")
                    }
                }
                .buttonStyle(.borderedProminent)
            }
            .padding()
            .navigationTitle("Scan QR Code")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") {
                        dismiss()
                    }
                }
            }
        }
    }
}

// MARK: - Preview

#Preview {
    NavigationStack {
        SettingsView()
    }
    .environmentObject(AppState())
}

#Preview("Connected") {
    NavigationStack {
        SettingsView()
    }
    .environmentObject({
        let state = AppState()
        state.connectionState = .connected
        return state
    }())
}
