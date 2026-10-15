//
//  PicturesUITests.swift
//  PipAACUITests
//
//  E6 works tests (phase 044 PP-1, PP-2, PP-3, PP-5, PP-6, LW-5): finding a
//  picture, choosing it, drawing one, a pasted list, several photos. The
//  Worker is the in-process StubWorker (SayUITests.swift): no Jev, no
//  embedding model, no image model is reachable; every answer is canned and
//  every request is logged.
//
//  The instruments are not the UI's own claims: a board cell's accessibility
//  value ("family photo" - the file is on disk), the person's SQLite and the
//  blob folder read back from disk, and the stub's request log (what the
//  iPad SENT). The app runs with `-PipDataDir <tmp>`.
//

import CryptoKit
import SQLite3
import UIKit
import XCTest

final class PicturesUITests: XCTestCase {
    private var dir: URL!
    private var server: StubWorker!
    private let license = "pip-life-uitest"

    override func setUpWithError() throws {
        continueAfterFailure = false
        dir = FileManager.default.temporaryDirectory
            .appendingPathComponent("pip-e6-\(UUID().uuidString)", isDirectory: true)
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        server = try StubWorker()
    }

    override func tearDown() { server?.stop() }

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

    /// The bytes a `blob:<sha>` key names; the file name is their SHA-256.
    private func blobBytes(_ key: String) throws -> Data {
        XCTAssertTrue(key.hasPrefix("blob:"), key)
        let sha = String(key.dropFirst(5))
        let bytes = try Data(contentsOf: dir.appendingPathComponent("blobs/\(sha)"))
        XCTAssertEqual(sha256(bytes), sha, "the file name is the SHA-256 of its bytes")
        return bytes
    }

    // MARK: driving

    private func launch(_ extra: [String] = []) -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments = ["-pipUITestReset", "-PipDataDir", dir.path,
                               "-PipBaseURL", "http://127.0.0.1:\(server.port)",
                               "-pipUITestLicense", license] + extra
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

    /// Polls `cond` (XCTest's own run loop keeps the app responsive).
    private func wait(_ what: String, timeout: TimeInterval = 20, _ cond: () throws -> Bool) rethrows {
        let end = Date().addingTimeInterval(timeout)
        while Date() < end {
            if try cond() { return }
            RunLoop.current.run(until: Date().addingTimeInterval(0.1))
        }
        XCTFail("timed out waiting for: \(what)")
    }

    private func typeFind(_ app: XCUIApplication, _ q: String) {
        let field = app.textFields["wc-desc"]
        XCTAssertTrue(field.waitForExistence(timeout: 10))
        field.tap()
        field.typeText(q)
        app.buttons["wc-findgo"].tap()
    }

    // MARK: tests

