//
//  SyncMediaE2ETests.swift
//  PipAACUITests
//
//  044 C4 Works Tests, driven by scripts/ios/e2e_sync.sh (local Worker +
//  the switchable proxy scripts/ios/e2e_proxy.mjs + node "web devices").
//  Skipped without PIP_E2E_DIR / PIP_E2E_BASE.
//
//  testMediaBothWays      a photo and a recording set on the web device
//                         arrive on the iPad through an interrupted download;
//                         files are checked BY HASH on disk, read here, not
//                         through the app; a Chrome webm take says it cannot
//                         play; the iPad's own photo and recording reach the
//                         web device, which verifies them by hash.
//  testTwoPeopleSwitch    two linked people, switching back and forth in one
//                         run: each one's sync stops and restarts.
//
//  What is measured, and by whom: files in Application Support/blobs are
//  hashed by this process (CryptoKit) against the name the PEER computed;
//  the peer reads the relay; the screen is read through accessibility.
//

import CryptoKit
import XCTest

final class SyncMediaE2ETests: XCTestCase {
    private var dir: URL!
    private var dirB: URL?
    private var base: String!
    private var data: URL!

    override func setUpWithError() throws {
        continueAfterFailure = false
        guard let d = ProcessInfo.processInfo.environment["PIP_E2E_DIR"],
              let b = ProcessInfo.processInfo.environment["PIP_E2E_BASE"] else {
            throw XCTSkip("PIP_E2E_DIR/PIP_E2E_BASE not set - run scripts/ios/e2e_sync.sh")
        }
        dir = URL(fileURLWithPath: d, isDirectory: true)
        dirB = ProcessInfo.processInfo.environment["PIP_E2E_DIR_B"].map { URL(fileURLWithPath: $0, isDirectory: true) }
        base = b
        data = dir.appendingPathComponent("ipad", isDirectory: true)
        try FileManager.default.createDirectory(at: data, withIntermediateDirectories: true)
    }

    // MARK: file protocol

    private func put(_ name: String, _ text: String = "1", in d: URL? = nil) {
        try? text.write(to: (d ?? dir).appendingPathComponent(name), atomically: true, encoding: .utf8)
    }

    private func wait(_ name: String, _ timeout: TimeInterval = 120, in d: URL? = nil) throws -> String {
        let root = d ?? dir!
        let url = root.appendingPathComponent(name)
        let end = Date().addingTimeInterval(timeout)
        while Date() < end {
            if let s = try? String(contentsOf: url, encoding: .utf8) { return s }
            if FileManager.default.fileExists(atPath: root.appendingPathComponent("host-failed").path) {
                XCTFail("the peer failed: \((try? String(contentsOf: root.appendingPathComponent("host-failed"))) ?? "?")")
                throw XCTSkip("peer failed")
            }
            Thread.sleep(forTimeInterval: 0.1)
        }
        XCTFail("timed out waiting for peer file \(name)")
        throw XCTSkip("timeout")
    }

    private func poll(_ timeout: TimeInterval, _ cond: () -> Bool) -> TimeInterval? {
        let start = Date()
        while Date().timeIntervalSince(start) < timeout {
            if cond() { return Date().timeIntervalSince(start) }
            Thread.sleep(forTimeInterval: 0.1)
        }
        return cond() ? Date().timeIntervalSince(start) : nil
    }

