//
//  SyncE2ETests.swift
//  PipAACUITests
//
//  044 C3 Works Test: link this iPad with another device and sync both
//  ways. NOT a standalone test - it needs the local Worker and the node
//  "web device" that scripts/ios/e2e_sync.sh starts (real sync.mjs +
//  real WebCrypto against the local relay). They talk through files in
//  PIP_E2E_DIR. Without that variable every test here skips.
//
//  What is measured, and by whom:
//   - the node peer's database is read by the node peer;
//   - the iPad's database FILE is read here (sqlite3) and, at the end,
//     dumped by e2e_dump.mjs - never by the app;
//   - the screen is read through accessibility.
//

import SQLite3
import XCTest

final class SyncE2ETests: XCTestCase {
    private var dir: URL!
    private var base: String!
    private var data: URL!

    override func setUpWithError() throws {
        continueAfterFailure = false
        guard let d = ProcessInfo.processInfo.environment["PIP_E2E_DIR"],
              let b = ProcessInfo.processInfo.environment["PIP_E2E_BASE"] else {
            throw XCTSkip("PIP_E2E_DIR/PIP_E2E_BASE not set - run scripts/ios/e2e_sync.sh")
        }
        dir = URL(fileURLWithPath: d, isDirectory: true)
        base = b
        data = dir.appendingPathComponent("ipad", isDirectory: true)
        try FileManager.default.createDirectory(at: data, withIntermediateDirectories: true)
    }

    // MARK: file protocol with the peer

    private func put(_ name: String, _ text: String = "1") {
        try? text.write(to: dir.appendingPathComponent(name), atomically: true, encoding: .utf8)
    }

    private func wait(_ name: String, _ timeout: TimeInterval = 120) throws -> String {
        let url = dir.appendingPathComponent(name)
        let end = Date().addingTimeInterval(timeout)
        while Date() < end {
            if let s = try? String(contentsOf: url, encoding: .utf8) { return s }
            if FileManager.default.fileExists(atPath: dir.appendingPathComponent("host-failed").path) {
                XCTFail("the peer failed: \((try? String(contentsOf: dir.appendingPathComponent("host-failed"))) ?? "?")")
                throw XCTSkip("peer failed")
            }
            Thread.sleep(forTimeInterval: 0.1)
        }
        XCTFail("timed out waiting for peer file \(name)")
        throw XCTSkip("timeout")
    }

    private func nowMs() -> Double { Date().timeIntervalSince1970 * 1000 }

    // MARK: disk readers (the iPad's own file, read by this process)

    private struct Row: Decodable { let id: String; let home: Bool }
    private struct Doc: Decodable { let users: [Row] }

    private func people() -> [Row] {
        guard let d = try? Data(contentsOf: data.appendingPathComponent("people.json")),
              let doc = try? JSONDecoder().decode(Doc.self, from: d) else { return [] }
        return doc.users
    }

    private func scalar(_ sql: String) -> String? {
        guard let id = people().first(where: { $0.home })?.id ?? people().first?.id else { return nil }
        var db: OpaquePointer?
        let path = data.appendingPathComponent("Users/\(id).sqlite").path
        guard sqlite3_open_v2(path, &db, SQLITE_OPEN_READONLY, nil) == SQLITE_OK else { return nil }
        defer { sqlite3_close(db) }
        var st: OpaquePointer?
        guard sqlite3_prepare_v2(db, sql, -1, &st, nil) == SQLITE_OK else { return nil }
        defer { sqlite3_finalize(st) }
        guard sqlite3_step(st) == SQLITE_ROW, let c = sqlite3_column_text(st, 0) else { return nil }
        return String(cString: c)
    }

    // MARK: app

