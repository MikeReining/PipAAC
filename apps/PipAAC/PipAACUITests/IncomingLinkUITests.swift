//
//  IncomingLinkUITests.swift
//  PipAACUITests
//
//  044 universal links: an emailed sign-in link handed to the app lands in
//  the same flow as pasting it - Settings -> Your account, the link in the
//  paste field, Sign in run. The simulator never validates the AASA, so the
//  OS hand-off is stood in for by `-PipOpenURL <url>`, which calls the same
//  AppModel.handleIncomingURL that onOpenURL / onContinueUserActivity call.
//  The app is hermetic (-PipDataDir): the base URL is a refusing loopback
//  port, so "Sign in" reaches the core's honest offline path, never prod.
//

import XCTest

final class IncomingLinkUITests: XCTestCase {
    private var dir: URL!

    override func setUpWithError() throws {
        continueAfterFailure = false
        dir = FileManager.default.temporaryDirectory
            .appendingPathComponent("pip-link-\(UUID().uuidString)", isDirectory: true)
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
    }

    private func launch(opening url: String) -> XCUIApplication {
        let app = XCUIApplication()
        // -pipUITestReset: a signed-in account another test left in the
        // keychain (InviteE2ETests) would skip the sign-in this test checks.
        app.launchArguments = ["-PipDataDir", dir.path, "-pipUITestReset", "-PipOpenURL", url]
        app.launch()
        return app
    }

    func testSignInLinkLandsInYourAccountAndRunsTheSignIn() {
        let link = "https://app.pipaac.org/?signin=AbCdEfGhIjKlMnOpQrStUv"
        let app = launch(opening: link)
        let paste = app.textFields["acct:paste"]
        XCTAssertTrue(paste.waitForExistence(timeout: 30), "the link opens Settings on Your account")
        XCTAssertEqual(app.staticTexts["acct:state"].label, "Not signed in.")
        XCTAssertEqual(paste.value as? String, link, "the link is in the paste field, as if pasted")
        // The same Sign in a paste runs: it reached the core and answered.
        let line = app.staticTexts["acct:line"]
        XCTAssertTrue(line.waitForExistence(timeout: 30), "the sign-in ran")
        XCTAssertFalse(line.label.isEmpty)
        let a = XCTAttachment(screenshot: app.screenshot())
        a.name = "incoming-signin-link"
        a.lifetime = .keepAlways
        add(a)
    }

    func testInviteLinkOpensTheInviteeLanding() {
        // 044 IL: the supporter invite opens the app's landing, not Safari.
        // The base URL is a refusing loopback port, so the first step ends
        // in the web's own "Invite failed" line - never a request to prod.
        // (The whole flow against a real Worker: InviteE2ETests.)
        let app = launch(opening: "https://app.pipaac.org/?invite=AbCdEfGhIjKlMnOpQrStUv")
        let line = app.staticTexts["invite:line"]
        XCTAssertTrue(line.waitForExistence(timeout: 30), "the invite opens the landing sheet")
        XCTAssertTrue(app.navigationBars["Supporter invite"].exists)
        let end = Date().addingTimeInterval(30)
        while Date() < end, !line.label.hasPrefix("Invite failed — ") { Thread.sleep(forTimeInterval: 0.2) }
        XCTAssertTrue(line.label.hasPrefix("Invite failed — "), "the web's own failure line; saw: \(line.label)")
        XCTAssertFalse(app.textFields["acct:paste"].exists, "an invite is not a sign-in: Settings stays shut")
        let a = XCTAttachment(screenshot: app.screenshot())
        a.name = "incoming-invite-link"
        a.lifetime = .keepAlways
        add(a)
        app.buttons["invite:close"].tap()
        XCTAssertTrue(app.buttons["settingsGear"].waitForExistence(timeout: 10), "closing returns to the board")
    }

    func testOtherLinksDoNotOpenAnything() {
        // Anything that is neither the sign-in link nor the invite is
        // ignored rather than half-handled.
        let app = launch(opening: "https://app.pipaac.org/?other=AbCdEfGhIjKlMnOpQrStUv")
        XCTAssertTrue(app.buttons["tile:sns_0013"].waitForExistence(timeout: 30))
        XCTAssertFalse(app.textFields["acct:paste"].exists)
        XCTAssertFalse(app.staticTexts["invite:line"].exists)
        XCTAssertTrue(app.buttons["settingsGear"].exists)
    }
}
