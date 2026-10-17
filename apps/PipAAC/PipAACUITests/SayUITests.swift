//
//  SayUITests.swift
//  PipAACUITests
//
//  D4 works tests (phase 044 SN-2, SN-7, BS-6, BS-10, KB-8): the sentence
//  buttons and the cloud voice against a STUB Worker in this test process.
//  No Groq, ElevenLabs or xAI is reachable: the stub answers the Worker's
//  routes with canned JSON and a tiny silent clip.
//
//  The instruments are not the UI's own claims: the stub's request log
//  (what the iPad SENT: masked text, body shape) and the app's
//  played_clips.txt (the path AVAudioPlayer was given), whose bytes are
//  compared with the stub's clip.
//

import Network
import UIKit
import XCTest

@MainActor
final class SayUITests: XCTestCase {
    private var dir: URL!
    private var server: StubWorker!

    override func setUpWithError() throws {
        continueAfterFailure = false
        dir = FileManager.default.temporaryDirectory
            .appendingPathComponent("pip-d4-\(UUID().uuidString)", isDirectory: true)
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        server = try StubWorker()
    }

    override func tearDown() { server?.stop() }

    // MARK: helpers

    private func launch(base: String? = nil) -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments = ["-PipDataDir", dir.path, "-PipTraceAudio", "YES",
                               "-PipBaseURL", base ?? "http://127.0.0.1:\(server.port)"]
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

    /// Polls `cond` (XCTest's own run loop keeps the app responsive).
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

    // MARK: tests

    /// type a bar -> ✨ -> the bar shows the fixed sentence, and the speaker
    /// opens the cached clip the stub returned for exactly that sentence.
    func testFixItShowsTheSentenceAndSpeaksTheReturnedClip() throws {
        server.transformReply = "I want more."
        let app = launch()
        XCTAssertTrue(app.buttons["want"].waitForExistence(timeout: 30))
        app.buttons["more"].tap()
        app.buttons["more"].tap()
        wait("two chips") { barWords(app).count == 2 }
        let before = played().count

        app.buttons["Fix it"].tap()

        wait("the fixed sentence is on the bar") { barWords(app).contains("more.") }
        XCTAssertEqual(barWords(app), ["I", "want", "more."])
        shot(app, "d4-fix-it-bar")

        // What the iPad sent: the web's transform request.
        wait("transform + speak requests") { server.requests("/api/v1/voice/speak").count == 1 }
        let t = try XCTUnwrap(server.requests("/api/v1/transform").first)
        XCTAssertEqual(t.method, "POST")
        XCTAssertEqual(t.body["mode"] as? String, "fix")
        XCTAssertEqual(t.body["text"] as? String, "more more")
        XCTAssertEqual(t.body["tense"] as? String, "present")
        XCTAssertEqual(t.body["question"] as? Bool, false)
        XCTAssertEqual(Set(t.body.keys), ["user_id", "mode", "text", "tense", "question"])
        let uid = try XCTUnwrap(t.body["user_id"] as? String)
        XCTAssertNotNil(UUID(uuidString: uid), "the person's id, a UUID as the Worker requires")
        let sp = try XCTUnwrap(server.requests("/api/v1/voice/speak").first)
        XCTAssertEqual(sp.body["text"] as? String, "I want more.")
        XCTAssertEqual(sp.body["feeling"] as? String, "neutral")
        XCTAssertEqual(Set(sp.body.keys), ["user_id", "voice", "text", "feeling"])
        XCTAssertEqual(sp.body["user_id"] as? String, uid)
        XCTAssertEqual(server.requests("/api/v1/trial/start").count, 1)

        // What was heard: a file inside the voice cache, with the stub's bytes.
        wait("the cloud clip plays") { played().count > before && played().last?.contains("/VoiceCache/pip-voice/") == true }
        let path = try XCTUnwrap(played().last)
        XCTAssertEqual(try Data(contentsOf: URL(fileURLWithPath: path)), StubWorker.clip)

        // ▶ again: the cache answers - no second request - same file.
        app.buttons["Play"].tap()
        wait("replayed from the cache") { played().filter { $0 == path }.count == 2 }
        XCTAssertEqual(server.requests("/api/v1/voice/speak").count, 1)
    }

