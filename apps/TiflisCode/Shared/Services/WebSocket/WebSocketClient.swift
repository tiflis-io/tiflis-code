//
//  WebSocketClient.swift
//  TiflisCode
//
//  Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
//  Licensed under the Functional Source License (FSL-1.1-NC). See LICENSE file for details.
//

import Foundation
import Network

/// WebSocket client implementation for connecting to tunnel server
/// Runs on background threads; delegate callbacks are dispatched to main actor
/// Thread-safe: All state mutations and delegate callbacks are properly synchronized
final class WebSocketClient: NSObject, WebSocketClientProtocol, @unchecked Sendable {
    weak var delegate: WebSocketClientDelegate?
    
    // MARK: - Constants
    // Optimized for fast disconnect detection (~5-8s) while maintaining connection stability

    private let pingInterval: TimeInterval = 5.0 // 5 seconds - fast liveness detection
    private let pongTimeout: TimeInterval = 5.0 // 5 seconds - quick timeout for faster detection
    private let minReconnectDelay: TimeInterval = 0.5 // 500ms - fast first retry
    private let maxReconnectDelay: TimeInterval = 5.0 // 5 seconds - don't wait too long
    private let missedPongsBeforeReconnect: Int = 1 // Reconnect after 1 missed pong for fast detection
    
    // MARK: - Logging
    
    /// Formats current timestamp for logging
    private static var timestamp: String {
        let formatter = DateFormatter()
        formatter.dateFormat = "HH:mm:ss.SSS"
        return formatter.string(from: Date())
    }
    
    /// Logs a message with timestamp
    /// Static method to avoid requiring 'self' in closures
    private static func log(_ message: String) {
        print("[\(WebSocketClient.timestamp)] \(message)")
    }
    
    // MARK: - Properties
    
    private var webSocketTask: URLSessionWebSocketTask?
    private var urlSession: URLSession?
    private var pingTask: Task<Void, Never>? // Task-based periodic ping instead of Timer
    private var lastPongTimestamp: Date?
    private var pongTimeoutTask: Task<Void, Never>? // Task-based timeout instead of Timer
    private var consecutiveMissedPongs: Int = 0 // Track consecutive missed pongs for connection health

    // Application-level heartbeat for end-to-end verification
    // Optimized for fast disconnect detection
    private var heartbeatTask: Task<Void, Never>?
    private var heartbeatTimeoutTask: Task<Void, Never>?
    private var pendingHeartbeatId: String?
    private let heartbeatInterval: TimeInterval = 3.0  // 3 seconds - fast end-to-end check
    private let heartbeatTimeout: TimeInterval = 3.0   // 3 seconds - quick timeout
    private var consecutiveHeartbeatFailures: Int = 0
    private let maxHeartbeatFailures: Int = 2

    // Network monitoring
    private var pathMonitor: NWPathMonitor?
    private var monitorQueue = DispatchQueue(label: "com.tiflis.code.network-monitor")
    private var lastNetworkPath: NWPath.Status?
    private var networkChangeTask: Task<Void, Never>?
    
    private var connectionURL: String?
    private var tunnelId: String?
    private var authKey: String?
    private var deviceId: String?
    
    private var reconnectAttempts = 0
    private var reconnectTask: Task<Void, Never>?
    private var isReconnecting = false
    private var isConnecting = false // Track if connection is in progress
    private var listenTask: Task<Void, Never>? // Track the listenForMessages task
    
    private(set) var isConnected = false
    
    // Connection waiting
    private var connectionContinuation: CheckedContinuation<Void, Error>?
    
    // MARK: - Connection
    
    func connect(url: String, tunnelId: String, authKey: String, deviceId: String) async throws {
        // Prevent multiple simultaneous connection attempts
        guard !isConnecting else {
            WebSocketClient.log("⚠️ WebSocket: Connection already in progress, ignoring duplicate request")
            return
        }
        
        // Cancel any ongoing reconnection
        reconnectTask?.cancel()
        reconnectTask = nil
        isReconnecting = false
        
        // Mark as connecting (don't use defer - we'll clear it explicitly on success/error)
        isConnecting = true
        
        do {
            // Store connection parameters
            self.connectionURL = url
            self.tunnelId = tunnelId
            self.authKey = authKey
            self.deviceId = deviceId
            
            // Disconnect existing connection if any
            disconnect()
            
            // Normalize and validate WebSocket URL
            let normalizedURL = normalizeWebSocketURL(url)
            guard let wsURL = URL(string: normalizedURL) else {
                WebSocketClient.log("❌ WebSocket: Invalid URL after normalization. Original: \(url), Normalized: \(normalizedURL)")
                throw WebSocketError.invalidURL
            }
            
            // Validate it's a WebSocket URL
            guard wsURL.scheme == "ws" || wsURL.scheme == "wss" else {
                WebSocketClient.log("❌ WebSocket: Invalid scheme '\(wsURL.scheme ?? "nil")' in URL: \(normalizedURL)")
                throw WebSocketError.invalidURL
            }
            
            // Log connection attempt with full URL details
            WebSocketClient.log("🔌 WebSocket: Connecting to \(normalizedURL)")
            if wsURL.port == nil {
                WebSocketClient.log("⚠️ WebSocket: No port specified in URL: \(normalizedURL)")
                WebSocketClient.log("⚠️ WebSocket: The tunnel server typically runs on port 3001. Ensure the URL includes the port: ws://host:3001/ws")
            }
            
            // Create URLSession with delegate
            let configuration = URLSessionConfiguration.default
            configuration.waitsForConnectivity = true
            // Allow cellular connections (important for watchOS)
            configuration.allowsCellularAccess = true
            // Allow connections over constrained networks (watchOS via iPhone)
            configuration.allowsConstrainedNetworkAccess = true
            // Allow expensive network operations (cellular, personal hotspot)
            configuration.allowsExpensiveNetworkAccess = true
            // Timeout settings
            // timeoutIntervalForRequest: timeout for individual request/response
            configuration.timeoutIntervalForRequest = 60
            // timeoutIntervalForResource: timeout for entire connection
            // Set to 1 hour - our ping/pong mechanism handles liveness detection
            // Lower value helps iOS detect network changes faster
            configuration.timeoutIntervalForResource = 60 * 60
            urlSession = URLSession(configuration: configuration, delegate: self, delegateQueue: nil)

            // Create WebSocket task
            webSocketTask = urlSession?.webSocketTask(with: wsURL)

            // Increase maximum message size to handle large sync.state responses
            // Default is 1MB, but chat history can grow larger
            webSocketTask?.maximumMessageSize = 50 * 1024 * 1024 // 50MB
            
            // Start the connection
            webSocketTask?.resume()
            
            // Wait for connection to be established (via delegate callback)
            WebSocketClient.log("⏳ WebSocket: Waiting for connection to open...")
            try await waitForConnection()
            WebSocketClient.log("✅ WebSocket: Connection opened, sending connect message...")
            
            // Send connect message to tunnel
            try await sendConnectMessage()
            WebSocketClient.log("📤 WebSocket: Connect message sent, waiting for connected response...")
            
            // Wait for connected response
            try await waitForConnectedResponse()
            WebSocketClient.log("✅ WebSocket: Received connected response, sending auth message...")
            
            // Send auth message to workstation
            try await sendAuthMessage()
            WebSocketClient.log("📤 WebSocket: Auth message sent, waiting for auth.success...")
            
            // Wait for auth.success response
            try await waitForAuthSuccess()
            WebSocketClient.log("✅ WebSocket: Authentication successful!")
            
            // Mark as connected BEFORE starting heartbeat
            // This is important because listenForMessages() checks isConnected
            isConnected = true

            // Start transport-level heartbeat (ping/pong)
            startHeartbeat()

            // Start application-level heartbeat (verifies end-to-end connectivity)
            startAppHeartbeat()

            // Start network monitoring for connection health
            startNetworkMonitor()
            reconnectAttempts = 0
            consecutiveMissedPongs = 0 // Reset missed pongs on successful connection
            consecutiveHeartbeatFailures = 0 // Reset heartbeat failures on successful connection
            isConnecting = false // Clear connecting flag on success
            isReconnecting = false // Clear reconnecting flag on successful connection
            WebSocketClient.log("🎉 WebSocket: Fully connected and authenticated")
        } catch {
            // Clear connecting flag on any error
            isConnecting = false
            throw error
        }
    }
    
