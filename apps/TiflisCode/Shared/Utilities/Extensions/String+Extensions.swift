//
//  String+Extensions.swift
//  TiflisCode
//
//  Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
//  Licensed under the MIT License. See LICENSE file for details.
//

import Foundation

extension String {
    /// Efficiently converts String to UTF-8 bytes array
    /// Directly converts String.UTF8View to Array, avoiding intermediate Data allocation
    /// - Returns: Array of UInt8 representing UTF-8 encoded string
    var utf8Bytes: [UInt8] {
        Array(self.utf8)
    }
    
    /// Efficiently converts String to UTF-8 bytes as ArraySlice
    /// Optimized for SwiftTerm feed operations that accept ArraySlice<UInt8>
    /// - Returns: ArraySlice of UInt8 representing UTF-8 encoded string
    var utf8BytesSlice: ArraySlice<UInt8> {
        utf8Bytes[...]
    }
}