    /// Change the bar while a slow ⏪ is in flight -> the late reply is
    /// discarded (bar unchanged, its text never reaches the voice or the
    /// speaker), and the press still speaks the CURRENT bar, as the web does.
    func testLateReplyAfterTheBarChangedIsDiscarded() throws {
        server.transformReply = "Went to the park."
        server.transformDelay = 3.0
        let app = launch()
        XCTAssertTrue(app.buttons["want"].waitForExistence(timeout: 30))
        app.buttons["go"].tap()
        app.buttons["more"].tap()
        wait("two chips") { barWords(app).count == 2 }

        app.buttons["Say it in the past"].tap()
        wait("request in flight") { server.requests("/api/v1/transform").count == 1 }
        app.buttons["want"].tap()              // the child keeps going
        wait("three chips") { barWords(app).count == 3 }
        let bar = barWords(app)

        // The stub's reply lands (3 s) and is dropped; the current bar speaks.
        wait("the current bar is spoken", timeout: 15) {
            played().contains { $0.contains("/VoiceCache/pip-voice/") }
        }
        XCTAssertEqual(barWords(app), bar, "bar unchanged by the stale reply")
        XCTAssertFalse(barWords(app).contains("park."))
        let spoken = server.requests("/api/v1/voice/speak")
        XCTAssertFalse(spoken.isEmpty)
        XCTAssertEqual(spoken.last?.body["text"] as? String,
                       bar.joined(separator: " ").lowercased() + ".",
                       "the voice was asked for the current bar")
        XCTAssertFalse(spoken.contains { ($0.body["text"] as? String ?? "").contains("park") },
                       "the abandoned reply never reaches the voice")
        let path = try XCTUnwrap(played().last { $0.contains("/VoiceCache/pip-voice/") })
        XCTAssertEqual(try Data(contentsOf: URL(fileURLWithPath: path)), StubWorker.clip)
        shot(app, "d4-late-reply-dropped")
    }

    /// Offline: the existing honest path - the bar speaks as built, and the
    /// toast says why. Nothing is replaced.
    func testOfflineSpeaksAsBuiltAndSaysWhy() throws {
        let app = launch(base: "http://127.0.0.1:9")
        XCTAssertTrue(app.buttons["want"].waitForExistence(timeout: 30))
        app.buttons["go"].tap()
        app.buttons["more"].tap()
        wait("two chips") { barWords(app).count == 2 }
        let before = played().count

        app.buttons["Fix it"].tap()

        let toast = app.staticTexts["toast"]
        XCTAssertTrue(toast.waitForExistence(timeout: 10))
        XCTAssertEqual(toast.label, "Fix it needs the internet — spoke it as it was.")
        wait("her word clips play") { played().count >= before + 2 }
        XCTAssertFalse(played().suffix(2).contains { $0.contains("/VoiceCache/") })
        XCTAssertEqual(barWords(app).count, 2, "the bar keeps her words")
        shot(app, "d4-offline-toast")
    }

