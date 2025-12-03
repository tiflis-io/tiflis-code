//
//  WebSocketClient.swift
//  TiflisCode
//
//  Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
//  Licensed under the MIT License. See LICENSE file for details.
//

import Foundation

/// WebSocket client implementation for connecting to tunnel server
/// Runs on background threads; delegate callbacks are dispatched to main actor
/// Thread-safe: All state mutations and delegate callbacks are properly synchronized
final class WebSocketClient: NSObject, WebSocketClientProtocol, @unchecked Sendable {
    weak var delegate: WebSocketClientDelegate?
    
    // MARK: - Constants

    private let pingInterval: TimeInterval = 20.0 // 20 seconds
    private let pongTimeout: TimeInterval = 30.0 // 30 seconds
    private let receiveTimeout: TimeInterval = 60.0 // 60 seconds - detect silent disconnects
    private let minReconnectDelay: TimeInterval = 1.0
    private let maxReconnectDelay: TimeInterval = 30.0
    
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
            urlSession = URLSession(configuration: configuration, delegate: self, delegateQueue: nil)
            
            // Create WebSocket task
            webSocketTask = urlSession?.webSocketTask(with: wsURL)
            
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
            
            // Start heartbeat (handles MainActor internally)
            startHeartbeat()
            
            isConnected = true
            reconnectAttempts = 0
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
    
    /// Normalizes WebSocket URL - converts http:// to ws:// and ensures proper format
    /// Only adds default ports (80 for ws://, 443 for wss://) if port is missing AND no path is present.
    /// URLs with paths (like /ws) are assumed to be service-specific and should include the port explicitly.
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
            // If no protocol, assume ws:// for local development
            normalized = "ws://" + normalized
        }
        
        // Parse URL to check for port and path
        guard let urlComponents = URLComponents(string: normalized) else {
            return normalized
        }
        
        // Only add default port if:
        // 1. No port is specified
        // 2. No path is present (or path is just "/")
        // URLs with paths like "/ws" are likely service-specific and should include the port
        let hasPath = urlComponents.path.count > 1 // More than just "/"
        
        if urlComponents.port == nil && !hasPath {
            let defaultPort: Int
            if normalized.hasPrefix("wss://") {
                defaultPort = 443
            } else {
                defaultPort = 80
            }
            
            // Reconstruct URL with default port
            var components = urlComponents
            components.port = defaultPort
            if let urlWithPort = components.url {
                normalized = urlWithPort.absoluteString
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
    
    private func handlePongTimeout() {
        // Connection is stale, disconnect and reconnect
        disconnect()
        scheduleReconnect()
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
                // Use timeout on receive to detect silent disconnects (network switch, carrier change)
                // Without timeout, task.receive() blocks indefinitely on stale connections
                WebSocketClient.log("👂 WebSocket: Waiting for message (timeout: \(receiveTimeout)s)...")

                let messageData = try await withThrowingTaskGroup(of: Data.self) { group in
                    // Task to receive message
                    group.addTask {
                        let wsMessage = try await task.receive()

                        switch wsMessage {
                        case .string(let text):
                            guard let data = text.data(using: .utf8) else {
                                throw WebSocketError.invalidMessage
                            }
                            return data
                        case .data(let data):
                            return data
                        @unknown default:
                            throw WebSocketError.invalidMessage
                        }
                    }

                    // Task for timeout - detect silent disconnects
                    group.addTask { [receiveTimeout] in
                        try await Task.sleep(for: .seconds(receiveTimeout))
                        WebSocketClient.log("⏱️ WebSocket: Receive timeout after \(receiveTimeout) seconds - connection may be stale")
                        throw WebSocketError.connectionClosed
                    }

                    // Return first completed task and cancel the other
                    let result = try await group.next()!
                    group.cancelAll()
                    return result
                }

                WebSocketClient.log("📥 WebSocket: Received raw message")

                // Parse and handle message on main actor to avoid data races
                await MainActor.run { [messageData] in
                    // Parse JSON on MainActor to ensure thread safety
                    guard let dict = try? JSONSerialization.jsonObject(with: messageData) as? [String: Any] else {
                        WebSocketClient.log("❌ WebSocket: Failed to parse message data")
                        return
                    }
                    // Log message type for debugging
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

                // Connection lost or error (including receive timeout)
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
            WebSocketClient.log("📥 WebSocket: Received pong (timestamp: \(pongMsg.timestamp))")
            
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

