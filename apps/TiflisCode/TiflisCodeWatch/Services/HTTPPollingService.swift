//
//  HTTPPollingService.swift
//  TiflisCodeWatch
//
//  Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
//  Licensed under the Functional Source License (FSL-1.1-NC). See LICENSE file for details.
//

import Foundation
import Combine

/// Service for HTTP polling communication with tunnel server.
/// Used on watchOS because direct WebSocket connections are blocked by Apple (NECP policy).
@MainActor
final class HTTPPollingService: ObservableObject {
    // MARK: - Published State

    @Published private(set) var isConnected = false
    @Published private(set) var workstationOnline = false
    @Published private(set) var workstationName: String?
    @Published private(set) var lastError: String?

    // MARK: - Debug State (visible in UI when logs don't work)

    @Published var debugLastPollTime: Date?
    @Published var debugLastPollResult: String = "Not polled"
    @Published var debugMessagesReceived: Int = 0
    @Published var debugLastMessageType: String = "None"

    // MARK: - Message Publisher

    /// Publisher for received messages from the server
    let messageSubject = PassthroughSubject<[String: Any], Never>()

    // MARK: - Private Properties

    private var tunnelURL: String?
    private var tunnelId: String?
    private var authKey: String?
    private var deviceId: String

    private var pollingTask: Task<Void, Never>?
    private var currentSequence: Int = 0

    // Polling configuration
    private let pollIntervalSeconds: TimeInterval = 2.0
    private let pollTimeoutSeconds: TimeInterval = 30.0

    private let urlSession: URLSession

    // MARK: - Initialization

    init(deviceId: String? = nil) {
        self.deviceId = deviceId ?? UUID().uuidString

        // Configure URLSession for watchOS
        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 30
        config.timeoutIntervalForResource = 60
        config.allowsCellularAccess = true
        config.allowsConstrainedNetworkAccess = true
        config.allowsExpensiveNetworkAccess = true
        self.urlSession = URLSession(configuration: config)
    }

    // MARK: - Public Methods

    /// Configures the service with tunnel credentials
    func configure(tunnelURL: String, tunnelId: String, authKey: String) {
        self.tunnelURL = tunnelURL
        self.tunnelId = tunnelId
        self.authKey = authKey
        NSLog("⌚️ HTTPPollingService: Configured with tunnel URL: %@", tunnelURL)
    }

