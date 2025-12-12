//
//  WebSocketMessage.swift
//  TiflisCode
//
//  Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
//  Licensed under the Functional Source License (FSL-1.1-NC). See LICENSE file for details.
//

import Foundation

// MARK: - Connection Messages

/// Message sent from mobile client to tunnel server to establish connection
struct ConnectMessage: Codable {
    let type: String
    let payload: ConnectPayload
    
    init(payload: ConnectPayload) {
        self.type = "connect"
        self.payload = payload
    }
    
    struct ConnectPayload: Codable {
        let tunnelId: String
        let authKey: String
        let deviceId: String
        let reconnect: Bool?
        
        enum CodingKeys: String, CodingKey {
            case tunnelId = "tunnel_id"
            case authKey = "auth_key"
            case deviceId = "device_id"
            case reconnect
        }
    }
}

/// Response from tunnel server confirming connection
struct ConnectedMessage: Codable {
    let type: String
    let payload: ConnectedPayload
    
    struct ConnectedPayload: Codable {
        let tunnelId: String
        let tunnelVersion: String?
        let protocolVersion: String?
        let restored: Bool?
        
        enum CodingKeys: String, CodingKey {
            case tunnelId = "tunnel_id"
            case tunnelVersion = "tunnel_version"
            case protocolVersion = "protocol_version"
            case restored
        }
    }
}

// MARK: - Authentication Messages

/// Message sent from mobile client to workstation (via tunnel) for authentication
struct AuthMessage: Codable {
    let type: String
    let payload: AuthPayload
    
    init(payload: AuthPayload) {
        self.type = "auth"
        self.payload = payload
    }
    
    struct AuthPayload: Codable {
        let authKey: String
        let deviceId: String
        
        enum CodingKeys: String, CodingKey {
            case authKey = "auth_key"
            case deviceId = "device_id"
        }
    }
}

/// Response from workstation confirming successful authentication
struct AuthSuccessMessage: Codable {
    let type: String
    let payload: AuthSuccessPayload
    
    struct AuthSuccessPayload: Codable {
        let deviceId: String
        let workstationName: String?
        let workstationVersion: String?
        let protocolVersion: String?
        let workspacesRoot: String?
        let restoredSubscriptions: [String]?

        enum CodingKeys: String, CodingKey {
            case deviceId = "device_id"
            case workstationName = "workstation_name"
            case workstationVersion = "workstation_version"
            case protocolVersion = "protocol_version"
            case workspacesRoot = "workspaces_root"
            case restoredSubscriptions = "restored_subscriptions"
        }
    }
}

/// Response from workstation indicating authentication failure
struct AuthErrorMessage: Codable {
    let type: String
    let payload: AuthErrorPayload
    
    struct AuthErrorPayload: Codable {
        let code: String
        let message: String
    }
}

// MARK: - Heartbeat Messages

/// Ping message sent periodically to keep connection alive
struct PingMessage: Codable {
    let type: String
    let timestamp: Int64
    
    init(timestamp: Int64 = Int64(Date().timeIntervalSince1970 * 1000)) {
        self.type = "ping"
        self.timestamp = timestamp
    }
}

/// Pong message sent in response to ping
struct PongMessage: Codable {
    let type: String
    let timestamp: Int64

    init(timestamp: Int64) {
        self.type = "pong"
        self.timestamp = timestamp
    }
}

/// Heartbeat acknowledgment message for end-to-end connectivity verification
struct HeartbeatAckMessage: Codable {
    let type: String
    let id: String
    let timestamp: Int64
    let workstationUptimeMs: Int

    enum CodingKeys: String, CodingKey {
        case type
        case id
        case timestamp
        case workstationUptimeMs = "workstation_uptime_ms"
    }
}

// MARK: - Error Messages

/// Generic error message
struct ErrorMessage: Codable {
    let type: String
    let payload: ErrorPayload
    let id: String?
    
    struct ErrorPayload: Codable {
        let code: String
        let message: String
        let details: [String: String]?
    }
}

// MARK: - Connection Event Messages

/// Message indicating workstation went offline
struct WorkstationOfflineMessage: Codable {
    let type: String
    let payload: WorkstationOfflinePayload
    
