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
    
    @State private var authKey = ""
    @State private var showQRScanner = false
    @State private var showMagicLinkInput = false
    @State private var magicLink = ""
    
    var body: some View {
        Form {
            // Connection Section
            Section {
                // Connection status
                HStack {
                    Circle()
                        .fill(appState.connectionState.indicatorColor)
                        .frame(width: 12, height: 12)
                    
                    Text(appState.connectionState.statusText)
                    
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
        // Parse magic link in format: tiflis://connect?tunnel_id=...&url=...&key=...
        guard let url = URL(string: link),
              url.scheme == "tiflis",
              url.host == "connect",
              let components = URLComponents(url: url, resolvingAgainstBaseURL: false),
              let queryItems = components.queryItems else {
            return
        }
        
        for item in queryItems {
            switch item.name {
            case "tunnel_id":
                tunnelId = item.value ?? ""
            case "url":
                tunnelURL = item.value ?? ""
            case "key":
                authKey = item.value ?? ""
            default:
                break
            }
        }
        
        // Auto-connect after setting credentials
        appState.connect()
    }
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
                    onScan("tiflis://connect?tunnel_id=Z6q62aKz-F96&url=wss://tunnel.tiflis.io/ws&key=demo-key")
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
