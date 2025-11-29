//
//  KeychainManager.swift
//  TiflisCode
//
//  Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
//  Licensed under the MIT License. See LICENSE file for details.
//

import Foundation
import Security

/// Protocol for secure keychain storage operations
protocol KeychainManaging {
    /// Saves the authentication key to the keychain
    /// - Parameter key: The authentication key to save
    /// - Throws: `KeychainError` if the operation fails
    func saveAuthKey(_ key: String) throws
    
    /// Retrieves the authentication key from the keychain
    /// - Returns: The authentication key if found, nil otherwise
    func getAuthKey() -> String?
    
    /// Deletes the authentication key from the keychain
    /// - Throws: `KeychainError` if the operation fails
    func deleteAuthKey() throws
}

/// Errors that can occur during keychain operations
enum KeychainError: Error {
    case itemNotFound
    case duplicateItem
    case unexpectedData
    case unhandledError(status: OSStatus)
    
    var localizedDescription: String {
        switch self {
        case .itemNotFound:
            return "Keychain item not found"
        case .duplicateItem:
            return "Keychain item already exists"
        case .unexpectedData:
            return "Unexpected keychain data format"
        case .unhandledError(let status):
            return "Keychain operation failed with status: \(status)"
        }
    }
}

/// Implementation of secure keychain storage for authentication keys
final class KeychainManager: KeychainManaging {
    private let service: String
    private let account: String
    
    init(service: String = "com.tiflis.TiflisCode", account: String = "workstation_auth_key") {
        self.service = service
        self.account = account
    }
    
    func saveAuthKey(_ key: String) throws {
        guard let data = key.data(using: .utf8) else {
            throw KeychainError.unexpectedData
        }
        
        // Delete existing item if it exists
        let deleteQuery: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account
        ]
        SecItemDelete(deleteQuery as CFDictionary)
        
        // Add new item
        let addQuery: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecValueData as String: data,
            kSecAttrAccessible as String: kSecAttrAccessibleWhenUnlockedThisDeviceOnly
        ]
        
        let status = SecItemAdd(addQuery as CFDictionary, nil)
        
        guard status == errSecSuccess else {
            if status == errSecDuplicateItem {
                throw KeychainError.duplicateItem
            } else {
                throw KeychainError.unhandledError(status: status)
            }
        }
    }
    
    func getAuthKey() -> String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne
        ]
        
        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        
        guard status == errSecSuccess,
              let data = result as? Data,
              let key = String(data: data, encoding: .utf8) else {
            return nil
        }
        
        return key
    }
    
    func deleteAuthKey() throws {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account
        ]
        
        let status = SecItemDelete(query as CFDictionary)
        
        guard status == errSecSuccess || status == errSecItemNotFound else {
            throw KeychainError.unhandledError(status: status)
        }
    }
}

