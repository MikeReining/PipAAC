//
//  TeamE2ETests.swift
//  PipAACUITests
//
//  044 F2 Works Test: team roles, invites, removal with key rotation and
//  regrant, the device list, and deleting cloud data / the account. NOT a
//  standalone test - scripts/ios/e2e_sync.sh (scenario `team`) starts the
//  LOCAL Worker, a proxy that can cut the regrant leg, and node peers: a
//  second device and two supporters (real sync.mjs, real WebCrypto). They
//  talk through files in PIP_E2E_DIR.
//
//  What is measured, and by whom:
//   - every authority claim (owner-only refusal, removed device refused,
//     pending deletion, the removed supporter unable to decrypt, the
//     remaining supporter's account bundle holding the new epoch) is asked
//     of the RELAY by a peer - never read off this screen;
//   - the interrupted regrant is a REAL kill: the proxy cuts the grant
//     call, this test terminates the app, relaunches it, and the journal
//     drains by itself (the peer reads the Worker to prove it);
//   - the screen is read through accessibility; databases are diffed by
//     the script.
//
//  The simulator cannot run a passkey ceremony, so the owner's account
//  session is issued by the Worker to a software passkey (the peer) and
//  handed to the app by `-pipUITestSeedAccount`; the C5 AccountUITests
//  cover the real sign-in screens.
//

import XCTest

final class TeamE2ETests: XCTestCase {
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

