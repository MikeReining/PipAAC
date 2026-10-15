//
//  FirstRunUITests.swift
//  PipAACUITests
//
//  E7 works tests (phase 044 PF-2, PF-3, PF-4, SN-11): a fresh install
//  walks welcome -> button look -> "their world" (a person with a photo)
//  -> the scripted demo -> the board, and never shows first run again.
//  Every claim is read from the files the app wrote (the person's SQLite,
//  people.json), not from the UI's own report. Every other UI test boots
//  straight to the board: first run is shown only with
//  `-pipUITestFirstRun`.
//
//  Screenshots land in /tmp/pipaac-shots-e7/.
//

import SQLite3
import UIKit
import XCTest

final class FirstRunUITests: XCTestCase {
    private var dir: URL!
    private var face: URL!

    override func setUpWithError() throws {
        continueAfterFailure = false
        dir = FileManager.default.temporaryDirectory
            .appendingPathComponent("pip-e7-\(UUID().uuidString)", isDirectory: true)
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        try FileManager.default.createDirectory(
            atPath: "/tmp/pipaac-shots-e7", withIntermediateDirectories: true)
        // A real, decodable picture for the person's face.
        let img = UIGraphicsImageRenderer(size: CGSize(width: 96, height: 96)).image { c in
            UIColor(red: 0.8, green: 0.2, blue: 0.25, alpha: 1).setFill()
            c.fill(CGRect(x: 0, y: 0, width: 96, height: 96))
            UIColor.white.setFill()
            c.cgContext.fillEllipse(in: CGRect(x: 28, y: 20, width: 40, height: 40))
        }
        face = dir.appendingPathComponent("face.png")
        try XCTUnwrap(img.pngData()).write(to: face)
    }

    // MARK: disk readers (the instruments the app cannot influence)

    private struct Row: Decodable {
        let id: String, name: String
        var needsSetup: Bool, audience: String?, tourDone: Bool?
    }
    private struct Doc: Decodable { let users: [Row] }

    private func people() throws -> [Row] {
        let data = try Data(contentsOf: dir.appendingPathComponent("people.json"))
        return try JSONDecoder().decode(Doc.self, from: data).users
    }

    private func query(_ sql: String) throws -> [[String]] {
        let id = try XCTUnwrap(people().first).id
        var db: OpaquePointer?
        let path = dir.appendingPathComponent("Users/\(id).sqlite").path
        XCTAssertEqual(sqlite3_open_v2(path, &db, SQLITE_OPEN_READONLY, nil), SQLITE_OK)
        defer { sqlite3_close(db) }
        var st: OpaquePointer?
        XCTAssertEqual(sqlite3_prepare_v2(db, sql, -1, &st, nil), SQLITE_OK, sql)
        defer { sqlite3_finalize(st) }
        var rows: [[String]] = []
        while sqlite3_step(st) == SQLITE_ROW {
            rows.append((0..<sqlite3_column_count(st)).map {
                sqlite3_column_text(st, $0).map { String(cString: $0) } ?? ""
            })
        }
        return rows
    }

    // MARK: helpers

