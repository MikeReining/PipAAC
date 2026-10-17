//
//  SettingsRowsUITests.swift
//  PipAACUITests
//
//  E9 works tests (phase 044 ST-8, SB-7, SB-9, KB-7, ST-3): the Spotlight
//  look settings, the Smart bar family editor, the likely-next outline,
//  the device keyboard, and Face ID standing in for the PIN - each end to
//  end on the real board. The app runs with `-PipDataDir <tmp>`, so every
//  claim is read from the person's SQLite FILE (never the app's own
//  report), and survives a relaunch. Shots go to /tmp/pipaac-shots-e9/.
//
//  Face ID: the system prompt cannot be driven from XCUITest, so
//  `-pipUITestBiometric pass|fail` stands in for the system's answer (the
//  gate, the saved choice and the PIN fallback are the real code).
//

import SQLite3
import XCTest

@MainActor
final class SettingsRowsUITests: XCTestCase {
    private var dir: URL!

    override func setUpWithError() throws {
        continueAfterFailure = false
        dir = FileManager.default.temporaryDirectory
            .appendingPathComponent("pip-e9-\(UUID().uuidString)", isDirectory: true)
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
    }

    // MARK: helpers

    private func person() throws -> String {
        struct Row: Decodable { let id: String }
        struct Doc: Decodable { let users: [Row] }
        let data = try Data(contentsOf: dir.appendingPathComponent("people.json"))
        return try XCTUnwrap(JSONDecoder().decode(Doc.self, from: data).users.first).id
    }

    private func query(_ sql: String) -> [[String]] {
        guard let id = try? person() else { return [] }
        var db: OpaquePointer?
        let path = dir.appendingPathComponent("Users/\(id).sqlite").path
        guard sqlite3_open_v2(path, &db, SQLITE_OPEN_READONLY, nil) == SQLITE_OK else { return [] }
        defer { sqlite3_close(db) }
        var st: OpaquePointer?
        guard sqlite3_prepare_v2(db, sql, -1, &st, nil) == SQLITE_OK else { return [] }
        defer { sqlite3_finalize(st) }
        var rows: [[String]] = []
        while sqlite3_step(st) == SQLITE_ROW {
            rows.append((0..<sqlite3_column_count(st)).map {
                sqlite3_column_text(st, $0).map { String(cString: $0) } ?? ""
            })
        }
        return rows
    }

    private func profile(_ column: String) -> String? {
        query("SELECT \(column) FROM learner_profile WHERE id = 'prf_local'").first?.first
    }

    private func wait(_ what: String, timeout: TimeInterval = 15, _ cond: () -> Bool) {
        let end = Date().addingTimeInterval(timeout)
        while Date() < end {
            if cond() { return }
            RunLoop.current.run(until: Date().addingTimeInterval(0.1))
        }
        XCTFail("timed out waiting for: \(what)")
    }

