//
//  ConnectionService.swift
//  TiflisCode
//
//  Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
//  Licensed under the Functional Source License (FSL-1.1-NC). See LICENSE file for details.
//

import Foundation
import Combine

/// Protocol for connection service operations
@MainActor
protocol ConnectionServicing: AnyObject {
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

    /// Current workspaces root directory path
    var workspacesRoot: String { get }

    /// Publisher for workspaces root changes
    var workspacesRootPublisher: Published<String>.Publisher { get }

    /// WebSocket client for sending messages (read-only access)
    var webSocketClient: WebSocketClientProtocol { get }

    /// Command sender for safe command sending with retry and queue support
    var commandSender: CommandSending { get }

    /// Publisher for all incoming WebSocket messages
    /// View models can subscribe and filter by message type or session ID
    var messagePublisher: PassthroughSubject<[String: Any], Never> { get }

    /// Requests state synchronization from workstation server
    /// This removes stale sessions and restores active ones
    func requestSync() async

    /// Sends a message via WebSocket
    /// - Parameter message: JSON message string to send
    func sendMessage(_ message: String) throws

    /// Checks connection health by sending immediate ping
    /// Call when app returns to foreground to detect stale connections
    func checkConnectionHealth()
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
    @Published private(set) var workspacesRoot: String = ""
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

    var workspacesRootPublisher: Published<String>.Publisher {
        $workspacesRoot
    }

    /// Publisher for all incoming WebSocket messages
    /// View models can subscribe and filter by message type or session ID
    let messagePublisher = PassthroughSubject<[String: Any], Never>()
    
    /// WebSocket client for sending messages (exposed for view models)
    var webSocketClient: WebSocketClientProtocol {
        return _webSocketClient
    }

    /// Command sender for safe command sending with retry and queue support
    /// Lazy initialization to avoid circular reference during init
    private lazy var _commandSender: CommandSender = CommandSender(
        connectionService: self,
        webSocketClient: _webSocketClient
    )

    var commandSender: CommandSending {
        return _commandSender
    }
    
    // MARK: - Stored Credentials
    
    private let userDefaults: UserDefaults
    
    /// Check if running in screenshot testing mode
    private var isScreenshotTesting: Bool {
        ProcessInfo.processInfo.environment["SCREENSHOT_TESTING"] == "1"
    }

    private var tunnelURL: String {
        // In screenshot testing mode, use test tunnel URL
        if isScreenshotTesting,
           let testURL = ProcessInfo.processInfo.environment["SCREENSHOT_TEST_TUNNEL_URL"] {
            return testURL
        }
        return userDefaults.string(forKey: "tunnelURL") ?? ""
    }

    private var tunnelId: String {
        // In screenshot testing mode, use the tunnel ID from environment
        if isScreenshotTesting,
           let testTunnelId = ProcessInfo.processInfo.environment["SCREENSHOT_TEST_TUNNEL_ID"] {
            return testTunnelId
        }
        return userDefaults.string(forKey: "tunnelId") ?? ""
    }

