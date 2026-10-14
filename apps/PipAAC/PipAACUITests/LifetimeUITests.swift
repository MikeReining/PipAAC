//
//  LifetimeUITests.swift
//  PipAACUITests
//
//  F1 works tests (phase 044 PU-3, PU-4, PU-7, PU-8, PU-10): the Lifetime
//  page, the parent gate, the purchase, and a refund, end to end through
//  the real app, core, host crypto and relay client against a STUB Worker
//  in this test process. The App Store sheet cannot be driven from an
//  XCUITest, so the app runs with `-PipFakeStore YES` (a store that
//  "succeeds" with a placeholder transaction); the StoreKit side is proven
//  by PipAACTests/PurchaseTests with StoreKitTest.
//
//  Instruments the UI cannot influence: the stub's request log (nothing was
//  redeemed before the gate; what the iPad sent after it), and a RELAUNCH -
//  ownership must come back from the Worker, not from the app's own memory.
//

import Network
import XCTest

@MainActor
final class LifetimeUITests: XCTestCase {
    private var dir: URL!
    private var worker: LifetimeStub!

    override func setUpWithError() throws {
        continueAfterFailure = false
        dir = FileManager.default.temporaryDirectory
            .appendingPathComponent("pip-f1-\(UUID().uuidString)", isDirectory: true)
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        worker = try LifetimeStub()
    }

    override func tearDown() { worker?.stop() }

