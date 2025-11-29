//
//  ConnectionService.swift
//  TiflisCode
//
//  Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
//  Licensed under the MIT License. See LICENSE file for details.
//

import Foundation
import Combine

/// Protocol for connection service operations
@MainActor
protocol ConnectionServicing {
    /// Connects to the tunnel server using stored credentials
    /// - Throws: Connection errors if the operation fails
    func connect() async throws
    
    /// Disconnects from the tunnel server
    func disconnect()
    
    /// Current connection state
    var connectionState: ConnectionState { get }
    
    /// Publisher for connection state changes
    var connectionStatePublisher: Published<ConnectionState>.Publisher { get }
    
    /// Whether the workstation is currently online
    var workstationOnline: Bool { get }
    
    /// Publisher for workstation online status changes
    var workstationOnlinePublisher: Published<Bool>.Publisher { get }
}

/// Service that manages WebSocket connection lifecycle
@MainActor
final class ConnectionService: ConnectionServicing {
    // MARK: - Dependencies
    
    // Store as concrete type to avoid Sendable issues when passing across actor boundaries
    private let webSocketClient: WebSocketClient
    private let keychainManager: KeychainManaging
    private let deviceIDManager: DeviceIDManaging
    
    // MARK: - Published Properties
    
    @Published private(set) var connectionState: ConnectionState = .disconnected
    @Published private(set) var workstationOnline: Bool = true // Assume online until we know otherwise
    
    var connectionStatePublisher: Published<ConnectionState>.Publisher {
        $connectionState
    }
    
    var workstationOnlinePublisher: Published<Bool>.Publisher {
        $workstationOnline
    }
    
    // MARK: - Stored Credentials
    
    private let userDefaults: UserDefaults
    
    private var tunnelURL: String {
        userDefaults.string(forKey: "tunnelURL") ?? ""
    }
    
    private var tunnelId: String {
        userDefaults.string(forKey: "tunnelId") ?? ""
    }
    
    // MARK: - Initialization
    
    init(
        webSocketClient: WebSocketClient,
        keychainManager: KeychainManaging,
        deviceIDManager: DeviceIDManaging,
        userDefaults: UserDefaults = .standard
    ) {
        self.webSocketClient = webSocketClient
        self.keychainManager = keychainManager
        self.deviceIDManager = deviceIDManager
        self.userDefaults = userDefaults
        
        // Set delegate
        webSocketClient.delegate = self
    }
    
    // MARK: - Connection Methods
    
    func connect() async throws {
        guard !tunnelURL.isEmpty, !tunnelId.isEmpty else {
            throw ConnectionError.missingCredentials
        }
        
        guard let authKey = keychainManager.getAuthKey() else {
            throw ConnectionError.missingAuthKey
        }
        
        let deviceId = deviceIDManager.deviceID
        
        connectionState = .connecting
        
        do {
            try await webSocketClient.connect(
                url: tunnelURL,
                tunnelId: tunnelId,
                authKey: authKey,
                deviceId: deviceId
            )
        } catch {
            connectionState = .error(error.localizedDescription)
            throw error
        }
    }
    
    func disconnect() {
        webSocketClient.disconnect()
        connectionState = .disconnected
    }
}

// MARK: - WebSocketClientDelegate

extension ConnectionService: WebSocketClientDelegate {
    func webSocketClient(_ client: WebSocketClientProtocol, didConnect tunnelId: String) {
        // Connection to tunnel established, waiting for auth
    }
    
    func webSocketClient(_ client: WebSocketClientProtocol, didAuthenticate deviceId: String, restoredSubscriptions: [String]?) {
        connectionState = .connected
        // Assume workstation is online when we successfully authenticate
        workstationOnline = true
    }
    
    func webSocketClient(_ client: WebSocketClientProtocol, didReceiveMessage message: [String: Any]) {
        // Messages are handled by specific view models
        // This service just manages connection state
    }
    
    func webSocketClient(_ client: WebSocketClientProtocol, didDisconnect error: Error?) {
        if let error = error {
            connectionState = .error(error.localizedDescription)
        } else {
            connectionState = .disconnected
        }
        // Reset workstation status when disconnected
        workstationOnline = true
    }
    
    func webSocketClient(_ client: WebSocketClientProtocol, workstationDidGoOffline tunnelId: String) {
        // Workstation is offline, but connection to tunnel remains
        workstationOnline = false
    }
    
    func webSocketClient(_ client: WebSocketClientProtocol, workstationDidComeOnline tunnelId: String) {
        // Workstation is back online
        workstationOnline = true
    }
}

// MARK: - Errors

enum ConnectionError: LocalizedError {
    case missingCredentials
    case missingAuthKey
    
    var errorDescription: String? {
        switch self {
        case .missingCredentials:
            return "Missing tunnel URL or tunnel ID"
        case .missingAuthKey:
            return "Missing authentication key"
        }
    }
}

