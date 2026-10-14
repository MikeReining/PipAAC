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
        app.launchArguments = ["-pipUITestReset"]
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
        app.launchArguments = ["-pipUITestReset"]
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
        app.launchArguments = ["-pipUITestReset"]
        app.launch()
        XCTAssertTrue(app.buttons["want"].waitForExistence(timeout: 20))

        // The corner gear opens the sheet — no PIN on a fresh install.
        app.buttons["settingsGear"].tap()
        XCTAssertTrue(app.buttons["settingsDone"].waitForExistence(timeout: 10))
        // E4: the sentence bar lives on the Talking page.
        app.buttons["settingsSection:talking"].tap()

        // Pick the "Play + Question" preset — the bar keeps only Play,
        // Ask it, and Clear. Settings is a scrolling Form, so the preset
        // may sit below the fold (rows above it grow as slices land).
        let preset = app.buttons["Play + Question"]
        for _ in 0..<8 where !preset.isHittable { app.swipeUp(velocity: .slow) }
        preset.tap()
        app.buttons["settingsDone"].tap()

        XCTAssertTrue(app.buttons["want"].waitForExistence(timeout: 10))
        app.buttons["tile:sns_0013"].tap() // tile id — "want" is also a strip card
        XCTAssertTrue(app.buttons["Ask it"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["Clear"].exists)
        XCTAssertFalse(app.buttons["Fix it"].exists)
        XCTAssertFalse(app.buttons["Say it in the past"].exists)
    }

    // MARK: - E1: Edit mode + word card

    /// Enter Edit through Settings, return the app on the board.
    @MainActor
    private func enterEdit(_ app: XCUIApplication) {
        app.buttons["settingsGear"].tap()
        let edit = app.buttons["editBoard"]
        XCTAssertTrue(edit.waitForExistence(timeout: 10))
        edit.tap()
        XCTAssertTrue(app.buttons["editDone"].waitForExistence(timeout: 10))
    }

    @MainActor
    private func attachShot(_ app: XCUIApplication, _ name: String) {
        let a = XCTAttachment(screenshot: app.screenshot())
        a.name = name
        a.lifetime = .keepAlways
        add(a)
    }

    /// E1 works test: Edit mode -> word card -> rename -> Done -> the
    /// board wears the new name -> terminate, relaunch -> still there.
    @MainActor
    func testEditRenameSurvivesRelaunch() throws {
        let app = XCUIApplication()
        app.launchArguments = ["-pipUITestReset", "-pipUITestSeedPerson", "Nana"]
        app.launch()
        XCTAssertTrue(app.buttons["want"].waitForExistence(timeout: 20))
        XCTAssertTrue(app.buttons["Nana"].exists, "the seated person shows on the board")

        enterEdit(app)
        // Edit mode: tiles take adult gestures, not child taps.
        app.buttons["Nana"].tap()
        let name = app.textFields["wc-name"]
        XCTAssertTrue(name.waitForExistence(timeout: 10), "the card opens with a name field")
        attachShot(app, "e1-word-card")
        name.tap()
        name.typeText(String(repeating: XCUIKeyboardKey.delete.rawValue, count: 4))
        name.typeText("Nana Joy\n")
        app.buttons["wc-done"].tap()
        XCTAssertTrue(app.buttons["Nana Joy"].waitForExistence(timeout: 10),
                      "the edit board repaints from the core")
        attachShot(app, "e1-edit-mode")
        app.buttons["editDone"].tap()

        XCTAssertTrue(app.buttons["Nana Joy"].waitForExistence(timeout: 10))
        XCTAssertFalse(app.buttons["Nana"].exists)
        // The child path still speaks and fills the bar.
        app.buttons["Nana Joy"].tap()
        XCTAssertTrue(app.buttons["Backspace"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["Backspace"].isEnabled)

        // The edit is in the database: a fresh process reads it back.
        app.terminate()
        let again = XCUIApplication()
        again.launch()
        XCTAssertTrue(again.buttons["Nana Joy"].waitForExistence(timeout: 20),
                      "the new name survives a relaunch")
        XCTAssertFalse(again.buttons["Nana"].exists)
    }

    /// Remove a personal word (undo toast), then remove it for good.
    @MainActor
    func testEditRemoveWithUndo() throws {
        let app = XCUIApplication()
        app.launchArguments = ["-pipUITestReset", "-pipUITestSeedPerson", "Nana"]
        app.launch()
        XCTAssertTrue(app.buttons["Nana"].waitForExistence(timeout: 20))
        enterEdit(app)

        app.buttons["Nana"].tap()
        app.buttons["wc-remove"].tap()
        XCTAssertTrue(app.buttons["toast-undo"].waitForExistence(timeout: 5))
        XCTAssertFalse(app.buttons["Nana"].exists, "removed word leaves the board")
        app.buttons["toast-undo"].tap()
        XCTAssertTrue(app.buttons["Nana"].waitForExistence(timeout: 5), "Undo brings it back")

        app.buttons["Nana"].tap()
        app.buttons["wc-remove"].tap()
        XCTAssertTrue(app.buttons["editDone"].waitForExistence(timeout: 5))
        app.buttons["editDone"].tap()
        app.terminate()
        let again = XCUIApplication()
        again.launch()
        XCTAssertTrue(again.buttons["want"].waitForExistence(timeout: 20))
        XCTAssertFalse(again.buttons["Nana"].exists, "the removal survives a relaunch")
    }

    /// Hide a word -> the child board loses it -> show it again; then
    /// drag a word onto its neighbor -> the cells swap, and stay swapped
    /// after a relaunch.
    @MainActor
    func testEditHideShowAndMove() throws {
        let app = XCUIApplication()
        app.launchArguments = ["-pipUITestReset"]
        app.launch()
        let want = app.buttons["tile:sns_0013"]
        XCTAssertTrue(want.waitForExistence(timeout: 20))
        let go = app.buttons["tile:sns_0014"]
        let wantHome = want.frame, neighborHome = go.frame
        XCTAssertNotEqual(wantHome, neighborHome)

        // Hide.
        enterEdit(app)
        app.buttons["tile:sns_0013"].tap()
        let hide = app.buttons["wc-hide"]
        XCTAssertTrue(hide.waitForExistence(timeout: 10))
        XCTAssertEqual(hide.label, "Hide this word")
        hide.tap()
        XCTAssertTrue(app.staticTexts["editToastText"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["tile:sns_0013"].exists, "the adult still sees the ghost")
        app.buttons["editDone"].tap()
        XCTAssertTrue(app.buttons["tile:sns_0014"].waitForExistence(timeout: 10))
        XCTAssertFalse(app.buttons["tile:sns_0013"].exists, "the child board hides it")

        // Show again, from the ghost.
        enterEdit(app)
        app.buttons["tile:sns_0013"].tap()
        let show = app.buttons["wc-hide"]
        XCTAssertTrue(show.waitForExistence(timeout: 10))
        XCTAssertEqual(show.label, "Show this word")
        show.tap()
        app.buttons["editDone"].tap()
        XCTAssertTrue(app.buttons["tile:sns_0013"].waitForExistence(timeout: 10))

        // Move: drag want onto its neighbor.
        enterEdit(app)
        let src = app.buttons["tile:sns_0013"]
        let dst = app.buttons["tile:sns_0014"]
        src.press(forDuration: 0.2, thenDragTo: dst)
        XCTAssertTrue(app.buttons["toast-undo"].waitForExistence(timeout: 5), "a Moved toast with Undo")
        attachShot(app, "e1-moved-toast")
        app.buttons["editDone"].tap()
        let want2 = app.buttons["tile:sns_0013"], go2 = app.buttons["tile:sns_0014"]
        XCTAssertTrue(want2.waitForExistence(timeout: 10))
        XCTAssertEqual(want2.frame, neighborHome, "want took its neighbor's cell")
        XCTAssertEqual(go2.frame, wantHome, "the neighbor took want's cell")

        app.terminate()
        let again = XCUIApplication()
        again.launch()
        let w3 = again.buttons["tile:sns_0013"]
        XCTAssertTrue(w3.waitForExistence(timeout: 20))
        XCTAssertEqual(w3.frame, neighborHome, "positions stay swapped after a relaunch")
        XCTAssertEqual(again.buttons["tile:sns_0014"].frame, wantHome)
    }

    // MARK: - E2: add a word + the Library

    /// Edit -> Groups -> open a group by its door.
    @MainActor
    private func openGroupInEdit(_ app: XCUIApplication, _ id: String) {
        app.buttons["editGroups"].tap()
        let door = app.buttons["group:\(id)"]
        XCTAssertTrue(door.waitForExistence(timeout: 10))
        door.tap()
    }

    /// E2 works test: Edit -> Add a word -> choose the group (Snack) ->
    /// type "pizza" -> pick the catalog match -> Done -> the word is on
    /// that group's page -> relaunch -> still there, same cell.
    @MainActor
    func testAddCatalogWordToChosenGroup() throws {
        let app = XCUIApplication()
        app.launchArguments = ["-pipUITestReset"]
        app.launch()
        XCTAssertTrue(app.buttons["tile:sns_0013"].waitForExistence(timeout: 20))
        enterEdit(app)

        app.buttons["editAdd"].tap()
        let field = app.textFields["add-word"]
        XCTAssertTrue(field.waitForExistence(timeout: 10))
        XCTAssertEqual(app.buttons["add-dest"].label, "Choose a group, now My Words")
        app.buttons["add-dest"].tap()
        let snack = app.buttons["add-group:all:grp_snack"]
        XCTAssertTrue(snack.waitForExistence(timeout: 10))
        attachShot(app, "e2-group-picker")
        snack.tap()
        XCTAssertEqual(app.buttons["add-dest"].label, "Choose a group, now Snack")
        field.tap()
        field.typeText("pizza")
        let match = app.buttons["add-match:sense:sns_0100"]
        XCTAssertTrue(match.waitForExistence(timeout: 10), "the catalog match is offered")
        XCTAssertTrue(app.buttons["add-new"].exists, "Make is always last")
        attachShot(app, "e2-add-matches")
        match.tap()
        XCTAssertTrue(app.staticTexts["editToastText"].waitForExistence(timeout: 5))
        XCTAssertEqual(app.staticTexts["editToastText"].label, "Added pizza")
        XCTAssertTrue(app.buttons["toast-action"].exists, "the web's Add to other groups door")
        app.buttons["editDone"].tap()

        XCTAssertTrue(app.buttons["tile:sns_0013"].waitForExistence(timeout: 10))
        app.buttons["Groups"].firstMatch.tap()
        let door = app.buttons["group:grp_snack"]
        XCTAssertTrue(door.waitForExistence(timeout: 10))
        door.tap()
        XCTAssertTrue(app.buttons["tile:sns_0100"].waitForExistence(timeout: 10),
                      "pizza is on the Snack page")
        let frame = app.buttons["tile:sns_0100"].frame

        app.terminate()
        let again = XCUIApplication()
        again.launch()
        XCTAssertTrue(again.buttons["tile:sns_0013"].waitForExistence(timeout: 20))
        again.buttons["Groups"].firstMatch.tap()
        again.buttons["group:grp_snack"].tap()
        XCTAssertTrue(again.buttons["tile:sns_0100"].waitForExistence(timeout: 10),
                      "pizza survives a relaunch")
        XCTAssertEqual(again.buttons["tile:sns_0100"].frame, frame, "in the same cell")
    }

    /// A tapped empty cell is the picker: the word lands exactly there.
    @MainActor
    func testAddIntoTappedEmptyCell() throws {
        let app = XCUIApplication()
        app.launchArguments = ["-pipUITestReset"]
        app.launch()
        XCTAssertTrue(app.buttons["tile:sns_0013"].waitForExistence(timeout: 20))
        enterEdit(app)
        openGroupInEdit(app, "grp_snack")
        let doors = app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH 'emptycell:'"))
        XCTAssertTrue(doors.firstMatch.waitForExistence(timeout: 10))
        let cell = doors.element(boundBy: doors.count - 1)
        let cellFrame = cell.frame
        cell.tap()
        let field = app.textFields["add-word"]
        XCTAssertTrue(field.waitForExistence(timeout: 10))
        XCTAssertEqual(app.buttons["add-dest"].label, "Choose a group, now Snack")
        field.tap()
        field.typeText("pizza")
        app.buttons["add-match:sense:sns_0100"].tap()
        let tile = app.buttons["tile:sns_0100"]
        XCTAssertTrue(tile.waitForExistence(timeout: 10))
        XCTAssertEqual(tile.frame, cellFrame, "the word took the tapped cell")
    }

    /// Make a personal word -> its card says where it went -> Also in
    /// adds it to another group -> the Library search finds it -> it is
    /// still there after a relaunch.
    @MainActor
    func testMakePersonalWordThenLibrary() throws {
        let app = XCUIApplication()
        app.launchArguments = ["-pipUITestReset"]
        app.launch()
        XCTAssertTrue(app.buttons["tile:sns_0013"].waitForExistence(timeout: 20))
        enterEdit(app)

        app.buttons["editAdd"].tap()
        let field = app.textFields["add-word"]
        XCTAssertTrue(field.waitForExistence(timeout: 10))
        field.tap()
        field.typeText("Grandpa Lou")
        let make = app.buttons["add-new"]
        XCTAssertTrue(make.waitForExistence(timeout: 10))
        XCTAssertTrue(make.label.contains("Grandpa Lou"))
        make.tap()
        XCTAssertTrue(app.staticTexts["wc-added"].waitForExistence(timeout: 10))
        XCTAssertEqual(app.staticTexts["wc-added"].label, "✓ Added to My Words")
        attachShot(app, "e2-just-added-card")

        app.buttons["wc-addgroup"].tap()
        let chip = app.buttons["boards-chip:grp_snack"]
        XCTAssertTrue(chip.waitForExistence(timeout: 10))
        XCTAssertFalse(app.buttons["boards-chip:grp_my_words"].exists, "it is already in My Words")
        XCTAssertFalse(app.buttons["boards-save"].isEnabled)
        chip.tap()
        app.buttons["boards-save"].tap()
        XCTAssertTrue(app.staticTexts["editToastText"].waitForExistence(timeout: 5))
        XCTAssertEqual(app.staticTexts["editToastText"].label, "Added Grandpa Lou to Snack")

        app.buttons["editLibrary"].tap()
        let q = app.textFields["lib-q"]
        XCTAssertTrue(q.waitForExistence(timeout: 10))
        q.tap()
        q.typeText("grandpa")
        let row = app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH 'lib-row:entity:'")).firstMatch
        XCTAssertTrue(row.waitForExistence(timeout: 10), "search finds the new word")
        XCTAssertTrue(row.label.hasPrefix("Grandpa Lou"))
        XCTAssertTrue(row.label.contains("My Words"))
        XCTAssertTrue(row.label.contains("Snack"))
        attachShot(app, "e2-library-search")
        row.tap()
        XCTAssertTrue(app.textFields["wc-name"].waitForExistence(timeout: 10), "a row opens the card")
        app.buttons["wc-done"].tap()
        app.buttons["lib-close"].tap()
        app.buttons["editDone"].tap()

        app.terminate()
        let again = XCUIApplication()
        again.launch()
        XCTAssertTrue(again.buttons["tile:sns_0013"].waitForExistence(timeout: 20))
        again.buttons["Groups"].firstMatch.tap()
        again.buttons["group:grp_my_words"].tap()
        let ent = again.buttons.matching(NSPredicate(format: "label == 'Grandpa Lou'")).firstMatch
        XCTAssertTrue(ent.waitForExistence(timeout: 10),
                      "the personal word is on its page after a relaunch")
    }
}
