//
//  VoiceUITests.swift
//  PipAACUITests
//
//  D3 works test (phase 044 BS-23 / BS-25): choose Mia -> honest progress
//  -> done -> tap a word -> the speaker opens the file inside Mia's pack
//  -> relaunch with the network gone, still Mia.
//
//  The network is a loopback server in this test process serving a SMALL
//  slice of the real Mia clips (read from the repo's public/) under the
//  web's own paths and sw-audio.json shape - no real voice pack is
//  downloaded. The instruments are on disk: the app's played_clips.txt
//  (the path AVAudioPlayer was given) and the person's SQLite file.
//

import Network
import SQLite3
import XCTest

final class VoiceUITests: XCTestCase {
    private var dir: URL!
    private var server: ClipServer!
    /// 040: other voices are a trial/Lifetime feature - the stub Worker
    /// answers the trial clock (running) so the picker is unlocked.
    private var worker: StubWorker!
    private let mia = "voi_mia_en"

    override func setUpWithError() throws {
        continueAfterFailure = false
        dir = FileManager.default.temporaryDirectory
            .appendingPathComponent("pip-d3-\(UUID().uuidString)", isDirectory: true)
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
    }

    override func tearDown() { server?.stop(); worker?.stop() }

    // MARK: repo files

    private var publicDir: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("public")
    }

    private func query(_ file: String, _ sql: String) -> [String] {
        var db: OpaquePointer?
        guard sqlite3_open_v2(file, &db, SQLITE_OPEN_READONLY, nil) == SQLITE_OK else { return [] }
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

    /// Mia's clip key for a word (what the core resolves on a tap).
    private func miaKey(sense: String) -> String {
        query(publicDir.appendingPathComponent("fresh_db.sqlite").path, """
            SELECT c.key FROM clip c JOIN label l ON l.utterance_id = c.utterance_id
            WHERE l.sense_id = '\(sense)' AND l.kind = 'lemma' AND l.status = 'approved'
              AND c.voice_id = '\(mia)' AND c.status = 'ready' LIMIT 1
            """).first ?? ""
    }

    // MARK: app

    private func launch() -> XCUIApplication {
        let app = XCUIApplication()
        if worker == nil { worker = try? StubWorker() }
        app.launchArguments = ["-PipDataDir", dir.path, "-PipTraceAudio", "YES",
                               "-PipBaseURL", "http://127.0.0.1:\(worker.port)",
                               "-PipVoiceBase", "http://127.0.0.1:\(server.port)"]
        app.launch()
        return app
    }

    private func played() -> [String] {
        ((try? String(contentsOf: dir.appendingPathComponent("played_clips.txt"), encoding: .utf8)) ?? "")
            .split(separator: "\n").map(String.init)
    }

    private func personFile() throws -> String {
        let users = dir.appendingPathComponent("Users")
        let f = try FileManager.default.contentsOfDirectory(atPath: users.path)
            .first { $0.hasSuffix(".sqlite") }
        return users.appendingPathComponent(try XCTUnwrap(f)).path
    }

    func testChooseEveDownloadsPlaysFromPackAndSurvivesOffline() throws {
        let keys = ["sns_0013", "sns_0128"].map(miaKey)    // want, apple (+ filler below)
        XCTAssertFalse(keys.contains(""), "Mia clips for the sample words")
        let filler = query(publicDir.appendingPathComponent("fresh_db.sqlite").path,
            "SELECT key FROM clip WHERE voice_id = '\(mia)' ORDER BY key LIMIT 40")
        let files = Array(Set(keys + filler))
        server = try ClipServer(publicDir: publicDir, voice: mia, keys: files, delayMs: 250)

        var app = launch()
        XCTAssertTrue(app.buttons["tile:sns_0013"].waitForExistence(timeout: 30))
        app.buttons["settingsGear"].tap()
        XCTAssertTrue(app.buttons["settingsSection:talking"].waitForExistence(timeout: 10))
        app.buttons["settingsSection:talking"].tap()   // E4: Voice lives on the Talking page
        XCTAssertTrue(app.buttons["voice:change"].waitForExistence(timeout: 10))
        app.buttons["voice:change"].tap()
        let use = app.buttons["voice:use:\(mia)"]
        XCTAssertTrue(use.waitForExistence(timeout: 10))
        use.tap()

        // Honest progress while it downloads, then Mia is in use.
        XCTAssertTrue(app.progressIndicators["voice:progress:\(mia)"].waitForExistence(timeout: 10),
                      "download progress shows")
        shot(app, "voice-downloading")
        XCTAssertTrue(app.staticTexts["voice:inuse:\(mia)"].waitForExistence(timeout: 60),
                      "Mia in use after the pack verified")
        shot(app, "voice-mia-in-use")

        // The synced setting is on disk, written by the core.
        let pid = try personFile()
        XCTAssertEqual(query(pid, "SELECT preferred_voice_id FROM learner_profile").first, mia)

        app.navigationBars.buttons.firstMatch.tap()
        app.buttons["settingsDone"].tap()
        // The sheet's dismissal must finish first: a tap during it lands nowhere.
        XCTAssertTrue(app.buttons["settingsDone"].waitForNonExistence(timeout: 10), "Settings closed")
        XCTAssertTrue(app.buttons["tile:sns_0013"].isHittable)
        app.buttons["tile:sns_0013"].tap()
        let want = dir.appendingPathComponent("VoicePacks/\(mia)").path + "/" + miaKey(sense: "sns_0013")
        try waitFor { self.played().last == want }
        XCTAssertEqual(played().last, want, "the speaker opened Mia's file inside her pack")
        // Packs are not in backups.
        let v = try dir.appendingPathComponent("VoicePacks").resourceValues(forKeys: [.isExcludedFromBackupKey])
        XCTAssertEqual(v.isExcludedFromBackup, true)

        // Relaunch with the network gone: still Mia, still her file.
        app.terminate()
        server.stop()
        let before = played().count
        app = launch()
        XCTAssertTrue(app.buttons["tile:sns_0013"].waitForExistence(timeout: 30))
        app.buttons["tile:sns_0013"].tap()
        try waitFor { self.played().count > before }
        XCTAssertEqual(played().last, want, "offline relaunch still speaks Mia")
        XCTAssertEqual(query(try personFile(), "SELECT preferred_voice_id FROM learner_profile").first, mia)
    }

    /// Manual only (TEST_RUNNER_PIP_REAL_VOICE=voi_sam_en): downloads ONE
    /// real voice pack from app.pipaac.org (free static files) and reports
    /// size and time. Skipped in every normal run.
    func testRealDownloadOfOneVoice() throws {
        guard let voice = ProcessInfo.processInfo.environment["PIP_REAL_VOICE"] else {
            throw XCTSkip("manual: set TEST_RUNNER_PIP_REAL_VOICE=voi_sam_en")
        }
        let app = XCUIApplication()
        app.launchArguments = ["-PipDataDir", dir.path]
        if let b = ProcessInfo.processInfo.environment["PIP_REAL_BASE"] {
            app.launchArguments += ["-PipVoiceBase", b]   // default: app.pipaac.org
        }
        app.launch()
        XCTAssertTrue(app.buttons["tile:sns_0013"].waitForExistence(timeout: 30))
        app.buttons["settingsGear"].tap()
        app.buttons["settingsSection:talking"].tap()   // E4: Voice lives on the Talking page
        app.buttons["voice:change"].tap()
        let t0 = Date()
        app.buttons["voice:use:\(voice)"].tap()
        let inuse = app.staticTexts["voice:inuse:\(voice)"]
        let failed = app.staticTexts["voice:message"]
        let end = Date().addingTimeInterval(420)
        while Date() < end, !inuse.exists, !failed.exists { Thread.sleep(forTimeInterval: 1) }
        add(XCTAttachment(screenshot: app.screenshot()))
        XCTAssertTrue(inuse.exists, "download did not finish: \(failed.exists ? failed.label : "still running")")
        let secs = Date().timeIntervalSince(t0)
        let pack = dir.appendingPathComponent("VoicePacks/\(voice)")
        var bytes = 0, n = 0
        for case let u as URL in FileManager.default.enumerator(at: pack, includingPropertiesForKeys: [.fileSizeKey])! {
            if let sz = try? u.resourceValues(forKeys: [.fileSizeKey]).fileSize, u.pathExtension == "mp3" { bytes += sz; n += 1 }
        }
        print("REALVOICE \(voice) files=\(n) bytes=\(bytes) seconds=\(secs)")
        add(XCTAttachment(screenshot: app.screenshot()))
    }

    private func shot(_ app: XCUIApplication, _ name: String) {
        let a = XCTAttachment(screenshot: app.screenshot())
        a.name = name
        a.lifetime = .keepAlways
        add(a)
    }

    private func waitFor(_ cond: () -> Bool) throws {
        let end = Date().addingTimeInterval(10)
        while Date() < end { if cond() { return }; Thread.sleep(forTimeInterval: 0.1) }
    }
}