    private func launch(reset: Bool) -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments = (reset ? ["-pipUITestReset"] : [])
            + ["-PipDataDir", data.path, "-PipBaseURL", base,
               "-pipUITestMediaHook", "-PipTraceAudio", "YES"]
        app.launch()
        return app
    }

    private func attach(_ app: XCUIApplication, _ name: String) {
        let a = XCTAttachment(screenshot: app.screenshot())
        a.name = name
        a.lifetime = .keepAlways
        add(a)
    }

    private func decode<T: Decodable>(_ type: T.Type, _ name: String, in d: URL? = nil,
                                      _ timeout: TimeInterval = 120) throws -> T {
        try JSONDecoder().decode(T.self, from: Data(try wait(name, timeout, in: d).utf8))
    }

    private struct Person: Decodable { let entityId: String; let userId: String }

    private func sha256(of url: URL) -> String? {
        guard let d = try? Data(contentsOf: url) else { return nil }
        return SHA256.hash(data: d).map { String(format: "%02x", $0) }.joined()
    }

    private func blobFile(_ sha: String) -> URL { data.appendingPathComponent("blobs/\(sha)") }

    /// Settings -> Team & devices -> Join with a code -> role -> code.
    private func joinWithCode(_ app: XCUIApplication, _ code: String, first: Bool) {
        app.buttons["settingsGear"].tap()
        XCTAssertTrue(app.buttons["settingsSection:team"].waitForExistence(timeout: 10))
        app.buttons["settingsSection:team"].tap()   // E4: the Team & devices page
        XCTAssertTrue(app.buttons["settings:team"].waitForExistence(timeout: 10))
        app.buttons["settings:team"].tap()
        XCTAssertTrue(app.buttons["team:join"].waitForExistence(timeout: 10))
        if first {
            XCTAssertEqual(app.staticTexts["team:status"].label, "Only on this device so far.")
        }
        app.buttons["team:join"].tap()
        XCTAssertTrue(app.buttons["pair:role:board"].waitForExistence(timeout: 10))
        app.buttons["pair:role:board"].tap()
        let input = app.textFields["pair:input"]
        input.tap()
        input.typeText(code)
        XCTAssertTrue(app.staticTexts["pair:status"].waitForExistence(timeout: 10))
    }

    private func tileValue(_ app: XCUIApplication, _ id: String) -> String {
        (app.buttons["tile:\(id)"].value as? String) ?? ""
    }

    private func playedClips() -> String {
        (try? String(contentsOf: data.appendingPathComponent("played_clips.txt"), encoding: .utf8)) ?? ""
    }

    // MARK: media

    private struct PeerMedia: Decodable {
        let photoSha: String; let recSha: String; let webmSha: String
        let webEntity: String; let photoBytes: Int
    }
    private struct Verified: Decodable {
        struct One: Decodable { let sha: String; let hashMatches: Bool; let bytes: Int }
        struct Ops: Decodable { let photoRows: Int; let clipRows: Int }
        let photo: One; let voice: One; let opsArrived: Ops
    }

    func testMediaBothWays() throws {
        let app = launch(reset: true)
        XCTAssertTrue(app.buttons["tile:sns_0013"].waitForExistence(timeout: 30))
        let code = try wait("code.txt").trimmingCharacters(in: .whitespacesAndNewlines)
        let person = try decode(Person.self, "person.json")
        let ent = person.entityId
        joinWithCode(app, code, first: true)
        XCTAssertTrue(app.buttons["tile:\(ent)"].waitForExistence(timeout: 60))
        put("ui-linked")
        _ = try wait("peer-edit.json")
        XCTAssertTrue(app.buttons["tile:\(ent)"].waitForExistence(timeout: 10))
        Thread.sleep(forTimeInterval: 2)
        put("ui-saw-edit")

        // The relay will cut every blob download in half. The peer then
        // sets a photo and two recordings; the ops arrive, the bytes cannot.
        put("proxy-mode", "cut-blobs")
        put("ui-cut-on")
        let m = try decode(PeerMedia.self, "peer-media.json")
        XCTAssertNotNil(poll(60) {
            ((try? String(contentsOf: dir.appendingPathComponent("proxy-mode.log"), encoding: .utf8)) ?? "").contains("CUT")
        }, "the proxy cut a blob download mid-transfer")
        Thread.sleep(forTimeInterval: 1)
        XCTAssertFalse(FileManager.default.fileExists(atPath: blobFile(m.photoSha).path),
                       "an interrupted download leaves no file under the hash's name")
        XCTAssertEqual(tileValue(app, ent), "", "the tile shows name + colour until the picture is here")
        attach(app, "c4-interrupted-download")

        // PP-10: pending is said honestly in Team & devices.
        app.buttons["settingsGear"].tap()
        app.buttons["settingsSection:team"].tap()   // E4: the Team & devices page
        app.buttons["settings:team"].tap()
        let media = app.staticTexts["team:media"]
        XCTAssertTrue(media.waitForExistence(timeout: 10), "pending media is shown, not hidden")
        XCTAssertEqual(media.label, "Getting a photo or recording…")
        attach(app, "c4-media-pending")
        app.navigationBars.buttons.element(boundBy: 0).tap() // back to Settings
        XCTAssertTrue(app.buttons["settingsDone"].waitForExistence(timeout: 10))
        app.buttons["settingsDone"].tap()

        // The relay is back: the download completes by itself (backoff retry).
        put("proxy-mode", "pass")
        let landed = poll(90) { FileManager.default.fileExists(atPath: self.blobFile(m.photoSha).path) }
        XCTAssertNotNil(landed, "the interrupted photo completed after the relay came back")
        print("E2E-MEDIA photo (\(m.photoBytes) bytes) landed \(Int((landed ?? 0) * 1000)) ms after reconnect")
        // Measured by hash from the file the app saved - not by the UI.
        XCTAssertEqual(sha256(of: blobFile(m.photoSha)), m.photoSha, "photo file hashes to its name")
        XCTAssertNotNil(poll(30) { self.tileValue(app, ent) == "family photo" }, "the tile draws the picture")
        attach(app, "c4-picture-arrived")

        XCTAssertNotNil(poll(60) { FileManager.default.fileExists(atPath: self.blobFile(m.recSha).path) })
        XCTAssertEqual(sha256(of: blobFile(m.recSha)), m.recSha, "recording file hashes to its name")
        app.buttons["tile:\(ent)"].tap()
        XCTAssertNotNil(poll(10) { self.playedClips().contains("blobs/\(m.recSha)") },
                        "tapping the word plays the web device's recording (file the speaker opened)")

        // A Chrome-style webm take: bytes arrive and verify, but the iPad
        // cannot decode them - it says so; no silence, no device speech.
        XCTAssertNotNil(poll(60) { FileManager.default.fileExists(atPath: self.blobFile(m.webmSha).path) })
        XCTAssertEqual(sha256(of: blobFile(m.webmSha)), m.webmSha)
        let web = app.buttons["tile:\(m.webEntity)"]
        XCTAssertTrue(web.waitForExistence(timeout: 30))
        web.tap()
        let toast = app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", "Can't play this recording here")).firstMatch
        XCTAssertTrue(toast.waitForExistence(timeout: 10), "the honest state is shown for a recording this iPad cannot decode")
        XCTAssertFalse(playedClips().contains(m.webmSha), "the webm was never handed to the player")
        attach(app, "c4-cannot-play")
        put("ui-media-verified")

        // The iPad's own photo and recording (E3's card writers, via the
        // test hook: no camera or microphone in the simulator).
        func request(_ id: String, _ kind: String, _ file: String) throws -> String {
            let body = ["id": id, "kind": kind, "wordKind": "sense", "wordId": "sns_0014",
                        "file": dir.appendingPathComponent(file).path]
            try JSONSerialization.data(withJSONObject: body)
                .write(to: data.appendingPathComponent("media-request.json"))
            let res = try wait("ipad/media-result-\(id).json", 30)
            struct R: Decodable { let key: String? }
            let key = try JSONDecoder().decode(R.self, from: Data(res.utf8)).key ?? ""
            return String(key.dropFirst(5))
        }
        let photoSha = try request("1", "photo", "ipad-photo.png")
        let voiceSha = try request("2", "voice", "ipad-voice.wav")
        XCTAssertEqual(photoSha, sha256(of: dir.appendingPathComponent("ipad-photo.png")))
        XCTAssertEqual(voiceSha, sha256(of: dir.appendingPathComponent("ipad-voice.wav")))
        put("ui-sent-media", "{\"photoSha\":\"\(photoSha)\",\"voiceSha\":\"\(voiceSha)\"}")
        let v = try decode(Verified.self, "peer-verified-ipad-media.json", 120)
        XCTAssertTrue(v.photo.hashMatches && v.voice.hashMatches, "the web device opened both by hash")
        XCTAssertEqual(v.photo.sha, photoSha)
        XCTAssertGreaterThan(v.opsArrived.photoRows, 0)
        XCTAssertGreaterThan(v.opsArrived.clipRows, 0)
        print("E2E-MEDIA iPad -> web device verified by hash: photo \(v.photo.bytes) B, voice \(v.voice.bytes) B")

        // Nothing owed any more, and the files survive a relaunch.
        app.terminate()
        XCTAssertEqual(sha256(of: blobFile(m.photoSha)), m.photoSha)
        Thread.sleep(forTimeInterval: 3)
        put("ui-done")
        _ = try wait("host-done", 60)
    }

    // MARK: pictures chosen (044 E6b)

    private struct Expect: Decodable { let ipadSha: String; let webSha: String; let ipadSense: String; let webSense: String }
    private struct PictureVerified: Decodable {
        let sense: String; let rowKey: String; let sha: String
        let hashMatches: Bool; let bytesAreTheCannedPicture: Bool; let bytes: Int
    }

    /// A picture chosen on the web device reaches the iPad, and one chosen on
    /// the iPad (real Find -> tap, through the finder client) reaches the web
    /// device. The finder's answers are canned by the proxy (no paid API);
    /// what is measured is on the OTHER side: this process hashes the file
    /// the app saved against the sha the peer computed from its own bytes;
    /// the peer reads its own image_override row and opens the blob from the
    /// relay by hash.
    func testPicturesBothWays() throws {
        let app = launch(reset: true)
        XCTAssertTrue(app.buttons["tile:sns_0013"].waitForExistence(timeout: 30))
        let code = try wait("code.txt").trimmingCharacters(in: .whitespacesAndNewlines)
        joinWithCode(app, code, first: true)
        put("ui-linked")
        _ = try wait("peer-edit.json")
        Thread.sleep(forTimeInterval: 2)
        put("ui-saw-edit")
        let want = try decode(Expect.self, "peer-expect-pictures.json")
        XCTAssertEqual(tileValue(app, "sns_0013"), "", "no picture yet")
        XCTAssertEqual(tileValue(app, "sns_0014"), "", "no picture yet")

        // Web -> iPad: the peer chose a picture for "go".
        _ = try wait("peer-picked.json")
        XCTAssertNotNil(poll(90) { FileManager.default.fileExists(atPath: self.blobFile(want.webSha).path) },
                        "the web device's picture was downloaded")
        XCTAssertEqual(sha256(of: blobFile(want.webSha)), want.webSha, "the file hashes to the peer's sha")
        XCTAssertNotNil(poll(30) { self.tileValue(app, want.webSense) == "family photo" }, "the tile wears it")
        attach(app, "e6b-web-pick-on-ipad")

        // iPad -> web: Find, tap the match, Done.
        app.buttons["settingsGear"].tap()
        XCTAssertTrue(app.buttons["editBoard"].waitForExistence(timeout: 10))
        app.buttons["editBoard"].tap()
        XCTAssertTrue(app.buttons["editDone"].waitForExistence(timeout: 10))
        app.buttons["tile:\(want.ipadSense)"].tap()
        let field = app.textFields["wc-desc"]
        XCTAssertTrue(field.waitForExistence(timeout: 10))
        field.tap()
        field.typeText("e2e apple")
        app.buttons["wc-findgo"].tap()
        let match = app.buttons["wc-result:img_e2e_ipad"]
        XCTAssertTrue(match.waitForExistence(timeout: 30), "the finder's match shows")
        attach(app, "e6b-ipad-find")
        match.tap()
        app.buttons["wc-done"].tap()
        XCTAssertNotNil(poll(30) { self.tileValue(app, want.ipadSense) == "family photo" }, "the iPad's own tile wears it")
        XCTAssertNotNil(poll(30) { FileManager.default.fileExists(atPath: self.blobFile(want.ipadSha).path) })
        XCTAssertEqual(sha256(of: blobFile(want.ipadSha)), want.ipadSha, "the file the iPad saved is the picture offered")
        put("ui-picked")
        let v = try decode(PictureVerified.self, "peer-verified-ipad-picture.json", 120)
        XCTAssertEqual(v.sense, want.ipadSense)
        XCTAssertEqual(v.rowKey, "blob:\(want.ipadSha)", "the web device's own table names the picture")
        XCTAssertTrue(v.hashMatches && v.bytesAreTheCannedPicture, "the web device opened it from the relay by hash")
        print("E2E-PICTURES iPad -> web verified by hash (\(v.bytes) B); web -> iPad file hashed here")

        app.terminate()
        XCTAssertEqual(sha256(of: blobFile(want.webSha)), want.webSha)
        put("ui-done")
        _ = try wait("host-done", 60)
    }

    // MARK: two people

    func testTwoPeopleSwitch() throws {
        guard let dirB else { throw XCTSkip("PIP_E2E_DIR_B not set") }
        let a = dir!, b = dirB
        let app = launch(reset: true)
        XCTAssertTrue(app.buttons["tile:sns_0013"].waitForExistence(timeout: 30))

        // Person A.
        let pa = try decode(Person.self, "person.json", in: a)
        joinWithCode(app, try wait("code.txt", in: a).trimmingCharacters(in: .whitespacesAndNewlines), first: true)
        XCTAssertTrue(app.buttons["tile:\(pa.entityId)"].waitForExistence(timeout: 60))
        XCTAssertEqual(app.buttons["tile:\(pa.entityId)"].label, "Alpha")
        put("ui-linked", in: a)
        _ = try wait("peer-edit.json", in: a)
        XCTAssertNotNil(poll(10) { app.buttons["tile:\(pa.entityId)"].label == "Alphad" }, "A syncs")
        put("ui-saw-edit", in: a)

        // Person B joins in the same run: before C4 this one stayed local.
        let pb = try decode(Person.self, "person.json", in: b)
        joinWithCode(app, try wait("code.txt", in: b).trimmingCharacters(in: .whitespacesAndNewlines), first: false)
        XCTAssertTrue(app.buttons["tile:\(pb.entityId)"].waitForExistence(timeout: 60))
        XCTAssertEqual(app.buttons["tile:\(pb.entityId)"].label, "Beta")
        put("ui-linked", in: b)
        _ = try wait("peer-edit.json", in: b)
        let t0 = Date()
        XCTAssertNotNil(poll(15) { app.buttons["tile:\(pb.entityId)"].label == "Betad" },
                        "the second linked person syncs without a relaunch")
        print("E2E-LATENCY second person's peer edit shown: \(Int(Date().timeIntervalSince(t0) * 1000)) ms")
        put("ui-saw-edit", in: b)
        attach(app, "c4-second-person-synced")

        func switchPerson() {
            app.buttons["settingsGear"].tap()
            XCTAssertTrue(app.buttons["settingsSection:team"].waitForExistence(timeout: 10))
            app.buttons["settingsSection:team"].tap()   // E4: People lives on the Team & devices page
            XCTAssertTrue(app.buttons["settings:people"].waitForExistence(timeout: 10))
            app.buttons["settings:people"].tap()
            let sw = app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Switch to'")).firstMatch
            XCTAssertTrue(sw.waitForExistence(timeout: 10))
            sw.tap()
        }

        // A edits while B is open (A's loop is stopped), then we switch to A:
        // the restart catches up.
        put("ui-go-edit2", in: a)
        _ = try wait("peer-edit2.json", in: a)
        switchPerson()
        XCTAssertNotNil(poll(30) { app.buttons["tile:\(pa.entityId)"].label == "Alphadd" },
                        "switching back to A restarts its sync and catches up")
        put("ui-saw-edit2", in: a)
        // ... and A is live again: an edit made now arrives with no switch.
        put("ui-go-edit3", in: a)
        _ = try wait("peer-edit3.json", in: a)
        XCTAssertNotNil(poll(15) { app.buttons["tile:\(pa.entityId)"].label == "Alphaddd" }, "A is live after the restart")
        put("ui-saw-edit3", in: a)
        attach(app, "c4-first-person-back")

        // And back to B, which edited while it was stopped.
        put("ui-go-edit2", in: b)
        _ = try wait("peer-edit2.json", in: b)
        switchPerson()
        XCTAssertNotNil(poll(30) { app.buttons["tile:\(pb.entityId)"].label == "Betadd" }, "B catches up after a second switch")
        put("ui-saw-edit2", in: b)
        put("ui-go-edit3", in: b)
        _ = try wait("peer-edit3.json", in: b)
        XCTAssertNotNil(poll(15) { app.buttons["tile:\(pb.entityId)"].label == "Betaddd" })
        put("ui-saw-edit3", in: b)

        Thread.sleep(forTimeInterval: 6)
        put("ui-done", in: a)
        put("ui-done", in: b)
        _ = try wait("host-done", 60, in: a)
        _ = try wait("host-done", 60, in: b)
    }
}
