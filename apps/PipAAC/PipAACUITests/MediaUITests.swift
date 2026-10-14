//
//  MediaUITests.swift
//  PipAACUITests
//
//  E3 works tests (phase 044 PP-4, PP-7, PP-8, LW-19): a photo for a word,
//  the family's voice for a word, a person photo. The app runs with
//  `-PipDataDir <tmp>`, so every claim below is read from the files the
//  app wrote - the person's SQLite, the blob folder, people.json - not
//  from the UI's own report.
//
//  SETUP (once per simulator, scripts do this): the photo tests pick from
//  the simulator's photo library, so a known image must be in it:
//    xcrun simctl addmedia <udid> /tmp/pipaac-shots-e3/test-red.png
//  The simulator has no microphone, so the voice test feeds a WAV the test
//  wrote through the recorder's injectable capture source
//  (`-pipUITestVoiceFile`) - the same save path a real take uses.
//

import CryptoKit
import SQLite3
import XCTest

final class MediaUITests: XCTestCase {
    private var dir: URL!

    override func setUpWithError() throws {
        continueAfterFailure = false
        dir = FileManager.default.temporaryDirectory
            .appendingPathComponent("pip-e3-\(UUID().uuidString)", isDirectory: true)
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
    }

    // MARK: disk readers

    private func sha256(_ d: Data) -> String {
        SHA256.hash(data: d).map { String(format: "%02x", $0) }.joined()
    }

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

    /// The blob a `blob:<sha>` key names: it exists, and its bytes hash to
    /// the sha in the key (content-addressed, the web's format).
    private func blobBytes(_ key: String) throws -> Data {
        XCTAssertTrue(key.hasPrefix("blob:"), key)
        let sha = String(key.dropFirst(5))
        let file = dir.appendingPathComponent("blobs/\(sha)")
        XCTAssertTrue(FileManager.default.fileExists(atPath: file.path), "blob file on disk")
        let bytes = try Data(contentsOf: file)
        XCTAssertEqual(sha256(bytes), sha, "the file name is the SHA-256 of its bytes")
        return bytes
    }