    func disconnect() {
        stopHeartbeat()
        stopAppHeartbeat()
        stopNetworkMonitor()
        webSocketTask?.cancel(with: .goingAway, reason: nil)
        webSocketTask = nil
        urlSession?.invalidateAndCancel()
        urlSession = nil
        isConnected = false
        // Don't clear isConnecting here - let the connect() method handle it
        // This prevents race conditions where disconnect() is called during connect()
        reconnectTask?.cancel()
        reconnectTask = nil
        isReconnecting = false
    }

    // MARK: - Network Monitoring

    private func startNetworkMonitor() {
        // Stop any existing monitor
        stopNetworkMonitor()

        pathMonitor = NWPathMonitor()
        pathMonitor?.pathUpdateHandler = { [weak self] path in
            self?.handleNetworkPathUpdate(path)
        }
        pathMonitor?.start(queue: monitorQueue)
        WebSocketClient.log("📡 WebSocket: Network monitor started")
    }

    private func stopNetworkMonitor() {
        networkChangeTask?.cancel()
        networkChangeTask = nil
        pathMonitor?.cancel()
        pathMonitor = nil
        lastNetworkPath = nil
    }

    private func handleNetworkPathUpdate(_ path: NWPath) {
        let previousStatus = lastNetworkPath
        lastNetworkPath = path.status

        // Log network change
        let interfaceTypes = path.availableInterfaces.map { "\($0.type)" }.joined(separator: ", ")
        WebSocketClient.log("📡 WebSocket: Network path updated - status: \(path.status), interfaces: [\(interfaceTypes)]")

        // Handle network becoming unavailable
        if path.status == .unsatisfied {
            WebSocketClient.log("📡 WebSocket: Network unavailable")
            // Don't disconnect immediately - iOS will buffer and retry
            // Just log for now, the ping/pong mechanism will detect the dead connection
            return
        }

        // Handle network becoming available or changing
        if path.status == .satisfied {
            // Skip if this is the initial status report (not a change)
            guard previousStatus != nil else {
                WebSocketClient.log("📡 WebSocket: Initial network status - connected")
                return
            }

            // Network changed or recovered - check connection health immediately
            WebSocketClient.log("📡 WebSocket: Network changed/recovered - checking connection health")

            // Cancel any pending network change task
            networkChangeTask?.cancel()

            // Wait a moment for network to stabilize, then verify connection
            networkChangeTask = Task { [weak self] in
                guard let self = self else { return }

                // Wait for network to stabilize
                try? await Task.sleep(for: .milliseconds(500))

                guard !Task.isCancelled else { return }

                await MainActor.run {
                    self.checkConnectionHealth()
                }
            }
        }
    }

    // MARK: - Connection Health

    /// Checks connection health by sending an immediate ping
    /// Call this after network changes or when app returns to foreground
    @MainActor
    func checkConnectionHealth() {
        // Skip if connection is in progress - don't interfere with initial connection
        guard !isConnecting else {
            WebSocketClient.log("💓 WebSocket: Health check skipped - connection in progress")
            return
        }

        // Skip if reconnection is already scheduled
        guard !isReconnecting else {
            WebSocketClient.log("💓 WebSocket: Health check skipped - reconnection in progress")
            return
        }

        guard isConnected else {
            WebSocketClient.log("💓 WebSocket: Health check skipped - not connected")
            // Only try to reconnect if we have credentials AND had a previous connection
            // (connectionURL is set during connect(), so if it's set we had a connection before)
            if connectionURL != nil && tunnelId != nil && authKey != nil && deviceId != nil {
                WebSocketClient.log("💓 WebSocket: Has credentials - scheduling reconnect")
                scheduleReconnect()
            }
            return
        }

        guard let task = webSocketTask, task.state == .running else {
            WebSocketClient.log("💓 WebSocket: Health check - task not running, reconnecting")
            handleDisconnectionFromHealthCheck()
            return
        }

        WebSocketClient.log("💓 WebSocket: Sending health check ping")

        // Send immediate ping and expect quick response
        Task { [weak self] in
            await self?.sendHealthCheckPing()
        }
    }

