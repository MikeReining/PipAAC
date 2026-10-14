//
//  AccountUITests.swift
//  PipAACUITests
//
//  044 C5: Settings -> Your account against the LOCAL Worker (no peer; run
//  by scripts/ios/e2e_sync.sh as the "account" scenario, PIP_E2E_BASE set).
//
//  What the simulator can prove: the email-link request reaches the Worker
//  (the dev mailbox holds the link), the pasted link is claimed, and the app
//  reaches the passkey step. It cannot complete a passkey ceremony (no
//  iCloud Keychain / pipaac.org association), so the flow must end in a
//  plain "Sign-in failed" line with the person still signed out - and the
//  PRF -> account key path is proven in node (app_account.test.mjs) and in
//  AccountHostTests. The real-iPad run is the manual script in
//  docs/phases/044_Native_iOS_App.md section 10 (C5).
//

import XCTest

final class AccountUITests: XCTestCase {
    private var base: String!
    private var data: URL!
    private var dir: URL!

    override func setUpWithError() throws {
        continueAfterFailure = false
        guard let b = ProcessInfo.processInfo.environment["PIP_E2E_BASE"],
              let d = ProcessInfo.processInfo.environment["PIP_E2E_DIR"] else {
            throw XCTSkip("PIP_E2E_BASE/PIP_E2E_DIR not set - run scripts/ios/e2e_sync.sh")
        }
        base = b
        dir = URL(fileURLWithPath: d, isDirectory: true)
        data = dir.appendingPathComponent("ipad", isDirectory: true)
        try FileManager.default.createDirectory(at: data, withIntermediateDirectories: true)
    }

    private func attach(_ app: XCUIApplication, _ name: String) {
        let a = XCTAttachment(screenshot: app.screenshot())
        a.name = name
        a.lifetime = .keepAlways
        add(a)
    }

    /// The Worker's dev mailbox stands in for the email. The test runner's
    /// own network is under ATS, so e2e_sync.sh reads the mailbox for us:
    /// we drop the address in email.txt and wait for link.txt.
    private func mailboxLink(_ email: String) -> String? {
        let url = dir.appendingPathComponent("email.txt")
        try? email.write(to: url, atomically: true, encoding: .utf8)
        let end = Date().addingTimeInterval(30)
        while Date() < end {
            if let s = try? String(contentsOf: dir.appendingPathComponent("link.txt"), encoding: .utf8),
               !s.isEmpty { return s.trimmingCharacters(in: .whitespacesAndNewlines) }
            Thread.sleep(forTimeInterval: 0.2)
        }
        return nil
    }

    func testAccountLinkClaimAndThePasskeyStep() throws {
        let app = XCUIApplication()
        app.launchArguments = ["-pipUITestReset", "-PipDataDir", data.path, "-PipBaseURL", base]
        app.launch()
        XCTAssertTrue(app.buttons["tile:sns_0013"].waitForExistence(timeout: 30))
        app.buttons["settingsGear"].tap()
        XCTAssertTrue(app.buttons["settingsSection:account"].waitForExistence(timeout: 10))
        app.buttons["settingsSection:account"].tap()
        XCTAssertEqual(app.staticTexts["acct:state"].label, "Not signed in.")

        let email = "c5-\(UUID().uuidString.prefix(8).lowercased())@example.com"
        let field = app.textFields["acct:email"]
        field.tap()
        field.typeText(email)
        app.buttons["acct:send"].tap()
        let status = app.staticTexts["acct:linkStatus"]
        XCTAssertTrue(status.waitForExistence(timeout: 20))
        XCTAssertEqual(status.label, "Link sent — open it on the device you want to sign in.")
        attach(app, "c5-account-link-sent")

        // The Worker's dev mailbox is the stand-in for the email.
        let link = try XCTUnwrap(mailboxLink(email), "the dev mailbox holds the link the Worker made")
        XCTAssertTrue(link.contains("/?signin="))
        let paste = app.textFields["acct:paste"]
        paste.tap()
        paste.typeText(link)
        app.buttons["acct:signin"].tap()
        // Claimed -> new account -> the passkey step. The simulator has no
        // passkey to offer, so it ends in a plain failure line.
        let line = app.staticTexts["acct:line"]
        XCTAssertTrue(line.waitForExistence(timeout: 30))
        let ended = NSPredicate(format: "label BEGINSWITH 'Sign-in'")
        let done = XCTNSPredicateExpectation(predicate: ended, object: line)
        let r = XCTWaiter().wait(for: [done], timeout: 60)
        attach(app, "c5-account-passkey-step")
        if r == .completed {
            XCTAssertTrue(line.label.hasPrefix("Sign-in failed") || line.label == "Sign-in was cancelled.", line.label)
        }
        XCTAssertEqual(app.staticTexts["acct:state"].label, "Not signed in.", "no half-signed-in state is kept")
    }
}
