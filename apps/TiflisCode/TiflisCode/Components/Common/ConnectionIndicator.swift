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
    
    var body: some View {
        HStack(spacing: 6) {
            Circle()
                .fill(appState.connectionState.indicatorColor)
                .frame(width: 10, height: 10)
                .overlay {
                    if case .connecting = appState.connectionState {
                        Circle()
                            .stroke(lineWidth: 2)
                            .foregroundStyle(appState.connectionState.indicatorColor)
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
    
    @State private var showQRScanner = false
    @State private var showMagicLinkInput = false
    @State private var magicLink = ""
    
    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            // Status
            HStack {
                Circle()
                    .fill(appState.connectionState.indicatorColor)
                    .frame(width: 12, height: 12)
                
                Text(appState.connectionState.statusText)
                    .font(.headline)
            }
            
            Divider()
            
            if appState.connectionState.isConnected {
                // Connected: show info and disconnect
                VStack(alignment: .leading, spacing: 8) {
                    InfoRow(label: "Workstation", value: "MacBook Pro")
                    InfoRow(label: "Version", value: "0.1.0")
                    InfoRow(label: "Tunnel", value: tunnelURL.isEmpty ? "tunnel.tiflis.io" : shortenURL(tunnelURL))
                }
                
                Button {
                    appState.disconnect()
                    dismiss()
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
        .frame(width: 260)
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
    
    private func shortenURL(_ url: String) -> String {
        url.replacingOccurrences(of: "wss://", with: "")
           .replacingOccurrences(of: "ws://", with: "")
           .replacingOccurrences(of: "/ws", with: "")
    }
    
    private func handleMagicLink(_ link: String) {
        guard let url = URL(string: link),
              url.scheme == "tiflis",
              url.host == "connect",
              let components = URLComponents(url: url, resolvingAgainstBaseURL: false),
              let queryItems = components.queryItems else {
            return
        }
        
        for item in queryItems {
            switch item.name {
            case "url":
                tunnelURL = item.value ?? ""
            case "key":
                // Store auth key securely (would use Keychain in production)
                break
            default:
                break
            }
        }
        
        // Auto-connect after setting credentials
        appState.connect()
    }
}

struct InfoRow: View {
    let label: String
    let value: String
    
    var body: some View {
        HStack {
            Text(label)
                .foregroundStyle(.secondary)
            Spacer()
            Text(value)
                .fontWeight(.medium)
        }
        .font(.subheadline)
    }
}

// MARK: - Preview

#Preview {
    VStack(spacing: 40) {
        ConnectionIndicator()
            .environmentObject({
                let state = AppState()
                state.connectionState = .connected
                return state
            }())
        
        ConnectionIndicator()
            .environmentObject({
                let state = AppState()
                state.connectionState = .connecting
                return state
            }())
        
        ConnectionIndicator()
            .environmentObject({
                let state = AppState()
                state.connectionState = .disconnected
                return state
            }())
        
        ConnectionIndicator()
            .environmentObject({
                let state = AppState()
                state.connectionState = .error("Connection refused")
                return state
            }())
    }
    .padding()
}