    private func launch() -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments = ["-PipDataDir", dir.path, "-PipFakeStore", "YES",
                               "-PipBaseURL", "http://127.0.0.1:\(worker.port)"]
        app.launch()
        return app
    }

    private func el(_ app: XCUIApplication, _ id: String) -> XCUIElement {
        app.descendants(matching: .any)[id].firstMatch
    }

    private func shot(_ app: XCUIApplication, _ name: String) {
        let d = URL(fileURLWithPath: "/tmp/pipaac-shots-f1", isDirectory: true)
        try? FileManager.default.createDirectory(at: d, withIntermediateDirectories: true)
        try? app.screenshot().pngRepresentation.write(to: d.appendingPathComponent("\(name).png"))
    }

    private func openLifetime(_ app: XCUIApplication) {
        XCTAssertTrue(app.buttons["want"].waitForExistence(timeout: 30))
        app.buttons["settingsGear"].tap()
        XCTAssertTrue(el(app, "settingsDone").waitForExistence(timeout: 10))
        let row = el(app, "settings:lifetime")
        XCTAssertTrue(row.waitForExistence(timeout: 10), "Settings has a Pip Lifetime row")
        row.tap()
    }

    /// Type the spelled-out digits the gate asks for.
    private func passTheGate(_ app: XCUIApplication) {
        let prompt = el(app, "gate:prompt")
        XCTAssertTrue(prompt.waitForExistence(timeout: 10), "the parent gate is shown")
        let words = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"]
        let asked = prompt.label.replacingOccurrences(of: "Type these digits: ", with: "")
            .components(separatedBy: ", ")
        let digits = asked.compactMap { words.firstIndex(of: $0) }.map(String.init).joined()
        XCTAssertEqual(digits.count, 3, "prompt was: \(prompt.label)")
        let input = el(app, "gate:input")
        input.tap()
        input.typeText(digits)
    }

    func testBuyBehindTheGateOwnedAfterRelaunchAndRefundedAfterRefund() throws {
        var app = launch()
        openLifetime(app)

        // PU-3: the page sells on the web's words, with the trial countdown, no web link.
        let buy = el(app, "life:buy")
        XCTAssertTrue(buy.waitForExistence(timeout: 20))
        XCTAssertTrue(el(app, "life:trial").waitForExistence(timeout: 20), "the trial countdown shows")
        XCTAssertTrue(el(app, "life:trial").label.contains("days left")
                      || el(app, "life:trial").label.contains("day left"), el(app, "life:trial").label)
        XCTAssertFalse(app.buttons["Copy unlock link"].exists)
        XCTAssertTrue(NSPredicate(format: "label CONTAINS '48.99'").evaluate(with: buy), "price from the store: \(buy.label)")
        shot(app, "1-lifetime-for-sale")

        // PU-10: the gate comes first; nothing reaches the Worker until it is passed.
        buy.tap()
        shot(app, "2-parent-gate")
        XCTAssertTrue(el(app, "gate:prompt").waitForExistence(timeout: 10))
        XCTAssertEqual(worker.requests("/api/v1/appstore/redeem").count, 0, "no purchase before the gate")
        el(app, "gate:cancel").tap()
        RunLoop.current.run(until: Date().addingTimeInterval(1))
        XCTAssertEqual(worker.requests("/api/v1/appstore/redeem").count, 0, "cancel buys nothing")

        buy.tap()
        passTheGate(app)

        // PU-4: the signed transaction goes to the Worker for THIS person; then it is theirs.
        XCTAssertTrue(el(app, "life:owned").waitForExistence(timeout: 30), "owned after the Worker said yes")
        let sent = worker.requests("/api/v1/appstore/redeem")
        XCTAssertEqual(sent.count, 1)
        XCTAssertEqual(sent[0].body["jws"] as? String, "fake.jws.fake-1")
        let userId = try XCTUnwrap(sent[0].body["user_id"] as? String)
        XCTAssertEqual(userId.count, 36)
        XCTAssertEqual(worker.entitlement(userId), "lifetime", "the Worker's record, not the UI's claim")
        shot(app, "3-owned")

        // The app reads entitlement only from the Worker: a relaunch still says owned.
        app.terminate()
        app = launch()
        openLifetime(app)
        XCTAssertTrue(el(app, "life:owned").waitForExistence(timeout: 30), "ownership survives a relaunch")
        XCTAssertFalse(el(app, "life:buy").exists)

        // PU-7: Apple refunds; the notification flips the Worker; the iPad follows.
        app.terminate()
        worker.refund(userId)
        app = launch()
        openLifetime(app)
        XCTAssertTrue(el(app, "life:buy").waitForExistence(timeout: 30), "refunded: for sale again")
        XCTAssertFalse(el(app, "life:owned").exists)
        XCTAssertTrue(el(app, "life:issue").waitForExistence(timeout: 10), "says why")
        shot(app, "4-refunded")
    }

    /// PU-5: a wrong code says so; a good one turns Lifetime on (Worker-side).
    func testACodeTurnsLifetimeOn() throws {
        let app = launch()
        openLifetime(app)
        let field = el(app, "life:code")
        XCTAssertTrue(field.waitForExistence(timeout: 20))
        field.tap(); field.typeText("PIP-WRONG")
        el(app, "life:use-code").tap()
        XCTAssertTrue(el(app, "life:code-message").waitForExistence(timeout: 20))
        XCTAssertEqual(el(app, "life:code-message").label, "That code didn't work. Check it and try again.")
        XCTAssertFalse(el(app, "life:owned").exists)
        field.tap()
        field.typeText(String(repeating: XCUIKeyboardKey.delete.rawValue, count: 9))
        field.typeText("PIP-GOOD-CODE")
        el(app, "life:use-code").tap()
        XCTAssertTrue(el(app, "life:owned").waitForExistence(timeout: 30))
        let sent = worker.requests("/api/v1/license/redeem")
        XCTAssertEqual(sent.last?.body["code"] as? String, "PIP-GOOD-CODE")
        XCTAssertEqual(worker.entitlement(try XCTUnwrap(sent.last?.body["user_id"] as? String)), "lifetime")
    }

    /// PU-8: the second-device wall on a free board is a door to the page.
    func testTheSecondDeviceWallOpensTheLifetimePage() throws {
        let app = launch()
        XCTAssertTrue(app.buttons["want"].waitForExistence(timeout: 30))
        app.buttons["settingsGear"].tap()
        XCTAssertTrue(el(app, "settingsDone").waitForExistence(timeout: 10))
        el(app, "settings:team").tap()
        el(app, "team:add").tap()
        let door = el(app, "pair:lifetime")
        XCTAssertTrue(door.waitForExistence(timeout: 30), "the wall says Pip Lifetime and offers it")
        shot(app, "5-second-device-wall")
        door.tap()
        XCTAssertTrue(el(app, "life:buy").waitForExistence(timeout: 30), "it opens the Lifetime page")
    }
}

// MARK: - the stub Worker

/// Just enough Worker for the Lifetime flows: relay user create + the
/// device-signed reads (signatures are not checked here), the trial, the
/// App Store redeem. `refund` is Apple's server notification, as the Worker
/// applies it: entitlement off, payment issue "refunded".
final class LifetimeStub: @unchecked Sendable {
    struct Req { let method: String; let path: String; let body: [String: Any] }
    private let listener: NWListener
    private let q = DispatchQueue(label: "stub.lifetime")
    private let lock = NSLock()
    private var log: [Req] = []
    private var state: [String: (entitlement: String, issue: String?)] = [:]
    private(set) var port: UInt16 = 0

    init() throws {
        listener = try NWListener(using: .tcp, on: .any)
        let ready = DispatchSemaphore(value: 0)
        listener.stateUpdateHandler = { if case .ready = $0 { ready.signal() } }
        listener.newConnectionHandler = { [weak self] c in self?.serve(c, Data()) }
        listener.start(queue: q)
        _ = ready.wait(timeout: .now() + 5)
        port = listener.port?.rawValue ?? 0
    }