    private func launch(_ extra: [String] = []) -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments = ["-pipUITestReset", "-PipDataDir", dir.path] + extra
        app.launch()
        return app
    }

    private func enterEdit(_ app: XCUIApplication) {
        app.buttons["settingsGear"].tap()
        XCTAssertTrue(app.buttons["editBoard"].waitForExistence(timeout: 10))
        app.buttons["editBoard"].tap()
        XCTAssertTrue(app.buttons["editDone"].waitForExistence(timeout: 10))
    }

    private func shot(_ app: XCUIApplication, _ name: String) {
        let a = XCTAttachment(screenshot: app.screenshot())
        a.name = name
        a.lifetime = .keepAlways
        add(a)
    }

    /// The Photo tile is a menu where the iPad has a camera: Choose a photo.
    private func choosePhoto(_ app: XCUIApplication, from id: String) {
        app.buttons[id].tap()
        let choose = app.buttons["Choose a photo"]
        if choose.waitForExistence(timeout: 3) { choose.tap() }
        pickFirstPhoto(app)
    }

    /// Picks the first photo in the system picker.
    private func pickFirstPhoto(_ app: XCUIApplication) {
        // The system picker is a remote view with no usable accessibility
        // tree for its cells; the simulator's library opens with our added
        // red image first (top-left cell), so tap that point.
        XCTAssertTrue(app.buttons["Library"].waitForExistence(timeout: 30)
                      || app.staticTexts["Photos"].waitForExistence(timeout: 5), "the picker opened")
        sleep(2)
        shot(app, "e3-picker")
        app.coordinate(withNormalizedOffset: CGVector(dx: 0.436, dy: 0.449)).tap()
        // iOS 26's picker may ask to confirm.
        let add = app.buttons["Add"]
        if add.waitForExistence(timeout: 2) { add.tap() }
    }

    // MARK: tests

    /// PP-4: pick a photo for "want" -> the tile wears it -> relaunch ->
    /// still there; the blob is on disk under its hash and the override op
    /// is recorded.
    @MainActor
    func testPickPhotoForAWordSurvivesRelaunch() throws {
        let app = launch()
        XCTAssertTrue(app.buttons["tile:sns_0013"].waitForExistence(timeout: 30))
        XCTAssertNotEqual(app.buttons["tile:sns_0013"].value as? String, "family photo")
        enterEdit(app)
        app.buttons["tile:sns_0013"].tap()
        XCTAssertTrue(app.buttons["wc-photo"].waitForExistence(timeout: 10))
        shot(app, "e3-word-card-rows")
        choosePhoto(app, from: "wc-photo")
        shot(app, "e3-after-pick")

        XCTAssertTrue(app.buttons["wc-useours"].waitForExistence(timeout: 20),
                      "the card now offers Use our picture")
        app.buttons["wc-done"].tap()
        let tile = app.buttons["tile:sns_0013"]
        XCTAssertTrue(tile.waitForExistence(timeout: 10))
        let worn = expectation(for: NSPredicate(format: "value == 'family photo'"), evaluatedWith: tile)
        wait(for: [worn], timeout: 10)
        shot(app, "e3-tile-with-photo")
        app.buttons["editDone"].tap()

        // The disk, not the UI.
        let key = try XCTUnwrap(query(
            "SELECT photo_key FROM image_override WHERE sense_id='sns_0013' AND status='ready'").first?.first)
        let jpeg = try blobBytes(key)
        XCTAssertEqual(Array(jpeg.prefix(2)), [0xff, 0xd8], "stored as a JPEG")
        XCTAssertEqual(try query(
            "SELECT count(*) FROM sync_op WHERE kind='set_image_override' AND args LIKE '%\(key)%'").first?.first, "1")

        app.terminate()
        let again = XCUIApplication()
        again.launchArguments = ["-PipDataDir", dir.path]
        again.launch()
        XCTAssertTrue(again.buttons["tile:sns_0013"].waitForExistence(timeout: 30))
        XCTAssertEqual(again.buttons["tile:sns_0013"].value as? String, "family photo",
                       "the photo survives a relaunch")
    }

    /// PP-7 / LW-19: record a voice for "want" (a take fed through the
    /// injected capture source) -> Your voice is offered and plays instead
    /// of the catalog clip; switching to the board voice keeps the take.
    @MainActor
    func testRecordAVoiceForAWord() throws {
        // One second of 440 Hz, 16-bit mono WAV.
        let rate = 22050
        var pcm = Data()
        for i in 0..<rate {
            let v = Int16(8000 * sin(2 * Double.pi * 440 * Double(i) / Double(rate)))
            withUnsafeBytes(of: v.littleEndian) { pcm.append(contentsOf: $0) }
        }
        func le<T: FixedWidthInteger>(_ x: T) -> Data { withUnsafeBytes(of: x.littleEndian) { Data($0) } }
        var wav = Data("RIFF".utf8) + le(UInt32(36 + pcm.count)) + Data("WAVEfmt ".utf8)
        wav += le(UInt32(16)) + le(UInt16(1)) + le(UInt16(1)) + le(UInt32(rate))
        wav += le(UInt32(rate * 2)) + le(UInt16(2)) + le(UInt16(16)) + Data("data".utf8) + le(UInt32(pcm.count)) + pcm
        let take = dir.appendingPathComponent("take.wav")
        try wav.write(to: take)

        let app = launch(["-pipUITestVoiceFile", take.path, "-pipUITestProbe"])
        XCTAssertTrue(app.buttons["tile:sns_0013"].waitForExistence(timeout: 30))
        enterEdit(app)
        app.buttons["tile:sns_0013"].tap()
        let rec = app.buttons["wc-record"]
        XCTAssertTrue(rec.waitForExistence(timeout: 10))
        XCTAssertFalse(app.buttons["wc-voicemine"].exists, "no recording yet")
        app.buttons["wc-voicebase"].tap()
        XCTAssertTrue(app.staticTexts["wc-lastclip"].label.hasPrefix("audio/"),
                      "the board voice plays a catalog clip")

        rec.tap()
        XCTAssertTrue(NSPredicate(format: "label BEGINSWITH 'Stop'").evaluate(with: rec)
                      || rec.label == "Stop recording")
        shot(app, "e3-recording")
        rec.tap()
        XCTAssertTrue(app.buttons["wc-voicemine"].waitForExistence(timeout: 10), "Your voice is offered")
        shot(app, "e3-voice-row")

        let key = "blob:\(sha256(wav))"
        // The speaker layer: the clip the card played back is the take.
        let lastClip = app.staticTexts["wc-lastclip"]
        XCTAssertTrue(NSPredicate(format: "label == %@", key).evaluate(with: lastClip) || {
            _ = lastClip.waitForExistence(timeout: 5)
            return lastClip.label == key
        }(), "playback after Stop resolved to the recording blob; got \(lastClip.label)")
        // The disk: ready override, byte-identical blob.
        XCTAssertEqual(try query("SELECT key FROM clip_override WHERE status='ready'").first?.first, key)
        XCTAssertEqual(try blobBytes(key), wav)
        XCTAssertEqual(try query(
            "SELECT count(*) FROM sync_op WHERE kind='set_override' AND args LIKE '%\(key)%'").first?.first, "1")

        // Board voice and back: the take stays offered.
        app.buttons["wc-voicebase"].tap()
        XCTAssertTrue(app.buttons["wc-voicemine"].exists)
        XCTAssertEqual(try query("SELECT count(*) FROM clip_override WHERE status='ready'").first?.first, "0")
        app.buttons["wc-voicemine"].tap()
        XCTAssertEqual(try query("SELECT key FROM clip_override WHERE status='ready'").first?.first, key)
        app.buttons["wc-done"].tap()
        app.buttons["editDone"].tap()

        // Relaunch: the tile in the card still resolves to the recording.
        app.terminate()
        let again = XCUIApplication()
        again.launchArguments = ["-PipDataDir", dir.path, "-pipUITestProbe"]
        again.launch()
        XCTAssertTrue(again.buttons["tile:sns_0013"].waitForExistence(timeout: 30))
        enterEdit(again)
        again.buttons["tile:sns_0013"].tap()
        XCTAssertTrue(again.buttons["wc-tile"].waitForExistence(timeout: 10))
        again.buttons["wc-tile"].tap()
        let probe = again.staticTexts["wc-lastclip"]
        XCTAssertTrue(probe.waitForExistence(timeout: 5))
        XCTAssertTrue(NSPredicate(format: "label == %@", key).evaluate(with: probe) || {
            Thread.sleep(forTimeInterval: 1)
            return probe.label == key
        }(), "after relaunch the tile plays the family's recording; got \(probe.label)")
    }

    /// PP-8: a person photo from Settings -> the registry and the synced
    /// profile both name a blob that exists.
    @MainActor
    func testPersonPhoto() throws {
        let app = launch()
        XCTAssertTrue(app.buttons["tile:sns_0013"].waitForExistence(timeout: 30))
        app.buttons["settingsGear"].tap()
        XCTAssertTrue(app.buttons["settings:people"].waitForExistence(timeout: 10))
        app.buttons["settings:people"].tap()
        let add = app.buttons["person-photo"]
        XCTAssertTrue(add.waitForExistence(timeout: 10))
        choosePhoto(app, from: "person-photo")
        XCTAssertTrue(app.buttons["person-photo-rm"].waitForExistence(timeout: 20))
        shot(app, "e3-person-photo")

        struct Row: Decodable { let photo: String? }
        struct Doc: Decodable { let users: [Row] }
        let reg = try JSONDecoder().decode(
            Doc.self, from: Data(contentsOf: dir.appendingPathComponent("people.json")))
        let key = try XCTUnwrap(reg.users.first?.photo)
        _ = try blobBytes(key)
        XCTAssertEqual(try query("SELECT person_photo FROM learner_profile WHERE id='prf_local'").first?.first, key)

        app.buttons["person-photo-rm"].tap()
        XCTAssertTrue(NSPredicate(format: "label == 'Add a photo'").evaluate(with: app.buttons["person-photo"])
                      || app.buttons["person-photo"].waitForExistence(timeout: 5))
    }
}