    private func sendHealthCheckPing() async {
        // Cancel any existing pong timeout
        await MainActor.run {
            pongTimeoutTask?.cancel()
            pongTimeoutTask = nil
        }

        // Send ping
        await sendPing()

        // Wait for health check - use shorter timeout for quicker detection
        let healthCheckTimeout: TimeInterval = 5.0
        try? await Task.sleep(for: .seconds(healthCheckTimeout))

        // Check if we received pong (pongTimeoutTask would have been cancelled)
        await MainActor.run {
            // If pongTimeoutTask is still running, we didn't get pong in time
            if pongTimeoutTask != nil {
                WebSocketClient.log("💓 WebSocket: Health check failed - no pong received")
                handleDisconnectionFromHealthCheck()
            }
        }
    }

    @MainActor
    private func handleDisconnectionFromHealthCheck() {
        WebSocketClient.log("💓 WebSocket: Health check detected dead connection - reconnecting")

        let wasConnected = isConnected
        isConnected = false
        stopHeartbeat()
        stopNetworkMonitor()

        // Cancel WebSocket task to unblock any pending receive()
        webSocketTask?.cancel(with: .goingAway, reason: "Health check failed".data(using: .utf8))
        webSocketTask = nil
        urlSession?.invalidateAndCancel()
        urlSession = nil

        // Notify delegate so UI shows disconnected state
        if wasConnected {
            delegate?.webSocketClient(self, didDisconnect: WebSocketError.connectionClosed)
        }

        scheduleReconnect()
    }
    
    // MARK: - Message Sending
    
    func sendMessage(_ message: [String: Any]) throws {
        guard let task = webSocketTask else {
            WebSocketClient.log("❌ WebSocket: Cannot send message - no task")
            throw WebSocketError.notConnected
        }
        
        guard task.state == .running else {
            WebSocketClient.log("❌ WebSocket: Cannot send message - task state is \(task.state.rawValue)")
            throw WebSocketError.notConnected
        }
        
        guard let jsonData = try? JSONSerialization.data(withJSONObject: message),
              let jsonString = String(data: jsonData, encoding: .utf8) else {
            WebSocketClient.log("❌ WebSocket: Failed to serialize message: \(message)")
            throw WebSocketError.invalidMessage
        }
        
        let wsMessage = URLSessionWebSocketTask.Message.string(jsonString)
        task.send(wsMessage) { error in
            if let error = error {
                WebSocketClient.log("❌ WebSocket: Send error: \(error.localizedDescription)")
                // If send fails, the connection is likely broken
                Task { @MainActor [weak self] in
                    self?.handleDisconnection(error: error)
                }
            }
        }
    }

    /// Send a pre-serialized JSON string message
    func sendMessage(_ jsonString: String) throws {
        guard let task = webSocketTask else {
            WebSocketClient.log("❌ WebSocket: Cannot send message - no task")
            throw WebSocketError.notConnected
        }

        guard task.state == .running else {
            WebSocketClient.log("❌ WebSocket: Cannot send message - task state is \(task.state.rawValue)")
            throw WebSocketError.notConnected
        }

        let wsMessage = URLSessionWebSocketTask.Message.string(jsonString)
        task.send(wsMessage) { error in
            if let error = error {
                WebSocketClient.log("❌ WebSocket: Send error: \(error.localizedDescription)")
                Task { @MainActor [weak self] in
                    self?.handleDisconnection(error: error)
                }
            }
        }
    }
    
    // MARK: - Private Methods
    
    private func waitForConnection() async throws {
        return try await withCheckedThrowingContinuation { continuation in
            // Store continuation to be resumed by delegate callback
            self.connectionContinuation = continuation
            
            // Set timeout
            Task { [weak self] in
                try? await Task.sleep(for: .seconds(10))
                guard let self = self else { return }
                if let cont = self.connectionContinuation {
                    self.connectionContinuation = nil
                    WebSocketClient.log("⏱️ WebSocket: Connection timeout after 10 seconds")
                    cont.resume(throwing: WebSocketError.connectionClosed)
                }
            }
        }
    }
    
    /// Normalizes WebSocket URL - converts http:// to ws:// and https:// to wss://
    /// Adds default ports (80 for ws://, 443 for wss://) if port is missing.
    private func normalizeWebSocketURL(_ url: String) -> String {
        var normalized = url.trimmingCharacters(in: .whitespacesAndNewlines)

        // Replace http:// with ws://
        if normalized.hasPrefix("http://") {
            normalized = normalized.replacingOccurrences(of: "http://", with: "ws://")
        }

        // Replace https:// with wss://
        if normalized.hasPrefix("https://") {
            normalized = normalized.replacingOccurrences(of: "https://", with: "wss://")
        }

        // Ensure it starts with ws:// or wss://
        if !normalized.hasPrefix("ws://") && !normalized.hasPrefix("wss://") {
            normalized = "ws://" + normalized
        }

        // Parse URL to check for port
        guard var urlComponents = URLComponents(string: normalized) else {
            return normalized
        }

        // Add default port if not specified
        // 443 for wss://, 80 for ws://
        if urlComponents.port == nil {
            let defaultPort: Int
            if normalized.hasPrefix("wss://") {
                defaultPort = 443
            } else {
                defaultPort = 80
            }

            urlComponents.port = defaultPort
            if let urlWithPort = urlComponents.url {
                normalized = urlWithPort.absoluteString
                WebSocketClient.log("🔧 WebSocket: Added default port \(defaultPort) to URL: \(normalized)")
            }
        }

        return normalized
    }
    
    private func sendConnectMessage() async throws {
        guard let tunnelId = tunnelId,
              let authKey = authKey,
              let deviceId = deviceId else {
            WebSocketClient.log("❌ WebSocket: Missing credentials for connect message")
            throw WebSocketError.missingCredentials
        }
        
        let payload: [String: Any] = [
            "tunnel_id": tunnelId,
            "auth_key": authKey,
            "device_id": deviceId,
            "reconnect": reconnectAttempts > 0
        ]
        
        let message: [String: Any] = [
            "type": "connect",
            "payload": payload
        ]
        
        WebSocketClient.log("📤 WebSocket: Sending connect message (tunnel_id: \(tunnelId), device_id: \(deviceId))")
        try sendMessage(message)
    }
    
