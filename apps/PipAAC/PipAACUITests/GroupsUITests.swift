//
//  GroupsUITests.swift
//  PipAACUITests
//
//  E4 works tests (phase 044 LW-14, LW-15, ST-7, ST-4, ST-5, BS-21,
//  BS-22): manage groups, hide/show them in Settings, the look of the
//  buttons, the counts badge. The app runs with `-PipDataDir <tmp>`, so
//  every claim is read from the person's SQLite the app wrote - not from
//  the UI's own report. Shots go to /tmp/pipaac-shots-e4/ and are also
//  kept as attachments.
//

import SQLite3
import XCTest

final class GroupsUITests: XCTestCase {
    private var dir: URL!

    override func setUpWithError() throws {
        continueAfterFailure = false
        dir = FileManager.default.temporaryDirectory
            .appendingPathComponent("pip-e4-\(UUID().uuidString)", isDirectory: true)
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
    }

    // MARK: disk readers

    private func person() throws -> String {
        struct Row: Decodable { let id: String }
        struct Doc: Decodable { let users: [Row] }
        let data = try Data(contentsOf: dir.appendingPathComponent("people.json"))
        return try XCTUnwrap(JSONDecoder().decode(Doc.self, from: data).users.first).id
    }

    private func query(_ sql: String) throws -> [[String]] {
        var db: OpaquePointer?
        let path = dir.appendingPathComponent("Users/\(try person()).sqlite").path
        XCTAssertEqual(sqlite3_open_v2(path, &db, SQLITE_OPEN_READONLY, nil), SQLITE_OK)
        defer { sqlite3_close(db) }
        var st: OpaquePointer?
        XCTAssertEqual(sqlite3_prepare_v2(db, sql, -1, &st, nil), SQLITE_OK)
        defer { sqlite3_finalize(st) }
        var rows: [[String]] = []
        while sqlite3_step(st) == SQLITE_ROW {
            rows.append((0..<sqlite3_column_count(st)).map {
                sqlite3_column_text(st, $0).map { String(cString: $0) } ?? ""
            })
        }
        return rows
    }