    /// Connects to the tunnel server via HTTP
    func connect() async throws {
        guard let tunnelURL = tunnelURL,
              let tunnelId = tunnelId,
              let authKey = authKey else {
            throw HTTPPollingError.notConfigured
        }

        NSLog("⌚️ HTTPPollingService: Connecting to tunnel...")

        // Build connect URL
        let baseURL = buildHTTPURL(from: tunnelURL)
        guard let url = URL(string: "\(baseURL)/api/v1/watch/connect") else {
            throw HTTPPollingError.invalidURL
        }

        // Build request body
        let body: [String: Any] = [
            "tunnel_id": tunnelId,
            "auth_key": authKey,
            "device_id": deviceId
        ]

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONSerialization.data(withJSONObject: body)

        // Send connect request
        let (data, response) = try await urlSession.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse else {
            throw HTTPPollingError.invalidResponse
        }

        if httpResponse.statusCode == 200 {
            if let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
                let online = json["workstation_online"] as? Bool ?? false
                let name = json["workstation_name"] as? String

                self.isConnected = true
                self.workstationOnline = online
                self.workstationName = name
                self.lastError = nil
                self.currentSequence = 0

                NSLog("⌚️ HTTPPollingService: Connected! Workstation online: %d", online ? 1 : 0)

                // Start polling
                startPolling()
            }
        } else {
            let errorJson = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
            let errorMessage = errorJson?["message"] as? String ?? "Connection failed"
            throw HTTPPollingError.serverError(httpResponse.statusCode, errorMessage)
        }
    }

    /// Disconnects from the tunnel server
    func disconnect() {
        NSLog("⌚️ HTTPPollingService: Disconnecting...")

        // Stop polling
        pollingTask?.cancel()
        pollingTask = nil

        // Send disconnect request (fire and forget)
        Task {
            await sendDisconnectRequest()
        }

        isConnected = false
        workstationOnline = false
        currentSequence = 0
    }

    /// Sends a command to the workstation
    func sendCommand(_ message: [String: Any]) async throws {
        guard let tunnelURL = tunnelURL,
              let tunnelId = tunnelId,
              let authKey = authKey else {
            throw HTTPPollingError.notConfigured
        }

        guard isConnected else {
            throw HTTPPollingError.notConnected
        }

        let baseURL = buildHTTPURL(from: tunnelURL)
        guard let url = URL(string: "\(baseURL)/api/v1/watch/command") else {
            throw HTTPPollingError.invalidURL
        }

        // Include auth credentials in every request for security and
        // to ensure workstation registers the device_id
        let body: [String: Any] = [
            "tunnel_id": tunnelId,
            "auth_key": authKey,
            "device_id": deviceId,
            "message": message
        ]

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONSerialization.data(withJSONObject: body)

        let (data, response) = try await urlSession.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse else {
            throw HTTPPollingError.invalidResponse
        }

        if httpResponse.statusCode != 200 {
            let errorJson = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
            let errorMessage = errorJson?["message"] as? String ?? "Command failed"

            if httpResponse.statusCode == 503 {
                workstationOnline = false
                throw HTTPPollingError.workstationOffline
            }

            throw HTTPPollingError.serverError(httpResponse.statusCode, errorMessage)
        }

        NSLog("⌚️ HTTPPollingService: Command sent successfully")
    }

    // MARK: - Private Methods

    /// Converts WebSocket URL to HTTP URL
    private func buildHTTPURL(from wsURL: String) -> String {
        var httpURL = wsURL

        // Replace ws:// with http:// and wss:// with https://
        if httpURL.hasPrefix("wss://") {
            httpURL = httpURL.replacingOccurrences(of: "wss://", with: "https://")
        } else if httpURL.hasPrefix("ws://") {
            httpURL = httpURL.replacingOccurrences(of: "ws://", with: "http://")
        }

        // Remove /ws path if present
        if httpURL.hasSuffix("/ws") {
            httpURL = String(httpURL.dropLast(3))
        }

        return httpURL
    }

    /// Starts the polling loop
    private func startPolling() {
        pollingTask?.cancel()

        pollingTask = Task { [weak self] in
            while !Task.isCancelled {
                guard let self = self, self.isConnected else { break }

                do {
                    try await self.pollMessages()
                } catch {
                    NSLog("⌚️ HTTPPollingService: Poll error: %@", error.localizedDescription)

                    // Handle specific errors
                    if case HTTPPollingError.notConnected = error {
                        break
                    }
                }

                // Wait before next poll
                try? await Task.sleep(for: .seconds(self.pollIntervalSeconds))
            }
        }
    }

    /// Polls for new messages
    private func pollMessages() async throws {
        guard let tunnelURL = tunnelURL else {
            throw HTTPPollingError.notConfigured
        }

        let baseURL = buildHTTPURL(from: tunnelURL)
        guard var urlComponents = URLComponents(string: "\(baseURL)/api/v1/watch/messages") else {
            throw HTTPPollingError.invalidURL
        }

        urlComponents.queryItems = [
            URLQueryItem(name: "device_id", value: deviceId),
            URLQueryItem(name: "since", value: String(currentSequence))
        ]

        guard let url = urlComponents.url else {
            throw HTTPPollingError.invalidURL
        }

        var request = URLRequest(url: url)
        request.httpMethod = "GET"
        request.timeoutInterval = pollTimeoutSeconds

        let (data, response) = try await urlSession.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse else {
            throw HTTPPollingError.invalidResponse
        }

        // Update debug state
        debugLastPollTime = Date()

        if httpResponse.statusCode == 200 {
            guard let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
                debugLastPollResult = "Invalid JSON response"
                return
            }

            // Update workstation status
            if let online = json["workstation_online"] as? Bool {
                if workstationOnline != online {
                    workstationOnline = online
                    NSLog("⌚️ HTTPPollingService: Workstation online status changed to: %d", online ? 1 : 0)
                }
            }

            // Update sequence
            if let newSequence = json["current_sequence"] as? Int {
                currentSequence = newSequence
            }

            // Process messages
            if let messages = json["messages"] as? [[String: Any]] {
                debugLastPollResult = "OK: \(messages.count) msgs, seq=\(currentSequence)"

                for message in messages {
                    if let messageData = message["data"] as? [String: Any] {
                        debugMessagesReceived += 1
                        if let msgType = messageData["type"] as? String {
                            debugLastMessageType = msgType
                        }
                        messageSubject.send(messageData)
                    }
                }

                if !messages.isEmpty {
                    NSLog("⌚️ HTTPPollingService: Received %d messages", messages.count)
                }
            } else {
                debugLastPollResult = "OK: no messages array"
            }
        } else if httpResponse.statusCode == 404 {
            // Client not found - need to reconnect
            isConnected = false
            throw HTTPPollingError.notConnected
        } else {
            let errorJson = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
            let errorMessage = errorJson?["message"] as? String ?? "Poll failed"
            throw HTTPPollingError.serverError(httpResponse.statusCode, errorMessage)
        }
    }

    /// Sends disconnect request
    private func sendDisconnectRequest() async {
        guard let tunnelURL = tunnelURL else { return }

        let baseURL = buildHTTPURL(from: tunnelURL)
        guard let url = URL(string: "\(baseURL)/api/v1/watch/disconnect") else { return }

        let body: [String: Any] = [
            "device_id": deviceId
        ]

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try? JSONSerialization.data(withJSONObject: body)

        _ = try? await urlSession.data(for: request)
    }
}

// MARK: - Errors

enum HTTPPollingError: LocalizedError {
    case notConfigured
    case notConnected
    case invalidURL
    case invalidResponse
    case workstationOffline
    case serverError(Int, String)

    var errorDescription: String? {
        switch self {
        case .notConfigured:
            return "Service not configured"
        case .notConnected:
            return "Not connected"
        case .invalidURL:
            return "Invalid URL"
        case .invalidResponse:
            return "Invalid response"
        case .workstationOffline:
            return "Workstation offline"
        case .serverError(let code, let message):
            return "Server error (\(code)): \(message)"
        }
    }
}
