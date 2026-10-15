//
//  FeelingUITests.swift
//  PipAACUITests
//
//  D4 works tests (phase 044 BS-24, SN-10, and the voice lock): the
//  expressive-voice faces and the post-trial voice lock against the STUB
//  Worker (StubWorker, SayUITests.swift). No paid API is reachable.
//
//  Instruments the UI cannot influence: the stub's request log (what the
//  iPad SENT - the web's /api/v1/voice/speak body with the feeling) and the
//  app's played_clips.txt (the path PipSpeaker's muted player was given),
//  whose bytes are compared with the stub's clip.
//

import UIKit
import XCTest

@MainActor
final class FeelingUITests: XCTestCase {
    private var dir: URL!
    private var server: StubWorker!

    override func setUpWithError() throws {
        continueAfterFailure = false
        dir = FileManager.default.temporaryDirectory
            .appendingPathComponent("pip-feel-\(UUID().uuidString)", isDirectory: true)
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        server = try StubWorker()
    }

    override func tearDown() { server?.stop() }

    private func launch() -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments = ["-PipDataDir", dir.path, "-PipTraceAudio", "YES",
                               "-PipBaseURL", "http://127.0.0.1:\(server.port)"]
        app.launch()
        return app
    }

    private func played() -> [String] {
        ((try? String(contentsOf: dir.appendingPathComponent("played_clips.txt"), encoding: .utf8)) ?? "")
            .split(separator: "\n").map(String.init)
    }

    private func shot(_ app: XCUIApplication, _ name: String) {
        let a = XCTAttachment(screenshot: app.screenshot())
        a.name = name
        a.lifetime = .keepAlways
        add(a)
    }

    private func wait(_ what: String, timeout: TimeInterval = 20, _ cond: () -> Bool) {
        let end = Date().addingTimeInterval(timeout)
        while Date() < end {
            if cond() { return }
            RunLoop.current.run(until: Date().addingTimeInterval(0.1))
        }
        XCTFail("timed out waiting for: \(what)")
    }

    private func barWords(_ app: XCUIApplication) -> [String] {
        app.descendants(matching: .any)["sentenceBar"].staticTexts.allElementsBoundByIndex.map { $0.label }
    }

    /// Board up, trial read, two words on the bar.
    private func boardWithTwoWords(_ app: XCUIApplication) {
        XCTAssertTrue(app.buttons["want"].waitForExistence(timeout: 30))
        wait("the trial is read") { server.requests("/api/v1/trial").count >= 1 }
        app.buttons["go"].tap()
        app.buttons["more"].tap()
        wait("two chips") { barWords(app).count == 2 }
    }

    private func openTalking(_ app: XCUIApplication) {
        app.buttons["settingsGear"].tap()
        XCTAssertTrue(app.buttons["settingsSection:talking"].waitForExistence(timeout: 10))
        app.buttons["settingsSection:talking"].tap()
    }

    // MARK: BS-24

    /// A face tap speaks the bar in that feeling: the stub receives the
    /// web's speak request with the feeling, and the clip it returns plays.
    func testFaceTapSpeaksWithThatFeeling() throws {
        let app = launch()
        boardWithTwoWords(app)
        let face = app.buttons["face:sad"]
        XCTAssertTrue(face.waitForExistence(timeout: 10), "the faces own the strip's last slot")
        XCTAssertEqual(face.label, "Say it sad")
        shot(app, "feel-faces-on-the-bar")
        let before = played().count

        face.tap()

        wait("the feeling request") { server.requests("/api/v1/voice/speak").count == 1 }
        let sp = try XCTUnwrap(server.requests("/api/v1/voice/speak").first)
        XCTAssertEqual(sp.body["feeling"] as? String, "sad")
        XCTAssertEqual(sp.body["text"] as? String, "go more.")
        XCTAssertEqual(Set(sp.body.keys), ["user_id", "voice", "text", "feeling"])
        wait("the clip plays through the speaker") {
            played().count > before && played().last?.contains("/VoiceCache/pip-voice/") == true
        }
        let path = try XCTUnwrap(played().last)
        XCTAssertEqual(try Data(contentsOf: URL(fileURLWithPath: path)), StubWorker.clip)
        XCTAssertEqual(barWords(app).count, 2, "the bar keeps her words")

        // ▶ afterwards is neutral again - the feeling was for that press only.
        app.buttons["Play"].tap()
        wait("neutral speak") { server.requests("/api/v1/voice/speak").count == 2 }
        XCTAssertEqual(server.requests("/api/v1/voice/speak")[1].body["feeling"] as? String, "neutral")
    }

    /// After the trial a face speaks the bar the free way and the adult
    /// gets the ask once (speech.js askOnce).
    func testFaceAfterTrialAsksOnceAndSpeaksWordByWord() throws {
        server.trialEnded = true
        let app = launch()
        boardWithTwoWords(app)
        let face = app.buttons["face:happy"]
        XCTAssertTrue(face.waitForExistence(timeout: 10))
        let before = played().count

        face.tap()

        let toast = app.staticTexts["toast"]
        let ask = "A feeling voice comes with Pip Lifetime — the free trial has ended."
        wait("the ask", timeout: 10) { toast.exists && toast.label == ask }
        XCTAssertTrue(app.buttons["See Pip Lifetime"].exists, "the ask offers the door")
        shot(app, "feel-face-trial-over-ask")
        wait("her word clips play") { played().count >= before + 2 }
        XCTAssertFalse(played().suffix(2).contains { $0.contains("/VoiceCache/") })
        XCTAssertTrue(server.requests("/api/v1/voice/speak").isEmpty, "no feeling request is sent")
        XCTAssertEqual(barWords(app).count, 2, "nothing is replaced")
    }

    // MARK: SN-10

    /// Settings -> Talking -> Try the faces: the sample sentence in that feeling.
    func testTryTheFacesInSettings() throws {
        let app = launch()
        XCTAssertTrue(app.buttons["want"].waitForExistence(timeout: 30))
        wait("the trial is read") { server.requests("/api/v1/trial").count >= 1 }
        openTalking(app)
        let face = app.buttons["tryface:angry"]
        XCTAssertTrue(face.waitForExistence(timeout: 10))
        XCTAssertEqual(face.label, "Hear it angry")
        shot(app, "feel-try-the-faces")
        let before = played().count

        face.tap()

        wait("the sample request") { server.requests("/api/v1/voice/speak").count == 1 }
        let sp = try XCTUnwrap(server.requests("/api/v1/voice/speak").first)
        XCTAssertEqual(sp.body["text"] as? String, "I want an apple.")
        XCTAssertEqual(sp.body["feeling"] as? String, "angry")
        wait("the clip plays") {
            played().count > before && played().last?.contains("/VoiceCache/pip-voice/") == true
        }
        XCTAssertEqual(try Data(contentsOf: URL(fileURLWithPath: try XCTUnwrap(played().last))), StubWorker.clip)

        // Off dims and disables them, and the board's slot goes back to words.
        app.switches["Feeling faces"].firstMatch.coordinate(withNormalizedOffset: CGVector(dx: 0.95, dy: 0.5)).tap()
        wait("the faces are disabled") { !app.buttons["tryface:angry"].isEnabled }
        XCTAssertTrue(app.staticTexts["Off — the Smart bar shows word suggestions instead."].exists)
        shot(app, "feel-try-the-faces-off")
    }

    // MARK: voice lock

    /// The trial is over: every non-default voice shows the lock and can't
    /// be picked; the lock opens the Lifetime page. Pip's own voice is free.
    func testLockedVoicesAfterTrialCannotBePicked() throws {
        server.trialEnded = true
        let app = launch()
        XCTAssertTrue(app.buttons["want"].waitForExistence(timeout: 30))
        wait("the trial is read") { server.requests("/api/v1/trial").count >= 1 }
        RunLoop.current.run(until: Date().addingTimeInterval(0.5))
        openTalking(app)
        XCTAssertTrue(app.buttons["voice:change"].waitForExistence(timeout: 10))
        app.buttons["voice:change"].tap()

        let lock = app.buttons["voice:locked:voi_mia_en"]
        XCTAssertTrue(lock.waitForExistence(timeout: 10), "Mia is locked after the trial")
        XCTAssertEqual(lock.label, "🔒 Pip Lifetime")
        XCTAssertFalse(app.buttons["voice:use:voi_mia_en"].exists, "a locked voice can't be picked")
        XCTAssertFalse(app.buttons["voice:hear:voi_mia_en"].exists)
        XCTAssertTrue(app.staticTexts["voice:inuse:voi_default_en"].exists, "Pip's own voice stays")
        XCTAssertTrue(app.buttons["voice:hear:voi_default_en"].exists)
        shot(app, "feel-voices-locked")

        lock.tap()
        let line = app.descendants(matching: .any)["life:trial"].firstMatch
        XCTAssertTrue(line.waitForExistence(timeout: 30), "the lock opens the Lifetime page")
        XCTAssertEqual(line.label, "Free trial ended. Buy to turn it all back on.")
    }

    /// While the trial runs nothing is locked.
    func testVoicesUnlockedDuringTrial() throws {
        let app = launch()
        XCTAssertTrue(app.buttons["want"].waitForExistence(timeout: 30))
        wait("the trial is read") { server.requests("/api/v1/trial").count >= 1 }
        openTalking(app)
        XCTAssertTrue(app.buttons["voice:change"].waitForExistence(timeout: 10))
        app.buttons["voice:change"].tap()
        XCTAssertTrue(app.buttons["voice:use:voi_mia_en"].waitForExistence(timeout: 10))
        XCTAssertFalse(app.buttons["voice:locked:voi_mia_en"].exists)
    }
}
