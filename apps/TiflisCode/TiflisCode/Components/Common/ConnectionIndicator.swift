//
//  ConnectionIndicator.swift
//  TiflisCode
//
//  Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
//  Licensed under the MIT License. See LICENSE file for details.
//

import SwiftUI

/// Colored dot indicator showing connection status
struct ConnectionIndicator: View {
    @EnvironmentObject private var appState: AppState
    
    /// Computed color based on both tunnel connection and workstation status
    private var indicatorColor: Color {
        // If tunnel is not connected, use connection state color
        guard appState.connectionState.isConnected else {
            return appState.connectionState.indicatorColor
        }
        
        // If tunnel is connected but workstation is offline, show orange
        if !appState.workstationOnline {
            return .orange
        }
        
        // Both tunnel and workstation are online
        return .green
    }
    
    var body: some View {
        HStack(spacing: 6) {
            Circle()
                .fill(indicatorColor)
                .frame(width: 10, height: 10)
                .overlay {
                    if case .connecting = appState.connectionState {
                        Circle()
                            .stroke(lineWidth: 2)
                            .foregroundStyle(indicatorColor)
                            .opacity(0.5)
                            .scaleEffect(1.5)
                            .animation(
                                .easeInOut(duration: 0.8)
                                .repeatForever(autoreverses: true),
                                value: appState.connectionState
                            )
                    }
                }
        }
    }
}

/// Popover with connection details and quick actions
struct ConnectionPopover: View {
    @EnvironmentObject private var appState: AppState
    @Environment(\.dismiss) private var dismiss
    @AppStorage("tunnelURL") private var tunnelURL = ""
    @AppStorage("tunnelId") private var tunnelId = ""
    
    @State private var showQRScanner = false
    @State private var showMagicLinkInput = false
    @State private var magicLink = ""
    @State private var showDisconnectConfirmation = false
    
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
    private var indicatorColor: Color {
        guard appState.connectionState.isConnected else {
            return appState.connectionState.indicatorColor
        }
        return appState.workstationOnline ? .green : .orange
    }
    
    /// Status text that includes workstation status
    private var statusText: String {
        guard appState.connectionState.isConnected else {
            return appState.connectionState.statusText
        }
        return appState.workstationOnline ? "Connected" : "Connected (Workstation Offline)"
    }
    
    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            // 1. Status
            HStack {
                Circle()
                    .fill(indicatorColor)
                    .frame(width: 12, height: 12)
                
                Text(statusText)
                    .font(.headline)
            }
            
            Divider()
            
            if appState.connectionState.isConnected {
                // Connected: show info and disconnect
                VStack(alignment: .leading, spacing: 8) {
                    // 2. Workstation name
                    InfoRow(label: "Workstation", value: appState.workstationName.isEmpty ? "—" : appState.workstationName)
                    
                    // 3. Tunnel
                    InfoRow(label: "Tunnel", value: tunnelURL.isEmpty ? "tunnel.tiflis.io" : tunnelURL)
                    
                    // 4. Tunnel ID
                    InfoRow(label: "Tunnel ID", value: tunnelId.isEmpty ? "—" : tunnelId, useMonospaced: true)
                    
                    // 5. Tunnel version (with protocol version inline)
                    InfoRow(
                        label: "Tunnel Version",
                        value: formatVersionWithProtocol(
                            version: appState.tunnelVersion,
                            protocolVersion: appState.tunnelProtocolVersion
                        )
                    )
                    
                    // 6. Workstation version (with protocol version inline)
                    InfoRow(
                        label: "Workstation Version",
                        value: formatVersionWithProtocol(
                            version: appState.workstationVersion,
                            protocolVersion: appState.workstationProtocolVersion
                        )
                    )
                }
                
                // 7. Disconnect button with confirmation
                Button {
                    showDisconnectConfirmation = true
                } label: {
                    Text("Disconnect")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .tint(.red)
            } else {
                // Not connected: show connection options
                VStack(spacing: 12) {
                    Button {
                        showQRScanner = true
                    } label: {
                        Label("Scan QR Code", systemImage: "qrcode.viewfinder")
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.borderedProminent)
                    
                    Button {
                        showMagicLinkInput = true
                    } label: {
                        Label("Paste Magic Link", systemImage: "link")
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.bordered)
                }
            }
        }
        .padding()
        .frame(width: 320)
        .alert("Disconnect", isPresented: $showDisconnectConfirmation) {
            Button("Disconnect", role: .destructive) {
                appState.disconnect()
                dismiss()
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("Are you sure you want to disconnect from the workstation?")
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
        
        // Store tunnel_id (workstation ID) for routing
        tunnelId = payload.tunnel_id
        tunnelURL = payload.url
        // Store auth key securely (would use Keychain in production)
        // Note: authKey is not stored in this component, it's handled by AppState
        
        // Auto-connect after setting credentials
        appState.connect()
    }
    
    private struct MagicLinkPayload: Codable {
        let tunnel_id: String
        let url: String
        let key: String
    }
}

struct InfoRow: View {
    let label: String
    let value: String
    var useMonospaced: Bool = false
    
    var body: some View {
        HStack {
            Text(label)
                .foregroundStyle(.secondary)
            Spacer()
            Text(value)
                .foregroundStyle(.secondary)
                .font(useMonospaced ? .system(.body, design: .monospaced) : .body)
        }
    }
}

// MARK: - Preview

#Preview {
    VStack(spacing: 40) {
        // Connected with workstation online
        ConnectionIndicator()
            .environmentObject({
                let state = AppState()
                state.connectionState = .connected
                state.workstationOnline = true
                return state
            }())
        
        // Connected with workstation offline
        ConnectionIndicator()
            .environmentObject({
                let state = AppState()
                state.connectionState = .connected
                state.workstationOnline = false
                return state
            }())
        
        // Connecting
        ConnectionIndicator()
            .environmentObject({
                let state = AppState()
                state.connectionState = .connecting
                return state
            }())
        
        // Disconnected
        ConnectionIndicator()
            .environmentObject({
                let state = AppState()
                state.connectionState = .disconnected
                return state
            }())
        
        // Error
        ConnectionIndicator()
            .environmentObject({
                let state = AppState()
                state.connectionState = .error("Connection refused")
                return state
            }())
    }
    .padding()
}