    /// SN-9: the trial is over and nobody holds a license. The press is
    /// sent, the Worker refuses, the bar is spoken as built (word clips,
    /// no natural voice), the grown-up gets the ask with the door, and the
    /// door opens the Lifetime page - whose trial line says it ended.
    func testTrialOverGatedButtonSpeaksAsBuiltAndOffersTheLifetimePage() throws {
        server.trialEnded = true
        let app = launch()
        XCTAssertTrue(app.buttons["want"].waitForExistence(timeout: 30))
        app.buttons["go"].tap()
        app.buttons["more"].tap()
        wait("two chips") { barWords(app).count == 2 }
        let before = played().count

        app.buttons["Fix it"].tap()

        // (The boot's expiry nudge may still be up; the press's own ask replaces it.)
        let toast = app.staticTexts["toast"]
        let ask = "Fix it comes with Pip Lifetime — the free trial has ended."
        wait("the ask", timeout: 10) { toast.exists && toast.label == ask }
        let door = app.buttons["See Pip Lifetime"]
        XCTAssertTrue(door.exists, "the ask offers See Pip Lifetime")
        shot(app, "f-trial-over-ask")
        door.tap()
        let line = app.descendants(matching: .any)["life:trial"].firstMatch
        XCTAssertTrue(line.waitForExistence(timeout: 30), "the door opens the Lifetime page")
        XCTAssertEqual(line.label, "Free trial ended. Buy to turn it all back on.")
        shot(app, "f-trial-over-lifetime")
        app.buttons["life:close"].tap()

        // What was heard: her word clips, never the natural voice.
        wait("her word clips play") { played().count >= before + 2 }
        XCTAssertFalse(played().suffix(2).contains { $0.contains("/VoiceCache/") })
        XCTAssertEqual(barWords(app), ["Go", "more"], "nothing is replaced")
        // What the iPad SENT: the press went to the Worker (no client
        // pre-gate), carried no license, and no natural-voice request followed.
        let t = try XCTUnwrap(server.requests("/api/v1/transform").first)
        XCTAssertNil(t.body["license"])
        XCTAssertTrue(server.requests("/api/v1/voice/speak").isEmpty)

        // Play is never gated: it speaks her words and asks nothing.
        let n = played().count
        XCTAssertTrue(app.buttons["Play"].waitForExistence(timeout: 10))
        app.buttons["Play"].tap()
        wait("play speaks the word clips") { played().count >= n + 2 }
        XCTAssertTrue(server.requests("/api/v1/voice/speak").isEmpty)
    }

    /// A typed word is minted on commit (a supporter action) and its tile
    /// clip is what plays - from the local cache afterwards.
    func testTypedWordIsMintedAndSpokenFromTheTileLibrary() throws {
        let app = launch()
        XCTAssertTrue(app.buttons["want"].waitForExistence(timeout: 30))
        app.buttons["Keyboard"].tap()
        XCTAssertTrue(app.buttons["kbkey:z"].waitForExistence(timeout: 10))
        for k in ["z", "o", "r", "p"] { app.buttons["kbkey:\(k)"].tap() }
        app.buttons["kbkey: "].tap()

        // Two requests, as on the web: the commit's tap fetch ("user_typed")
        // and the supporter mint ("user_keyboard"); the ledger dedupes them.
        wait("mint request") {
            server.requests("/api/v1/voice/tile").contains { $0.body["source"] as? String == "user_keyboard" }
        }
        let m = try XCTUnwrap(server.requests("/api/v1/voice/tile")
            .first { $0.body["source"] as? String == "user_keyboard" })
        XCTAssertEqual(m.body["text"] as? String, "zorp")
        XCTAssertEqual(Set(m.body.keys), ["user_id", "voice", "locale", "text", "source"])
        wait("the tile clip plays") { played().contains { $0.contains("/VoiceCache/pip-tile-voice/") } }
        let path = try XCTUnwrap(played().last { $0.contains("/pip-tile-voice/") })
        XCTAssertEqual(try Data(contentsOf: URL(fileURLWithPath: path)), StubWorker.clip)
    }
}

// MARK: - the stub Worker

/// Just enough of the Worker: the routes the iPad calls, canned answers, a
/// log of what it was sent, and an optional delay on /transform.
final class StubWorker: @unchecked Sendable {
    struct Req { let method: String; let path: String; let headers: [String: String]; let body: [String: Any] }

