//
//  DeviceIDManager.swift
//  TiflisCode
//
//  Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
//  Licensed under the Functional Source License (FSL-1.1-NC). See LICENSE file for details.
//

import Foundation

#if os(watchOS)
import WatchKit
#else
import UIKit
#endif

/// Protocol for managing device identifier
@MainActor
protocol DeviceIDManaging {
    /// The unique device identifier for this device
    var deviceID: String { get }
}

/// Implementation of device identifier management
/// Uses identifierForVendor as primary source, falls back to stored UUID in UserDefaults
@MainActor
final class DeviceIDManager: DeviceIDManaging {
    private let userDefaults: UserDefaults
    private let deviceIDKey = "device_id"
    
    init(userDefaults: UserDefaults = .standard) {
        self.userDefaults = userDefaults
    }
    
    var deviceID: String {
        // First, try to use identifierForVendor (persists across app installs on same device)
        #if os(watchOS)
        let vendorID = WKInterfaceDevice.current().identifierForVendor?.uuidString
        #else
        let vendorID = UIDevice.current.identifierForVendor?.uuidString
        #endif

        if let vendorID {
            // Store it for consistency
            if userDefaults.string(forKey: deviceIDKey) != vendorID {
                userDefaults.set(vendorID, forKey: deviceIDKey)
            }
            return vendorID
        }
        
        // Fallback: generate and store a UUID if identifierForVendor is unavailable
        if let storedID = userDefaults.string(forKey: deviceIDKey) {
            return storedID
        }
        
        // Generate new UUID and store it
        let newID = UUID().uuidString
        userDefaults.set(newID, forKey: deviceIDKey)
        return newID
    }
}