    /// PP-1 / PP-2 / PP-3 on a built-in word: Find "wanting" -> choose one
    /// -> the board tile wears it (read from the cell) -> Draw -> the tile
    /// wears the drawing, and the allowance on the card went down.
    @MainActor
    func testFindPickAndDrawForAWord() throws {
        let app = launch()
        XCTAssertTrue(app.buttons["tile:sns_0013"].waitForExistence(timeout: 30))
        XCTAssertNotEqual(app.buttons["tile:sns_0013"].value as? String, "family photo")
        enterEdit(app)
        app.buttons["tile:sns_0013"].tap()
        typeFind(app, "wanting")
        let red = app.buttons["wc-result:img_red"]
        XCTAssertTrue(red.waitForExistence(timeout: 20), "the finder's matches show")
        XCTAssertTrue(app.buttons["wc-result:img_green"].exists)
        XCTAssertEqual(app.staticTexts["wc-drawcost"].label, "A drawing uses 1 of your 3 left.")
        shot(app, "e6-find-results")

        // The request the iPad sent: the web's body, with the person's license.
        let f = try XCTUnwrap(server.requests("/api/v1/pictures/find").first)
        XCTAssertEqual(f.body["text"] as? String, "wanting")
        XCTAssertEqual(f.body["license"] as? String, license)
        XCTAssertEqual(f.body["locale"] as? String, "en")
        XCTAssertNotNil(UUID(uuidString: try XCTUnwrap(f.body["user_id"] as? String)))

        red.tap()
        wait("the pick signal") { server.requests("/api/v1/pictures/pick").count == 1 }
        XCTAssertEqual(server.requests("/api/v1/pictures/pick").first?.body["image_id"] as? String, "img_red")
        app.buttons["wc-done"].tap()
        let tile = app.buttons["tile:sns_0013"]
        let worn = expectation(for: NSPredicate(format: "value == 'family photo'"), evaluatedWith: tile)
        wait(for: [worn], timeout: 15)
        shot(app, "e6-tile-with-picked-picture")

        // The disk: the override names a blob whose bytes are the candidate's.
        let key1 = try XCTUnwrap(query(
            "SELECT photo_key FROM image_override WHERE sense_id='sns_0013' AND status='ready'").first?.first)
        XCTAssertEqual(try blobBytes(key1), StubWorker.png(.red))
        XCTAssertEqual(try query(
            "SELECT count(*) FROM sync_op WHERE kind='set_image_override' AND args LIKE '%\(key1)%'").first?.first, "1")

        // Draw it for me: "Draw this" on those words.
        tile.tap()
        typeFind(app, "wanting")
        let draw = app.buttons["wc-draw-this"]
        XCTAssertTrue(draw.waitForExistence(timeout: 20))
        draw.tap()
        let line = app.staticTexts["wc-picstate"]
        XCTAssertTrue(line.waitForExistence(timeout: 30))
        wait("the drawing lands") { line.label == "Drawn for you · 2 drawings left" }
        shot(app, "e6-drawn")
        let d = try XCTUnwrap(server.requests("/api/v1/pictures/draw").first)
        XCTAssertEqual(d.body["text"] as? String, "want")
        XCTAssertEqual(d.body["description"] as? String, "wanting")
        XCTAssertEqual(d.body["license"] as? String, license)
        try wait("the override names the drawing") {
            let k = try query("SELECT photo_key FROM image_override WHERE sense_id='sns_0013' AND status='ready'").first?.first
            return k != nil && k != key1
        }
        let key2 = try XCTUnwrap(query(
            "SELECT photo_key FROM image_override WHERE sense_id='sns_0013' AND status='ready'").first?.first)
        XCTAssertEqual(try blobBytes(key2), StubWorker.png(.orange))
    }

    /// PP-1 / PP-2 on a family word: opening the card runs the finder; a close
    /// picture is applied free (the board cell wears it); choosing another
    /// sends the one reject for the picture we had chosen.
    @MainActor
    func testANewWordGetsItsPictureAndReplacingItIsRejectedOnce() throws {
        server.finds["Nana"] = [
            "candidates": [["image_id": "img_green", "asset": "/symbols/img_green.png", "source": "ours", "score": 0.95],
                           ["image_id": "img_blue", "asset": "/symbols/img_blue.png", "source": "ours", "score": 0.8]],
            "auto": "img_green", "scope": "common", "kind": "None", "language": "en", "calibrated": true,
        ]
        let app = launch(["-pipUITestSeedPerson", "Nana"])
        let cell = app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH 'tile:ent_'")).firstMatch
        XCTAssertTrue(cell.waitForExistence(timeout: 30))
        XCTAssertNotEqual(cell.value as? String, "family photo")
        enterEdit(app)
        cell.tap()

        let worn = expectation(for: NSPredicate(format: "value == 'family photo'"), evaluatedWith: cell)
        wait(for: [worn], timeout: 30)
        XCTAssertEqual(server.requests("/api/v1/pictures/draw").count, 0, "a close picture costs no drawing")
        let f = try XCTUnwrap(server.requests("/api/v1/pictures/find").first)
        XCTAssertEqual(f.body["text"] as? String, "Nana")
        let key = try XCTUnwrap(query("SELECT photo_key FROM personal_entity WHERE spoken_name='Nana'").first?.first)
        XCTAssertEqual(try blobBytes(key), StubWorker.png(.green))
        shot(app, "e6-new-word-picture")

        let alt = app.buttons["wc-pic:img_blue"]
        XCTAssertTrue(alt.waitForExistence(timeout: 20), "the finder's other matches are offered")
        alt.tap()
        wait("one reject") { server.requests("/api/v1/pictures/reject").count == 1 }
        let rj = try XCTUnwrap(server.requests("/api/v1/pictures/reject").first)
        XCTAssertEqual(rj.body["ours"] as? String, "img_green")
        XCTAssertEqual(rj.body["action"] as? String, "pick")
        XCTAssertEqual(rj.body["theirs"] as? String, "img_blue")
        try wait("the picture is the chosen one") {
            let k = try query("SELECT photo_key FROM personal_entity WHERE spoken_name='Nana'").first?.first ?? ""
            return k != key
        }
        let key2 = try XCTUnwrap(query("SELECT photo_key FROM personal_entity WHERE spoken_name='Nana'").first?.first)
        XCTAssertEqual(try blobBytes(key2), StubWorker.png(.blue))
        // Choosing the first back does not reject again.
        app.buttons["wc-pic:img_green"].tap()
        wait("a second pick") { server.requests("/api/v1/pictures/pick").count == 2 }
        XCTAssertEqual(server.requests("/api/v1/pictures/reject").count, 1)
    }

