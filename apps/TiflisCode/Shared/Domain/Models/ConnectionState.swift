//
//  ConnectionState.swift
//  TiflisCode
//
//  Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
//  Licensed under the Functional Source License (FSL-1.1-NC). See LICENSE file for details.
//

import Foundation
import SwiftUI

/// Represents the current connection state to the tunnel server
enum ConnectionState: Equatable {
    case disconnected
    case connecting
    case connected        // Tunnel connected, awaiting auth
    case authenticating   // Auth message sent, waiting for auth.success
    case authenticated    // Tunnel auth complete, heartbeat pending
    case verified         // End-to-end connectivity confirmed via heartbeat
    case degraded(String) // Heartbeat failing, connection may be stale
    case error(String)

    /// Returns true when authenticated or better (can send messages)
    var isConnected: Bool {
        switch self {
        case .authenticated, .verified, .degraded:
            return true
        default:
            return false
        }
    }

    /// Returns true only when end-to-end connectivity is verified via heartbeat
    var isVerified: Bool {
        if case .verified = self {
            return true
        }
        return false
    }

    /// Returns true if tunnel connection is established (but may not be authenticated yet)
    var isTunnelConnected: Bool {
        switch self {
        case .connected, .authenticating, .authenticated, .verified, .degraded:
            return true
        default:
            return false
        }
    }

    var indicatorColor: Color {
        switch self {
        case .verified:
            // Proper green (not lime/salad green)
            return Color(red: 0.2, green: 0.7, blue: 0.3)
        case .authenticated:
            // Yellow-green: tunnel auth ok, awaiting heartbeat verification
            return Color(red: 0.6, green: 0.8, blue: 0.2)
        case .degraded:
            return .orange
        case .connected, .authenticating, .connecting:
            return .yellow
        case .disconnected:
            return .gray
        case .error:
            return .red
        }
    }

    var indicatorSymbol: String {
        switch self {
        case .verified:
            return "●"
        case .authenticated, .degraded:
            return "●"
        case .connected, .authenticating, .connecting:
            return "◐"
        case .disconnected:
            return "○"
        case .error:
            return "●"
        }
    }

    var statusText: String {
        switch self {
        case .verified:
            return "Connected"
        case .authenticated:
            return "Verifying..."
        case .degraded(let reason):
            return "Degraded: \(reason)"
        case .authenticating:
            return "Authenticating..."
        case .connected:
            return "Connected to tunnel..."
        case .connecting:
            return "Connecting..."
        case .disconnected:
            return "Disconnected"
        case .error(let message):
            return "Error: \(message)"
        }
    }
}