    /// A 0.3 s silent mono WAV - AVAudioPlayer opens it; served as audio/mpeg.
    static let clip: Data = {
        let rate = 8000, n = rate * 3 / 10
        var d = Data("RIFF".utf8)
        func u32(_ v: Int) { var x = UInt32(v).littleEndian; d.append(Data(bytes: &x, count: 4)) }
        func u16(_ v: Int) { var x = UInt16(v).littleEndian; d.append(Data(bytes: &x, count: 2)) }
        u32(36 + n * 2); d.append(Data("WAVEfmt ".utf8)); u32(16); u16(1); u16(1)
        u32(rate); u32(rate * 2); u16(2); u16(16)
        d.append(Data("data".utf8)); u32(n * 2); d.append(Data(count: n * 2))
        return d
    }()

    private let listener: NWListener
    private let q = DispatchQueue(label: "stub.worker")
    private let lock = NSLock()
    private var log: [Req] = []
    private(set) var port: UInt16 = 0
    var transformReply = "Hello."
    /// 044 F: the trial is over - the clock reads a past end and the
    /// transform route refuses with the Worker's bad_license. (Set before
    /// launch; these launches never hold a license.)
    var trialEnded = false
    var transformDelay: Double = 0

    // E6 - the Picture Finder routes (no provider is reachable: every answer is canned).
    /// A solid-colour PNG the app can decode; the colour names the picture.
    static func png(_ color: UIColor) -> Data {
        let r = UIGraphicsImageRenderer(size: CGSize(width: 64, height: 64))
        return r.pngData { ctx in color.setFill(); ctx.fill(CGRect(x: 0, y: 0, width: 64, height: 64)) }
    }
    static let candidateColors: [String: UIColor] = [
        "img_red": .red, "img_green": .green, "img_blue": .blue, "drawn": .orange,
    ]
    /// normalized text -> the find result body (default: three candidates, no auto, common word)
    var finds: [String: [String: Any]] = [:]
    var picLeft = 3
    /// E6b: the finder is down (find and find-batch answer 503: the word is parked).
    var findStatus = 200
    /// E6b: seconds the draw stream holds after its first stage ("planning").
    var drawStageDelay: Double = 0
    private func findBody(_ text: String) -> [String: Any] {
        if let f = finds[text] { return f }
        return ["candidates": [["image_id": "img_red", "asset": "/symbols/img_red.png", "source": "ours", "score": 0.9],
                               ["image_id": "img_green", "asset": "/symbols/img_green.png", "source": "ours", "score": 0.8],
                               ["image_id": "img_blue", "asset": "/symbols/img_blue.png", "source": "ours", "score": 0.7]],
                "auto": NSNull(), "scope": "common", "kind": "None", "language": "en", "calibrated": true]
    }

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

