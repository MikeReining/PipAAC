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

import CoreImage.CIFilterBuiltins
import SQLite3
import UIKit
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
        XCTAssertTrue(app.buttons["settingsSection:team"].waitForExistence(timeout: 10))
        app.buttons["settingsSection:team"].tap()   // E4: the Team & devices page
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
        app.buttons["settingsSection:team"].tap()   // E4: the Team & devices page
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
    /// Settings -> Edit the board (the PIN gate is off on a fresh device).
    private func enterEditing(_ app: XCUIApplication) {
        app.buttons["settingsGear"].tap()
        XCTAssertTrue(app.buttons["editBoard"].waitForExistence(timeout: 10))
        app.buttons["editBoard"].tap()
        XCTAssertTrue(app.buttons["editDone"].waitForExistence(timeout: 10))
    }

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

        // 044 E8 (LW-22): an edit made with the relay gone is honestly "not saved
        // anywhere else yet" - never "Saved".
        enterEditing(app)
        XCTAssertTrue(app.staticTexts["editStatus"].waitForExistence(timeout: 10))
        app.buttons["tile:sns_0013"].tap()
        XCTAssertTrue(app.buttons["wc-hide"].waitForExistence(timeout: 10))
        app.buttons["wc-hide"].tap()
        // (editorStatus's own order: a failed catch-up against the dead relay
        // outranks "Offline" - the web function, unchanged.)
        XCTAssertNotNil(poll(10) {
            ["Saving…", "Offline — will sync", "Couldn't apply an update — keep this open"]
                .contains(app.staticTexts["editStatus"].label) },
                        "offline with an unsent edit the status is pending, not Saved: \(app.staticTexts["editStatus"].label)")
        attach(app, "e8-status-pending")
        app.terminate()

        // Reconnect: relaunch against the relay.
        let t1 = nowMs()
        app = launch(reset: false)
        let caught = poll(30) { app.buttons["tile:\(ent)"].label == edit.name }
        XCTAssertNotNil(caught, "reconnecting catches up the missed rename")
        XCTAssertNotNil(poll(10) { self.scalar("SELECT speech_rate FROM learner_profile WHERE id='prf_local'") == edit.speech_rate })
        print("E2E-LATENCY offline catch-up after relaunch: \(Int(nowMs() - t1)) ms")
        attach(app, "c3-caught-up")

        // ... and once the relay has accepted it, the same line turns to "✓ Saved".
        enterEditing(app)
        XCTAssertNotNil(poll(60) { app.staticTexts["editStatus"].label == "✓ Saved" },
                        "the pending edit was sent: \(app.staticTexts["editStatus"].label)")
        XCTAssertEqual(scalar("SELECT COUNT(*) FROM sync_op WHERE relay_seq IS NULL"), "0",
                       "the iPad's own file agrees: nothing is waiting")
        attach(app, "e8-status-saved")
        put("ui-saw-edit")
        Thread.sleep(forTimeInterval: 3)
        put("ui-done")
        _ = try wait("host-done", 60)
    }

    // MARK: 044 C5 - the recovery card and supporter accounts

    /// Settings -> Backup & privacy -> Restore from a card.
    private func openRestore(_ app: XCUIApplication) {
        app.buttons["settingsGear"].tap()
        XCTAssertTrue(app.buttons["settingsSection:backup"].waitForExistence(timeout: 10))
        app.buttons["settingsSection:backup"].tap()
        XCTAssertTrue(app.buttons["backup:restore"].waitForExistence(timeout: 10))
        app.buttons["backup:restore"].tap()
    }

    /// The 12 words on the card sheet, read off the screen ("Word 3, able").
    private func cardWords(_ app: XCUIApplication) -> String {
        (1...12).map { app.staticTexts["rec:word:\($0)"].label.components(separatedBy: ", ").last ?? "" }
            .joined(separator: " ")
    }

    private func cardShownAtIsSet() -> Bool {
        guard let d = try? Data(contentsOf: data.appendingPathComponent("people.json")),
              let o = try? JSONSerialization.jsonObject(with: d) as? [String: Any],
              let users = o["users"] as? [[String: Any]] else { return false }
        return users.contains { ($0["cardShownAt"] as? Double ?? 0) > 0 }
    }

    /// After a restore: the person is the home person and the only one, the
    /// peer's rename and setting arrived, and the card on THIS iPad shows the
    /// same 12 words (the words came back); then Replace card gives new ones.
    private func verifyRestored(_ app: XCUIApplication, words: String, ent: String) throws {
        XCTAssertTrue(app.buttons["tile:\(ent)"].waitForExistence(timeout: 90), "the restored person's own word arrived")
        XCTAssertEqual(app.buttons["tile:\(ent)"].label, "Zedd", "the peer's rename was in the restored copy")
        XCTAssertNotNil(poll(10) { self.people().count == 1 && self.people()[0].home },
                        "the fresh placeholder was replaced by the restored person")
        XCTAssertNotNil(poll(10) { self.scalar("SELECT speech_rate FROM learner_profile WHERE id='prf_local'") == "faster" },
                        "the synced setting is in the iPad's own file")
        attach(app, "c5-restored")

        // The card on this iPad: same 12 words as the card that restored it.
        app.buttons["settingsGear"].tap()
        XCTAssertTrue(app.buttons["settingsSection:backup"].waitForExistence(timeout: 10))
        app.buttons["settingsSection:backup"].tap()
        app.buttons["backup:card"].tap()
        XCTAssertTrue(app.images["rec:qr"].waitForExistence(timeout: 30))
        let before = words.trimmingCharacters(in: .whitespacesAndNewlines)
        XCTAssertEqual(cardWords(app), before, "the card shows the same words it was restored from")
        attach(app, "c5-card")
        XCTAssertNotNil(poll(10) { self.cardShownAtIsSet() }, "the registry remembers the card was shown")

        // Replace card: new words, and the relay accepts the new root.
        app.buttons["rec:replace"].tap()
        XCTAssertTrue(app.buttons["rec:replaceConfirm"].firstMatch.waitForExistence(timeout: 10))
        app.buttons["rec:replaceConfirm"].firstMatch.tap()
        let changed = poll(60) { self.cardWords(app) != before && !self.cardWords(app).contains("  ") }
        XCTAssertNotNil(changed, "Replace card shows a different set of 12 words")
        XCTAssertFalse(app.staticTexts["rec:replaceNote"].exists, "no 'unfinished' note: the relay took the new card")
        attach(app, "c5-card-replaced")
    }

    /// SY-10 + SY-9 + SY-13: a fresh install restores from the card's WORDS
    /// (typed into the paste box), the person arrives, the dumps match.
    func testRestoreFromWords() throws {
        let app = launch(reset: true)
        XCTAssertTrue(app.buttons["tile:sns_0013"].waitForExistence(timeout: 30))
        let words = try wait("words.txt")
        let ent = try entityId()
        openRestore(app)
        let box = app.textViews["rec:paste"]
        XCTAssertTrue(box.waitForExistence(timeout: 10))
        box.tap()
        box.typeText(words)
        attach(app, "c5-restore-words")
        app.buttons["rec:restore"].tap()
        try verifyRestored(app, words: words, ent: ent)
        Thread.sleep(forTimeInterval: 4) // acknowledgements flush
        put("ui-done")
        _ = try wait("host-done", 60)
    }

    /// SY-10 (scan): the card's QR as an IMAGE through the injectable scan
    /// source (the simulator has no camera). The image is generated here from
    /// the link the peer wrote; the app must read the QR back out of pixels.
    func testRestoreByScanningTheCard() throws {
        let link = try wait("link.txt").trimmingCharacters(in: .whitespacesAndNewlines)
        let words = try wait("words.txt")
        let ent = try entityId()
        let png = dir.appendingPathComponent("card-scan.png")
        let f = CIFilter.qrCodeGenerator()
        f.message = Data(link.utf8)
        f.correctionLevel = "M"
        let img = f.outputImage!.transformed(by: CGAffineTransform(scaleX: 8, y: 8))
        let ui = UIImage(cgImage: CIContext().createCGImage(img, from: img.extent)!)
        try ui.pngData()!.write(to: png)

        let app = XCUIApplication()
        app.launchArguments = ["-pipUITestReset", "-PipDataDir", data.path, "-PipBaseURL", base,
                               "-PipScanImage", png.path]
        app.launch()
        XCTAssertTrue(app.buttons["tile:sns_0013"].waitForExistence(timeout: 30))
        openRestore(app)
        XCTAssertTrue(app.buttons["restore:scan"].waitForExistence(timeout: 10))
        attach(app, "c5-restore-scan")
        app.buttons["restore:scan"].tap()
        try verifyRestored(app, words: words, ent: ent)
        Thread.sleep(forTimeInterval: 4)
        put("ui-done")
        _ = try wait("host-done", 60)
    }
}
