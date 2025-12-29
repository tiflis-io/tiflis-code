//
//  ConnectView.swift
//  TiflisCode
//
//  Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
//  Licensed under the Functional Source License (FSL-1.1-NC). See LICENSE file for details.
//

import SwiftUI

/// Connect screen shown when workstation is not connected.
/// Provides QR code scanning and magic link input options.
struct ConnectView: View {
    @EnvironmentObject private var appState: AppState
    @AppStorage("tunnelURL") private var tunnelURL = ""
    @AppStorage("tunnelId") private var tunnelId = ""
    
    @State private var showQRScanner = false
    @State private var showMagicLinkInput = false
    @State private var magicLink = ""
    @State private var isConnecting = false
    @State private var errorMessage: String?
    
    private let keychainManager = KeychainManager()
    
    var body: some View {
        VStack(spacing: 32) {
            Spacer()
            
            // Logo and branding
            VStack(spacing: 16) {
                Image("TiflisLogo")
                    .resizable()
                    .aspectRatio(contentMode: .fit)
                    .frame(width: 120, height: 120)
                
                Text("Tiflis Code")
                    .font(.largeTitle)
                    .fontWeight(.bold)
                
                Text("Connect to your workstation to control AI agents remotely")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 32)
            }
            
            Spacer()
            
            // Connection options
            VStack(spacing: 16) {
                // Error message
                if let error = errorMessage {
                    HStack {
                        Image(systemName: "exclamationmark.triangle.fill")
                            .foregroundStyle(.red)
                        Text(error)
                            .font(.subheadline)
                            .foregroundStyle(.red)
                    }
                    .padding(.horizontal)
                }
                
                // Scan QR Code button
                Button {
                    errorMessage = nil
                    showQRScanner = true
                } label: {
                    HStack {
                        Image(systemName: "qrcode.viewfinder")
                            .font(.title2)
                        Text("Scan QR Code")
                            .fontWeight(.semibold)
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 16)
                }
                .buttonStyle(.borderedProminent)
                .disabled(isConnecting)
                
                // Divider with "or"
                HStack {
                    Rectangle()
                        .fill(Color.secondary.opacity(0.3))
                        .frame(height: 1)
                    Text("or")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                    Rectangle()
                        .fill(Color.secondary.opacity(0.3))
                        .frame(height: 1)
                }
                .padding(.horizontal, 32)
                
                // Paste Magic Link button
                Button {
                    errorMessage = nil
                    showMagicLinkInput = true
                } label: {
                    HStack {
                        Image(systemName: "link")
                            .font(.title2)
                        Text("Paste Magic Link")
                            .fontWeight(.semibold)
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 16)
                }
                .buttonStyle(.bordered)
                .disabled(isConnecting)
                
                // Loading indicator
                if isConnecting {
                    HStack(spacing: 8) {
                        ProgressView()
                        Text("Connecting...")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                    }
                    .padding(.top, 8)
                }
            }
            .padding(.horizontal, 24)
            
            Spacer()
            
            // Footer
            VStack(spacing: 8) {
                Text("Run `workstation connect` on your machine")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                
                Link(destination: URL(string: "https://github.com/tiflis-io/tiflis-code")!) {
                    Text("Learn more")
                        .font(.caption)
                        .foregroundStyle(.blue)
                }
            }
            .padding(.bottom, 32)
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
              let jsonData = Data(base64Encoded: base64Data) else {
            errorMessage = "Invalid magic link format"
            return
        }
        
        guard let payload = try? JSONDecoder().decode(MagicLinkPayload.self, from: jsonData) else {
            errorMessage = "Failed to parse connection data"
            return
        }
        
        isConnecting = true
        errorMessage = nil
        
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
        
        // Reset connecting state after a delay (connection state will be updated by observer)
        Task { @MainActor in
            try? await Task.sleep(for: .seconds(3))
            isConnecting = false
        }
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
    ConnectView()
        .environmentObject(AppState())
}