    func requests(_ path: String) -> [Req] {
        lock.lock(); defer { lock.unlock() }
        return log.filter { $0.path == path }
    }

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
            let head = String(decoding: buf[..<split.lowerBound], as: UTF8.self)
            let lines = head.components(separatedBy: "\r\n")
            let parts = lines[0].split(separator: " ").map(String.init)
            var headers: [String: String] = [:]
            for l in lines.dropFirst() {
                if let i = l.firstIndex(of: ":") {
                    headers[l[..<i].lowercased()] = l[l.index(after: i)...].trimmingCharacters(in: .whitespaces)
                }
            }
            let want = Int(headers["content-length"] ?? "0") ?? 0
            let body = Data(buf[split.upperBound...])
            if body.count < want && !done { self.serve(c, buf); return }
            self.handle(c, method: parts.first ?? "GET",
                        target: parts.count > 1 ? parts[1] : "/", headers: headers, body: body)
        }
    }

    private func handle(_ c: NWConnection, method: String, target: String,
                        headers: [String: String], body: Data) {
        let path = target.split(separator: "?").first.map(String.init) ?? target
        let json = (try? JSONSerialization.jsonObject(with: body)) as? [String: Any] ?? [:]
        lock.lock(); log.append(Req(method: method, path: path, headers: headers, body: json)); lock.unlock()

        func send(_ status: Int, _ type: String, _ payload: Data, after: Double = 0) {
            let head = "HTTP/1.1 \(status) X\r\nContent-Type: \(type)\r\nContent-Length: \(payload.count)\r\nConnection: close\r\n\r\n"
            q.asyncAfter(deadline: .now() + after) {
                c.send(content: Data(head.utf8) + payload, completion: .contentProcessed { _ in c.cancel() })
            }
        }
        func sendJSON(_ o: Any, after: Double = 0) {
            send(200, "application/json", (try? JSONSerialization.data(withJSONObject: o)) ?? Data(), after: after)
        }
        let endsAt = (Date().timeIntervalSince1970 + (trialEnded ? -86400 : 5 * 86400)) * 1000
        switch path {
        case "/api/v1/trial/start": sendJSON(["endsAt": endsAt])
        case "/api/v1/trial": sendJSON(["licensed": false, "endsAt": endsAt])
        case "/api/v1/transform":
            if trialEnded {
                send(403, "application/json", Data(#"{"error":"bad_license"}"#.utf8))
            } else {
                sendJSON(["text": transformReply], after: transformDelay)
            }
        case "/api/v1/voice/speak", "/api/v1/voice/tile": send(200, "audio/mpeg", Self.clip)
        case "/api/v1/voice/tile/replaced": sendJSON(["ids": [String](), "next": 1])
        case "/api/v1/voice/tile/flag": send(204, "text/plain", Data()) // E8: "Sounds wrong"
        case "/api/v1/pictures/find" where findStatus != 200, "/api/v1/pictures/find-batch" where findStatus != 200:
            send(findStatus, "application/json", Data(#"{"error":"down"}"#.utf8))
        case "/api/v1/pictures/find": sendJSON(findBody(json["text"] as? String ?? ""))
        case "/api/v1/pictures/find-batch":
            let items = (json["items"] as? [[String: Any]]) ?? []
            sendJSON(["results": items.map { findBody($0["text"] as? String ?? "") }])
        case "/api/v1/pictures/allowance": sendJSON(["left": picLeft, "total": 5])
        case "/api/v1/pictures/pick", "/api/v1/pictures/reject": send(204, "text/plain", Data())
        case "/api/v1/pictures/draw":
            lock.lock(); picLeft -= 1; let left = picLeft; lock.unlock()
            let key = String(repeating: "ab", count: 32)
            func ev(_ o: [String: Any]) -> String {
                "data: " + String(decoding: (try? JSONSerialization.data(withJSONObject: o)) ?? Data(), as: UTF8.self) + "\n\n"
            }
            // The stream goes out as the Worker would send it: the first stage now,
            // the rest after `drawStageDelay` (the line on the card must show the
            // first while the draw is still in flight).
            let first = ev(["type": "stage", "stage": "planning"])
            let rest = ev(["type": "stage", "stage": "drawing"])
                + ev(["type": "done", "image": Self.png(.orange).base64EncodedString(), "key": key, "cache": "mint", "left": left])
            let head = "HTTP/1.1 200 X\r\nContent-Type: text/event-stream\r\nConnection: close\r\n\r\n"
            c.send(content: Data((head + first).utf8), completion: .contentProcessed { _ in })
            q.asyncAfter(deadline: .now() + drawStageDelay) {
                c.send(content: Data(rest.utf8), completion: .contentProcessed { _ in c.cancel() })
            }
        default:
            if path.hasPrefix("/symbols/") || path.hasPrefix("/api/v1/pictures/img/") {
                let name = (path as NSString).lastPathComponent.replacingOccurrences(of: ".png", with: "")
                send(200, "image/png", Self.png(Self.candidateColors[name] ?? .gray))
            } else {
                send(404, "text/plain", Data())
            }
        }
    }
}
