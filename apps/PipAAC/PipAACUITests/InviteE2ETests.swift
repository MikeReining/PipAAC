//
//  InviteE2ETests.swift
//  PipAACUITests
//
//  044 IL Works Test: a supporter's emailed invite opens the iPad app and the
//  supporter can accept it. NOT a standalone test - scripts/ios/e2e_sync.sh
//  (scenario `invite`) starts the LOCAL Worker and a node peer that is the
//  FAMILY: it owns a person, invites this iPad's supporter by email, and
//  Allows once the Worker says the invite was claimed. They talk through
//  files in PIP_E2E_DIR.
//
//  What is measured, and by whom:
//   - "claimed" is asked of the WORKER by the peer (the invite's own status),
//     not read off this screen;
//   - that this iPad really joined the person's relay is asked of the relay
//     (the peer lists the person's devices);
//   - the arrival survives a relaunch: the app is KILLED, started again with
//     no link, and the person is read back from the registry (People list);
//   - the granted key really works: a rename the peer makes AFTER the Allow
//     shows on the iPad board once the person is opened - only possible with
//     the key and the registration the invite brought.
//
//  The simulator cannot run a passkey sheet, so the app runs the ceremony in
//  software (`-pipUITestSoftPasskey`, SoftPasskey.swift): a real credential
//  and PRF, registered with the real Worker. The OS hand-off of the link is
//  stood in for by `-PipOpenURL`, which calls the same handleIncomingURL as
//  onOpenURL (IncomingLinkUITests).
//

import XCTest

final class InviteE2ETests: XCTestCase {
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

    private struct Person: Decodable { let entityId: String; let userId: String }

    // MARK: app

    private func launch(reset: Bool, extra: [String] = []) -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments = (reset ? ["-pipUITestReset"] : [])
            + ["-PipDataDir", data.path, "-PipBaseURL", base] + extra
        app.launch()
        return app
    }

    private func attach(_ app: XCUIApplication, _ name: String) {
        let a = XCTAttachment(screenshot: app.screenshot())
        a.name = name
        a.lifetime = .keepAlways
        add(a)
    }

    private func seeLabel(_ el: XCUIElement, _ label: String, _ timeout: TimeInterval) -> Bool {
        let end = Date().addingTimeInterval(timeout)
        while Date() < end {
            if el.exists, el.label == label { return true }
            Thread.sleep(forTimeInterval: 0.2)
        }
        return el.exists && el.label == label
    }

    // MARK: the scenario

    func testSupporterInviteOpensTheAppAndIsAccepted() throws {
        let person = try JSONDecoder().decode(Person.self, from: Data(try wait("person.json").utf8))
        let url = try wait("invite-url.txt").trimmingCharacters(in: .whitespacesAndNewlines)

        // The invite link opens the app: the landing sheet, the web's words.
        var app = launch(reset: true, extra: ["-pipUITestSoftPasskey", "-PipOpenURL", url])
        let line = app.staticTexts["invite:line"]
        XCTAssertTrue(line.waitForExistence(timeout: 40), "the invite link opens the landing")
        XCTAssertTrue(app.navigationBars["Supporter invite"].exists)
        let waiting = "Signed in — waiting for the family to Allow this share…"
        XCTAssertTrue(seeLabel(line, waiting, 90), "signed in with a new passkey, waiting; saw: \(line.label)")
        attach(app, "il-waiting-for-the-family")
        put("ui-opened")

        // The family Allows (the peer, once the WORKER says the invite is claimed).
        let done = "Done — the user is on this device."
        XCTAssertTrue(seeLabel(line, done, 120), "the Allow brings the user over; saw: \(line.label)")
        attach(app, "il-done")
        put("ui-landed")
        app.buttons["invite:close"].tap()

        // Survives a relaunch: kill the app, start it with no link, read the person back.
        app.terminate()
        app = launch(reset: false)
        XCTAssertTrue(app.buttons["settingsGear"].waitForExistence(timeout: 40))
        XCTAssertFalse(app.staticTexts["invite:line"].exists, "no link this time: no landing")
        app.buttons["settingsGear"].tap()
        XCTAssertTrue(app.buttons["settingsSection:team"].waitForExistence(timeout: 20))
        app.buttons["settingsSection:team"].tap()
        XCTAssertTrue(app.buttons["settings:people"].waitForExistence(timeout: 20))
        app.buttons["settings:people"].tap()
        let sw = app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Switch to'")).firstMatch
        XCTAssertTrue(sw.waitForExistence(timeout: 20), "the invited person is in the list after a relaunch")
        attach(app, "il-people-after-relaunch")

        // Open them: the key the Allow brought opens what the family wrote after it.
        _ = try wait("peer-edit.json")
        sw.tap()
        let tile = app.buttons["tile:\(person.entityId)"]
        XCTAssertTrue(tile.waitForExistence(timeout: 60), "the person's board opens")
        XCTAssertTrue(seeLabel(tile, "Zedd", 60), "the family's edit, sealed under the granted key, shows; saw: \(tile.label)")
        attach(app, "il-person-board")
        put("ui-saw-edit")
    }
}