    private func waitForConnectedResponse() async throws {
        WebSocketClient.log("⏳ WebSocket: Waiting for connected response...")

        // Keep receiving messages until we get "connected" or an error
        // Other messages are buffered for later processing
        var bufferedMessages: [[String: Any]] = []
        let timeout: TimeInterval = 30.0
        let startTime = Date()

        while true {
            // Check timeout
            if Date().timeIntervalSince(startTime) > timeout {
                WebSocketClient.log("⏱️ WebSocket: Connect timeout after \(timeout) seconds")
                throw WebSocketError.connectionClosed
            }

            let message = try await receiveMessage(timeout: timeout - Date().timeIntervalSince(startTime))
            WebSocketClient.log("📥 WebSocket: Received message: \(message)")

            guard let messageType = message["type"] as? String else {
                WebSocketClient.log("⚠️ WebSocket: Message without type during connect: \(message)")
                continue
            }

            // Handle connect-related messages
            if messageType == "connected" || messageType == "error" {
                guard let parsed = WebSocketMessage.parse(message) else {
                    WebSocketClient.log("❌ WebSocket: Failed to parse connect message")
                    throw WebSocketError.unexpectedMessage
                }

                switch parsed {
                case .connected(let connectedMsg):
                    WebSocketClient.log("✅ WebSocket: Received connected response (tunnel_id: \(connectedMsg.payload.tunnelId))")

                    // Note: Buffered messages during connect phase are discarded since we're not authenticated yet
                    // They will be re-sent by the server after we authenticate

                    await MainActor.run {
                        delegate?.webSocketClient(
                            self,
                            didConnect: connectedMsg.payload.tunnelId,
                            tunnelVersion: connectedMsg.payload.tunnelVersion,
                            protocolVersion: connectedMsg.payload.protocolVersion
                        )
                    }
                    return

                case .error(let errorMsg):
                    let errorCode = errorMsg.payload.code
                    let errorMessage = errorMsg.payload.message
                    WebSocketClient.log("❌ WebSocket: Received error during connect: \(errorCode) - \(errorMessage)")

                    switch errorCode {
                    case "TUNNEL_NOT_FOUND":
                        throw WebSocketError.workstationOffline(errorMessage)
                    default:
                        throw WebSocketError.authenticationFailed(errorMessage)
                    }

                default:
                    WebSocketClient.log("❌ WebSocket: Unexpected parsed message type during connect")
                    throw WebSocketError.unexpectedMessage
                }
            } else {
                // Buffer non-connect messages (unlikely during connect phase, but handle gracefully)
                WebSocketClient.log("📦 WebSocket: Buffering message during connect: \(messageType)")
                bufferedMessages.append(message)

                // Safety limit
                if bufferedMessages.count > 100 {
                    bufferedMessages.removeFirst()
                }
            }
        }
    }
    
    private func sendAuthMessage() async throws {
        guard let authKey = authKey,
              let deviceId = deviceId else {
            WebSocketClient.log("❌ WebSocket: Missing credentials for auth message")
            throw WebSocketError.missingCredentials
        }
        
        let payload: [String: Any] = [
            "auth_key": authKey,
            "device_id": deviceId
        ]
        
        let message: [String: Any] = [
            "type": "auth",
            "payload": payload
        ]
        
        WebSocketClient.log("📤 WebSocket: Sending auth message (device_id: \(deviceId))")
        try sendMessage(message)
    }
    
    private func waitForAuthSuccess() async throws {
        WebSocketClient.log("⏳ WebSocket: Waiting for auth.success response...")

        // Keep receiving messages until we get auth.success, auth.error, or error
        // Other messages (like forward.session_output) are buffered for later processing
        var bufferedMessages: [[String: Any]] = []
        let timeout: TimeInterval = 30.0
        let startTime = Date()

        while true {
            // Check timeout
            if Date().timeIntervalSince(startTime) > timeout {
                WebSocketClient.log("⏱️ WebSocket: Auth timeout after \(timeout) seconds")
                throw WebSocketError.connectionClosed
            }

            let message = try await receiveMessage(timeout: timeout - Date().timeIntervalSince(startTime))

            guard let messageType = message["type"] as? String else {
                WebSocketClient.log("⚠️ WebSocket: Message without type during auth: \(message)")
                continue
            }

            // Handle auth-related messages
            if messageType == "auth.success" || messageType == "auth.error" || messageType == "error" || messageType == "connection.workstation_offline" {
                WebSocketClient.log("📥 WebSocket: Received auth response: \(messageType)")

                guard let parsed = WebSocketMessage.parse(message) else {
                    WebSocketClient.log("❌ WebSocket: Failed to parse auth message")
                    throw WebSocketError.unexpectedMessage
                }

                switch parsed {
                case .authSuccess(let authSuccessMsg):
                    WebSocketClient.log("✅ WebSocket: Received auth.success (device_id: \(authSuccessMsg.payload.deviceId))")

                    // Process buffered messages after successful auth
                    if !bufferedMessages.isEmpty {
                        WebSocketClient.log("📦 WebSocket: Processing \(bufferedMessages.count) buffered messages")
                        await MainActor.run {
                            for buffered in bufferedMessages {
                                handleReceivedMessage(buffered)
                            }
                        }
                    }

                    await MainActor.run {
                        delegate?.webSocketClient(
                            self,
                            didAuthenticate: authSuccessMsg.payload.deviceId,
                            workstationName: authSuccessMsg.payload.workstationName,
                            workstationVersion: authSuccessMsg.payload.workstationVersion,
                            protocolVersion: authSuccessMsg.payload.protocolVersion,
                            workspacesRoot: authSuccessMsg.payload.workspacesRoot,
                            restoredSubscriptions: authSuccessMsg.payload.restoredSubscriptions
                        )
                    }
                    return

                case .authError(let authErrorMsg):
                    WebSocketClient.log("❌ WebSocket: Authentication failed: \(authErrorMsg.payload.message)")
                    throw WebSocketError.authenticationFailed(authErrorMsg.payload.message)

                case .error(let errorMsg):
                    let errorCode = errorMsg.payload.code
                    let errorMessage = errorMsg.payload.message
                    WebSocketClient.log("❌ WebSocket: Received error during auth: \(errorCode) - \(errorMessage)")

                    switch errorCode {
                    case "WORKSTATION_OFFLINE", "TUNNEL_NOT_FOUND":
                        throw WebSocketError.workstationOffline(errorMessage)
                    default:
                        throw WebSocketError.authenticationFailed(errorMessage)
                    }

                case .workstationOffline(let offlineMsg):
                    WebSocketClient.log("❌ WebSocket: Workstation went offline during auth (tunnel_id: \(offlineMsg.payload.tunnelId))")
                    throw WebSocketError.workstationOffline("Workstation is offline")

                default:
                    WebSocketClient.log("❌ WebSocket: Unexpected parsed message type during auth")
                    throw WebSocketError.unexpectedMessage
                }
            } else {
                // Buffer non-auth messages for later processing
                WebSocketClient.log("📦 WebSocket: Buffering message during auth: \(messageType)")
                bufferedMessages.append(message)

                // Safety limit on buffered messages
                if bufferedMessages.count > 100 {
                    WebSocketClient.log("⚠️ WebSocket: Too many buffered messages during auth, dropping oldest")
                    bufferedMessages.removeFirst()
                }
            }
        }
    }
    
