//
//  TiflisCodeTests.swift
//  TiflisCodeTests
//
//  Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
//  Licensed under the Functional Source License (FSL-1.1-NC). See LICENSE file for details.
//

import XCTest

final class TiflisCodeTests: XCTestCase {
    
    // MARK: - Basic Tests
    
    func testExample() throws {
        // Placeholder test
        XCTAssertTrue(true, "Basic test should pass")
    }
    
    func testPerformanceExample() throws {
        measure {
            // Performance test placeholder
            _ = (0..<1000).map { $0 * 2 }
        }
    }
}

// Note: To enable @testable import TiflisCode, ensure:
// 1. The TiflisCode target is built before running tests
// 2. The test target has TiflisCode as a dependency in project settings
// 3. ENABLE_T  ESTABILITY = YES in the TiflisCode target's Debug configuration