    private func launch(reset: Bool, url: String? = nil) -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments = (reset ? ["-pipUITestReset"] : [])
            + ["-PipDataDir", data.path, "-PipBaseURL", url ?? base]
        app.launch()
        return app
    }

    /// Polls `cond` until true or `timeout`; returns elapsed seconds or nil.
    private func poll(_ timeout: TimeInterval, _ cond: () -> Bool) -> TimeInterval? {
        let start = Date()
        while Date().timeIntervalSince(start) < timeout {
            if cond() { return Date().timeIntervalSince(start) }
            Thread.sleep(forTimeInterval: 0.05)
        }
        return cond() ? Date().timeIntervalSince(start) : nil
    }

    /// Settings -> Team & devices -> Join with a code -> role -> code.
    private func joinWithCode(_ app: XCUIApplication, _ code: String) {
        app.buttons["settingsGear"].tap()
        XCTAssertTrue(app.buttons["settings:team"].waitForExistence(timeout: 10))
        app.buttons["settings:team"].tap()
        XCTAssertTrue(app.buttons["team:join"].waitForExistence(timeout: 10))
        XCTAssertEqual(app.staticTexts["team:status"].label, "Only on this device so far.")
        app.buttons["team:join"].tap()
        XCTAssertTrue(app.buttons["pair:role:board"].waitForExistence(timeout: 10))
        app.buttons["pair:role:board"].tap()
        let input = app.textFields["pair:input"]
        input.tap()
        input.typeText(code)
        XCTAssertTrue(app.staticTexts["pair:status"].waitForExistence(timeout: 10))
    }

    private func entityId() throws -> String {
        struct P: Decodable { let entityId: String }
        return try JSONDecoder().decode(P.self, from: Data(try wait("person.json").utf8)).entityId
    }

    private func attach(_ app: XCUIApplication, _ name: String) {
        let a = XCTAttachment(screenshot: app.screenshot())
        a.name = name
        a.lifetime = .keepAlways
        add(a)
    }

    // MARK: tests

    /// Type the peer's code -> linked -> its edits arrive without a
    /// relaunch -> this iPad's edit reaches it -> this iPad offers a code a
    /// third device uses (SY-3) -> all three databases are identical
    /// (the script diffs the dumps).
    func testLinkAndSyncBothWays() throws {
        let app = launch(reset: true)
        XCTAssertTrue(app.buttons["tile:sns_0013"].waitForExistence(timeout: 30))
        let code = try wait("code.txt").trimmingCharacters(in: .whitespacesAndNewlines)
        let ent = try entityId()

        joinWithCode(app, code)
        attach(app, "c3-joining")
        let tile = app.buttons["tile:\(ent)"]
        let arrived = tile.waitForExistence(timeout: 60)
        if !arrived { attach(app, "c3-join-stuck") }
        XCTAssertTrue(arrived, "the linked person's own word arrived")
        XCTAssertEqual(tile.label, "Zed")
        XCTAssertNotNil(poll(5) { self.people().count == 1 && self.people()[0].home },
                        "the placeholder was replaced by the linked person")
        attach(app, "c3-linked")
        put("ui-linked")

        // The peer renames the personal word and changes a synced setting.
        struct Edit: Decodable { let t0: Double; let name: String; let speech_rate: String }
        let edit = try JSONDecoder().decode(Edit.self, from: Data(try wait("peer-edit.json").utf8))
        let renamed = poll(5) { app.buttons["tile:\(ent)"].label == edit.name }
        let tName = nowMs() - edit.t0
        XCTAssertNotNil(renamed, "rename shows on the board within 5 s, no relaunch")
        let rateMs = nowMs()
        XCTAssertNotNil(poll(5) { self.scalar("SELECT speech_rate FROM learner_profile WHERE id='prf_local'") == edit.speech_rate },
                        "the synced setting landed in the iPad's file")
        let tRate = nowMs() - edit.t0
        _ = rateMs
        put("ui-saw-edit", "name_ms=\(Int(tName)) setting_ms=\(Int(tRate))")
        print("E2E-LATENCY desktop edit -> iPad board shows rename: \(Int(tName)) ms; setting in iPad file: \(Int(tRate)) ms")
        attach(app, "c3-peer-edit-arrived")

        // The iPad hides a word.
        app.buttons["settingsGear"].tap()
        app.buttons["editBoard"].tap()
        XCTAssertTrue(app.buttons["editDone"].waitForExistence(timeout: 10))
        app.buttons["tile:sns_0013"].tap()
        XCTAssertTrue(app.buttons["wc-hide"].waitForExistence(timeout: 10))
        app.buttons["wc-hide"].tap()
        XCTAssertTrue(app.staticTexts["editToastText"].waitForExistence(timeout: 5))
        app.buttons["editDone"].tap()
        XCTAssertTrue(app.buttons["tile:sns_0014"].waitForExistence(timeout: 10))
        XCTAssertFalse(app.buttons["tile:sns_0013"].exists)
        put("ui-hid", "{\"label\":\"want\"}")
        // A few child taps: stats_day rows travel too (SY-15).
        for _ in 0..<3 { app.buttons["tile:sns_0014"].tap() }
        app.buttons["Play"].tap()
        let seen = try wait("peer-saw-mask.json", 60)
        print("E2E-MASK peer saw the iPad's hide: \(seen)")

        // SY-3: this iPad offers a code; a third device (node) joins with it.
        app.buttons["settingsGear"].tap()
        app.buttons["settings:team"].tap()
        XCTAssertEqual(app.staticTexts["team:status"].label,
                       "Linked — this board syncs with the devices you added.")
        app.buttons["team:add"].tap()
        let codeLabel = app.staticTexts["pair:code"]
        XCTAssertTrue(codeLabel.waitForExistence(timeout: 30))
        let shown = codeLabel.label.replacingOccurrences(of: "Code ", with: "")
            .replacingOccurrences(of: " ", with: "")
        XCTAssertEqual(shown.count, 8)
        attach(app, "c3-offering-code")
        put("ipad-code.txt", shown)
        XCTAssertTrue(app.staticTexts["pair:done"].waitForExistence(timeout: 90),
                      "the third device was granted")
        attach(app, "c3-offer-done")
        _ = try wait("join-done", 90)

        // Settle: let the peers' acknowledgements and our stats flush.
        Thread.sleep(forTimeInterval: 6)
        put("ui-done")
        _ = try wait("host-done", 60)
    }

    /// The peer edits while this iPad is offline (relaunched against a
    /// dead relay); reconnecting catches up.
    func testOfflineCatchUp() throws {
        var app = launch(reset: true)
        XCTAssertTrue(app.buttons["tile:sns_0013"].waitForExistence(timeout: 30))
        let code = try wait("code.txt").trimmingCharacters(in: .whitespacesAndNewlines)
        let ent = try entityId()
        joinWithCode(app, code)
        XCTAssertTrue(app.buttons["tile:\(ent)"].waitForExistence(timeout: 60))
        XCTAssertEqual(app.buttons["tile:\(ent)"].label, "Zed")
        Thread.sleep(forTimeInterval: 3) // cursor + registry settle
        app.terminate()

        // Offline: relaunch against a port nothing listens on.
        put("ui-linked")
        struct Edit: Decodable { let t0: Double; let name: String; let speech_rate: String }
        let edit = try JSONDecoder().decode(Edit.self, from: Data(try wait("peer-edit.json").utf8))
        app = launch(reset: false, url: "http://127.0.0.1:1")
        XCTAssertTrue(app.buttons["tile:\(ent)"].waitForExistence(timeout: 30))
        Thread.sleep(forTimeInterval: 6)
        XCTAssertEqual(app.buttons["tile:\(ent)"].label, "Zed", "offline: the old name, no catch-up possible")
        XCTAssertNotEqual(scalar("SELECT speech_rate FROM learner_profile WHERE id='prf_local'"), edit.speech_rate)
        attach(app, "c3-offline")
        app.terminate()

        // Reconnect: relaunch against the relay.
        let t1 = nowMs()
        app = launch(reset: false)
        let caught = poll(30) { app.buttons["tile:\(ent)"].label == edit.name }
        XCTAssertNotNil(caught, "reconnecting catches up the missed rename")
        XCTAssertNotNil(poll(10) { self.scalar("SELECT speech_rate FROM learner_profile WHERE id='prf_local'") == edit.speech_rate })
        print("E2E-LATENCY offline catch-up after relaunch: \(Int(nowMs() - t1)) ms")
        attach(app, "c3-caught-up")
        put("ui-saw-edit")
        Thread.sleep(forTimeInterval: 3)
        put("ui-done")
        _ = try wait("host-done", 60)
    }
}