    struct WorkstationOfflinePayload: Codable {
        let tunnelId: String
        
        enum CodingKeys: String, CodingKey {
            case tunnelId = "tunnel_id"
        }
    }
}

/// Message indicating workstation came online
struct WorkstationOnlineMessage: Codable {
    let type: String
    let payload: WorkstationOnlinePayload
    
    struct WorkstationOnlinePayload: Codable {
        let tunnelId: String
        
        enum CodingKeys: String, CodingKey {
            case tunnelId = "tunnel_id"
        }
    }
}

/// Enum representing all possible WebSocket messages
enum WebSocketMessage {
    case connected(ConnectedMessage)
    case authSuccess(AuthSuccessMessage)
    case authError(AuthErrorMessage)
    case pong(PongMessage)
    case heartbeatAck(HeartbeatAckMessage)
    case error(ErrorMessage)
    case workstationOffline(WorkstationOfflineMessage)
    case workstationOnline(WorkstationOnlineMessage)
    case unknown([String: Any])
}

// MARK: - Message Parsing Helpers

extension WebSocketMessage {
    /// Parses a raw JSON dictionary into the appropriate message type
    static func parse(_ dictionary: [String: Any]) -> WebSocketMessage? {
        guard let type = dictionary["type"] as? String else {
            return nil
        }
        
        switch type {
        case "connected":
            return try? parseConnected(dictionary)
        case "auth.success":
            return try? parseAuthSuccess(dictionary)
        case "auth.error":
            return try? parseAuthError(dictionary)
        case "pong":
            return try? parsePong(dictionary)
        case "heartbeat.ack":
            return try? parseHeartbeatAck(dictionary)
        case "error":
            return try? parseError(dictionary)
        case "connection.workstation_offline":
            return try? parseWorkstationOffline(dictionary)
        case "connection.workstation_online":
            return try? parseWorkstationOnline(dictionary)
        default:
            return .unknown(dictionary)
        }
    }
    
    private static func parseConnected(_ dict: [String: Any]) throws -> WebSocketMessage? {
        let data = try JSONSerialization.data(withJSONObject: dict)
        let message = try JSONDecoder().decode(ConnectedMessage.self, from: data)
        return .connected(message)
    }
    
    private static func parseAuthSuccess(_ dict: [String: Any]) throws -> WebSocketMessage? {
        let data = try JSONSerialization.data(withJSONObject: dict)
        let message = try JSONDecoder().decode(AuthSuccessMessage.self, from: data)
        return .authSuccess(message)
    }
    
    private static func parseAuthError(_ dict: [String: Any]) throws -> WebSocketMessage? {
        let data = try JSONSerialization.data(withJSONObject: dict)
        let message = try JSONDecoder().decode(AuthErrorMessage.self, from: data)
        return .authError(message)
    }
    
    private static func parsePong(_ dict: [String: Any]) throws -> WebSocketMessage? {
        let data = try JSONSerialization.data(withJSONObject: dict)
        let message = try JSONDecoder().decode(PongMessage.self, from: data)
        return .pong(message)
    }

    private static func parseHeartbeatAck(_ dict: [String: Any]) throws -> WebSocketMessage? {
        let data = try JSONSerialization.data(withJSONObject: dict)
        let message = try JSONDecoder().decode(HeartbeatAckMessage.self, from: data)
        return .heartbeatAck(message)
    }

    private static func parseError(_ dict: [String: Any]) throws -> WebSocketMessage? {
        let data = try JSONSerialization.data(withJSONObject: dict)
        let message = try JSONDecoder().decode(ErrorMessage.self, from: data)
        return .error(message)
    }
    
    private static func parseWorkstationOffline(_ dict: [String: Any]) throws -> WebSocketMessage? {
        let data = try JSONSerialization.data(withJSONObject: dict)
        let message = try JSONDecoder().decode(WorkstationOfflineMessage.self, from: data)
        return .workstationOffline(message)
    }
    
    private static func parseWorkstationOnline(_ dict: [String: Any]) throws -> WebSocketMessage? {
        let data = try JSONSerialization.data(withJSONObject: dict)
        let message = try JSONDecoder().decode(WorkstationOnlineMessage.self, from: data)
        return .workstationOnline(message)
    }
}