    private func receiveMessage(timeout: TimeInterval = 30.0) async throws -> [String: Any] {
        guard let task = webSocketTask else {
            WebSocketClient.log("❌ WebSocket: Cannot receive message - not connected")
            throw WebSocketError.notConnected
        }
        
        // Check if task is still running
        guard task.state == .running else {
            WebSocketClient.log("❌ WebSocket: Task state is \(task.state.rawValue), not running")
            throw WebSocketError.connectionClosed
        }
        
        // Use Data (which is Sendable) instead of [String: Any] for task group
        let messageData = try await withThrowingTaskGroup(of: Data.self) { group in
            // Task to receive message
            group.addTask {
                let message = try await task.receive()
                
                switch message {
                case .string(let text):
                    guard let data = text.data(using: .utf8) else {
                        WebSocketClient.log("❌ WebSocket: Failed to convert string to data: \(text)")
                        throw WebSocketError.invalidMessage
                    }
                    return data
                case .data(let data):
                    return data
                @unknown default:
                    WebSocketClient.log("❌ WebSocket: Unknown message type")
                    throw WebSocketError.invalidMessage
                }
            }
            
            // Task for timeout
            group.addTask {
                try await Task.sleep(for: .seconds(timeout))
                WebSocketClient.log("⏱️ WebSocket: Receive message timeout after \(timeout) seconds")
                throw WebSocketError.connectionClosed
            }
            
            // Return first completed task and cancel the other
            let result = try await group.next()!
            group.cancelAll()
            return result
        }
        
        // Parse JSON after receiving (on current actor, not in task group)
        guard let dict = try JSONSerialization.jsonObject(with: messageData) as? [String: Any] else {
            WebSocketClient.log("❌ WebSocket: Failed to parse JSON from received data")
            throw WebSocketError.invalidMessage
        }
        
        return dict
    }
    
    // MARK: - Heartbeat
    
    private func startHeartbeat() {
        // Stop any existing heartbeat first
        stopHeartbeat()
        
        // Send initial ping immediately to keep connection alive
        Task { @MainActor [weak self] in
            await self?.sendPing()
        }
        
        // Start periodic ping task using Task.sleep (best practice for async periodic tasks)
        // This approach is more reliable than Timer in async contexts and doesn't require RunLoop
        pingTask = Task { [weak self] in
            guard let self = self else { return }
            
            // Wait for initial delay before first periodic ping (initial ping already sent)
            try? await Task.sleep(for: .seconds(self.pingInterval))
            
            // Periodic ping loop
            while !Task.isCancelled {
                // Check if still connected and send ping (all on MainActor for thread safety)
                let shouldContinue = await MainActor.run {
                    guard self.isConnected, let task = self.webSocketTask, task.state == .running else {
                        WebSocketClient.log("⚠️ WebSocket: Stopping ping task - not connected")
                        return false
                    }
                    return true
                }
                
                guard shouldContinue else { break }
                
                // Send ping (sendPing is async and handles MainActor internally)
                await self.sendPing()
                
                // Wait for next ping interval
                try? await Task.sleep(for: .seconds(self.pingInterval))
            }
            
            WebSocketClient.log("🛑 WebSocket: Ping task ended")
        }
        WebSocketClient.log("⏰ WebSocket: Ping task started (interval: \(pingInterval)s)")
        
        // Start listening for messages (cancel any existing listen task first)
        listenTask?.cancel()
        listenTask = Task { [weak self] in
            await self?.listenForMessages()
        }
    }
    
    private func stopHeartbeat() {
        // Cancel ping task
        pingTask?.cancel()
        pingTask = nil
        // Cancel pong timeout task
        pongTimeoutTask?.cancel()
        pongTimeoutTask = nil
        // Cancel the listen task
        listenTask?.cancel()
        listenTask = nil
    }

    // MARK: - Application-Level Heartbeat

