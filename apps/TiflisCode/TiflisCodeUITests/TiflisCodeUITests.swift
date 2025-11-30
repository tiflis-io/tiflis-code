//
//  TiflisCodeUITests.swift
//  TiflisCodeUITests
//
//  Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
//  Licensed under the MIT License. See LICENSE file for details.
//

import XCTest

final class TiflisCodeUITests: XCTestCase {
    
    var app: XCUIApplication!
    
    override func setUpWithError() throws {
        continueAfterFailure = false
        app = XCUIApplication()
        app.launch()
    }
    
    override func tearDownWithError() throws {
        app = nil
    }
    
    // MARK: - Basic UI Tests
    
    func testAppLaunches() throws {
        // Verify the app launches successfully
        XCTAssertTrue(app.wait(for: .runningForeground, timeout: 5))
    }
    
    // MARK: - Performance Tests
    
    func testLaunchPerformance() throws {
        measure(metrics: [XCTApplicationLaunchMetric()]) {
            XCUIApplication().launch()
        }
    }
}
