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
    private let minReconnectDelay: TimeInterval = 1.0
    private let maxReconnectDelay: TimeInterval = 30.0
    
    // MARK: - Properties
    
    private var webSocketTask: URLSessionWebSocketTask?
    private var urlSession: URLSession?
    private var pingTimer: Timer?
    private var lastPongTimestamp: Date?
    private var pongTimeoutTimer: Timer?
    
    private var connectionURL: String?
    private var tunnelId: String?
    private var authKey: String?
    private var deviceId: String?
    
    private var reconnectAttempts = 0
    private var reconnectTask: Task<Void, Never>?
    private var isReconnecting = false
    
    private(set) var isConnected = false
    
    // Connection waiting
    private var connectionContinuation: CheckedContinuation<Void, Error>?
    
    // MARK: - Connection
    
    func connect(url: String, tunnelId: String, authKey: String, deviceId: String) async throws {
        // Cancel any ongoing reconnection
        reconnectTask?.cancel()
        reconnectTask = nil
        isReconnecting = false
        
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
            throw WebSocketError.invalidURL
        }
        
        // Validate it's a WebSocket URL
        guard wsURL.scheme == "ws" || wsURL.scheme == "wss" else {
            throw WebSocketError.invalidURL
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
        try await waitForConnection()
        
        // Send connect message to tunnel
        try await sendConnectMessage()
        
        // Wait for connected response
        try await waitForConnectedResponse()
        
        // Send auth message to workstation
        try await sendAuthMessage()
        
        // Wait for auth.success response
        try await waitForAuthSuccess()
        
        // Start heartbeat
        startHeartbeat()
        
        isConnected = true
        reconnectAttempts = 0
    }
    
    func disconnect() {
        stopHeartbeat()
        webSocketTask?.cancel(with: .goingAway, reason: nil)
        webSocketTask = nil
        urlSession?.invalidateAndCancel()
        urlSession = nil
        isConnected = false
        reconnectTask?.cancel()
        reconnectTask = nil
        isReconnecting = false
    }
    
    // MARK: - Message Sending
    
    func sendMessage(_ message: [String: Any]) throws {
        guard let task = webSocketTask, task.state == .running else {
            throw WebSocketError.notConnected
        }
        
        guard let jsonData = try? JSONSerialization.data(withJSONObject: message),
              let jsonString = String(data: jsonData, encoding: .utf8) else {
            throw WebSocketError.invalidMessage
        }
        
        let wsMessage = URLSessionWebSocketTask.Message.string(jsonString)
        task.send(wsMessage) { error in
            if let error = error {
                print("WebSocket send error: \(error)")
            }
        }
    }
    
    // MARK: - Private Methods
    
    private func waitForConnection() async throws {
        return try await withCheckedThrowingContinuation { continuation in
            // Store continuation to be resumed by delegate callback
            self.connectionContinuation = continuation
            
            // Set timeout
            Task {
                try? await Task.sleep(for: .seconds(10))
                if let cont = self.connectionContinuation {
                    self.connectionContinuation = nil
                    cont.resume(throwing: WebSocketError.connectionClosed)
                }
            }
        }
    }
    
    /// Normalizes WebSocket URL - converts http:// to ws:// and ensures proper format
    /// Adds default ports (80 for ws://, 443 for wss://) if port is missing
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
        
        // Parse URL to check for port
        guard let urlComponents = URLComponents(string: normalized) else {
            return normalized
        }
        
        // If no port is specified, add default port based on scheme
        if urlComponents.port == nil {
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
        
        try sendMessage(message)
    }
    
    private func waitForConnectedResponse() async throws {
        let message = try await receiveMessage()
        
        guard let parsed = WebSocketMessage.parse(message),
              case .connected(let connectedMsg) = parsed else {
            throw WebSocketError.unexpectedMessage
        }
        
        await MainActor.run {
            delegate?.webSocketClient(self, didConnect: connectedMsg.payload.tunnelId)
        }
    }
    
    private func sendAuthMessage() async throws {
        guard let authKey = authKey,
              let deviceId = deviceId else {
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
        
        try sendMessage(message)
    }
    
    private func waitForAuthSuccess() async throws {
        let message = try await receiveMessage()
        
        guard let parsed = WebSocketMessage.parse(message) else {
            throw WebSocketError.unexpectedMessage
        }
        
        switch parsed {
        case .authSuccess(let authSuccessMsg):
            await MainActor.run {
                delegate?.webSocketClient(
                    self,
                    didAuthenticate: authSuccessMsg.payload.deviceId,
                    restoredSubscriptions: authSuccessMsg.payload.restoredSubscriptions
                )
            }
        case .authError(let authErrorMsg):
            throw WebSocketError.authenticationFailed(authErrorMsg.payload.message)
        default:
            throw WebSocketError.unexpectedMessage
        }
    }
    
    private func receiveMessage() async throws -> [String: Any] {
        guard let task = webSocketTask else {
            throw WebSocketError.notConnected
        }
        
        let message = try await task.receive()
        
        switch message {
        case .string(let text):
            guard let data = text.data(using: .utf8),
                  let dict = try JSONSerialization.jsonObject(with: data) as? [String: Any] else {
                throw WebSocketError.invalidMessage
            }
            return dict
        case .data(let data):
            guard let dict = try JSONSerialization.jsonObject(with: data) as? [String: Any] else {
                throw WebSocketError.invalidMessage
            }
            return dict
        @unknown default:
            throw WebSocketError.invalidMessage
        }
    }
    
    // MARK: - Heartbeat
    
    private func startHeartbeat() {
        stopHeartbeat()
        
        pingTimer = Timer.scheduledTimer(withTimeInterval: pingInterval, repeats: true) { [weak self] _ in
            Task { @MainActor [weak self] in
                await self?.sendPing()
            }
        }
        
        // Start listening for messages
        Task {
            await listenForMessages()
        }
    }
    
    private func stopHeartbeat() {
        pingTimer?.invalidate()
        pingTimer = nil
        pongTimeoutTimer?.invalidate()
        pongTimeoutTimer = nil
    }
    
    private func sendPing() async {
        let timestamp = Int64(Date().timeIntervalSince1970 * 1000)
        let message: [String: Any] = [
            "type": "ping",
            "timestamp": timestamp
        ]
        
        do {
            try sendMessage(message)
            
            // Set timeout for pong
            pongTimeoutTimer?.invalidate()
            pongTimeoutTimer = Timer.scheduledTimer(withTimeInterval: pongTimeout, repeats: false) { [weak self] _ in
                Task { @MainActor [weak self] in
                    self?.handlePongTimeout()
                }
            }
        } catch {
            print("Failed to send ping: \(error)")
        }
    }
    
    private func handlePongTimeout() {
        // Connection is stale, disconnect and reconnect
        disconnect()
        scheduleReconnect()
    }
    
    private func listenForMessages() async {
        while isConnected, let task = webSocketTask, task.state == .running {
            do {
                let message = try await receiveMessage()
                
                // Handle message on main actor
                await MainActor.run {
                    handleReceivedMessage(message)
                }
            } catch {
                // Connection lost
                await MainActor.run {
                    handleDisconnection(error: error)
                }
                break
            }
        }
    }
    
    @MainActor
    private func handleReceivedMessage(_ message: [String: Any]) {
        guard let parsed = WebSocketMessage.parse(message) else {
            // Unknown message, forward to delegate
            delegate?.webSocketClient(self, didReceiveMessage: message)
            return
        }
        
        switch parsed {
        case .pong:
            lastPongTimestamp = Date()
            pongTimeoutTimer?.invalidate()
            pongTimeoutTimer = nil
            
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
        guard !isReconnecting else { return }
        isReconnecting = true
        
        reconnectTask?.cancel()
        reconnectTask = Task { [weak self] in
            guard let self = self else { return }
            
            let delay = min(
                self.minReconnectDelay * pow(2.0, Double(self.reconnectAttempts)),
                self.maxReconnectDelay
            )
            
            try? await Task.sleep(for: .seconds(delay))
            
            guard let url = self.connectionURL,
                  let tunnelId = self.tunnelId,
                  let authKey = self.authKey,
                  let deviceId = self.deviceId else {
                self.isReconnecting = false
                return
            }
            
            self.reconnectAttempts += 1
            
            do {
                try await self.connect(url: url, tunnelId: tunnelId, authKey: authKey, deviceId: deviceId)
            } catch {
                // Schedule another reconnect attempt
                await MainActor.run {
                    self.scheduleReconnect()
                }
            }
        }
    }
    
    @MainActor
    private func handleDisconnection(error: Error?) {
        isConnected = false
        stopHeartbeat()
        delegate?.webSocketClient(self, didDisconnect: error)
        
        // Schedule reconnection if we have credentials
        if connectionURL != nil && tunnelId != nil && authKey != nil && deviceId != nil {
            scheduleReconnect()
        }
    }
}

// MARK: - URLSessionWebSocketDelegate

extension WebSocketClient: URLSessionWebSocketDelegate {
    nonisolated func urlSession(_ session: URLSession, webSocketTask: URLSessionWebSocketTask, didOpenWithProtocol protocol: String?) {
        // Connection opened - resume waiting continuation
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
        Task { @MainActor [weak self] in
            guard let self = self else { return }
            if let continuation = self.connectionContinuation {
                self.connectionContinuation = nil
                continuation.resume(throwing: WebSocketError.connectionClosed)
            }
            self.handleDisconnection(error: WebSocketError.connectionClosed)
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
            return "WebSocket connection closed"
        }
    }
}