    /// Starts the application-level heartbeat that verifies end-to-end connectivity.
    /// This differs from transport-level ping/pong - it sends a message that must be
    /// processed by the workstation, verifying the full Mobile → Tunnel → Workstation path.
    private func startAppHeartbeat() {
        // Cancel any existing heartbeat task
        stopAppHeartbeat()

        heartbeatTask = Task { [weak self] in
            guard let self = self else { return }

            // Send first heartbeat immediately
            await self.sendHeartbeat()

            // Then send periodically
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(self.heartbeatInterval))
                guard !Task.isCancelled else { break }

                let canSend = await MainActor.run { self.isConnected }
                guard canSend else { break }

                await self.sendHeartbeat()
            }
        }

        WebSocketClient.log("💓 WebSocket: App heartbeat started (interval: \(heartbeatInterval)s)")
    }

    private func stopAppHeartbeat() {
        heartbeatTask?.cancel()
        heartbeatTask = nil
        heartbeatTimeoutTask?.cancel()
        heartbeatTimeoutTask = nil
        pendingHeartbeatId = nil
    }

    private func sendHeartbeat() async {
        let canSend = await MainActor.run {
            guard self.isConnected, let task = self.webSocketTask, task.state == .running else {
                return false
            }
            return true
        }

        guard canSend else {
            WebSocketClient.log("⚠️ WebSocket: Skipping heartbeat - not connected")
            return
        }

        let heartbeatId = UUID().uuidString
        let timestamp = Int64(Date().timeIntervalSince1970 * 1000)

        await MainActor.run {
            self.pendingHeartbeatId = heartbeatId
        }

        let message: [String: Any] = [
            "type": "heartbeat",
            "id": heartbeatId,
            "timestamp": timestamp
        ]

        do {
            try sendMessage(message)
            WebSocketClient.log("💓 WebSocket: Sent heartbeat (id: \(heartbeatId.prefix(8)))")

            // Cancel any existing timeout
            await MainActor.run {
                self.heartbeatTimeoutTask?.cancel()
            }

            // Start timeout for heartbeat ack
            heartbeatTimeoutTask = Task { [weak self] in
                guard let self = self else { return }

                try? await Task.sleep(for: .seconds(self.heartbeatTimeout))

                if !Task.isCancelled {
                    await MainActor.run {
                        // Only handle timeout if this heartbeat is still pending
                        if self.pendingHeartbeatId == heartbeatId {
                            self.handleHeartbeatTimeout()
                        }
                    }
                }
            }
        } catch {
            WebSocketClient.log("❌ WebSocket: Failed to send heartbeat: \(error)")
        }
    }

    @MainActor
    private func handleHeartbeatTimeout() {
        consecutiveHeartbeatFailures += 1
        pendingHeartbeatId = nil

        WebSocketClient.log("⚠️ WebSocket: Heartbeat timeout (failures: \(consecutiveHeartbeatFailures)/\(maxHeartbeatFailures))")

        if consecutiveHeartbeatFailures >= maxHeartbeatFailures {
            // Connection is stale - force full reconnect
            WebSocketClient.log("❌ WebSocket: Max heartbeat failures reached - forcing reconnect")
            delegate?.webSocketClient(self, connectionBecameStale: "No response from workstation")
            forceReconnect()
        } else {
            // Mark connection as degraded
            delegate?.webSocketClient(self, connectionDegraded: "Heartbeat timeout")
        }
    }

    @MainActor
    private func handleHeartbeatAck(id: String, timestamp: Int, uptimeMs: Int) {
        // Verify this is the ack for our pending heartbeat
        guard pendingHeartbeatId == id else {
            WebSocketClient.log("⚠️ WebSocket: Received heartbeat.ack for unknown id: \(id.prefix(8))")
            return
        }

        // Cancel timeout task
        heartbeatTimeoutTask?.cancel()
        heartbeatTimeoutTask = nil
        pendingHeartbeatId = nil
        consecutiveHeartbeatFailures = 0

        WebSocketClient.log("💓 WebSocket: Heartbeat ack received (uptime: \(uptimeMs)ms)")

        // Notify delegate that connection is verified
        delegate?.webSocketClient(self, didVerifyConnection: uptimeMs)
    }

    /// Forces a complete reconnection, canceling all tasks and resetting state
    private func forceReconnect() {
        WebSocketClient.log("🔄 WebSocket: Force reconnecting...")

        // Cancel all tasks
        stopHeartbeat()
        stopAppHeartbeat()
        networkChangeTask?.cancel()
        networkChangeTask = nil

        // Close socket
        webSocketTask?.cancel(with: .abnormalClosure, reason: "Force reconnect".data(using: .utf8))
        webSocketTask = nil
        urlSession?.invalidateAndCancel()
        urlSession = nil

        // Reset state
        isConnected = false
        isConnecting = false
        consecutiveMissedPongs = 0
        consecutiveHeartbeatFailures = 0
        pendingHeartbeatId = nil

        // Schedule reconnect
        scheduleReconnect()
    }

    private func sendPing() async {
        // Access connection state and task on MainActor for thread safety
        let canSend = await MainActor.run {
            guard self.isConnected, let task = self.webSocketTask, task.state == .running else {
                return false
            }
            return true
        }
        
        guard canSend else {
            WebSocketClient.log("⚠️ WebSocket: Skipping ping - not connected")
            return
        }
        
        let timestamp = Int64(Date().timeIntervalSince1970 * 1000)
        let message: [String: Any] = [
            "type": "ping",
            "timestamp": timestamp
        ]
        
        do {
            // sendMessage accesses webSocketTask directly, which is safe since we're in async context
            // and the class is @unchecked Sendable
            try sendMessage(message)
            WebSocketClient.log("📤 WebSocket: Sent ping (timestamp: \(timestamp))")
            
            // Set timeout for pong using Task (best practice for async timeouts)
            // Cancel any existing timeout task first
            await MainActor.run {
                self.pongTimeoutTask?.cancel()
            }
            
            // Create new timeout task
            pongTimeoutTask = Task { [weak self] in
                guard let self = self else { return }
                
                // Wait for pong timeout duration
                try? await Task.sleep(for: .seconds(self.pongTimeout))
                
                // Check if we're still waiting for pong (task wasn't cancelled)
                if !Task.isCancelled {
                    await MainActor.run {
                        self.handlePongTimeout()
                    }
                }
            }
        } catch {
            WebSocketClient.log("❌ WebSocket: Failed to send ping: \(error)")
            // If ping fails, connection might be broken - disconnect and reconnect
            await MainActor.run {
                self.handleDisconnection(error: error)
            }
        }
    }
    
    @MainActor
    private func handlePongTimeout() {
        consecutiveMissedPongs += 1
        WebSocketClient.log("⚠️ WebSocket: Pong timeout (missed: \(consecutiveMissedPongs)/\(missedPongsBeforeReconnect))")

        // If we've missed too many pongs, the connection is likely dead
        if consecutiveMissedPongs >= missedPongsBeforeReconnect {
            WebSocketClient.log("❌ WebSocket: Connection appears dead after \(consecutiveMissedPongs) missed pongs, reconnecting...")
            consecutiveMissedPongs = 0

            // Mark as disconnected and notify delegate
            let wasConnected = isConnected
            isConnected = false
            stopHeartbeat()
            stopNetworkMonitor()

            // Cancel WebSocket task to unblock any pending receive()
            webSocketTask?.cancel(with: .goingAway, reason: "Pong timeout".data(using: .utf8))
            webSocketTask = nil
            urlSession?.invalidateAndCancel()
            urlSession = nil

            // Notify delegate about disconnection
            if wasConnected {
                delegate?.webSocketClient(self, didDisconnect: WebSocketError.connectionClosed)
            }

            // Schedule reconnection
            scheduleReconnect()
        }
        // Otherwise, let the next ping cycle continue - might just be temporary network hiccup
    }
    
    private func listenForMessages() async {
        guard let task = webSocketTask else {
            WebSocketClient.log("⚠️ WebSocket: listenForMessages() - no webSocketTask")
            return
        }

        WebSocketClient.log("🎧 WebSocket: Starting to listen for messages (task state: \(task.state.rawValue))")

        while isConnected, task.state == .running {
            // Check if task was cancelled
            if Task.isCancelled {
                WebSocketClient.log("🛑 WebSocket: Listen task cancelled")
                break
            }

            do {
                // No timeout here - we rely on ping/pong mechanism for liveness detection
                // The pongTimeout task will trigger disconnection if server doesn't respond to pings
                // This allows idle terminals to stay connected indefinitely
                let wsMessage = try await task.receive()

                let messageData: Data
                switch wsMessage {
                case .string(let text):
                    guard let data = text.data(using: .utf8) else {
                        WebSocketClient.log("❌ WebSocket: Failed to convert string to data")
                        continue
                    }
                    messageData = data
                case .data(let data):
                    messageData = data
                @unknown default:
                    WebSocketClient.log("❌ WebSocket: Unknown message type")
                    continue
                }

                // Parse and handle message on main actor to avoid data races
                await MainActor.run { [messageData] in
                    // Parse JSON on MainActor to ensure thread safety
                    guard let dict = try? JSONSerialization.jsonObject(with: messageData) as? [String: Any] else {
                        WebSocketClient.log("❌ WebSocket: Failed to parse message data")
                        return
                    }
                    // Log message type for debugging (include pong for troubleshooting)
                    if let messageType = dict["type"] as? String {
                        WebSocketClient.log("📥 WebSocket: Received message type: \(messageType)")
                    }
                    handleReceivedMessage(dict)
                }
            } catch {
                // Check if task was cancelled (this is expected when disconnecting)
                if Task.isCancelled {
                    WebSocketClient.log("🛑 WebSocket: Listen task cancelled during receive")
                    break
                }

                // Connection lost or error
                // Check if connection is still valid before handling disconnection
                // This prevents handling errors from already-closed connections
                await MainActor.run {
                    // Only handle disconnection if we were actually connected
                    // This prevents duplicate disconnection handling
                    if isConnected {
                        WebSocketClient.log("❌ WebSocket: Error in listenForMessages: \(error)")
                        handleDisconnection(error: error)
                    } else {
                        WebSocketClient.log("⚠️ WebSocket: Error in listenForMessages but already disconnected: \(error)")
                    }
                }
                break
            }
        }
    }
    
    @MainActor
    private func handleReceivedMessage(_ message: [String: Any]) {
        // Handle tunnel-wrapped messages (forward.session_output)
        if let messageType = message["type"] as? String, messageType == "forward.session_output" {
            WebSocketClient.log("📦 WebSocket: Unwrapping forward.session_output message")
            
            // Unwrap tunnel message: extract the actual session.output message from payload
            // The payload can be either a String (JSON) or already a Dictionary
            if let payloadString = message["payload"] as? String {
                // Payload is a JSON string - parse it
                if let payloadData = payloadString.data(using: .utf8),
                   let unwrappedMessage = try? JSONSerialization.jsonObject(with: payloadData) as? [String: Any] {
                    WebSocketClient.log("✅ WebSocket: Unwrapped forward.session_output (from string)")
                    // Forward the unwrapped message to delegate
                    delegate?.webSocketClient(self, didReceiveMessage: unwrappedMessage)
                    return
                } else {
                    WebSocketClient.log("⚠️ WebSocket: Failed to parse payload string as JSON")
                    return
                }
            } else if let payloadDict = message["payload"] as? [String: Any] {
                // Payload is already a dictionary - forward it directly
                WebSocketClient.log("✅ WebSocket: Unwrapped forward.session_output (from dict)")
                delegate?.webSocketClient(self, didReceiveMessage: payloadDict)
                return
            } else {
                WebSocketClient.log("⚠️ WebSocket: forward.session_output payload is neither String nor Dictionary: \(type(of: message["payload"]))")
                return
            }
        }
        
        guard let parsed = WebSocketMessage.parse(message) else {
            // Unknown message, forward to delegate
            delegate?.webSocketClient(self, didReceiveMessage: message)
            return
        }
        
        switch parsed {
        case .pong(let pongMsg):
            lastPongTimestamp = Date()
            // Cancel pong timeout task since we received the pong
            pongTimeoutTask?.cancel()
            pongTimeoutTask = nil
            // Reset missed pongs counter - connection is healthy
            consecutiveMissedPongs = 0
            WebSocketClient.log("📥 WebSocket: Received pong (timestamp: \(pongMsg.timestamp))")

        case .heartbeatAck(let ackMsg):
            handleHeartbeatAck(
                id: ackMsg.id,
                timestamp: Int(ackMsg.timestamp),
                uptimeMs: ackMsg.workstationUptimeMs
            )

        case .error(let errorMsg):
            delegate?.webSocketClient(self, didReceiveMessage: message)
            // Check if it's a connection error
            if errorMsg.payload.code == "WORKSTATION_OFFLINE" {
                if let tunnelId = tunnelId {
                    delegate?.webSocketClient(self, workstationDidGoOffline: tunnelId)
                }
            }
            
        case .workstationOffline(let offlineMsg):
            delegate?.webSocketClient(self, workstationDidGoOffline: offlineMsg.payload.tunnelId)
            
        case .workstationOnline(let onlineMsg):
            delegate?.webSocketClient(self, workstationDidComeOnline: onlineMsg.payload.tunnelId)

        case .authSuccess(let authSuccessMsg):
            // Handle auth.success messages received after initial authentication
            // This happens when workstation reconnects and re-authenticates the client
            WebSocketClient.log("✅ WebSocket: Received auth.success (re-authentication after workstation reconnect)")
            delegate?.webSocketClient(
                self,
                didAuthenticate: authSuccessMsg.payload.deviceId,
                workstationName: authSuccessMsg.payload.workstationName,
                workstationVersion: authSuccessMsg.payload.workstationVersion,
                protocolVersion: authSuccessMsg.payload.protocolVersion,
                workspacesRoot: authSuccessMsg.payload.workspacesRoot,
                restoredSubscriptions: authSuccessMsg.payload.restoredSubscriptions
            )

        default:
            delegate?.webSocketClient(self, didReceiveMessage: message)
        }
    }
    
    // MARK: - Reconnection
    
    private func scheduleReconnect() {
        // Don't schedule reconnect if already connecting or reconnecting
        guard !isConnecting && !isReconnecting else {
            WebSocketClient.log("⚠️ WebSocket: Skipping reconnect - already connecting (\(isConnecting)) or reconnecting (\(isReconnecting))")
            return
        }
        
        // Don't reconnect if already connected
        guard !isConnected else {
            WebSocketClient.log("⚠️ WebSocket: Skipping reconnect - already connected")
            return
        }
        
        WebSocketClient.log("🔄 WebSocket: Scheduling reconnect (current attempts: \(reconnectAttempts))")
        isReconnecting = true
        
        reconnectTask?.cancel()
        reconnectTask = Task { [weak self] in
            guard let self = self else { return }
            
            let delay = min(
                self.minReconnectDelay * pow(2.0, Double(self.reconnectAttempts)),
                self.maxReconnectDelay
            )
            
            WebSocketClient.log("🔄 WebSocket: Scheduling reconnect in \(delay) seconds (attempt \(self.reconnectAttempts + 1))")
            try? await Task.sleep(for: .seconds(delay))
            
            // Check again before connecting (might have connected in the meantime)
            await MainActor.run {
                guard !self.isConnected else {
                    WebSocketClient.log("✅ WebSocket: Already connected, cancelling reconnect")
                    self.isReconnecting = false
                    return
                }
                
                // Check again if we're already connecting (might have started in the meantime)
                guard !self.isConnecting else {
                    WebSocketClient.log("⚠️ WebSocket: Connection already in progress, cancelling reconnect")
                    self.isReconnecting = false
                    return
                }
                
                guard let url = self.connectionURL,
                      let tunnelId = self.tunnelId,
                      let authKey = self.authKey,
                      let deviceId = self.deviceId else {
                    WebSocketClient.log("⚠️ WebSocket: Missing credentials for reconnect")
                    self.isReconnecting = false
                    return
                }
                
                self.reconnectAttempts += 1
                
                // Start connection (this will set isConnecting = true)
                Task {
                    do {
                        try await self.connect(url: url, tunnelId: tunnelId, authKey: authKey, deviceId: deviceId)
                        // Connection successful - isReconnecting will be cleared by connect()
                    } catch {
                        // Schedule another reconnect attempt
                        await MainActor.run {
                            self.isReconnecting = false // Clear flag before scheduling again
                            self.scheduleReconnect()
                        }
                    }
                }
            }
        }
    }
    
    @MainActor
    private func handleDisconnection(error: Error?) {
        // Prevent handling disconnection if we're already connecting (avoid race conditions)
        guard !isConnecting else {
            WebSocketClient.log("⚠️ WebSocket: Ignoring disconnection event - connection in progress")
            return
        }
        
        // If already disconnected, ignore duplicate disconnection events
        guard isConnected else {
            WebSocketClient.log("⚠️ WebSocket: Ignoring disconnection event - already disconnected")
            return
        }
        
        isConnected = false
        stopHeartbeat()
        delegate?.webSocketClient(self, didDisconnect: error)
        
        // Don't reconnect if the error is workstation offline - user needs to start the workstation
        if let wsError = error as? WebSocketError,
           case .workstationOffline = wsError {
            WebSocketClient.log("⚠️ WebSocket: Workstation is offline, not attempting reconnection")
            return
        }
        
        // Schedule reconnection if we have credentials
        // scheduleReconnect() will check isConnecting and isReconnecting internally
        if connectionURL != nil && tunnelId != nil && authKey != nil && deviceId != nil {
            scheduleReconnect()
        }
    }
}