    private var screenshotTestAuthKey: String? {
        ProcessInfo.processInfo.environment["SCREENSHOT_TEST_AUTH_KEY"]
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

        // In screenshot testing mode, use test auth key; otherwise use keychain
        let authKey: String
        if isScreenshotTesting, let testAuthKey = screenshotTestAuthKey {
            authKey = testAuthKey
        } else if let keychainAuthKey = keychainManager.getAuthKey() {
            authKey = keychainAuthKey
        } else {
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
        // Connection to tunnel established, auth message being sent
        // State: tunnel connected, waiting for auth.success from workstation
        connectionState = .authenticating
        self.tunnelVersion = tunnelVersion ?? ""
        self.tunnelProtocolVersion = protocolVersion ?? ""
    }

    func webSocketClient(_ client: WebSocketClientProtocol, didAuthenticate deviceId: String, workstationName: String?, workstationVersion: String?, protocolVersion: String?, workspacesRoot: String?, restoredSubscriptions: [String]?) {
        // Fully authenticated with workstation - NOW we can show green
        connectionState = .authenticated
        // Workstation is definitely online since we just authenticated
        workstationOnline = true
        self.workstationName = workstationName ?? ""
        self.workstationVersion = workstationVersion ?? ""
        self.workstationProtocolVersion = protocolVersion ?? ""
        self.workspacesRoot = workspacesRoot ?? ""

        // After authentication, request state sync to restore sessions
        // This is especially important after app restart
        Task { @MainActor [weak self] in
            guard let self = self else { return }
            await self.requestSync()
        }
    }
    
    /// Requests state synchronization from workstation server
    /// This restores active sessions and subscriptions after app restart
    func requestSync() async {
        print("🔄 ConnectionService.requestSync: Sending sync request")

        let config = CommandBuilder.sync()
        let result = await _commandSender.send(config)

        switch result {
        case .success:
            print("✅ ConnectionService.requestSync: Sync request sent successfully")
        case .queued:
            print("📦 ConnectionService.requestSync: Sync request queued")
        case .failure(let error):
            print("❌ ConnectionService.requestSync: Failed to send sync request: \(error)")
            // Sync failure is non-critical, sessions will be discovered via broadcasts
        }
    }

    func sendMessage(_ message: String) throws {
        try _webSocketClient.sendMessage(message)
    }

    func checkConnectionHealth() {
        // Only check if we think we're authenticated
        guard connectionState == .authenticated else {
            print("💓 ConnectionService: Health check skipped - not authenticated (state: \(connectionState))")
            return
        }

        print("💓 ConnectionService: Checking connection health")
        _webSocketClient.checkConnectionHealth()
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
        workspacesRoot = ""
        tunnelVersion = ""
        tunnelProtocolVersion = ""
    }
    
    func webSocketClient(_ client: WebSocketClientProtocol, workstationDidGoOffline tunnelId: String) {
        // Workstation is offline, but connection to tunnel remains
        workstationOnline = false
        // Change state to .connected - we're still connected to tunnel but not authenticated
        // with workstation (since it's offline). This shows orange indicator.
        connectionState = .connected
    }
    
    func webSocketClient(_ client: WebSocketClientProtocol, workstationDidComeOnline tunnelId: String) {
        // Workstation is back online
        workstationOnline = true

        // Set state to authenticating - indicator will show yellow until we get auth.success
        // This prevents showing green when we might not actually be authenticated
        connectionState = .authenticating

        // Re-authenticate with the workstation since it may have restarted
        // and lost our client registration
        Task { @MainActor [weak self] in
            guard let self = self else { return }
            await self.reauthenticateWithWorkstation()
        }
    }

    /// Re-sends authentication message to workstation after it comes back online
    /// This is necessary because the workstation may have restarted and lost client state
    private func reauthenticateWithWorkstation() async {
        guard let authKey = keychainManager.getAuthKey() else {
            connectionState = .error("Missing auth key")
            return
        }

        let deviceId = deviceIDManager.deviceID
        let message: [String: Any] = [
            "type": "auth",
            "payload": [
                "auth_key": authKey,
                "device_id": deviceId
            ]
        ]

        do {
            try _webSocketClient.sendMessage(message)
            // State remains .authenticating until we receive auth.success callback
        } catch {
            connectionState = .error("Re-authentication failed: \(error.localizedDescription)")
        }
    }

    func webSocketClient(_ client: WebSocketClientProtocol, didVerifyConnection uptimeMs: Int) {
        // End-to-end connectivity verified via heartbeat
        connectionState = .verified
    }

    func webSocketClient(_ client: WebSocketClientProtocol, connectionDegraded reason: String) {
        // Heartbeat failed but not yet critical
        connectionState = .degraded(reason)
    }

    func webSocketClient(_ client: WebSocketClientProtocol, connectionBecameStale reason: String) {
        // Connection is stale - WebSocket client will force reconnect
        // Set state to connecting to show reconnection in progress
        connectionState = .connecting
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

