//
//  CardRowsUITests.swift
//  PipAACUITests
//
//  E8 works tests (phase 044 LW-8, LW-13, LW-17, LW-20, LW-22): Swap,
//  Colour, the Library's Suggested tab, "Sounds wrong" and the editor's
//  save status, end to end on the real board.
//
//  Instruments the app cannot influence: the person's SQLite FILE, read
//  here (never through the app), and the stub Worker's request log (the
//  flag goes to a loopback stub - no real service is reachable).
//

import SQLite3
import XCTest

@MainActor
final class CardRowsUITests: XCTestCase {
    private var dir: URL!
    private var server: StubWorker!

    override func setUpWithError() throws {
        continueAfterFailure = false
        dir = FileManager.default.temporaryDirectory
            .appendingPathComponent("pip-e8-\(UUID().uuidString)", isDirectory: true)
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        server = try StubWorker()
    }

    override func tearDown() { server?.stop() }

    // MARK: helpers

    private func launch(seed: String? = nil, reset: Bool = true) -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments = (reset ? ["-pipUITestReset"] : [])
            + ["-PipDataDir", dir.path, "-PipBaseURL", "http://127.0.0.1:\(server.port)"]
            + (seed.map { ["-pipUITestSeedPerson", $0] } ?? [])
        app.launch()
        return app
    }

    private func enterEdit(_ app: XCUIApplication) {
        app.buttons["settingsGear"].tap()
        let edit = app.buttons["editBoard"]
        XCTAssertTrue(edit.waitForExistence(timeout: 10))
        edit.tap()
        XCTAssertTrue(app.buttons["editDone"].waitForExistence(timeout: 10))
    }

    private func shot(_ app: XCUIApplication, _ name: String) {
        let a = XCTAttachment(screenshot: app.screenshot())
        a.name = name
        a.lifetime = .keepAlways
        add(a)
    }

    /// Rows from the person's own SQLite file, opened read-only here.
    private func rows(_ sql: String) -> [String] {
        let users = dir.appendingPathComponent("Users", isDirectory: true)
        guard let file = (try? FileManager.default.contentsOfDirectory(atPath: users.path))?
            .first(where: { $0.hasSuffix(".sqlite") }) else { return [] }
        var db: OpaquePointer?
        guard sqlite3_open_v2(users.appendingPathComponent(file).path, &db, SQLITE_OPEN_READONLY, nil) == SQLITE_OK
        else { return [] }
        defer { sqlite3_close(db) }
        var st: OpaquePointer?
        guard sqlite3_prepare_v2(db, sql, -1, &st, nil) == SQLITE_OK else { return [] }
        defer { sqlite3_finalize(st) }
        var out: [String] = []
        while sqlite3_step(st) == SQLITE_ROW {
            out.append(sqlite3_column_text(st, 0).map { String(cString: $0) } ?? "")
        }
        return out
    }

    private func wait(_ what: String, timeout: TimeInterval = 20, _ cond: () -> Bool) {
        let end = Date().addingTimeInterval(timeout)
        while Date() < end {
            if cond() { return }
            RunLoop.current.run(until: Date().addingTimeInterval(0.1))
        }
        XCTFail("timed out waiting for: \(what)")
    }

    private func firstSwapRow(_ app: XCUIApplication) -> XCUIElement {
        app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH 'swap-row:'")).firstMatch
    }

    // MARK: LW-8 Swap

    /// Main board: card -> Swap for another word -> pick -> the new word
    /// holds the old word's cell, the old word is off the board; the
    /// database agrees and it survives a relaunch.
    func testSwapOnTheMainBoardReplacesTheWordInItsCell() throws {
        let app = launch()
        XCTAssertTrue(app.buttons["tile:sns_0013"].waitForExistence(timeout: 30))
        XCTAssertEqual(rows("SELECT COUNT(*) FROM core_override WHERE item_id = 'sns_0013'"), ["0"])
        enterEdit(app)
        let frame = app.buttons["tile:sns_0013"].frame
        app.buttons["tile:sns_0013"].tap()
        let swap = app.buttons["wc-replace"]
        XCTAssertTrue(swap.waitForExistence(timeout: 10), "a word that holds a cell offers Swap")
        shot(app, "e8-card-swap")
        swap.tap()

        let first = firstSwapRow(app)
        XCTAssertTrue(first.waitForExistence(timeout: 10))
        XCTAssertTrue(app.staticTexts["swap-head"].exists, "the head row shows the tapped word")
        let key = first.identifier.replacingOccurrences(of: "swap-row:", with: "") // sense:sns_xxxx
        let newId = String(key.split(separator: ":")[1])
        let label = first.label
        shot(app, "e8-swap-picker")
        first.tap()

        XCTAssertTrue(app.buttons["tile:\(newId)"].waitForExistence(timeout: 10), "the picked word is on the board")
        XCTAssertEqual(app.buttons["tile:\(newId)"].frame, frame, "in the old word's cell")
        XCTAssertFalse(app.buttons["tile:sns_0013"].exists, "the old word left the board")
        XCTAssertEqual(app.staticTexts.matching(identifier: "editToastText").firstMatch.label, "Placed \(label)")

        // The database, read here: an override seats the new word in that slot.
        XCTAssertEqual(rows("SELECT COUNT(*) FROM core_override WHERE item_id = '\(newId)'"), ["1"])
        app.terminate()
        let again = launch(reset: false)
        XCTAssertTrue(again.buttons["tile:\(newId)"].waitForExistence(timeout: 30), "survives a relaunch")
        XCTAssertFalse(again.buttons["tile:sns_0013"].exists)
    }

    /// A group page: the picked word takes the tapped word's exact cell and
    /// the old word leaves the group (replaceGroupItem); Undo brings it back.
    func testSwapInAGroupTakesTheCellAndUndoRestoresIt() throws {
        let app = launch()
        XCTAssertTrue(app.buttons["tile:sns_0013"].waitForExistence(timeout: 30))
        enterEdit(app)
        app.buttons["editGroups"].tap()
        let door = app.buttons["group:grp_snack"]
        XCTAssertTrue(door.waitForExistence(timeout: 10))
        door.tap()
        let oldRow = rows("""
            SELECT item_id || ',' || slot_index FROM group_cell
            WHERE group_id = 'grp_snack' AND layout = 'grid60' AND page = 0 ORDER BY slot_index LIMIT 1
            """).first ?? ""
        let parts = oldRow.split(separator: ",").map(String.init)
        XCTAssertEqual(parts.count, 2, "the Snack group has a word on page 1")
        let oldId = parts[0], slot = parts[1]
        XCTAssertTrue(app.buttons["tile:\(oldId)"].waitForExistence(timeout: 10))
        app.buttons["tile:\(oldId)"].tap()
        XCTAssertTrue(app.buttons["wc-replace"].waitForExistence(timeout: 10))
        app.buttons["wc-replace"].tap()
        let first = firstSwapRow(app)
        XCTAssertTrue(first.waitForExistence(timeout: 10))
        let newId = String(first.identifier.replacingOccurrences(of: "swap-row:", with: "").split(separator: ":")[1])
        let label = first.label
        first.tap()

        XCTAssertTrue(app.buttons["tile:\(newId)"].waitForExistence(timeout: 10))
        XCTAssertFalse(app.buttons["tile:\(oldId)"].exists)
        XCTAssertTrue(app.staticTexts.matching(identifier: "editToastText").firstMatch.label.hasPrefix("Replaced "))
        XCTAssertTrue(app.staticTexts.matching(identifier: "editToastText").firstMatch.label.hasSuffix("with \(label)"))
        XCTAssertEqual(rows("""
            SELECT item_id FROM group_cell WHERE group_id = 'grp_snack' AND layout = 'grid60'
            AND page = 0 AND slot_index = \(slot)
            """), [newId], "the file has the new word in the old word's cell")
        XCTAssertEqual(rows("SELECT COUNT(*) FROM group_membership WHERE group_id = 'grp_snack' AND item_id = '\(oldId)'"), ["0"])

        app.buttons["toast-undo"].tap()
        XCTAssertTrue(app.buttons["tile:\(oldId)"].waitForExistence(timeout: 10), "Undo puts it back")
        wait("the file has the old word back") {
            rows("SELECT item_id FROM group_cell WHERE group_id = 'grp_snack' AND layout = 'grid60' AND page = 0 AND slot_index = \(slot)") == [oldId]
        }
    }

    // MARK: LW-13 Colour

    func testColourOfAPersonalWordIsSavedAndShownEverywhere() throws {
        let app = launch(seed: "Nana")
        XCTAssertTrue(app.buttons["Nana"].waitForExistence(timeout: 30))
        enterEdit(app)
        app.buttons["Nana"].tap()
        XCTAssertTrue(app.buttons["wc-kind:Green"].waitForExistence(timeout: 10), "the Colour row has swatches")
        XCTAssertEqual(app.staticTexts["wc-kind"].label, "Person")
        shot(app, "e8-card-colour")
        app.buttons["wc-kind:Green"].tap()
        wait("the row says Action") { app.staticTexts["wc-kind"].label == "Action" }
        XCTAssertEqual(rows("SELECT fitzgerald_role FROM personal_entity WHERE spoken_name = 'Nana'"), ["Green"])
        XCTAssertEqual(app.buttons["wc-kind:Green"].value as? String, "Selected")
        app.buttons["wc-done"].tap()
        app.buttons["editDone"].tap()
        app.terminate()
        let again = launch(seed: nil, reset: false)
        XCTAssertTrue(again.buttons["Nana"].waitForExistence(timeout: 30))
        XCTAssertEqual(rows("SELECT fitzgerald_role FROM personal_entity WHERE spoken_name = 'Nana'"), ["Green"])
        // A catalog word has no Colour row.
        enterEdit(again)
        again.buttons["tile:sns_0013"].tap()
        XCTAssertTrue(again.buttons["wc-done"].waitForExistence(timeout: 10))
        XCTAssertFalse(again.buttons["wc-kind:Green"].exists)
    }

    // MARK: LW-17 Suggested

    /// The web's Suggested tab lists nothing until the device hears words
    /// (library.mjs librarySuggested); the tab says so in the web's words.
    func testLibrarySuggestedTabSaysWhatTheWebSays() throws {
        let app = launch()
        XCTAssertTrue(app.buttons["tile:sns_0013"].waitForExistence(timeout: 30))
        enterEdit(app)
        app.buttons["editLibrary"].tap()
        XCTAssertTrue(app.segmentedControls["lib-tabs"].waitForExistence(timeout: 10))
        app.segmentedControls["lib-tabs"].buttons["Suggested"].tap()
        let empty = app.staticTexts["lib-empty"]
        XCTAssertTrue(empty.waitForExistence(timeout: 10))
        XCTAssertEqual(empty.label,
                       "Nothing here yet — words the device hears appear once the child does not have them yet.")
        shot(app, "e8-library-suggested")
    }

    // MARK: LW-20 Sounds wrong

    func testSoundsWrongFlagsTheClipOnAStubWorker() throws {
        let app = launch(seed: "Nana")
        XCTAssertTrue(app.buttons["Nana"].waitForExistence(timeout: 30))
        wait("the trial clock was mirrored") { !server.requests("/api/v1/trial").isEmpty }
        enterEdit(app)
        app.buttons["Nana"].tap()
        let flag = app.buttons["wc-flag"]
        XCTAssertTrue(flag.waitForExistence(timeout: 10), "a personal word on a shared voice offers it")
        shot(app, "e8-card-flag")
        flag.tap()
        wait("the flag reached the stub") { server.requests("/api/v1/voice/tile/flag").count == 1 }
        let req = try XCTUnwrap(server.requests("/api/v1/voice/tile/flag").first)
        XCTAssertEqual(req.method, "POST")
        XCTAssertEqual(req.body["text"] as? String, "Nana")
        XCTAssertEqual(req.body["locale"] as? String, "en")
        XCTAssertNotNil(UUID(uuidString: req.body["user_id"] as? String ?? ""))
        XCTAssertNotNil(req.body["voice"] as? String)
        let toast = app.staticTexts.matching(identifier: "editToastText").firstMatch
        XCTAssertTrue(toast.waitForExistence(timeout: 10))
        XCTAssertEqual(toast.label, "Flagged for review — it keeps playing meanwhile")
        // A catalog word is never flagged from here.
        app.buttons["wc-done"].tap()
        app.buttons["tile:sns_0013"].tap()
        XCTAssertTrue(app.buttons["wc-done"].waitForExistence(timeout: 10))
        XCTAssertFalse(app.buttons["wc-flag"].exists)
    }

    // MARK: LW-22 save status

    /// A device with no sync partner says so; the linked pending -> saved
    /// path runs in the E2E (SyncE2ETests.testOfflineCatchUp).
    func testEditorStatusOnADeviceThatIsNotLinked() throws {
        let app = launch(seed: "Nana")
        XCTAssertTrue(app.buttons["Nana"].waitForExistence(timeout: 30))
        enterEdit(app)
        let status = app.staticTexts["editStatus"]
        XCTAssertTrue(status.waitForExistence(timeout: 10))
        XCTAssertEqual(status.label, "Saved on this device")
        shot(app, "e8-editor-status")
    }
}
