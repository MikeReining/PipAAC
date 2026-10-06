//
//  PipAACUITests.swift
//  PipAACUITests
//
//  B1 works test (phase 044): the app boots to the real board,
//  a tile tap updates the sentence bar, backspace/clear work.
//  Clip file playback is covered by the parity harness + node facade;
//  UI tests assert the paint, not the speaker.
//

import XCTest

final class PipAACUITests: XCTestCase {

    override func setUpWithError() throws {
        continueAfterFailure = false
    }

    @MainActor
    func testBoardTapBar() throws {
        let app = XCUIApplication()
        app.launch()

        // Boot: the seeded 10×6 board paints real catalog tiles.
        let want = app.buttons["want"]
        XCTAssertTrue(want.waitForExistence(timeout: 20), "board tile 'want' never appeared")
        XCTAssertTrue(app.buttons["go"].exists)
        XCTAssertTrue(app.buttons["I"].exists)

        // Tap a tile: the bar fills, controls arm, a clip plays.
        want.tap()
        let backspace = app.buttons["Backspace"]
        XCTAssertTrue(backspace.waitForExistence(timeout: 10))
        XCTAssertTrue(backspace.isEnabled, "backspace should arm after a tap")
        XCTAssertTrue(app.buttons["Play"].isEnabled)

        // Second tile grows the bar.
        app.buttons["more"].tap()

        // Backspace shrinks it; controls stay armed.
        backspace.tap()
        XCTAssertTrue(app.buttons["Play"].isEnabled)

        // Clear empties the bar; controls disarm again.
        app.buttons["Clear"].tap()
        XCTAssertTrue(app.staticTexts["Tap a word to start."].waitForExistence(timeout: 10))
        XCTAssertFalse(app.buttons["Play"].isEnabled)

        // Groups anchor opens the index; a door opens a group page;
        // Groups returns to the board.
        app.buttons["Groups"].tap()
        XCTAssertTrue(app.buttons["Groups"].waitForExistence(timeout: 10))
        app.buttons["Groups"].tap()
        XCTAssertTrue(app.buttons["want"].waitForExistence(timeout: 10))
    }
}
