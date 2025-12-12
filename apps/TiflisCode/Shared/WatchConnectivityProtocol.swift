//
//  WatchConnectivityProtocol.swift
//  TiflisCode
//
//  Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
//  Licensed under the Functional Source License (FSL-1.1-NC). See LICENSE file for details.
//

import Foundation

/// Keys for WatchConnectivity message dictionaries
enum WatchConnectivityKey {
    static let messageType = "messageType"
    static let tunnelURL = "tunnelURL"
    static let tunnelId = "tunnelId"
    static let authKey = "authKey"
    static let ttsEnabled = "ttsEnabled"
    static let sttLanguage = "sttLanguage"
    static let isConnected = "isConnected"
    static let workstationOnline = "workstationOnline"
    static let error = "error"

    // Relay keys
    static let relayPayload = "relayPayload"
    static let relayConnectionState = "relayConnectionState"
}

/// Message types for Watch <-> iPhone communication
enum WatchConnectivityMessageType: String, Codable {
    /// Watch requests credentials from iPhone
    case credentialsRequest = "credentials.request"
    /// iPhone sends credentials to Watch
    case credentialsResponse = "credentials.response"
    /// iPhone pushes settings update to Watch
    case settingsUpdate = "settings.update"
    /// iPhone pushes connection status update to Watch
    case connectionStatusUpdate = "connection.status"

    // MARK: - WebSocket Relay Messages (Watch -> iPhone -> Server)

    /// Watch requests to connect via iPhone's WebSocket
    case relayConnect = "relay.connect"
    /// Watch requests to disconnect
    case relayDisconnect = "relay.disconnect"
    /// Watch sends a message to be relayed to WebSocket server
    case relayMessage = "relay.message"
    /// iPhone forwards WebSocket message to Watch
    case relayResponse = "relay.response"
    /// iPhone notifies Watch of connection state change
    case relayConnectionState = "relay.connectionState"
    /// Watch requests sync from iPhone
    case relaySync = "relay.sync"
}

/// Credentials for connecting to the tunnel server
struct WatchCredentials: Codable, Equatable {
    let tunnelURL: String
    let tunnelId: String
    let authKey: String

    /// Check if credentials are valid (non-empty)
    var isValid: Bool {
        !tunnelURL.isEmpty && !tunnelId.isEmpty && !authKey.isEmpty
    }

    /// Create from dictionary
    static func from(dictionary: [String: Any]) -> WatchCredentials? {
        guard let tunnelURL = dictionary[WatchConnectivityKey.tunnelURL] as? String,
              let tunnelId = dictionary[WatchConnectivityKey.tunnelId] as? String,
              let authKey = dictionary[WatchConnectivityKey.authKey] as? String else {
            return nil
        }
        return WatchCredentials(tunnelURL: tunnelURL, tunnelId: tunnelId, authKey: authKey)
    }

    /// Convert to dictionary for WatchConnectivity transfer
    func toDictionary() -> [String: Any] {
        [
            WatchConnectivityKey.tunnelURL: tunnelURL,
            WatchConnectivityKey.tunnelId: tunnelId,
            WatchConnectivityKey.authKey: authKey
        ]
    }
}

/// Settings that sync between iPhone and Watch
struct WatchSettings: Codable, Equatable {
    let ttsEnabled: Bool
    let sttLanguage: String

    /// Create from dictionary
    static func from(dictionary: [String: Any]) -> WatchSettings? {
        guard let ttsEnabled = dictionary[WatchConnectivityKey.ttsEnabled] as? Bool,
              let sttLanguage = dictionary[WatchConnectivityKey.sttLanguage] as? String else {
            return nil
        }
        return WatchSettings(ttsEnabled: ttsEnabled, sttLanguage: sttLanguage)
    }

    /// Convert to dictionary for WatchConnectivity transfer
    func toDictionary() -> [String: Any] {
        [
            WatchConnectivityKey.ttsEnabled: ttsEnabled,
            WatchConnectivityKey.sttLanguage: sttLanguage
        ]
    }
}

/// Connection status update from iPhone to Watch
struct WatchConnectionStatus: Codable, Equatable {
    let isConnected: Bool
    let workstationOnline: Bool