// MARK: - URLSessionWebSocketDelegate

extension WebSocketClient: URLSessionWebSocketDelegate {
    nonisolated func urlSession(_ session: URLSession, webSocketTask: URLSessionWebSocketTask, didOpenWithProtocol protocol: String?) {
        // Connection opened - resume waiting continuation
        WebSocketClient.log("✅ WebSocket: Connection opened successfully")
        Task { @MainActor [weak self] in
            guard let self = self else { return }
            if let continuation = self.connectionContinuation {
                self.connectionContinuation = nil
                continuation.resume()
            }
        }
    }
    
    nonisolated func urlSession(_ session: URLSession, webSocketTask: URLSessionWebSocketTask, didCloseWith closeCode: URLSessionWebSocketTask.CloseCode, reason: Data?) {
        // Connection closed - cancel any waiting continuation and dispatch to main actor
        let reasonString = reason.flatMap { String(data: $0, encoding: .utf8) } ?? "unknown"
        WebSocketClient.log("❌ WebSocket: Connection closed with code \(closeCode.rawValue), reason: \(reasonString)")
        
        Task { @MainActor [weak self] in
            guard let self = self else { return }
            // Resume any waiting continuation to prevent leaks
            if let continuation = self.connectionContinuation {
                self.connectionContinuation = nil
                let error = WebSocketError.connectionClosed
                WebSocketClient.log("❌ WebSocket: Resuming connection continuation with error: \(error.localizedDescription)")
                continuation.resume(throwing: error)
            }
            // Only handle disconnection if we were actually connected
            // This prevents duplicate disconnection handling when connection closes during setup
            if self.isConnected || self.isConnecting {
                self.handleDisconnection(error: WebSocketError.connectionClosed)
            } else {
                WebSocketClient.log("⚠️ WebSocket: Ignoring didCloseWith - already disconnected or not connecting")
            }
        }
    }
}

// MARK: - Errors

enum WebSocketError: LocalizedError {
    case invalidURL
    case notConnected
    case invalidMessage
    case missingCredentials
    case unexpectedMessage
    case authenticationFailed(String)
    case connectionClosed
    case workstationOffline(String)
    
    var errorDescription: String? {
        switch self {
        case .invalidURL:
            return "Invalid WebSocket URL"
        case .notConnected:
            return "WebSocket is not connected"
        case .invalidMessage:
            return "Invalid message format"
        case .missingCredentials:
            return "Missing connection credentials"
        case .unexpectedMessage:
            return "Received unexpected message"
        case .authenticationFailed(let message):
            return "Authentication failed: \(message)"
        case .connectionClosed:
            return "WebSocket connection closed. Check that the tunnel server is running and the URL includes the correct port (default: 3001)"
        case .workstationOffline(let message):
            return "Workstation is offline: \(message). Please ensure the workstation server is running and connected to the tunnel."
        }
    }
}