    // MARK: file protocol with the peers

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
                XCTFail("a peer failed: \(why)")
                throw XCTSkip("peer failed")
            }
            Thread.sleep(forTimeInterval: 0.1)
        }
        XCTFail("timed out waiting for peer file \(name)")
        throw XCTSkip("timeout")
    }

    private func json<T: Decodable>(_ type: T.Type, _ name: String, _ timeout: TimeInterval = 180) throws -> T {
        try JSONDecoder().decode(T.self, from: Data(try wait(name, timeout).utf8))
    }

    private struct Emails: Decodable { let owner: String; let s1: String; let s2: String }
    private struct Waiting: Decodable { let acct_id: String; let token: String; let email: String }

    // MARK: app

    private func launch(reset: Bool, extra: [String] = []) -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments = (reset ? ["-pipUITestReset"] : [])
            + ["-PipDataDir", data.path, "-PipBaseURL", base] + extra
        app.launch()
        return app
    }

    private func poll(_ timeout: TimeInterval, _ cond: () -> Bool) -> Bool {
        let end = Date().addingTimeInterval(timeout)
        while Date() < end {
            if cond() { return true }
            Thread.sleep(forTimeInterval: 0.2)
        }
        return cond()
    }

    private func attach(_ app: XCUIApplication, _ name: String) {
        let a = XCTAttachment(screenshot: app.screenshot())
        a.name = name
        a.lifetime = .keepAlways
        add(a)
    }

    /// Board -> Settings -> a section row. Always called from the board
    /// (closeSettings first), so the gear is the way in.
    private func open(_ app: XCUIApplication, _ row: String) {
        XCTAssertTrue(app.buttons["settingsGear"].waitForExistence(timeout: 20))
        app.buttons["settingsGear"].tap()
        XCTAssertTrue(app.buttons[row].waitForExistence(timeout: 20), "settings row \(row)")
        app.buttons[row].tap()
    }

    /// Back to the Settings list (a sub-page shows a back button).
    private func backOut(_ app: XCUIApplication) {
        let back = app.navigationBars.buttons.element(boundBy: 0)
        if back.exists { back.tap() }
    }

    private func closeSettings(_ app: XCUIApplication) {
        for _ in 0..<3 where !app.buttons["settingsDone"].exists { backOut(app) }
        if app.buttons["settingsDone"].exists { app.buttons["settingsDone"].tap() }
        _ = app.buttons["settingsGear"].waitForExistence(timeout: 10)
    }

    /// The Settings form is a lazy list: bring a row on screen before using it.
    @discardableResult
    private func reveal(_ app: XCUIApplication, _ el: XCUIElement) -> Bool {
        for i in 0..<10 {
            if el.exists && el.isHittable { return true }
            if i < 5 { app.swipeUp() } else { app.swipeDown() }
        }
        return el.exists && el.isHittable
    }

    /// A line of text somewhere on the (lazy) form, within `timeout` seconds.
    private func seeText(_ app: XCUIApplication, _ s: String, _ timeout: TimeInterval) -> Bool {
        see(app, text(app, containing: s), timeout)
    }

    /// An element somewhere on the (lazy) form, within `timeout` seconds.
    private func see(_ app: XCUIApplication, _ el: XCUIElement, _ timeout: TimeInterval) -> Bool {
        let end = Date().addingTimeInterval(timeout)
        var n = 0
        while Date() < end {
            if el.exists { return true }
            n += 1
            if n % 3 == 0 { if (n / 3) % 2 == 1 { app.swipeUp() } else { app.swipeDown() } }
            Thread.sleep(forTimeInterval: 0.4)
        }
        return el.exists
    }

    private func text(_ app: XCUIApplication, containing s: String) -> XCUIElement {
        app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", s)).firstMatch
    }

    private func button(_ app: XCUIApplication, idSuffix: String, idPrefix: String) -> XCUIElement {
        app.buttons.matching(NSPredicate(
            format: "identifier BEGINSWITH %@ AND identifier ENDSWITH %@", idPrefix, idSuffix)).firstMatch
    }

    private func tapConfirm(_ app: XCUIApplication, _ id: String, fallback: String) {
        let b = app.buttons[id].firstMatch
        if b.waitForExistence(timeout: 10) { b.tap(); return }
        let f = app.buttons[fallback].firstMatch
        XCTAssertTrue(f.waitForExistence(timeout: 5), "confirm button \(id)")
        f.tap()
    }

    // MARK: the scenario

    func testTeamRolesRemovalAndDeletion() throws {
        let seed = dir.appendingPathComponent("account-seed.json")
        _ = try wait("account-seed.json")
        let emails = try json(Emails.self, "emails.json")
        var app = launch(reset: true, extra: ["-pipUITestSeedAccount", seed.path, "-pipUITestSeedPerson", "Maya"])
        XCTAssertTrue(app.buttons["settingsGear"].waitForExistence(timeout: 40))

        // The web's order: the backup turns sync on (first card) -> then the Team list exists.
        open(app, "settings:backup")
        app.buttons["backup:card"].tap()
        XCTAssertTrue(app.images["rec:qr"].waitForExistence(timeout: 40))
        app.buttons["rec:close"].tap()
        closeSettings(app)
        let userId = try wait("lifetime-on")   // the peer saw our relay user and granted Lifetime
        XCTAssertFalse(userId.isEmpty)

        // AC-4: invite a supporter by email.
        open(app, "settings:team")
        let field = app.textFields["team:inviteEmail"]
        XCTAssertTrue(see(app, field, 30), "linked, signed in, owner: the invite form shows")
        reveal(app, field)
        field.tap()
        field.typeText(emails.s1)
        reveal(app, app.buttons["team:invite"])
        app.buttons["team:invite"].tap()
        XCTAssertTrue(app.staticTexts["Invite sent to \(emails.s1) — nothing syncs until you Allow it."]
            .waitForExistence(timeout: 30), "the web's toast")
        // "invited" is a moment: the supporter (a node peer) may accept before the next look.
        XCTAssertTrue(seeText(app, "\(emails.s1) — ", 30))
        attach(app, "f2-team-invited")

        // AC-5: they accept (peer); the owner sees the wait, taps Allow.
        let s1 = try json(Waiting.self, "s1-waiting", 120)
        XCTAssertTrue(seeText(app, "\(emails.s1) — waiting for an owner's Allow", 30))
        let allow = app.buttons["team:invite:\(s1.token):allow"]
        XCTAssertTrue(allow.waitForExistence(timeout: 10))
        reveal(app, allow)
        attach(app, "f2-team-waiting")
        allow.tap()
        XCTAssertTrue(app.staticTexts.matching(NSPredicate(
            format: "label BEGINSWITH %@", "Allowed — \(emails.s1) gets ")).firstMatch.waitForExistence(timeout: 30))
        XCTAssertTrue(seeText(app, "\(emails.s1) — team, can edit everything", 20))
        try wait("s1-synced", 120)   // the supporter's own database holds the person's words
        attach(app, "f2-team-member")

        // AC-6 / AC-9: Team is refused by the RELAY (peer asserts 403 owner_only), Owner is allowed, back to Team refused.
        try wait("s1-check-1", 60)
        let ownerBtn = app.buttons["team:member:\(s1.acct_id):setOwner"]
        XCTAssertTrue(ownerBtn.waitForExistence(timeout: 10))
        reveal(app, ownerBtn)
        XCTAssertEqual(ownerBtn.label.hasPrefix("Make owner"), true)
        ownerBtn.tap()
        XCTAssertTrue(seeText(app, "\(emails.s1) — owner", 20))
        put("ui-owner-on")
        try wait("s1-check-2", 60)
        let teamBtn = app.buttons["team:member:\(s1.acct_id):setOwner"]
        XCTAssertTrue(teamBtn.label.hasPrefix("Make team"))
        teamBtn.tap()
        XCTAssertTrue(seeText(app, "\(emails.s1) — team, can edit everything", 20))
        put("ui-owner-off")
        try wait("s1-check-3", 60)

        // SY-7: a second device joins through the code this iPad shows; the list names both.
        XCTAssertTrue(reveal(app, app.buttons["team:add"]), "Add a device is on the list")
        app.buttons["team:add"].tap()
        let codeLabel = app.staticTexts["pair:code"]
        XCTAssertTrue(codeLabel.waitForExistence(timeout: 30))
        put("ipad-code.txt", codeLabel.label.replacingOccurrences(of: "Code ", with: ""))
        XCTAssertTrue(app.staticTexts["pair:done"].waitForExistence(timeout: 90))
        app.buttons["pair:close"].tap()
        try wait("d2-synced", 120)
        let d2id = try wait("d2-device.txt").trimmingCharacters(in: .whitespacesAndNewlines)
        let d2row = app.staticTexts["dev:row:\(d2id)"]
        XCTAssertTrue(d2row.waitForExistence(timeout: 30))
        reveal(app, d2row)
        XCTAssertTrue(d2row.label.hasPrefix("Mac · e2e team device"), d2row.label)
        XCTAssertTrue(seeText(app, "iPad · Pip (this one)", 10))
        XCTAssertTrue(app.staticTexts["dev:plan"].label.hasSuffix("can be on every device."), "Lifetime: the relay says so")
        attach(app, "f2-devices")

        // AC-4/5/8: a second supporter; their own synced name shows instead of their email.
        reveal(app, field)
        field.tap()
        field.typeText(emails.s2)
        reveal(app, app.buttons["team:invite"])
        app.buttons["team:invite"].tap()
        let s2 = try json(Waiting.self, "s2-waiting", 120)
        let allow2 = app.buttons["team:invite:\(s2.token):allow"]
        XCTAssertTrue(allow2.waitForExistence(timeout: 60))
        reveal(app, allow2)
        allow2.tap()
        try wait("s2-synced", 120)
        try wait("s2-named", 60)
        XCTAssertTrue(seeText(app, "Ms. Rivera — team, can edit everything", 60),
                      "the supporter's synced name, not their email")
        XCTAssertFalse(text(app, containing: "\(emails.s2) — team").exists)
        attach(app, "f2-team-names")
        closeSettings(app)

        // SY-14: delete this person's cloud data (30-day undo) - the RELAY reports it; undo restores.
        open(app, "settings:backup")
        XCTAssertTrue(see(app, app.buttons["backup:delete"], 20))
        reveal(app, app.buttons["backup:delete"])
        app.buttons["backup:delete"].tap()
        XCTAssertTrue(app.staticTexts["del:body"].waitForExistence(timeout: 10))
        XCTAssertEqual(app.staticTexts["del:body"].label,
                       "The user and its backups will be deleted from the relay in 30 days. Any linked device can undo it before then. This device keeps its local copy.")
        attach(app, "f2-delete-sheet")
        app.buttons["del:confirm"].tap()
        XCTAssertTrue(see(app, app.staticTexts["backup:deleteState"], 30))
        XCTAssertTrue(app.staticTexts["backup:deleteState"].label.contains("is scheduled for deletion on"))
        put("ui-deleted")
        try wait("d2-saw-delete", 60)
        reveal(app, app.buttons["backup:undelete"])
        app.buttons["backup:undelete"].tap()
        XCTAssertTrue(see(app, app.buttons["backup:delete"], 30))
        put("ui-undeleted")
        try wait("d2-saw-undelete", 60)
        closeSettings(app)

        // AC-7 / SY-8: remove a supporter. The proxy cuts the regrant leg; the app is KILLED mid-regrant.
        put("proxy-mode", "cut-grant")
        Thread.sleep(forTimeInterval: 0.5)
        open(app, "settings:team")
        let rm = app.buttons["team:member:\(s1.acct_id):removeSupporter"]
        XCTAssertTrue(see(app, rm, 30))
        reveal(app, rm)
        rm.tap()
        tapConfirm(app, "team:removeConfirm", fallback: "Remove")
        XCTAssertTrue(app.staticTexts["team:regrant"].waitForExistence(timeout: 60),
                      "the rotation committed; the regrant is owed and the screen says so")
        XCTAssertFalse(app.staticTexts["team:row:member:\(s1.acct_id)"].exists, "the removed supporter left the list")
        XCTAssertTrue(seeText(app, "Ms. Rivera — team", 10))
        attach(app, "f2-regrant-pending")
        put("ui-cut-active")
        try wait("s2-stale-ok", 60)    // the Worker still holds only epoch 1 for the remaining supporter
        Thread.sleep(forTimeInterval: 1)
        app.terminate()                // the kill

        put("proxy-mode", "pass")
        Thread.sleep(forTimeInterval: 0.5)
        app = launch(reset: false)     // relaunch: no seed, no reset - the journal and the sign-in are on disk
        XCTAssertTrue(app.buttons["settingsGear"].waitForExistence(timeout: 40))
        open(app, "settings:team")
        XCTAssertTrue(seeText(app, "Ms. Rivera — team", 60))
        XCTAssertTrue(poll(90) { !app.staticTexts["team:regrant"].exists },
                      "the relaunch resumed the regrant by itself")
        attach(app, "f2-regrant-drained")
        put("ui-drained")
        try wait("s2-regrant-ok", 90)  // the Worker now holds the new epoch for the remaining supporter, and it opens a post-removal op

        // The remaining devices converge: device 2's post-removal edit (sealed under the new epoch) reaches this iPad.
        struct Post: Decodable { let name: String; let epoch: Int }
        let post = try json(Post.self, "peer-edit-post.json", 90)
        XCTAssertGreaterThanOrEqual(post.epoch, 2)
        closeSettings(app)
        let ent = app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH 'tile:' AND label == %@", post.name)).firstMatch
        XCTAssertTrue(ent.waitForExistence(timeout: 90), "device 2's new-epoch rename shows on the board")
        Thread.sleep(forTimeInterval: 2)
        put("ui-final")                // the peers dump their databases now
        try wait("s2-regrant-ok")

        // SY-7: remove the second device - rotation again, the RELAY refuses it afterwards.
        open(app, "settings:team")
        let rmDev = app.buttons["dev:remove:\(d2id)"]
        XCTAssertTrue(see(app, rmDev, 30))
        reveal(app, rmDev)
        rmDev.tap()
        tapConfirm(app, "dev:removeConfirm", fallback: "Remove")
        XCTAssertTrue(poll(30) { !app.staticTexts["dev:row:\(d2id)"].exists })
        put("ui-d2-removed")
        try wait("d2-removed-ok", 60)
        attach(app, "f2-device-removed")
        closeSettings(app)

        // AC-10: delete my account.
        open(app, "settings:account")
        XCTAssertTrue(see(app, app.staticTexts["acct:state"], 20))
        XCTAssertTrue(app.staticTexts["acct:state"].label.hasPrefix("Signed in as \(emails.owner)"))
        attach(app, "f2-account")
        reveal(app, app.buttons["acct:delete"])
        app.buttons["acct:delete"].tap()
        tapConfirm(app, "acct:deleteConfirm", fallback: "Delete account")
        XCTAssertTrue(app.staticTexts["Account deleted."].waitForExistence(timeout: 30))
        // The sign-in is gone from this device. This is the person's own synced device, so (as on the web,
        // renderAccount) the sign-in form stays hidden here: "Sign in on a supporter's device."
        XCTAssertTrue(app.staticTexts["acct:hidden"].waitForExistence(timeout: 20))
        XCTAssertFalse(text(app, containing: "Signed in as").exists)
        put("ui-account-deleted")
        try wait("host-done", 90)
    }
}
