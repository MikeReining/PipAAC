//
//  SpotlightE2ETests.swift
//  PipAACUITests
//
//  044 D5 Works Test: live modeling and the Spotlight glow on the board.
//  NOT a standalone test - scripts/ios/e2e_sync.sh (scenarios `spotlight`
//  and `spotlight-supporter`) starts the LOCAL Worker and a node "web
//  device" (the real sync.mjs, spotlight.mjs and WebCrypto) that talk to
//  this test through files in PIP_E2E_DIR.
//
//  What is measured, and by whom:
//   - the glow, the dim, the modeled word and the End chip are read off
//     the screen through accessibility values on the cells;
//   - that the child's taps ARRIVED in the supporter's session is asked
//     of the relay's live frames by the peer (peer-saw-taps.json), never
//     read off this screen; the same for a supporter's modeling taps;
//   - "lit when pressed" is read from the iPad's SQLite FILE by this
//     process, not by the app; the session row too;
//   - restart survival is a real kill, relaunched with the relay DEAD, so
//     the glow can only come from the saved row.
//

import SQLite3
import XCTest

final class SpotlightE2ETests: XCTestCase {
    private var dir: URL!
    private var base: String!
    private var data: URL!
    private let shots = URL(fileURLWithPath: ProcessInfo.processInfo.environment["PIP_E2E_SHOTS"] ?? "/tmp/pipaac-shots-d5", isDirectory: true)

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
        try FileManager.default.createDirectory(at: shots, withIntermediateDirectories: true)
    }

    // MARK: file protocol with the peer

    private func put(_ name: String, _ text: String = "1") {
        try? text.write(to: dir.appendingPathComponent(name), atomically: true, encoding: .utf8)
    }

    @discardableResult
    private func wait(_ name: String, _ timeout: TimeInterval = 180) throws -> String {
        let url = dir.appendingPathComponent(name)
        let end = Date().addingTimeInterval(timeout)
        while Date() < end {
            if let s = try? String(contentsOf: url, encoding: .utf8) { return s }
            if let why = try? String(contentsOf: dir.appendingPathComponent("host-failed"), encoding: .utf8) {
                XCTFail("the peer failed: \(why)")
                throw XCTSkip("peer failed")
            }
            Thread.sleep(forTimeInterval: 0.1)
        }
        XCTFail("timed out waiting for peer file \(name)")
        throw XCTSkip("timeout")
    }

    private func poll(_ timeout: TimeInterval, _ cond: () -> Bool) -> Bool {
        let end = Date().addingTimeInterval(timeout)
        while Date() < end {
            if cond() { return true }
            Thread.sleep(forTimeInterval: 0.1)
        }
        return cond()
    }

    // MARK: disk readers (the iPad's own file, read by this process)

    private struct Row: Decodable { let id: String; let home: Bool }
    private struct Doc: Decodable { let users: [Row] }

    private func scalar(_ sql: String) -> String? {
        guard let d = try? Data(contentsOf: data.appendingPathComponent("people.json")),
              let doc = try? JSONDecoder().decode(Doc.self, from: d),
              let id = doc.users.first(where: { $0.home })?.id ?? doc.users.first?.id else { return nil }
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

    private func join(_ app: XCUIApplication, code: String, role: String) {
        app.buttons["settingsGear"].tap()
        XCTAssertTrue(app.buttons["settings:team"].waitForExistence(timeout: 10))
        app.buttons["settings:team"].tap()
        XCTAssertTrue(app.buttons["team:join"].waitForExistence(timeout: 10))
        app.buttons["team:join"].tap()
        XCTAssertTrue(app.buttons["pair:role:\(role)"].waitForExistence(timeout: 10))
        app.buttons["pair:role:\(role)"].tap()
        let input = app.textFields["pair:input"]
        input.tap()
        input.typeText(code)
        XCTAssertTrue(app.staticTexts["pair:status"].waitForExistence(timeout: 10))
    }

    private func entityId() throws -> String {
        struct P: Decodable { let entityId: String }
        return try JSONDecoder().decode(P.self, from: Data(try wait("person.json").utf8)).entityId
    }

    /// Links this iPad to the peer's person and lands back on the board.
    private func linked(role: String) throws -> XCUIApplication {
        let app = launch(reset: true)
        XCTAssertTrue(app.buttons["tile:sns_0013"].waitForExistence(timeout: 30))
        let code = try wait("code.txt").trimmingCharacters(in: .whitespacesAndNewlines)
        let ent = try entityId()
        join(app, code: code, role: role)
        XCTAssertTrue(app.buttons["tile:\(ent)"].waitForExistence(timeout: 60), "the linked person's board arrived")
        XCTAssertTrue(poll(20) { self.scalar("SELECT COUNT(*) FROM personal_entity") != nil })
        Thread.sleep(forTimeInterval: 3) // cursor + registry settle, the socket opens
        put("ui-linked")
        return app
    }

    private func shot(_ app: XCUIApplication, _ name: String) {
        let s = app.screenshot()
        try? s.pngRepresentation.write(to: shots.appendingPathComponent("\(name).png"))
        let a = XCTAttachment(screenshot: s)
        a.name = name
        a.lifetime = .keepAlways
        add(a)
    }

    /// What the cell says about the attention layer: "", "glowing", "dimmed", "modeled".
    private func state(_ app: XCUIApplication, _ sense: String) -> String {
        (app.buttons["tile:\(sense)"].value as? String) ?? ""
    }

    private func dimmedCount(_ app: XCUIApplication) -> Int {
        app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH 'tile:' AND value CONTAINS 'dimmed'")).count
    }

    // MARK: SP-1 SP-2 SP-3 SP-5 SY-5 BS-26: the child's board

    /// A session started on the peer glows its words and dims the rest; it
    /// survives a kill (relaunched with the relay dead); a helper's tap lights
    /// a word; the child's taps arrive in the session (the peer asks the
    /// relay); the End chip ends it for everyone; a supporter-started session
    /// leaves the board plain.
    func testChildBoardGlowModelAndTaps() throws {
        var app = try linked(role: "board")
        struct Session: Decodable { let startedAt: Double; let targets: [String]; let name: String }
        let session = try JSONDecoder().decode(Session.self, from: Data(try wait("peer-session.json").utf8))

        // SP-1: glow on the two targets, dim on the rest, the chip names the session.
        XCTAssertTrue(poll(30) { self.state(app, "sns_0013") == "glowing" && self.state(app, "sns_0014") == "glowing" },
                      "the session started elsewhere glows its words")
        XCTAssertEqual(state(app, "sns_0016"), "dimmed")
        XCTAssertEqual(state(app, "sns_0015"), "dimmed")
        XCTAssertGreaterThan(dimmedCount(app), 10, "every other word is dimmed")
        XCTAssertTrue(app.buttons["spot:chip"].exists)
        XCTAssertEqual(app.buttons["spot:chip"].label, "🔦 Mealtime · End")
        XCTAssertEqual(scalar("SELECT COUNT(*) FROM spotlight_session"), "1", "the row is in the iPad's own file")
        XCTAssertEqual(scalar("SELECT started_at FROM spotlight_session").flatMap(Double.init), session.startedAt)
        shot(app, "d5-glow-and-dim")
        put("ui-saw-glow")

        // SP-2: kill, relaunch with the relay DEAD - the glow comes from the saved row.
        app.terminate()
        app = launch(reset: false, url: "http://127.0.0.1:1")
        XCTAssertTrue(app.buttons["tile:sns_0013"].waitForExistence(timeout: 30))
        XCTAssertTrue(poll(20) { self.state(app, "sns_0013") == "glowing" && self.state(app, "sns_0016") == "dimmed" },
                      "the session survives a restart with no relay")
        app.terminate()
        app = launch(reset: false)
        XCTAssertTrue(app.buttons["tile:sns_0013"].waitForExistence(timeout: 30))
        XCTAssertTrue(poll(20) { self.state(app, "sns_0013") == "glowing" })
        put("ui-saw-resume")

        // SP-3: a helper's tap lights a word on this board.
        _ = try wait("peer-modeled.json")
        XCTAssertTrue(poll(60) { self.state(app, "sns_0015") == "modeled" }, "the modeled word lights")
        XCTAssertEqual(state(app, "sns_0016"), "dimmed", "only that word")
        shot(app, "d5-modeled-word")
        put("ui-saw-modeled")

        // The child taps the modeled word, a glowing word, a dimmed word: a dimmed word still speaks.
        XCTAssertTrue(app.staticTexts["Tap a word to start."].exists)
        app.buttons["tile:sns_0015"].tap()
        app.buttons["tile:sns_0013"].tap()
        app.buttons["tile:sns_0016"].tap()
        XCTAssertFalse(app.staticTexts["Tap a word to start."].exists, "the dimmed word still went onto the bar")
        XCTAssertTrue(poll(10) { self.scalar("SELECT COUNT(*) FROM learner_event_log") == "3" }, "three taps logged")
        // "With the glow": the modeled word and the glowing word, not the dimmed one (read from the file).
        XCTAssertEqual(scalar("SELECT COUNT(*) FROM learner_event_log WHERE spotlit = 1"), "2")
        XCTAssertEqual(scalar("SELECT spotlit FROM learner_event_log WHERE item_id = 'sns_0016'"), "0")
        put("ui-tapped")

        // SP-5/SY-5: the peer reads the taps off the relay, in order, with this session's start.
        struct Seen: Decodable { let ok: Bool }
        XCTAssertTrue(try JSONDecoder().decode(Seen.self, from: Data(try wait("peer-saw-taps.json", 90).utf8)).ok,
                      "the child's three taps arrived in the supporter's session")

        // The End chip ends it for everyone.
        app.buttons["spot:chip"].tap()
        XCTAssertTrue(poll(10) { !app.buttons["spot:chip"].exists && self.state(app, "sns_0016") == "" })
        XCTAssertEqual(state(app, "sns_0013"), "")
        XCTAssertEqual(scalar("SELECT COUNT(*) FROM spotlight_session"), "0")
        put("ui-ended-chip")
        _ = try wait("peer-saw-end", 90)

        // A session started on a supporter's device: this board stays plain...
        _ = try wait("peer-supporter-session.json", 90)
        XCTAssertTrue(poll(30) { self.scalar("SELECT by_supporter FROM spotlight_session") == "1" })
        XCTAssertEqual(state(app, "sns_0013"), "", "no glow on the child's board")
        XCTAssertEqual(state(app, "sns_0014"), "")
        XCTAssertFalse(app.buttons["spot:chip"].exists)
        // ...until a word is modeled.
        XCTAssertTrue(poll(60) { self.state(app, "sns_0016") == "modeled" })
        shot(app, "d5-supporter-session-model-only")
        put("ui-saw-plain")
        _ = try wait("peer-ended", 90)
        XCTAssertTrue(poll(30) { self.scalar("SELECT COUNT(*) FROM spotlight_session") == "0" })

        Thread.sleep(forTimeInterval: 6) // acknowledgements flush
        put("ui-done")
        _ = try wait("host-done", 60)
    }

    // MARK: SP-4 SP-5 SP-3: the iPad as a supporter's device

    /// A supporter on the iPad: a session shows the line, a tap models (the
    /// peer reads the frame off the relay), the tip replaces the line, and the
    /// child's presses are counted per session.
    func testSupporterModelsAndSeesTheTipAndCounts() throws {
        let app = try linked(role: "supporter")
        _ = try wait("peer-session.json")
        let line = app.staticTexts["model:line"]
        XCTAssertTrue(line.waitForExistence(timeout: 30), "a supporter's spotlight shows the coach line")
        let first = line.label
        XCTAssertTrue(first.hasPrefix("Your taps light up on "), first)
        XCTAssertTrue(first.hasSuffix(" board. Say each word as you tap it."), first)
        XCTAssertTrue(poll(10) { self.state(app, "sns_0013") == "glowing" }, "a supporter's own device glows")
        shot(app, "d5-supporter-line")

        app.buttons["tile:sns_0013"].tap()
        XCTAssertTrue(poll(10) { line.label != first }, "the tip replaced the line")
        XCTAssertFalse(line.label.isEmpty)
        print("E2E-TIP \(line.label)")
        XCTAssertTrue(app.staticTexts["Tap a word to start."].exists, "a modeling tap never adds to the sentence bar")
        shot(app, "d5-tip-after-model")
        put("ui-modeled")

        let seen = try wait("peer-saw-model.json", 90)
        XCTAssertTrue(seen.contains("\"t\":\"sense:sns_0013\""), seen)
        _ = try wait("peer-child-taps.json", 90)
        let count = app.staticTexts["model:count"]
        XCTAssertTrue(poll(60) { count.exists && count.label.hasSuffix(" pressed 2 times") }, "the child's presses are counted")
        shot(app, "d5-supporter-count")
        put("ui-saw-count")

        Thread.sleep(forTimeInterval: 6)
        put("ui-done")
        _ = try wait("host-done", 60)
    }
}