    private func launch(reset: Bool, world: Bool = false) -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments = (reset ? ["-pipUITestReset"] : [])
            + ["-PipDataDir", dir.path, "-pipUITestFirstRun", "-pipUITestPhotoFile", face.path]
            + (world ? ["-pipUITestFirstRunWorld"] : [])
        app.launch()
        return app
    }

    private func shot(_ app: XCUIApplication, _ name: String) {
        let s = app.screenshot()
        try? s.pngRepresentation.write(to: URL(fileURLWithPath: "/tmp/pipaac-shots-e7/\(name).png"))
        let a = XCTAttachment(screenshot: s)
        a.name = name
        a.lifetime = .keepAlways
        add(a)
    }

    private func tap(_ app: XCUIApplication, _ id: String, timeout: TimeInterval = 20) {
        let b = app.buttons[id]
        XCTAssertTrue(b.waitForExistence(timeout: timeout), "\(id) never appeared")
        b.tap()
    }

    // MARK: tests

    /// PF-2 + PF-3 + PF-4: the whole walk, then a relaunch.
    @MainActor
    func testWelcomeWorldTourBoard() throws {
        let app = launch(reset: true, world: true)

        // PF-2: the welcome. Nothing but the welcome is reachable behind it.
        let name = app.textFields["welcome:name"]
        XCTAssertTrue(name.waitForExistence(timeout: 30), "the welcome never showed on a fresh install")
        XCTAssertTrue(app.staticTexts["Let's set up Pip"].exists)
        XCTAssertTrue(app.staticTexts["Who's it for?"].exists)
        XCTAssertFalse(app.buttons["welcome:continue"].isEnabled, "Continue waits for a choice")
        shot(app, "01-welcome")
        name.tap()
        name.typeText("Maya")
        tap(app, "welcome:choice:adult")
        shot(app, "02-welcome-chosen")
        tap(app, "welcome:continue")

        // PF-2: the button look, for a teen or adult.
        XCTAssertTrue(app.staticTexts["How should the buttons look?"].waitForExistence(timeout: 10))
        XCTAssertTrue(app.staticTexts["You can change this any time in Settings."].exists)
        shot(app, "03-look")
        tap(app, "look:choice:label")
        tap(app, "look:continue")

        // PF-3: their world - a person with a photo.
        let title = app.staticTexts["world:title"]
        XCTAssertTrue(title.waitForExistence(timeout: 10))
        XCTAssertEqual(title.label, "Who does Maya call for?")
        tap(app, "world:face:0")
        let who = app.textFields["world:name:0"]
        who.tap()
        who.typeText("Grandma")
        shot(app, "04-world-people")
        tap(app, "world:next")
        XCTAssertTrue(app.staticTexts["Any pets?"].waitForExistence(timeout: 10))
        let list = app.textViews["world:list"]
        XCTAssertTrue(list.waitForExistence(timeout: 5))
        list.tap()
        list.typeText("Buddy")
        XCTAssertTrue(app.staticTexts["new — picture later"].waitForExistence(timeout: 10),
                      "the paste preview shows what the line becomes")
        shot(app, "05-world-pets")
        tap(app, "world:next")
        XCTAssertTrue(app.staticTexts["Favorite foods"].waitForExistence(timeout: 10))
        tap(app, "world:skip")
        XCTAssertTrue(app.staticTexts["Places they go"].waitForExistence(timeout: 10))
        tap(app, "world:skip")

        // PF-4 / SN-11: the demo, on the real board.
        XCTAssertTrue(app.staticTexts["tour:say"].waitForExistence(timeout: 20))
        XCTAssertEqual(app.staticTexts["tour:say"].label, "Tap you.")
        XCTAssertTrue(app.otherElements["tour:ring"].waitForExistence(timeout: 5), "the ring marks the tile")
        shot(app, "06-tour-you")
        app.buttons["tile:sns_0013"].tap()            // want: not the step's tile - ignored
        XCTAssertEqual(app.staticTexts["tour:say"].label, "Tap you.")
        app.buttons["tile:sns_0002"].tap()
        let wantSay = NSPredicate(format: "label == 'Tap want.'")
        expectation(for: wantSay, evaluatedWith: app.staticTexts["tour:say"])
        waitForExpectations(timeout: 10)
        app.buttons["tile:sns_0013"].tap()
        let apple = app.buttons["strip:sns_0128"]
        XCTAssertTrue(apple.waitForExistence(timeout: 10), "apple is offered in the Smart bar")
        shot(app, "07-tour-apple")
        apple.tap()
        // The real ✨ icon button, not text.
        let fix = app.buttons["Fix it"]
        XCTAssertTrue(fix.waitForExistence(timeout: 10))
        XCTAssertTrue(app.otherElements["tour:ring"].exists)
        shot(app, "08-tour-fix")
        fix.tap()
        XCTAssertTrue(app.staticTexts["apple."].waitForExistence(timeout: 10), "✨ made it 'You want an apple.'")
        shot(app, "09-tour-ask")
        app.buttons["Ask it"].tap()
        XCTAssertTrue(app.staticTexts["apple?"].waitForExistence(timeout: 10), "❓ made it 'Do you want an apple?'")
        XCTAssertTrue(app.buttons["tour:go"].waitForExistence(timeout: 10))
        XCTAssertTrue(app.buttons["tour:voices"].exists)
        shot(app, "10-tour-done")
        app.buttons["tour:go"].tap()

        // The board, with the person on it and the look applied.
        let want = app.buttons["tile:sns_0013"]
        XCTAssertTrue(want.waitForExistence(timeout: 10))
        XCTAssertFalse(app.buttons["tour:go"].exists)
        let entity = try XCTUnwrap(query(
            "SELECT id FROM personal_entity WHERE spoken_name='Grandma'").first?.first)
        let cell = app.buttons["tile:\(entity)"]
        XCTAssertTrue(cell.waitForExistence(timeout: 10), "Grandma's cell is on the board")
        XCTAssertEqual(cell.value as? String, "family photo", "...wearing the photo that was picked")
        shot(app, "11-board-words-only")

        // The writes, read from the files.
        XCTAssertEqual(try query("SELECT presentation_mode FROM learner_profile WHERE id='prf_local'").first?.first,
                       "label", "the look was saved to the synced profile")
        XCTAssertEqual(try query("SELECT person_name FROM learner_profile WHERE id='prf_local'").first?.first, "Maya")
        let photo = try XCTUnwrap(query("SELECT photo_key FROM personal_entity WHERE id='\(entity)'").first?.first)
        XCTAssertTrue(photo.hasPrefix("blob:"), photo)
        XCTAssertEqual(try query("SELECT count(*) FROM group_membership WHERE group_id='grp_people' AND item_id='\(entity)'").first?.first, "1")
        XCTAssertEqual(try query("SELECT count(*) FROM personal_entity WHERE spoken_name='Buddy'").first?.first, "1")
        XCTAssertEqual(try query("SELECT count(*) FROM learner_event_log").first?.first, "0",
                       "the demo logged nothing")
        let row = try XCTUnwrap(people().first)
        XCTAssertEqual(row.name, "Maya")
        XCTAssertEqual(row.audience, "adult")
        XCTAssertFalse(row.needsSetup)
        XCTAssertEqual(row.tourDone, true)
        app.terminate()

        // A relaunch: first run is over.
        let again = launch(reset: false)
        XCTAssertTrue(again.buttons["tile:sns_0013"].waitForExistence(timeout: 30), "the board opens")
        XCTAssertFalse(again.textFields["welcome:name"].exists)
        XCTAssertFalse(again.staticTexts["tour:say"].exists)
        XCTAssertEqual(again.buttons["tile:\(entity)"].value as? String, "family photo")
        shot(again, "12-relaunch-board")
    }

    /// The web's path: welcome -> demo (no "their world" by itself), skip the demo.
    @MainActor
    func testSkipAndRelaunch() throws {
        let app = launch(reset: true)
        XCTAssertTrue(app.textFields["welcome:name"].waitForExistence(timeout: 30))
        tap(app, "welcome:choice:child")
        tap(app, "welcome:continue")
        // A child has no look question, and first run never opens their world: straight to the demo.
        XCTAssertTrue(app.staticTexts["tour:say"].waitForExistence(timeout: 20))
        XCTAssertFalse(app.staticTexts["world:title"].exists, "the web opens their world only from Settings")
        shot(app, "20-skip-tour")
        tap(app, "tour:skip")
        XCTAssertTrue(app.buttons["tile:sns_0013"].waitForExistence(timeout: 10))
        XCTAssertFalse(app.staticTexts["tour:say"].exists)
        XCTAssertEqual(try query("SELECT presentation_mode FROM learner_profile WHERE id='prf_local'").first?.first,
                       "symbol", "no look question: the default stands")
        XCTAssertEqual(try query("SELECT count(*) FROM personal_entity WHERE status='active'").first?.first, "0",
                       "skipping wrote no words")
        let row = try XCTUnwrap(people().first)
        XCTAssertFalse(row.needsSetup)
        XCTAssertEqual(row.audience, "child")
        XCTAssertEqual(row.tourDone, true)
        app.terminate()

        let again = launch(reset: false)
        XCTAssertTrue(again.buttons["tile:sns_0013"].waitForExistence(timeout: 30))
        XCTAssertFalse(again.textFields["welcome:name"].exists)
    }
}