    /// Create from dictionary
    static func from(dictionary: [String: Any]) -> WatchConnectionStatus? {
        guard let isConnected = dictionary[WatchConnectivityKey.isConnected] as? Bool,
              let workstationOnline = dictionary[WatchConnectivityKey.workstationOnline] as? Bool else {
            return nil
        }
        return WatchConnectionStatus(isConnected: isConnected, workstationOnline: workstationOnline)
    }

    /// Convert to dictionary for WatchConnectivity transfer
    func toDictionary() -> [String: Any] {
        [
            WatchConnectivityKey.isConnected: isConnected,
            WatchConnectivityKey.workstationOnline: workstationOnline
        ]
    }
}

/// Helper to create WatchConnectivity message dictionaries
enum WatchConnectivityMessage {
    /// Create credentials request message
    static func credentialsRequest() -> [String: Any] {
        [WatchConnectivityKey.messageType: WatchConnectivityMessageType.credentialsRequest.rawValue]
    }

    /// Create credentials response message
    static func credentialsResponse(credentials: WatchCredentials) -> [String: Any] {
        var dict = credentials.toDictionary()
        dict[WatchConnectivityKey.messageType] = WatchConnectivityMessageType.credentialsResponse.rawValue
        return dict
    }

    /// Create credentials response with error
    static func credentialsError(error: String) -> [String: Any] {
        [
            WatchConnectivityKey.messageType: WatchConnectivityMessageType.credentialsResponse.rawValue,
            WatchConnectivityKey.error: error
        ]
    }

    /// Create settings update message
    static func settingsUpdate(settings: WatchSettings) -> [String: Any] {
        var dict = settings.toDictionary()
        dict[WatchConnectivityKey.messageType] = WatchConnectivityMessageType.settingsUpdate.rawValue
        return dict
    }

    /// Create connection status update message
    static func connectionStatusUpdate(status: WatchConnectionStatus) -> [String: Any] {
        var dict = status.toDictionary()
        dict[WatchConnectivityKey.messageType] = WatchConnectivityMessageType.connectionStatusUpdate.rawValue
        return dict
    }

    /// Extract message type from dictionary
    static func messageType(from dictionary: [String: Any]) -> WatchConnectivityMessageType? {
        guard let rawValue = dictionary[WatchConnectivityKey.messageType] as? String else {
            return nil
        }
        return WatchConnectivityMessageType(rawValue: rawValue)
    }

    // MARK: - Relay Messages

    /// Create relay connect request
    static func relayConnect() -> [String: Any] {
        [WatchConnectivityKey.messageType: WatchConnectivityMessageType.relayConnect.rawValue]
    }

    /// Create relay disconnect request
    static func relayDisconnect() -> [String: Any] {
        [WatchConnectivityKey.messageType: WatchConnectivityMessageType.relayDisconnect.rawValue]
    }

    /// Create relay message (Watch -> iPhone -> Server)
    static func relayMessage(payload: [String: Any]) -> [String: Any] {
        [
            WatchConnectivityKey.messageType: WatchConnectivityMessageType.relayMessage.rawValue,
            WatchConnectivityKey.relayPayload: payload
        ]
    }

    /// Create relay response (iPhone -> Watch, forwarding server message)
    static func relayResponse(payload: [String: Any]) -> [String: Any] {
        [
            WatchConnectivityKey.messageType: WatchConnectivityMessageType.relayResponse.rawValue,
            WatchConnectivityKey.relayPayload: payload
        ]
    }

    /// Create relay connection state notification
    static func relayConnectionState(isConnected: Bool, workstationOnline: Bool, error: String? = nil) -> [String: Any] {
        var dict: [String: Any] = [
            WatchConnectivityKey.messageType: WatchConnectivityMessageType.relayConnectionState.rawValue,
            WatchConnectivityKey.isConnected: isConnected,
            WatchConnectivityKey.workstationOnline: workstationOnline
        ]
        if let error = error {
            dict[WatchConnectivityKey.error] = error
        }
        return dict
    }

    /// Create relay sync request
    static func relaySync() -> [String: Any] {
        [WatchConnectivityKey.messageType: WatchConnectivityMessageType.relaySync.rawValue]
    }
}
