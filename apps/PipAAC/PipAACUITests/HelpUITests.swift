//
//  HelpUITests.swift
//  PipAACUITests
//
//  E5 works tests (phase 044 HP-1..4). The Worker is stubbed in the app
//  (`-pipUITestHelpStub <dir>`): the stub records what it received into
//  <dir>, and these tests read those files - the request bodies are an
//  instrument the UI cannot influence. Nothing reaches production.
//  Expected answer text is read from src/help/answers.en.json (the
//  authored truth), found from this file's path.
//

import XCTest

final class HelpUITests: XCTestCase {
    private var dir: URL!

    override func setUpWithError() throws {
        continueAfterFailure = false
        dir = FileManager.default.temporaryDirectory
            .appendingPathComponent("pip-e5-\(UUID().uuidString)", isDirectory: true)
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
    }

    private func launch(_ mode: String) -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments = ["-pipUITestReset", mode, "-pipUITestHelpStub", dir.path,
                              // The email is remembered between visits (the web
                              // does too); start each test with it empty.
                              "-pip-help-email", ""]
        app.launch()
        return app
    }

    private func el(_ app: XCUIApplication, _ id: String) -> XCUIElement {
        app.descendants(matching: .any)[id].firstMatch
    }

    /// The Form is lazy: scroll until the element is on screen.
    @discardableResult private func reveal(_ app: XCUIApplication, _ id: String) -> XCUIElement {
        let e = el(app, id)
        var n = 0
        while !(e.exists && e.isHittable) && n < 12 {
            app.swipeUp(velocity: .slow)
            n += 1
        }
        XCTAssertTrue(e.exists, "\(id) not found")
        return e
    }

    private func openHelp(_ app: XCUIApplication) {
        app.buttons["settingsGear"].tap()
        XCTAssertTrue(el(app, "settingsDone").waitForExistence(timeout: 10))
        reveal(app, "settings:help").tap()
        if !el(app, "help:q").waitForExistence(timeout: 10) { print("DEBUGTREE", app.debugDescription) }
        XCTAssertTrue(el(app, "help:q").exists)
    }

    /// Evidence for the slice report (/tmp/pipaac-shots-e5/).
    private func shot(_ app: XCUIApplication, _ name: String) {
        let d = URL(fileURLWithPath: "/tmp/pipaac-shots-e5", isDirectory: true)
        try? FileManager.default.createDirectory(at: d, withIntermediateDirectories: true)
        try? app.screenshot().pngRepresentation.write(to: d.appendingPathComponent("\(name).png"))
    }

    private func authored() throws -> [String: String] {
        // .../apps/PipAAC/PipAACUITests/HelpUITests.swift -> repo root
        let root = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
        let data = try Data(contentsOf: root.appendingPathComponent("src/help/answers.en.json"))
        let doc = try JSONSerialization.jsonObject(with: data) as! [String: Any]
        var out: [String: String] = [:]
        for a in doc["answers"] as! [[String: Any]] { out[a["id"] as! String] = a["a"] as? String }
        return out
    }

    func testOfflineSearchOpensAnswerAndShowMeLandsOnVoiceRow() throws {
        let app = launch("-pipUITestHelpOffline")
        openHelp(app)
        let q = el(app, "help:q")
        q.tap()
        q.typeText("voice")
        let row = el(app, "help:answer:voice")
        XCTAssertTrue(row.waitForExistence(timeout: 10), "on-device search finds the voice answer")
        if row.value as? String != "expanded" { row.tap() }
        let truth = try authored()["voice"]!.components(separatedBy: "\n\n")
        for (i, p) in truth.enumerated() {
            let body = el(app, "help:body:voice:\(i)")
            XCTAssertTrue(body.waitForExistence(timeout: 5))
            XCTAssertEqual(body.label, p, "answer text matches answers.en.json")
        }
        shot(app, "help-answer-voice")
        // Offline: the Worker was never asked.
        XCTAssertFalse(FileManager.default.fileExists(atPath: dir.appendingPathComponent("search-url.txt").path))
        el(app, "help:show:voice").tap()
        XCTAssertTrue(el(app, "found:voice").waitForExistence(timeout: 10), "voice row is lit")
        XCTAssertTrue(el(app, "voice:change").exists)
        shot(app, "settings-voice-row-lit")
        XCTAssertFalse(el(app, "help:q").exists, "Help closed behind the row")
    }

    func testSearchByMeaningUsesTheWorkersAnswer() throws {
        let app = launch("-pipUITestHelpOnline")
        openHelp(app)
        let q = el(app, "help:q")
        q.tap()
        q.typeText("emotions")
        XCTAssertTrue(el(app, "help:answer:feelings").waitForExistence(timeout: 10),
                      "the Worker's meaning hit is shown")
        let sent = try String(contentsOf: dir.appendingPathComponent("search-url.txt"), encoding: .utf8)
        XCTAssertTrue(sent.hasSuffix("/api/v1/help/search?q=emotions"), sent)
    }

    func testSettingsSearchFindsHelpAndRows() throws {
        let app = launch("-pipUITestHelpOffline")
        app.buttons["settingsGear"].tap()
        let field = app.searchFields.firstMatch
        XCTAssertTrue(field.waitForExistence(timeout: 10))
        field.tap()
        field.typeText("voice")
        XCTAssertTrue(el(app, "help:answer:voice").waitForExistence(timeout: 10))
    }

    func testWriteToUsSendsTheExpectedFields() throws {
        let app = launch("-pipUITestHelpOnline")
        openHelp(app)
        let msg = reveal(app, "help:msg")
        msg.tap()
        msg.typeText("The tiles are too small")
        let email = reveal(app, "help:email")
        email.tap()
        // Let focus settle before typing (a typeText racing the keyboard
        // under load repeats itself into the field).
        let focused = XCTNSPredicateExpectation(
            predicate: NSPredicate(format: "hasKeyboardFocus == true"), object: email)
        XCTAssertEqual(XCTWaiter().wait(for: [focused], timeout: 30), .completed)
        email.typeText("parent@example.com")
        reveal(app, "help:send").tap()
        let status = reveal(app, "help:status")
        XCTAssertEqual(status.label, "Sent. Thank you.")
        shot(app, "write-to-us-sent")
        let data = try Data(contentsOf: dir.appendingPathComponent("write-body.json"))
        let body = try JSONSerialization.jsonObject(with: data) as! [String: Any]
        XCTAssertEqual(body["message"] as? String, "The tiles are too small")
        XCTAssertEqual(body["email"] as? String, "parent@example.com")
        let d = body["details"] as! [String: String]
        XCTAssertEqual(Set(d.keys), ["Pip version", "Device", "Screen", "Online", "Pip Lifetime", "This device"])
        XCTAssertEqual(d["Online"], "yes")
        XCTAssertEqual(Set(body.keys), ["message", "email", "details"])
    }

    func testOutsideLinkIsBehindTheParentGate() throws {
        let app = launch("-pipUITestHelpOffline")
        openHelp(app)
        reveal(app, "help:mail").tap()
        let prompt = el(app, "gate:prompt")
        XCTAssertTrue(prompt.waitForExistence(timeout: 10))
        // Wrong digits are refused and the challenge changes.
        let input = el(app, "gate:input")
        input.tap()
        input.typeText("000")
        XCTAssertTrue(el(app, "gate:wrong").waitForExistence(timeout: 20))
        el(app, "gate:cancel").tap()
        XCTAssertTrue(el(app, "help:mail").waitForExistence(timeout: 5), "cancel leaves Help as it was")
    }
}