    func stop() { listener.cancel() }

    func requests(_ path: String) -> [Req] { lock.withLock { log.filter { $0.path == path } } }
    func entitlement(_ user: String) -> String { lock.withLock { state[user]?.entitlement ?? "free" } }
    func refund(_ user: String) { lock.withLock { state[user] = ("free", "refunded") } }

    private func serve(_ c: NWConnection, _ acc: Data) {
        if acc.isEmpty { c.start(queue: q) }
        c.receive(minimumIncompleteLength: 1, maximumLength: 65536) { [weak self] data, _, done, _ in
            guard let self else { c.cancel(); return }
            var buf = acc
            if let data { buf.append(data) }
            guard let split = buf.range(of: Data("\r\n\r\n".utf8)) else {
                if done { c.cancel() } else { self.serve(c, buf) }
                return
            }
            let lines = String(decoding: buf[..<split.lowerBound], as: UTF8.self).components(separatedBy: "\r\n")
            let parts = lines[0].split(separator: " ").map(String.init)
            var length = 0
            for l in lines.dropFirst() where l.lowercased().hasPrefix("content-length:") {
                length = Int(l.dropFirst(15).trimmingCharacters(in: .whitespaces)) ?? 0
            }
            let body = Data(buf[split.upperBound...])
            if body.count < length && !done { self.serve(c, buf); return }
            self.handle(c, method: parts.first ?? "GET", target: parts.count > 1 ? parts[1] : "/", body: body)
        }
    }

    private func handle(_ c: NWConnection, method: String, target: String, body: Data) {
        let path = target.split(separator: "?").first.map(String.init) ?? target
        let json = (try? JSONSerialization.jsonObject(with: body)) as? [String: Any] ?? [:]
        lock.withLock { log.append(Req(method: method, path: path, body: json)) }
        func send(_ status: Int, _ obj: Any) {
            let payload = (try? JSONSerialization.data(withJSONObject: obj)) ?? Data()
            let head = "HTTP/1.1 \(status) X\r\nContent-Type: application/json\r\nContent-Length: \(payload.count)\r\nConnection: close\r\n\r\n"
            c.send(content: Data(head.utf8) + payload, completion: .contentProcessed { _ in c.cancel() })
        }
        let endsAt = (Date().timeIntervalSince1970 + 5 * 86400) * 1000
        let seg = path.split(separator: "/").map(String.init)
        // /users/<id>/...
        if seg.count >= 2, seg[0] == "users" {
            let user = seg[1]
            let st = lock.withLock { state[user] ?? ("free", nil) }
            switch (method, seg.dropFirst(2).joined(separator: "/")) {
            case ("GET", "devices/self"):
                var o: [String: Any] = ["entitlement": st.entitlement, "owner": true, "epoch": 1]
                if let i = st.issue { o["payment_issue"] = i }
                return send(200, o)
            case ("GET", "devices"):
                return send(200, ["devices": [["device_id": "other", "epoch": 1, "added_at": 0]]])
            case ("GET", "entitlement"):
                var o: [String: Any] = ["entitlement": st.entitlement]
                if st.entitlement == "lifetime" { o["license"] = "pip-life-test" }
                return send(200, o)
            case ("POST", "entitlement"):
                // The Worker refuses a refunded account's old token.
                if st.issue == "refunded" { return send(403, ["error": "payment_revoked"]) }
                return send(200, ["ok": true])
            default: return send(404, ["error": "not_found"])
            }
        }
        switch (method, path) {
        case ("POST", "/users"):
            return send(200, ["user_id": (json["user_id"] as? String) ?? ""])
        case ("POST", "/api/v1/trial/start"), ("GET", "/api/v1/trial"):
            return send(200, ["licensed": false, "endsAt": endsAt])
        case ("POST", "/api/v1/license/redeem"):
            guard (json["code"] as? String) == "PIP-GOOD-CODE" else { return send(403, ["error": "bad_code"]) }
            let user = (json["user_id"] as? String) ?? ""
            lock.withLock { state[user] = ("lifetime", nil) }
            return send(200, ["ok": true, "entitlement": "lifetime"])
        case ("POST", "/api/v1/appstore/redeem"):
            let user = (json["user_id"] as? String) ?? ""
            lock.withLock { state[user] = ("lifetime", nil) }
            return send(200, ["ok": true, "entitlement": "lifetime", "duplicate": false])
        default:
            return send(404, ["error": "not_found"])
        }
    }
}
