//
//  ConnectionState.swift
//  TiflisCode
//
//  Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
//  Licensed under the MIT License. See LICENSE file for details.
//

import Foundation
import SwiftUI

/// Represents the current connection state to the tunnel server
enum ConnectionState: Equatable {
    case disconnected
    case connecting
    case connected
    case error(String)
    
    var isConnected: Bool {
        if case .connected = self {
            return true
        }
        return false
    }
    
    var indicatorColor: Color {
        switch self {
        case .connected:
            return .green
        case .connecting:
            return .yellow
        case .disconnected:
            return .gray
        case .error:
            return .red
        }
    }
    
    var indicatorSymbol: String {
        switch self {
        case .connected:
            return "●"
        case .connecting:
            return "◐"
        case .disconnected:
            return "○"
        case .error:
            return "●"
        }
    }
    
    var statusText: String {
        switch self {
        case .connected:
            return "Connected"
        case .connecting:
            return "Connecting..."
        case .disconnected:
            return "Disconnected"
        case .error(let message):
            return "Error: \(message)"
        }
    }
}