    private func launch(reset: Bool = true) -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments = (reset ? ["-pipUITestReset"] : []) + ["-PipDataDir", dir.path]
        app.launch()
        return app
    }

    private func shot(_ app: XCUIApplication, _ name: String) {
        let s = app.screenshot()
        let a = XCTAttachment(screenshot: s)
        a.name = name
        a.lifetime = .keepAlways
        add(a)
        let out = URL(fileURLWithPath: "/tmp/pipaac-shots-e4", isDirectory: true)
        try? FileManager.default.createDirectory(at: out, withIntermediateDirectories: true)
        try? s.pngRepresentation.write(to: out.appendingPathComponent("\(name).png"))
    }

    private func openSettings(_ app: XCUIApplication, _ section: String? = nil) {
        app.buttons["settingsGear"].tap()
        XCTAssertTrue(app.buttons["settingsDone"].waitForExistence(timeout: 10))
        if let section {
            let b = app.buttons["settingsSection:\(section)"]
            XCTAssertTrue(b.waitForExistence(timeout: 10))
            b.tap()
        }
    }

    // MARK: LW-14 + LW-15

    /// Create "Park", rename it "Playground", move it first, give it the
    /// animals icon, relaunch: the database holds all of it, and the
    /// child's Groups index wears the new door.
    @MainActor
    func testManageGroupsSurvivesRelaunch() throws {
        let app = launch()
        XCTAssertTrue(app.buttons["want"].waitForExistence(timeout: 30))
        openSettings(app, "words")
        shot(app, "e4-settings-words")
        app.buttons["settings:editGroups"].tap()
        XCTAssertTrue(app.buttons["groupNew"].waitForExistence(timeout: 15))

        // Create.
        app.buttons["groupNew"].tap()
        let name = app.alerts.textFields.firstMatch
        XCTAssertTrue(name.waitForExistence(timeout: 5))
        name.typeText("Park")
        app.alerts.buttons["Create"].firstMatch.tap()
        let made = NSPredicate { _, _ in
            ((try? self.query("SELECT id FROM board_group WHERE name='Park'")) ?? []).count == 1
        }
        wait(for: [expectation(for: made, evaluatedWith: nil)], timeout: 10)
        XCTAssertEqual(try query("SELECT name, kind FROM board_group WHERE name='Park'"),
                       [["Park", "custom"]])
        let id = try XCTUnwrap(query("SELECT id FROM board_group WHERE name='Park'").first?.first)
        XCTAssertTrue(app.buttons["groupMore:\(id)"].waitForExistence(timeout: 15),
                      "the list scrolls to the new group")

        // Rename.
        app.buttons["groupMore:\(id)"].tap()
        app.buttons["groupMenuRename"].tap()
        let rename = app.alerts.textFields.firstMatch
        XCTAssertTrue(rename.waitForExistence(timeout: 5))
        rename.tap()
        rename.typeText(String(repeating: XCUIKeyboardKey.delete.rawValue, count: 4))
        rename.typeText("Playground")
        app.alerts.buttons["Rename"].firstMatch.tap()
        XCTAssertTrue(app.descendants(matching: .any).matching(NSPredicate(format: "label CONTAINS 'Playground'")).firstMatch.waitForExistence(timeout: 10))
        XCTAssertEqual(try query("SELECT name FROM board_group WHERE id='\(id)'"), [["Playground"]])

        // Reorder: drag Playground's grip above the first group.
        // ("Move to the top" in the row menu; the grip drag is the same moveGroupBlock.)
        app.buttons["groupMore:\(id)"].tap()
        app.buttons["groupMenuTop"].tap()
        let firstId = { try self.query("SELECT id FROM board_group ORDER BY index_slot LIMIT 1").first?.first }
        let moved = NSPredicate { _, _ in (try? firstId()) == id }
        wait(for: [expectation(for: moved, evaluatedWith: nil)], timeout: 10)
        XCTAssertEqual(try firstId(), id, "Playground is the first group in the database")

        // Icon from the library (the row is at the top now).
        for _ in 0..<8 where !app.buttons["groupMore:\(id)"].isHittable { app.swipeDown() }
        app.buttons["groupMore:\(id)"].tap()
        app.buttons["groupMenuIcon"].tap()
        shot(app, "e4-icon-picker")
        let search = app.textFields["iconSearch"]
        XCTAssertTrue(search.waitForExistence(timeout: 10))
        search.tap()
        search.typeText("animals")
        let animals = app.buttons.matching(NSPredicate(format: "identifier == 'icon:animals'")).firstMatch
        XCTAssertTrue(animals.waitForExistence(timeout: 10))
        animals.tap()
        let glyph = NSPredicate { _, _ in
            (try? self.query("SELECT glyph FROM board_group WHERE id='\(id)'").first?.first) == "icon:animals"
        }
        wait(for: [expectation(for: glyph, evaluatedWith: nil)], timeout: 10)
        shot(app, "e4-groups-editor")

        // Relaunch (same files): all persisted.
        app.terminate()
        let again = launch(reset: false)
        XCTAssertTrue(again.buttons["want"].waitForExistence(timeout: 30))
        XCTAssertEqual(try query("SELECT name, glyph FROM board_group WHERE id='\(id)'"),
                       [["Playground", "icon:animals"]])
        XCTAssertEqual(try firstId(), id)
        // ... and the child's Groups index shows the door with the icon.
        again.buttons["Groups"].firstMatch.tap()
        let door = again.buttons["group:\(id)"]
        XCTAssertTrue(door.waitForExistence(timeout: 15), "the new door is on the index")
        XCTAssertEqual(door.label, "Playground")
        XCTAssertEqual(door.value as? String, "icons/groups/animals.svg")
        shot(again, "e4-groups-index")
    }

    // MARK: ST-7

    /// Hide a group in Settings: it leaves the child's Groups index, the
    /// database says hidden, and showing it brings it back.
    @MainActor
    func testHideShowGroupInSettings() throws {
        let app = launch()
        XCTAssertTrue(app.buttons["want"].waitForExistence(timeout: 30))
        app.buttons["Groups"].firstMatch.tap()
        XCTAssertTrue(app.buttons["group:grp_drinks"].waitForExistence(timeout: 15))
        app.buttons["Groups"].firstMatch.tap()   // back to the board
        XCTAssertTrue(app.buttons["want"].waitForExistence(timeout: 10))

        openSettings(app, "words")
        app.buttons["settings:showGroups"].tap()
        let sw = app.descendants(matching: .any)["show:grp_drinks"]
        XCTAssertTrue(sw.waitForExistence(timeout: 10))
        XCTAssertEqual(sw.value as? String, "1")
        shot(app, "e4-show-groups")
        sw.tap()
        sleep(1)
        let hidden = NSPredicate { _, _ in
            (try? self.query("SELECT hidden FROM board_group WHERE id='grp_drinks'").first?.first) == "1"
        }
        wait(for: [expectation(for: hidden, evaluatedWith: nil)], timeout: 10)
        XCTAssertEqual(sw.value as? String, "0")
        app.buttons["settingsDone"].tap()
        app.buttons["Groups"].firstMatch.tap()
        XCTAssertTrue(app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH 'group:'")).firstMatch.waitForExistence(timeout: 15))
        XCTAssertFalse(app.buttons["group:grp_drinks"].exists, "a hidden group leaves the index")
        app.buttons["Groups"].firstMatch.tap()

        // Show it again.
        openSettings(app, "words")
        app.buttons["settings:showGroups"].tap()
        app.descendants(matching: .any)["show:grp_drinks"].tap()
        let shown = NSPredicate { _, _ in
            (try? self.query("SELECT hidden FROM board_group WHERE id='grp_drinks'").first?.first) == "0"
        }
        wait(for: [expectation(for: shown, evaluatedWith: nil)], timeout: 10)
        app.buttons["settingsDone"].tap()
        app.buttons["Groups"].firstMatch.tap()
        XCTAssertTrue(app.buttons["group:grp_drinks"].waitForExistence(timeout: 15))
    }

    // MARK: BS-22

    /// "Words only": the setting is the db's presentation_mode, the tiles
    /// say so, and the picture-less look is on screen.
    @MainActor
    func testWordsOnlyChangesTheLook() throws {
        let app = launch()
        let want = app.buttons["tile:sns_0013"]
        XCTAssertTrue(want.waitForExistence(timeout: 30))
        XCTAssertEqual(want.value as? String, "")
        shot(app, "e4-look-pictures")

        openSettings(app, "board")
        shot(app, "e4-settings-board")
        let seg = app.segmentedControls["board:look"]
        XCTAssertTrue(seg.waitForExistence(timeout: 10))
        seg.buttons["Words only"].tap()
        let label = NSPredicate { _, _ in
            (try? self.query("SELECT presentation_mode FROM learner_profile WHERE id='prf_local'")
                .first?.first) == "label"
        }
        wait(for: [expectation(for: label, evaluatedWith: nil)], timeout: 10)
        app.buttons["settingsDone"].tap()
        XCTAssertEqual(want.value as? String, "words only")
        shot(app, "e4-look-words-only")

        // Back to pictures: the tiles change back.
        openSettings(app, "board")
        app.segmentedControls["board:look"].buttons["Pictures and words"].tap()
        let sym = NSPredicate { _, _ in
            (try? self.query("SELECT presentation_mode FROM learner_profile WHERE id='prf_local'")
                .first?.first) == "symbol"
        }
        wait(for: [expectation(for: sym, evaluatedWith: nil)], timeout: 10)
        app.buttons["settingsDone"].tap()
        XCTAssertEqual(want.value as? String, "")
    }

    // MARK: BS-21

    /// Tap "want" three times as the child; in Edit mode the 📊 badge on
    /// that tile is the number of rows learner_event_log holds for it.
    @MainActor
    func testCountsBadgeIsTheChildsOwnTaps() throws {
        let app = launch()
        let want = app.buttons["tile:sns_0013"]
        XCTAssertTrue(want.waitForExistence(timeout: 30))
        for _ in 0..<3 { want.tap() }
        let logged = NSPredicate { _, _ in
            (Int((try? self.query("SELECT count(*) FROM learner_event_log WHERE item_id='sns_0013'")
                .first?.first) ?? "") ?? 0) >= 3
        }
        wait(for: [expectation(for: logged, evaluatedWith: nil)], timeout: 10)
        let n = try XCTUnwrap(Int(try XCTUnwrap(query(
            "SELECT count(*) FROM learner_event_log WHERE item_id='sns_0013'").first?.first)))

        openSettings(app)
        app.buttons["editBoard"].tap()
        XCTAssertTrue(app.buttons["editDone"].waitForExistence(timeout: 10))
        XCTAssertEqual(app.buttons["tile:sns_0013"].value as? String, "")
        app.buttons["editCounts"].tap()
        let tile = app.buttons["tile:sns_0013"]
        let on = NSPredicate(format: "value == %@", "\(n) \(n == 1 ? "tap" : "taps")")
        wait(for: [expectation(for: on, evaluatedWith: tile)], timeout: 10)
        shot(app, "e4-counts-badge")
        // A word nobody tapped says 0.
        let other = app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH 'tile:' AND identifier != 'tile:sns_0013'")).element(boundBy: 3)
        XCTAssertEqual(other.value as? String, "0 taps")
        // The badge leaves with Edit mode.
        app.buttons["editDone"].tap()
        XCTAssertTrue(want.waitForExistence(timeout: 10))
        XCTAssertEqual(want.value as? String, "")
    }

    // MARK: ST-4 + ST-5

    /// The sectioned Settings: every section is listed in the web's order
    /// with its one-line state, the Overview leads with the person, search
    /// finds a row and opens its page.
    @MainActor
    func testSettingsSectionsOverviewAndSearch() throws {
        let app = launch()
        XCTAssertTrue(app.buttons["want"].waitForExistence(timeout: 30))
        openSettings(app)
        let order = ["lifetime", "overview", "words", "board", "talking", "lang", "team", "backup", "account", "help"]
        let frames = order.map { app.buttons["settingsSection:\($0)"] }
        for f in frames { XCTAssertTrue(f.waitForExistence(timeout: 10)) }
        let ys = frames.map { $0.frame.minY }
        XCTAssertEqual(ys, ys.sorted(), "sections are in the web's order")
        XCTAssertTrue(frames[3].label.contains("60 buttons"), "the Board line says how it is set: \(frames[2].label)")

        // Overview: name, the checklist, the glance.
        XCTAssertTrue(app.textFields["person:name"].waitForExistence(timeout: 10))
        XCTAssertTrue(app.buttons["editBoard"].exists)
        XCTAssertTrue(app.staticTexts["setupTitle"].exists
                      || app.staticTexts["Finish setting up · 0 of 2 done"].exists)
        XCTAssertTrue(app.buttons["glance:board"].exists)
        let nameField = app.textFields["person:name"]
        nameField.tap()
        nameField.typeText("Maya\n")
        let named = NSPredicate { _, _ in
            (try? self.query("SELECT person_name FROM learner_profile WHERE id='prf_local'").first?.first) == "Maya"
        }
        wait(for: [expectation(for: named, evaluatedWith: nil)], timeout: 10)
        shot(app, "e4-settings-overview")

        // One box for Settings and Help: "speaking" -> the Speaking speed row, lit on its page.
        let search = app.textFields["settingsSearch"]
        search.tap()
        search.typeText("speaking")
        let hit = app.descendants(matching: .any)["help:setting:speed"].firstMatch
        XCTAssertTrue(hit.waitForExistence(timeout: 10))
        shot(app, "e4-settings-search")
        hit.tap()
        XCTAssertTrue(app.descendants(matching: .any)["found:speed"].waitForExistence(timeout: 10), "the Talking page opened on the lit row")
        XCTAssertTrue(app.buttons["voice:change"].exists)
        shot(app, "e4-settings-talking")
    }
}
