//
//  WebSocketMessage.swift
//  TiflisCode
//
//  Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
//  Licensed under the MIT License. See LICENSE file for details.
//

import Foundation

// MARK: - Connection Messages

/// Message sent from mobile client to tunnel server to establish connection
struct ConnectMessage: Codable {
    let type: String = "connect"
    let payload: ConnectPayload
    
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
        let restored: Bool?
        
        enum CodingKeys: String, CodingKey {
            case tunnelId = "tunnel_id"
            case restored
        }
    }
}

// MARK: - Authentication Messages

/// Message sent from mobile client to workstation (via tunnel) for authentication
struct AuthMessage: Codable {
    let type: String = "auth"
    let payload: AuthPayload
    
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
        let restoredSubscriptions: [String]?
        
        enum CodingKeys: String, CodingKey {
            case deviceId = "device_id"
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
    let type: String = "ping"
    let timestamp: Int64
    
    init(timestamp: Int64 = Int64(Date().timeIntervalSince1970 * 1000)) {
        self.timestamp = timestamp
    }
}

/// Pong message sent in response to ping
struct PongMessage: Codable {
    let type: String = "pong"
    let timestamp: Int64
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

