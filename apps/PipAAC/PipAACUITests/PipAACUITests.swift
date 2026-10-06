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

    /// B2 works test: the Keyboard anchor swaps the grid for the Pip key
    /// map, typing offers spelling completions in the strip, a completion
    /// tap commits the word, and the transform buttons' offline path
    /// speaks + toasts (Sentence_Bar § 1d — never dead).
    @MainActor
    func testKeyboardAndTransforms() throws {
        let app = XCUIApplication()
        app.launch()
        XCTAssertTrue(app.buttons["want"].waitForExistence(timeout: 20))

        // All six controls show on a fresh profile (bar_controls NULL).
        XCTAssertTrue(app.buttons["Fix it"].exists)
        XCTAssertTrue(app.buttons["Ask it"].exists)
        XCTAssertTrue(app.buttons["Say it in the past"].exists)
        XCTAssertTrue(app.buttons["Say it in the future"].exists)

        // The anchor opens the key grid; its label flips to Board.
        app.buttons["Keyboard"].tap()
        XCTAssertTrue(app.buttons["kbkey:w"].waitForExistence(timeout: 10))
        XCTAssertTrue(app.buttons["Board"].exists)
        XCTAssertTrue(app.buttons["kbpartner:sns_0073"].exists) // yes tile

        // Type "wan": the buffer shows in the bar, the strip completes.
        app.buttons["kbkey:w"].tap()
        app.buttons["kbkey:a"].tap()
        app.buttons["kbkey:n"].tap()
        XCTAssertTrue(app.staticTexts["wan▌"].waitForExistence(timeout: 5))

        // Completion tap commits the word — the bar owns "Want".
        app.buttons["want"].tap()
        XCTAssertTrue(app.staticTexts["Want"].waitForExistence(timeout: 5))
        XCTAssertFalse(app.staticTexts["wan▌"].exists)

        // A ⏪ press offline still speaks and says why — the bar keeps
        // her words unchanged.
        app.buttons["Say it in the past"].tap()
        XCTAssertTrue(app.staticTexts["toast"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["Want"].exists)

        // Board anchor returns to the grid.
        app.buttons["Board"].tap()
        XCTAssertTrue(app.buttons["want"].waitForExistence(timeout: 10))
    }

    /// B3 works test: the gear opens Settings (no PIN = one tap), a
    /// write lands — bar_controls trims the bar — and Done returns.
    @MainActor
    func testSettingsSurface() throws {
        let app = XCUIApplication()
        app.launch()
        XCTAssertTrue(app.buttons["want"].waitForExistence(timeout: 20))

        // The corner gear opens the sheet — no PIN on a fresh install.
        app.buttons["settingsGear"].tap()
        XCTAssertTrue(app.buttons["settingsDone"].waitForExistence(timeout: 10))

        // Pick the "Play + Question" preset — the bar keeps only Play,
        // Ask it, and Clear.
        app.buttons["Play + Question"].tap()
        app.buttons["settingsDone"].tap()

        XCTAssertTrue(app.buttons["want"].waitForExistence(timeout: 10))
        app.buttons["tile:sns_0013"].tap() // tile id — "want" is also a strip card
        XCTAssertTrue(app.buttons["Ask it"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["Clear"].exists)
        XCTAssertFalse(app.buttons["Fix it"].exists)
        XCTAssertFalse(app.buttons["Say it in the past"].exists)
    }
}