    /// LW-5 / PP-6: paste a list in the Library -> the preview says which
    /// rows are new, ours and drawn -> Add -> the words are in the Library,
    /// the close picture is applied, the rest is drawn.
    @MainActor
    func testPasteAListFillsTheLibraryAndTheirPictures() throws {
        server.finds["narwhal"] = [
            "candidates": [["image_id": "img_red", "asset": "/symbols/img_red.png", "source": "ours", "score": 0.95]],
            "auto": "img_red", "scope": "common", "kind": "None", "language": "en", "calibrated": true,
        ]
        let app = launch()
        XCTAssertTrue(app.buttons["tile:sns_0013"].waitForExistence(timeout: 30))
        enterEdit(app)
        app.buttons["editLibrary"].tap()
        XCTAssertTrue(app.buttons["lib-bulk"].waitForExistence(timeout: 10))
        app.buttons["lib-bulk"].tap()
        let paste = app.textViews["bulk-paste"]
        XCTAssertTrue(paste.waitForExistence(timeout: 10))
        paste.tap()
        paste.typeText("narwhal\nwombat\nwant\nNarwhal")

        // The preview: dedupe ("Narwhal" is "narwhal"), ours, new, drawn.
        XCTAssertTrue(app.staticTexts["bulk-tag:want"].waitForExistence(timeout: 10))
        XCTAssertEqual(app.staticTexts["bulk-tag:want"].label, "ours")
        wait("the finder labels the rows") {
            app.staticTexts["bulk-tag:narwhal"].label == "new" && app.staticTexts["bulk-tag:wombat"].label == "will draw"
        }
        XCTAssertFalse(app.otherElements["bulk-row:Narwhal"].exists)
        let add = app.buttons["bulk-add"]
        XCTAssertEqual(add.label, "Add 3 to My Words · draws 1 new picture")
        let fb = try XCTUnwrap(server.requests("/api/v1/pictures/find-batch").first)
        XCTAssertEqual((fb.body["items"] as? [[String: String]])?.map { $0["text"] ?? "" }, ["narwhal", "wombat"])
        shot(app, "e6-paste-list")

        add.tap()
        wait("the Library lists the new words") {
            app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH 'lib-row:entity:' AND label BEGINSWITH 'narwhal'")).count == 1
                && app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH 'lib-row:entity:' AND label BEGINSWITH 'wombat'")).count == 1
        }
        shot(app, "e6-library-after-paste")

        // The disk: the words, and their pictures filled in the background.
        XCTAssertEqual(try query("SELECT spoken_name FROM personal_entity WHERE status='active' ORDER BY spoken_name").map { $0[0] },
                       ["narwhal", "wombat"])
        try wait("both words have a picture") {
            try query("SELECT count(*) FROM personal_entity WHERE photo_key IS NOT NULL").first?.first == "2"
        }
        let nar = try XCTUnwrap(query("SELECT photo_key FROM personal_entity WHERE spoken_name='narwhal'").first?.first)
        let wom = try XCTUnwrap(query("SELECT photo_key FROM personal_entity WHERE spoken_name='wombat'").first?.first)
        XCTAssertEqual(try blobBytes(nar), StubWorker.png(.red), "the finder's close picture, free")
        XCTAssertEqual(try blobBytes(wom), StubWorker.png(.orange), "the drawn one")
        XCTAssertEqual(server.requests("/api/v1/pictures/draw").count, 1)
        XCTAssertEqual(server.requests("/api/v1/pictures/draw").first?.body["text"] as? String, "wombat")
        XCTAssertEqual(try query("SELECT count(*) FROM group_membership WHERE group_id='grp_my_words'").first?.first, "3")
    }

