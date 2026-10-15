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
        app.launchArguments = ["-PipDataDir", dir.path, "-PipOpenURL", url]
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

    func testOtherLinksDoNotOpenSettings() {
        // The invite link stays in Safari (the app has no invitee landing),
        // and the AASA does not claim it; if one reaches the app anyway it
        // is ignored rather than half-handled.
        let app = launch(opening: "https://app.pipaac.org/?invite=AbCdEfGhIjKlMnOpQrStUv")
        XCTAssertTrue(app.buttons["tile:sns_0013"].waitForExistence(timeout: 30))
        XCTAssertFalse(app.textFields["acct:paste"].exists)
        XCTAssertTrue(app.buttons["settingsGear"].exists)
    }
}