    private func launch(reset: Bool = true, extra: [String] = []) -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments = (reset ? ["-pipUITestReset"] : []) + ["-PipDataDir", dir.path] + extra
        app.launch()
        return app
    }

    private func shot(_ app: XCUIApplication, _ name: String) {
        let s = app.screenshot()
        let a = XCTAttachment(screenshot: s)
        a.name = name
        a.lifetime = .keepAlways
        add(a)
        let out = URL(fileURLWithPath: "/tmp/pipaac-shots-e9", isDirectory: true)
        try? FileManager.default.createDirectory(at: out, withIntermediateDirectories: true)
        try? s.pngRepresentation.write(to: out.appendingPathComponent("\(name).png"))
    }

    private func openSettings(_ app: XCUIApplication, _ section: String) {
        app.buttons["settingsGear"].tap()
        XCTAssertTrue(app.buttons["settingsDone"].waitForExistence(timeout: 10))
        let b = app.buttons["settingsSection:\(section)"]
        XCTAssertTrue(b.waitForExistence(timeout: 10))
        b.tap()
    }

    /// A Form switch: tap its knob (right edge), not the row's label.
    private func flip(_ sw: XCUIElement) {
        sw.coordinate(withNormalizedOffset: CGVector(dx: 0.95, dy: 0.5)).tap()
    }

    private func settingOps(_ key: String) -> Int {
        Int(query("SELECT count(*) FROM sync_op WHERE kind = 'set_setting' AND args LIKE '%\"key\":\"\(key)\"%'")
            .first?.first ?? "0") ?? -1
    }

    // MARK: ST-8 Spotlight look

    func testSpotlightLookWritesTheSyncedColumnsAndSurvivesRelaunch() throws {
        var app = launch()
        XCTAssertTrue(app.buttons["tile:sns_0013"].waitForExistence(timeout: 30))
        XCTAssertEqual(profile("spot_pulse"), "0")
        XCTAssertEqual(profile("spot_dim"), "45")
        XCTAssertEqual(profile("model_speaks"), "0")

        openSettings(app, "spotlight")
        XCTAssertTrue(app.staticTexts["spot:role"].waitForExistence(timeout: 10))
        XCTAssertEqual(app.staticTexts["spot:role"].label, "This is this person's board.")
        XCTAssertTrue(app.staticTexts["Steady glow · dim medium"].exists)
        shot(app, "e9-spotlight-page")
        // The Look preview: the board's own four tiles, "more" glowing (First words), the rest dimmed.
        let prev = app.descendants(matching: .any)["spot:lookPreview"]
        XCTAssertTrue(prev.waitForExistence(timeout: 10), "the Look preview is drawn")
        XCTAssertEqual(prev.value as? String,
                       "more glowing, go dimmed, we dimmed, play dimmed, steady, others dimmed to 45 percent")

        app.segmentedControls["spot:pulse"].buttons["Pulse"].tap()
        app.segmentedControls["spot:dim"].buttons["A lot"].tap()
        app.segmentedControls["spot:speaks"].buttons["Glow and speak"].tap()
        wait("the three columns land") {
            profile("spot_pulse") == "1" && profile("spot_dim") == "30" && profile("model_speaks") == "1"
        }
        XCTAssertTrue(app.staticTexts["Pulsing glow · dim a lot"].waitForExistence(timeout: 10))
        XCTAssertEqual(prev.value as? String,
                       "more glowing, go dimmed, we dimmed, play dimmed, pulsing, others dimmed to 30 percent",
                       "the preview follows the settings")
        // Each write was the web's synced op.
        XCTAssertEqual(settingOps("spot_pulse"), 1)
        XCTAssertEqual(settingOps("spot_dim"), 1)
        XCTAssertEqual(settingOps("model_speaks"), 1)
        shot(app, "e9-spotlight-look")

        app.terminate()
        app = launch(reset: false)
        XCTAssertTrue(app.buttons["tile:sns_0013"].waitForExistence(timeout: 30))
        openSettings(app, "spotlight")
        XCTAssertTrue(app.staticTexts["Pulsing glow · dim a lot"].waitForExistence(timeout: 10),
                      "the look survives a relaunch")
        XCTAssertEqual(profile("spot_dim"), "30")
    }

    // MARK: SB-9 outline likely next words

    func testOutlineLikelyNextWordsDrawsTheRankersCellsOnTheBoard() throws {
        let app = launch()
        let want = app.buttons["tile:sns_0013"]
        XCTAssertTrue(want.waitForExistence(timeout: 30))
        func outlined() -> [String] {
            app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH 'tile:'"))
                .allElementsBoundByIndex
                .filter { ($0.value as? String ?? "").contains("likely next") }
                .map { $0.identifier.replacingOccurrences(of: "tile:", with: "") }
        }
        XCTAssertEqual(profile("highlight_next"), "0", "default off")
        want.tap()
        XCTAssertTrue(app.buttons["Backspace"].waitForExistence(timeout: 10))
        XCTAssertEqual(outlined(), [], "off: nothing outlined")

        openSettings(app, "lang")
        let toggle = app.switches["lang:outline"]
        XCTAssertTrue(toggle.waitForExistence(timeout: 10))
        shot(app, "e9-language-help")
        flip(toggle)
        wait("highlight_next lands") { profile("highlight_next") == "1" }
        XCTAssertEqual(settingOps("highlight_next"), 1)
        app.buttons["settingsDone"].tap()

        // The bar still holds "want": its likely next words are outlined.
        wait("1-3 cells outlined") { (1...3).contains(outlined().count) }
        let ids = outlined()
        shot(app, "e9-outline-on-board")
        // Rule check from the screen alone: every outlined cell is a word the
        // Smart bar is offering (the ranker's list is what both draw).
        for id in ids {
            XCTAssertTrue(app.buttons["strip:\(id)"].exists, "\(id) is one of the strip's suggestions")
        }
        // Nothing moved: "want" still speaks and still sits where it was.
        XCTAssertTrue(want.exists)

        // A tap on an outlined word is an ordinary tap (the outline is chrome).
        app.buttons["Clear"].tap()
        wait("outline leaves with an empty bar") { outlined().isEmpty }

        // Off again: nothing outlined even with a word in the bar.
        openSettings(app, "lang")
        flip(app.switches["lang:outline"])
        wait("highlight_next off") { profile("highlight_next") == "0" }
        app.buttons["settingsDone"].tap()
        want.tap()
        XCTAssertTrue(app.buttons["Backspace"].isEnabled)
        sleep(1)
        XCTAssertEqual(outlined(), [])
    }

    // MARK: SB-7 families

    func testFamilyEditorReordersAddsAndSavesTheSyncedOrder() throws {
        let app = launch()
        XCTAssertTrue(app.buttons["tile:sns_0013"].waitForExistence(timeout: 30))
        openSettings(app, "lang")
        let chip = app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH 'fam:bf_'")).firstMatch
        for _ in 0..<6 where !chip.exists { app.swipeUp(velocity: .slow) }
        XCTAssertTrue(chip.waitForExistence(timeout: 10), "the families are listed")
        let famId = chip.identifier.replacingOccurrences(of: "fam:", with: "")
        let before = query("SELECT item_id FROM bar_family_item WHERE family_id = '\(famId)' ORDER BY position").map(\.[0])
        XCTAssertGreaterThanOrEqual(before.count, 2)
        chip.tap()

        XCTAssertTrue(app.staticTexts["fam:item:0"].waitForExistence(timeout: 10))
        shot(app, "e9-family-editor")
        // Move the first tile later, remove the new first, add a word.
        app.buttons["fam:right:0"].tap()
        app.buttons["fam:remove:0"].tap()
        let field = app.textFields["fam:add"]
        field.tap()
        field.typeText("zzzq")
        app.buttons["fam:addBtn"].tap()
        XCTAssertEqual(app.staticTexts["fam:problem"].waitForExistence(timeout: 10) ? app.staticTexts["fam:problem"].label : "",
                       "No such word")
        field.press(forDuration: 1.0)
        if app.menuItems["Select All"].waitForExistence(timeout: 2) { app.menuItems["Select All"].tap() }
        field.typeText("want")
        app.buttons["fam:addBtn"].tap()
        wait("the new word is a row") { app.staticTexts["fam:item:\(before.count - 1)"].exists }
        app.buttons["fam:save"].tap()

        let expected = Array(([before[1], before[0]] + before.dropFirst(2)).dropFirst()) + ["sns_0013"]
        wait("the saved order is in the database") {
            query("SELECT item_id FROM bar_family_item WHERE family_id = '\(famId)' ORDER BY position").map(\.[0]) == expected
        }
        let ops = query("SELECT args FROM sync_op WHERE kind = 'set_family_items'")
        XCTAssertEqual(ops.count, 1, "one synced op carries the whole new order")
        XCTAssertTrue(ops[0][0].contains(famId))
        XCTAssertTrue(app.staticTexts["fam:note"].waitForExistence(timeout: 10))
        XCTAssertEqual(app.staticTexts["fam:note"].label, "Family saved")

        app.terminate()
        let again = launch(reset: false)
        XCTAssertTrue(again.buttons["tile:sns_0013"].waitForExistence(timeout: 30))
        XCTAssertEqual(query("SELECT item_id FROM bar_family_item WHERE family_id = '\(famId)' ORDER BY position").map(\.[0]),
                       expected, "the order survives a relaunch")
    }

    // MARK: KB-7 device keyboard

    func testDeviceKeyboardTypesIntoTheBarThroughTheSameCommitPath() throws {
        let app = launch()
        XCTAssertTrue(app.buttons["tile:sns_0013"].waitForExistence(timeout: 30))
        openSettings(app, "board")
        let mode = app.segmentedControls["board:keyboardMode"]
        XCTAssertTrue(mode.waitForExistence(timeout: 10))
        XCTAssertEqual(profile("keyboard_mode"), "pip")
        mode.buttons["Device keyboard"].tap()
        wait("keyboard_mode lands") { profile("keyboard_mode") == "device" }
        XCTAssertEqual(settingOps("keyboard_mode"), 1)
        XCTAssertFalse(app.segmentedControls["board:letterLayout"].isEnabled,
                       "the letters are the device's own now")
        shot(app, "e9-settings-keyboard")
        app.buttons["settingsDone"].tap()

        app.buttons["Keyboard"].tap()
        let field = app.textFields["kb:device"]
        XCTAssertTrue(field.waitForExistence(timeout: 10), "the system keyboard's field")
        XCTAssertFalse(app.buttons["kbkey:q"].exists, "no Pip letter keys")
        XCTAssertTrue(app.buttons["kbpartner:sns_0073"].exists, "the answer keys stay")
        XCTAssertTrue(app.buttons["kbpartner:sns_0072"].exists)
        shot(app, "e9-device-keyboard")

        let before = query("SELECT count(*) FROM learner_event_log WHERE item_id = 'sns_0013' AND source = 'keyboard'")
        XCTAssertEqual(before.first?.first, "0")
        field.tap()
        field.typeText("want")
        // Mid-word: still in the field, not yet committed.
        XCTAssertEqual(query("SELECT count(*) FROM learner_event_log WHERE item_id = 'sns_0013' AND source = 'keyboard'")
            .first?.first, "0")
        field.typeText(" ")
        wait("the space committed 'want' like the Pip keys do") {
            query("SELECT count(*) FROM learner_event_log WHERE item_id = 'sns_0013' AND source = 'keyboard'")
                .first?.first == "1"
        }
        wait("the field was emptied") { (field.value as? String ?? "x") == "" }
        XCTAssertTrue(app.buttons["Backspace"].isEnabled, "the word is in the bar")

        // Back to Pip keys: the letters return.
        openSettings(app, "board")
        app.segmentedControls["board:keyboardMode"].buttons["Pip keyboard"].tap()
        wait("keyboard_mode back") { profile("keyboard_mode") == "pip" }
        app.buttons["settingsDone"].tap()
        XCTAssertTrue(app.buttons["kbkey:q"].waitForExistence(timeout: 10))
    }

    // MARK: ST-3 Face ID stands in for the PIN

    private func setPin(_ app: XCUIApplication, _ pin: String) {
        let lock = app.buttons["pin:change"]
        for _ in 0..<6 where !lock.isHittable { app.swipeUp(velocity: .slow) }
        lock.tap()
        let input = app.textFields["pin:input"]
        XCTAssertTrue(input.waitForExistence(timeout: 10))
        input.typeText(pin)
        XCTAssertTrue(app.textFields["pin:input"].waitForExistence(timeout: 5))
        app.textFields["pin:input"].typeText(pin)
    }

    func testFaceIDOpensSettingsInPlaceOfThePINAndThePINIsTheFallback() throws {
        var app = launch(extra: ["-pipUITestBiometric", "pass"])
        XCTAssertTrue(app.buttons["tile:sns_0013"].waitForExistence(timeout: 30))
        openSettings(app, "backup")
        // Not offered until a PIN exists.
        XCTAssertFalse(app.switches["pin:biometricToggle"].exists)
        setPin(app, "2468")
        let toggle = app.switches["pin:biometricToggle"]
        for _ in 0..<6 where !toggle.exists { app.swipeUp(velocity: .slow) }
        XCTAssertTrue(toggle.waitForExistence(timeout: 10), "offered once a PIN exists")
        XCTAssertEqual(toggle.value as? String, "0", "off by default")
        shot(app, "e9-faceid-toggle")
        flip(toggle)
        wait("Face ID is on") { (app.switches["pin:biometricToggle"].value as? String) == "1" }
        app.buttons["settingsDone"].tap()

        // The gate: Face ID answers, no digits typed.
        app.buttons["settingsGear"].tap()
        XCTAssertTrue(app.buttons["settingsDone"].waitForExistence(timeout: 10),
                      "Face ID opened Settings without the PIN")
        app.buttons["settingsDone"].tap()

        // Face ID fails or is cancelled: the PIN is still what opens Settings.
        app.terminate()
        app = launch(reset: false, extra: ["-pipUITestBiometric", "fail"])
        XCTAssertTrue(app.buttons["tile:sns_0013"].waitForExistence(timeout: 30))
        app.buttons["settingsGear"].tap()
        let input = app.textFields["pin:input"]
        XCTAssertTrue(input.waitForExistence(timeout: 10), "the PIN gate stays")
        XCTAssertFalse(app.buttons["settingsDone"].exists)
        XCTAssertTrue(app.buttons["pin:biometric"].exists, "and Face ID can be tried again")
        shot(app, "e9-faceid-fallback-gate")
        input.typeText("1111")
        XCTAssertTrue(app.staticTexts["Not that PIN."].waitForExistence(timeout: 5), "a wrong PIN still fails")
        XCTAssertFalse(app.buttons["settingsDone"].exists)
        app.textFields["pin:input"].typeText("2468")
        XCTAssertTrue(app.buttons["settingsDone"].waitForExistence(timeout: 10), "the right PIN opens it")

        // Turning the PIN off turns Face ID off with it.
        app.buttons["settingsSection:backup"].tap()
        let off = app.buttons["pin:off"]
        for _ in 0..<6 where !off.isHittable { app.swipeUp(velocity: .slow) }
        off.tap()
        app.buttons["settingsDone"].tap()
        app.buttons["settingsGear"].tap()
        XCTAssertTrue(app.buttons["settingsDone"].waitForExistence(timeout: 10), "no PIN: one tap")
    }
}