    /// PP-5: several photos become several words, only the named ones.
    /// (The photo files come in through the same save path the system picker
    /// uses; the picker itself is covered by testPhotosPickerBringsPhotos.)
    @MainActor
    func testSeveralPhotosBecomeSeveralWords() throws {
        let a = dir.appendingPathComponent("a.png"), b = dir.appendingPathComponent("b.png"),
            c = dir.appendingPathComponent("c.png")
        try StubWorker.png(.red).write(to: a)
        try StubWorker.png(.green).write(to: b)
        try StubWorker.png(.blue).write(to: c)
        let app = launch(["-pipUITestPhotoFiles", [a, b, c].map(\.path).joined(separator: ",")])
        XCTAssertTrue(app.buttons["tile:sns_0013"].waitForExistence(timeout: 30))
        enterEdit(app)
        app.buttons["editAdd"].tap()
        XCTAssertTrue(app.buttons["add-photos"].waitForExistence(timeout: 10))
        app.buttons["add-photos"].tap()
        let n0 = app.textFields["photo-name:0"]
        XCTAssertTrue(n0.waitForExistence(timeout: 10))
        XCTAssertEqual(app.staticTexts["photo-tag:0"].label, "needs a name")
        XCTAssertTrue(app.buttons["photo-save"].exists)
        XCTAssertFalse(app.buttons["photo-save"].isEnabled)
        n0.tap(); n0.typeText("Grandpa")
        let n2 = app.textFields["photo-name:2"]
        n2.tap(); n2.typeText("Dog park")
        XCTAssertEqual(app.buttons["photo-save"].label, "Save 2")
        shot(app, "e6-photo-drafts")
        app.buttons["photo-save"].tap()
        XCTAssertTrue(app.staticTexts["editToastText"].waitForExistence(timeout: 10))
        XCTAssertEqual(app.staticTexts["editToastText"].label, "Added 2 photos")

        let rows = try query("SELECT spoken_name, photo_key FROM personal_entity ORDER BY spoken_name")
        XCTAssertEqual(rows.map { $0[0] }, ["Dog park", "Grandpa"])
        XCTAssertEqual(Array(try blobBytes(rows[1][1]).prefix(2)), [0xff, 0xd8], "stored upright as a JPEG, like every family photo")
        // The files were re-encoded upright by the same photo path; they are the family's bytes.
        XCTAssertNotEqual(rows[0][1], rows[1][1])
        XCTAssertEqual(try query("SELECT count(*) FROM group_membership WHERE group_id='grp_my_words' AND item_kind='entity'").first?.first, "2")
        XCTAssertEqual(try query("SELECT count(*) FROM sync_op WHERE kind='create_entity' AND args LIKE '%blob:%'").first?.first, "2")
    }

    /// PP-5 with the real system picker (multi-select): one photo chosen.
    /// The simulator's library needs a known image first:
    ///   xcrun simctl addmedia <udid> <png>
    @MainActor
    func testPhotosPickerBringsPhotos() throws {
        let app = launch()
        XCTAssertTrue(app.buttons["tile:sns_0013"].waitForExistence(timeout: 30))
        enterEdit(app)
        app.buttons["editAdd"].tap()
        XCTAssertTrue(app.buttons["add-photos"].waitForExistence(timeout: 10))
        app.buttons["add-photos"].tap()
        XCTAssertTrue(app.buttons["Library"].waitForExistence(timeout: 30)
                      || app.staticTexts["Photos"].waitForExistence(timeout: 5), "the picker opened")
        sleep(2)
        shot(app, "e6-photos-picker")
        app.coordinate(withNormalizedOffset: CGVector(dx: 0.436, dy: 0.449)).tap()
        let add = app.buttons["Add"]
        if add.waitForExistence(timeout: 3) { add.tap() }
        let name = app.textFields["photo-name:0"]
        XCTAssertTrue(name.waitForExistence(timeout: 20), "the chosen photo waits for a name")
        name.tap(); name.typeText("Beach")
        app.buttons["photo-save"].tap()
        XCTAssertTrue(app.staticTexts["editToastText"].waitForExistence(timeout: 10))
        let key = try XCTUnwrap(query("SELECT photo_key FROM personal_entity WHERE spoken_name='Beach'").first?.first)
        XCTAssertEqual(Array(try blobBytes(key).prefix(2)), [0xff, 0xd8], "stored as a JPEG")
    }
}
