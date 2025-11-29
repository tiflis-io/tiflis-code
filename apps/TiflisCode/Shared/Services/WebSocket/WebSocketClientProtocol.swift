//
//  WebSocketClientProtocol.swift
//  TiflisCode
//
//  Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
//  Licensed under the MIT License. See LICENSE file for details.
//

import Foundation

/// Protocol for WebSocket client communication
protocol WebSocketClientProtocol: AnyObject {
    /// Delegate to receive WebSocket events
    var delegate: WebSocketClientDelegate? { get set }
    
    /// Connects to the tunnel server and authenticates with workstation
    /// - Parameters:
    ///   - url: Tunnel server WebSocket URL
    ///   - tunnelId: Workstation tunnel identifier
    ///   - authKey: Workstation authentication key
    ///   - deviceId: Unique device identifier
    /// - Throws: Connection errors if the operation fails
    func connect(url: String, tunnelId: String, authKey: String, deviceId: String) async throws
    
    /// Disconnects from the tunnel server
    func disconnect()
    
    /// Sends a message to the server
    /// - Parameter message: Message dictionary to send
    /// - Throws: Error if message cannot be sent
    func sendMessage(_ message: [String: Any]) throws
    
    /// Indicates whether the client is currently connected
    var isConnected: Bool { get }
}

/// Delegate protocol for WebSocket client events
/// All delegate methods are guaranteed to be called on the main actor
@MainActor
protocol WebSocketClientDelegate: AnyObject {
    /// Called when connection to tunnel is established
    /// - Parameters:
    ///   - client: The WebSocket client
    ///   - tunnelId: The tunnel identifier
    func webSocketClient(_ client: WebSocketClientProtocol, didConnect tunnelId: String)
    
    /// Called when authentication with workstation succeeds
    /// - Parameters:
    ///   - client: The WebSocket client
    ///   - deviceId: The device identifier
    ///   - restoredSubscriptions: Optional array of restored session subscription IDs
    func webSocketClient(_ client: WebSocketClientProtocol, didAuthenticate deviceId: String, restoredSubscriptions: [String]?)
    
    /// Called when a message is received from the server
    /// - Parameters:
    ///   - client: The WebSocket client
    ///   - message: The received message dictionary
    func webSocketClient(_ client: WebSocketClientProtocol, didReceiveMessage message: [String: Any])
    
    /// Called when the connection is disconnected
    /// - Parameters:
    ///   - client: The WebSocket client
    ///   - error: Optional error that caused the disconnection
    func webSocketClient(_ client: WebSocketClientProtocol, didDisconnect error: Error?)
    
    /// Called when the workstation goes offline
    /// - Parameters:
    ///   - client: The WebSocket client
    ///   - tunnelId: The tunnel identifier
    func webSocketClient(_ client: WebSocketClientProtocol, workstationDidGoOffline tunnelId: String)
    
    /// Called when the workstation comes back online
    /// - Parameters:
    ///   - client: The WebSocket client
    ///   - tunnelId: The tunnel identifier
    func webSocketClient(_ client: WebSocketClientProtocol, workstationDidComeOnline tunnelId: String)
}