/// A loopback HTTP server: /sw-audio.json (one voice, the given files)
/// and /audio/... straight from the repo's public/.
final class ClipServer: @unchecked Sendable {
    private let listener: NWListener
    private let publicDir: URL
    private let manifest: Data
    private let delay: Double
    private let q = DispatchQueue(label: "clip.server")
    private(set) var port: UInt16 = 0

    init(publicDir: URL, voice: String, keys: [String], delayMs: Int) throws {
        self.publicDir = publicDir
        self.delay = Double(delayMs) / 1000
        let m: [String: Any] = ["voices": [voice: ["hash": "test1", "files": keys.map { "/" + $0 }]]]
        manifest = try JSONSerialization.data(withJSONObject: m)
        listener = try NWListener(using: .tcp, on: .any)
        let ready = DispatchSemaphore(value: 0)
        listener.stateUpdateHandler = { if case .ready = $0 { ready.signal() } }
        listener.newConnectionHandler = { [weak self] c in self?.serve(c) }
        listener.start(queue: q)
        _ = ready.wait(timeout: .now() + 5)
        port = listener.port?.rawValue ?? 0
    }

    func stop() { listener.cancel() }

    private func serve(_ c: NWConnection) {
        c.start(queue: q)
        c.receive(minimumIncompleteLength: 1, maximumLength: 8192) { [weak self] data, _, _, _ in
            guard let self, let data, let req = String(data: data, encoding: .utf8) else { c.cancel(); return }
            let path = req.split(separator: " ").dropFirst().first.map(String.init) ?? "/"
            var body: Data?
            if path == "/sw-audio.json" { body = self.manifest }
            else if path.hasPrefix("/audio/") {
                body = try? Data(contentsOf: self.publicDir.appendingPathComponent(String(path.dropFirst())))
            }
            let send = {
                let head = body == nil ? "HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\nConnection: close\r\n\r\n"
                    : "HTTP/1.1 200 OK\r\nContent-Length: \(body!.count)\r\nConnection: close\r\n\r\n"
                c.send(content: Data(head.utf8) + (body ?? Data()), completion: .contentProcessed { _ in c.cancel() })
            }
            if path.hasPrefix("/audio/") { self.q.asyncAfter(deadline: .now() + self.delay, execute: send) } else { send() }
        }
    }
}
