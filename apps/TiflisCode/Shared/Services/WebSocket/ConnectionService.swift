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
    
    /// Current workstation name
    var workstationName: String { get }
    
    /// Publisher for workstation name changes
    var workstationNamePublisher: Published<String>.Publisher { get }
    
    /// Current workstation version
    var workstationVersion: String { get }
    
    /// Publisher for workstation version changes
    var workstationVersionPublisher: Published<String>.Publisher { get }
    
    /// Current tunnel server version
    var tunnelVersion: String { get }
    
    /// Publisher for tunnel version changes
    var tunnelVersionPublisher: Published<String>.Publisher { get }
    
    /// Current tunnel protocol version
    var tunnelProtocolVersion: String { get }
    
    /// Publisher for tunnel protocol version changes
    var tunnelProtocolVersionPublisher: Published<String>.Publisher { get }
    
    /// Current workstation protocol version
    var workstationProtocolVersion: String { get }
    
    /// Publisher for workstation protocol version changes
    var workstationProtocolVersionPublisher: Published<String>.Publisher { get }
    
    /// WebSocket client for sending messages (read-only access)
    var webSocketClient: WebSocketClientProtocol { get }
    
    /// Publisher for all incoming WebSocket messages
    /// View models can subscribe and filter by message type or session ID
    var messagePublisher: PassthroughSubject<[String: Any], Never> { get }
}

/// Service that manages WebSocket connection lifecycle
@MainActor
final class ConnectionService: ConnectionServicing {
    // MARK: - Dependencies
    
    // Store as concrete type to avoid Sendable issues when passing across actor boundaries
    private let _webSocketClient: WebSocketClient
    private let keychainManager: KeychainManaging
    private let deviceIDManager: DeviceIDManaging
    
    // MARK: - Published Properties
    
    @Published private(set) var connectionState: ConnectionState = .disconnected
    @Published private(set) var workstationOnline: Bool = true // Assume online until we know otherwise
    @Published private(set) var workstationName: String = ""
    @Published private(set) var workstationVersion: String = ""
    @Published private(set) var workstationProtocolVersion: String = ""
    @Published private(set) var tunnelVersion: String = ""
    @Published private(set) var tunnelProtocolVersion: String = ""
    
    var connectionStatePublisher: Published<ConnectionState>.Publisher {
        $connectionState
    }
    
    var workstationOnlinePublisher: Published<Bool>.Publisher {
        $workstationOnline
    }
    
    var workstationNamePublisher: Published<String>.Publisher {
        $workstationName
    }
    
    var workstationVersionPublisher: Published<String>.Publisher {
        $workstationVersion
    }
    
    var tunnelVersionPublisher: Published<String>.Publisher {
        $tunnelVersion
    }
    
    var tunnelProtocolVersionPublisher: Published<String>.Publisher {
        $tunnelProtocolVersion
    }
    
    var workstationProtocolVersionPublisher: Published<String>.Publisher {
        $workstationProtocolVersion
    }
    
    /// Publisher for all incoming WebSocket messages
    /// View models can subscribe and filter by message type or session ID
    let messagePublisher = PassthroughSubject<[String: Any], Never>()
    
    /// WebSocket client for sending messages (exposed for view models)
    var webSocketClient: WebSocketClientProtocol {
        return _webSocketClient
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
        self._webSocketClient = webSocketClient
        self.keychainManager = keychainManager
        self.deviceIDManager = deviceIDManager
        self.userDefaults = userDefaults
        
        // Set delegate
        _webSocketClient.delegate = self
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
            try await _webSocketClient.connect(
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
        _webSocketClient.disconnect()
        connectionState = .disconnected
    }
}

// MARK: - WebSocketClientDelegate

extension ConnectionService: WebSocketClientDelegate {
    func webSocketClient(_ client: WebSocketClientProtocol, didConnect tunnelId: String, tunnelVersion: String?, protocolVersion: String?) {
        // Connection to tunnel established, store tunnel and protocol versions
        self.tunnelVersion = tunnelVersion ?? ""
        self.tunnelProtocolVersion = protocolVersion ?? ""
    }
    
    func webSocketClient(_ client: WebSocketClientProtocol, didAuthenticate deviceId: String, workstationName: String?, workstationVersion: String?, protocolVersion: String?, restoredSubscriptions: [String]?) {
        connectionState = .connected
        // Assume workstation is online when we successfully authenticate
        workstationOnline = true
        self.workstationName = workstationName ?? ""
        self.workstationVersion = workstationVersion ?? ""
        self.workstationProtocolVersion = protocolVersion ?? ""
        
        // After authentication, request state sync to restore sessions
        // This is especially important after app restart
        Task { @MainActor [weak self] in
            guard let self = self else { return }
            await self.requestSync()
        }
    }
    
    /// Requests state synchronization from workstation server
    /// This restores active sessions and subscriptions after app restart
    private func requestSync() async {
        let requestId = UUID().uuidString
        let message: [String: Any] = [
            "type": "sync",
            "id": requestId
        ]
        
        do {
            try _webSocketClient.sendMessage(message)
        } catch {
            // Sync failure is non-critical, sessions will be discovered via broadcasts
        }
    }
    
    func webSocketClient(_ client: WebSocketClientProtocol, didReceiveMessage message: [String: Any]) {
        // Publish message to subscribers (view models can filter by session ID or message type)
        messagePublisher.send(message)
    }
    
    func webSocketClient(_ client: WebSocketClientProtocol, didDisconnect error: Error?) {
        if let error = error {
            connectionState = .error(error.localizedDescription)
        } else {
            connectionState = .disconnected
        }
        // Reset workstation status when disconnected
        workstationOnline = true
        workstationName = ""
        workstationVersion = ""
        workstationProtocolVersion = ""
        tunnelVersion = ""
        tunnelProtocolVersion = ""
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

