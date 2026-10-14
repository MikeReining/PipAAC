//
//  PeopleUITests.swift
//  PipAACUITests
//
//  D1 works test (phase 044 PF-5..7): several people on one iPad. The
//  app runs with `-PipDataDir <tmp>` so this test reads the registry
//  and each person's SQLite file itself - the claims below are about
//  bytes on disk, not the UI's own report.
//

import SQLite3
import XCTest

final class PeopleUITests: XCTestCase {
    private var dir: URL!

    override func setUpWithError() throws {
        continueAfterFailure = false
        dir = FileManager.default.temporaryDirectory
            .appendingPathComponent("pip-d1-\(UUID().uuidString)", isDirectory: true)
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
    }

    // MARK: disk readers

    private struct Row: Decodable { let id: String; let name: String; let home: Bool }
    private struct Doc: Decodable { let users: [Row] }

    private func registry() throws -> [Row] {
        let data = try Data(contentsOf: dir.appendingPathComponent("people.json"))
        return try JSONDecoder().decode(Doc.self, from: data).users
    }

    private func file(_ id: String) -> String {
        dir.appendingPathComponent("Users/\(id).sqlite").path
    }

    /// Taps a person's file recorded (learner_event_log rows).
    private func taps(_ id: String) -> Int {
        var db: OpaquePointer?
        guard sqlite3_open_v2(file(id), &db, SQLITE_OPEN_READONLY, nil) == SQLITE_OK else { return -1 }
        defer { sqlite3_close(db) }
        var st: OpaquePointer?
        guard sqlite3_prepare_v2(db, "SELECT COUNT(*) FROM learner_event_log", -1, &st, nil) == SQLITE_OK
        else { return -1 }
        defer { sqlite3_finalize(st) }
        return sqlite3_step(st) == SQLITE_ROW ? Int(sqlite3_column_int(st, 0)) : -1
    }

    private func launch() -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments = ["-PipDataDir", dir.path]
        app.launch()
        return app
    }

    private func openPeople(_ app: XCUIApplication) {
        app.buttons["settingsGear"].tap()
        XCTAssertTrue(app.buttons["settings:people"].waitForExistence(timeout: 10))
        app.buttons["settings:people"].tap()
        XCTAssertTrue(app.buttons["people:add"].waitForExistence(timeout: 10))
    }

    private func closeSettings(_ app: XCUIApplication) {
        // Back to the Settings root, then Done.
        if app.navigationBars.buttons.firstMatch.exists, !app.buttons["settingsDone"].exists {
            app.navigationBars.buttons.firstMatch.tap()
        }
        app.buttons["settingsDone"].tap()
    }

    func testSeveralPeopleOnOneIPad() throws {
        var app = launch()
        XCTAssertTrue(app.buttons["want"].waitForExistence(timeout: 30))

        // Fresh install: one person, home - opened straight to the board.
        var rows = try registry()
        XCTAssertEqual(rows.count, 1)
        XCTAssertTrue(rows[0].home)
        let first = rows[0].id
        let firstBase = taps(first)
        XCTAssertTrue(FileManager.default.fileExists(atPath: file(first)))

        // Add "Sam": lands on Sam's board.
        openPeople(app)
        app.buttons["people:add"].tap()
        let alert = app.alerts["Name this person"]
        XCTAssertTrue(alert.waitForExistence(timeout: 5))
        alert.textFields.firstMatch.tap()
        alert.textFields.firstMatch.typeText("Sam")
        alert.buttons["Add"].firstMatch.tap()
        XCTAssertTrue(app.buttons["tile:sns_0013"].waitForExistence(timeout: 30))
        rows = try registry()
        XCTAssertEqual(rows.count, 2)
        let sam = try XCTUnwrap(rows.first { $0.name == "Sam" })
        let samBase = taps(sam.id)
        XCTAssertFalse(sam.home, "an added person does not take 'opens first'")
        XCTAssertTrue(FileManager.default.fileExists(atPath: file(sam.id)))

        // Sam taps a word: Sam's file records it, the first person's does not.
        app.buttons["tile:sns_0013"].tap()
        XCTAssertTrue(app.buttons["Backspace"].waitForExistence(timeout: 10))
        XCTAssertTrue(app.buttons["Backspace"].isEnabled)
        let deadline = Date().addingTimeInterval(10)
        while taps(sam.id) < samBase + 1, Date() < deadline { usleep(200_000) }
        XCTAssertEqual(taps(sam.id), samBase + 1)
        XCTAssertEqual(taps(first), firstBase)

        // Switch back to the first person: their own empty bar, no Sam tap.
        openPeople(app)
        app.buttons["Switch to Unnamed"].tap()
        XCTAssertTrue(app.staticTexts["Tap a word to start."].waitForExistence(timeout: 30))
        XCTAssertFalse(app.buttons["Backspace"].isEnabled)
        XCTAssertEqual(taps(first), firstBase)
        XCTAssertEqual(taps(sam.id), samBase + 1)

        // Relaunch: the home person (the first) opens, not the last one added.
        app.terminate()
        app = launch()
        XCTAssertTrue(app.buttons["want"].waitForExistence(timeout: 30))
        openPeople(app)
        XCTAssertTrue(app.staticTexts["Open now · Opens first"].exists)
        XCTAssertTrue(app.buttons["Switch to Sam"].exists)

        // "When Pip opens" > "Show the list": relaunch asks who's talking.
        app.buttons["people:opens"].tap()
        app.buttons["Show the list"].tap()
        XCTAssertFalse(try registry().contains { $0.home })
        app.terminate()
        app = launch()
        XCTAssertTrue(app.staticTexts["Who's talking?"].waitForExistence(timeout: 30))
        XCTAssertEqual(app.buttons.matching(identifier: "launchPerson").count, 2)
        app.buttons.matching(identifier: "launchPerson").element(boundBy: 0).tap() // Unnamed: last opened
        XCTAssertTrue(app.buttons["want"].waitForExistence(timeout: 30))

        // Remove Sam (confirm with the web's copy): the file is gone from disk.
        openPeople(app)
        app.buttons["Remove Sam"].tap()
        XCTAssertTrue(app.alerts["Remove Sam from this device?"].waitForExistence(timeout: 5))
        app.alerts.buttons["Remove"].firstMatch.tap()
        let gone = Date().addingTimeInterval(10)
        while FileManager.default.fileExists(atPath: file(sam.id)), Date() < gone { usleep(200_000) }
        XCTAssertFalse(FileManager.default.fileExists(atPath: file(sam.id)))
        XCTAssertEqual(try registry().map(\.id), [first])
        XCTAssertTrue(FileManager.default.fileExists(atPath: file(first)))
        XCTAssertFalse(app.buttons["Switch to Sam"].exists)

        // Shot for the report.
        let shot = XCTAttachment(screenshot: app.screenshot())
        shot.name = "people-after-remove"; shot.lifetime = .keepAlways
        add(shot)
    }
}
