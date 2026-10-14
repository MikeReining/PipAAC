//
//  PipHostTests.swift
//  PipAACTests
//
//  044 C2: the Swift half of the sync loop's host seam (PipHost). The
//  web's sync loop itself is proven in node (scripts/ios/sync_host.test.mjs
//  against the built pip-core.js); here the real JavaScriptCore + URLSession
//  + keychain + CryptoKit are held to the same contract:
//   (a) openOp on every Fixtures/crypto/node.json op, through the JS host
//       module -> PipHost -> PipCrypto, equals the fixture plaintext;
//   (b) the fetch shim over a URLProtocol stub: status, json, arrayBuffer,
//       headers, request echo, abort;
//   (c) timers fire in order; clearTimeout/clearInterval cancel;
//   (d) the key store lands in the keychain under the web's names and
//       stays one identity;
//   (e) 600 overlapping fetch/timer/crypto promises while AppModel-style
//       core.sync calls interleave from many threads: no deadlock, all
//       settle;
//   (f) a real WebSocket against a loopback NWListener echo server.
//

import Testing
import Foundation
import Network
import os
import PipAAC

// MARK: - URLProtocol stub

final class StubProtocol: URLProtocol, @unchecked Sendable {
    static let hangStops = OSAllocatedUnfairLock(initialState: 0)

    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    private func reply(_ status: Int, _ headers: [String: String], _ body: Data) {
        let r = HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: "HTTP/1.1", headerFields: headers)!
        client?.urlProtocol(self, didReceive: r, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: body)
        client?.urlProtocolDidFinishLoading(self)
    }

    private func requestBody() -> Data {
        if let b = request.httpBody { return b }
        guard let s = request.httpBodyStream else { return Data() }
        s.open(); defer { s.close() }
        var out = Data()
        var buf = [UInt8](repeating: 0, count: 4096)
        while s.hasBytesAvailable {
            let n = s.read(&buf, maxLength: buf.count)
            if n <= 0 { break }
            out.append(buf, count: n)
        }
        return out
    }

    override func startLoading() {
        let path = request.url!.path
        switch path {
        case "/json":
            let echo: [String: Any] = [
                "method": request.httpMethod ?? "?",
                "xa": request.value(forHTTPHeaderField: "x-a") ?? "",
                "body": String(decoding: requestBody(), as: UTF8.self),
            ]
            reply(201, ["Content-Type": "application/json", "X-Reply": "yes"],
                  try! JSONSerialization.data(withJSONObject: echo))
        case "/bin":
            reply(200, ["Content-Type": "application/octet-stream"], Data([0, 1, 2, 254, 255]))
        case "/err":
            reply(500, ["Content-Type": "application/json"], Data(#"{"error":"boom"}"#.utf8))
        case "/hang":
            break // never answers; stopLoading marks the abort reaching URLSession
        default:
            if path.hasPrefix("/fast/") {
                let n = String(path.dropFirst("/fast/".count))
                let delay = Double.random(in: 0...0.02)
                DispatchQueue.global().asyncAfter(deadline: .now() + delay) {
                    self.reply(200, [:], Data("n\(n)".utf8))
                }
            } else {
                reply(404, [:], Data())
            }
        }
    }

    override func stopLoading() {
        if request.url?.path == "/hang" { Self.hangStops.withLock { $0 += 1 } }
    }
}

// MARK: - rig

/// Collects facade events (`__pipHost.emit`) arriving on the core queue.
final class EventBox: @unchecked Sendable {
    private let cond = NSCondition()
    private var events: [(String, String)] = []
    func add(_ name: String, _ json: String) {
        cond.lock(); events.append((name, json)); cond.broadcast(); cond.unlock()
    }
    func wait(_ name: String, timeout: TimeInterval) -> String? {
        let deadline = Date().addingTimeInterval(timeout)
        cond.lock(); defer { cond.unlock() }
        while true {
            if let i = events.firstIndex(where: { $0.0 == name }) { return events.remove(at: i).1 }
            if !cond.wait(until: deadline) { return nil }
        }
    }
}

final class HostRig: @unchecked Sendable {
    let core = PipCore()
    let events = EventBox()
    let service = "org.pipaac.keys.test.\(UUID().uuidString)"
    let blobs = FileManager.default.temporaryDirectory.appendingPathComponent("pip-c2-\(UUID().uuidString)")
    let saved = OSAllocatedUnfairLock(initialState: [String]())
    var host: PipHost!

    init() throws {
        let cfg = URLSessionConfiguration.ephemeral
        cfg.protocolClasses = [StubProtocol.self]
        let events = self.events
        let saved = self.saved
        host = PipHost(
            core: core,
            config: .init(keychainService: service, blobDirectory: blobs, sessionConfiguration: cfg),
            onEvent: { events.add($0, $1) },
            onSaveUser: { id, patch in saved.withLock { $0.append("\(id):\(patch)") } })
        try core.sync {
            try core.install(host)
            _ = try core.evaluate(resource: "pip-core.js", bundle: Bundle(for: PipCore.self))
            _ = try core.evaluate(resource: "pip-harness.js", bundle: Bundle(for: CoreHarness.self))
        }
    }

    deinit {
        for n in [PipKeychain.deviceSignName, PipKeychain.deviceDhName, "user/u9/root", "user/u9/key_e1", "journal/u9"] {
            try? PipKeychain.delete(n, service: service)
        }
        try? FileManager.default.removeItem(at: blobs)
    }

    /// Runs async JS; the script must `__pipHost.emit(name, json)` when done.
    func run(_ source: String, expecting name: String, timeout: TimeInterval = 20) throws -> [String: Any] {
        try core.sync { _ = try core.evaluate(source: source) }
        guard let json = events.wait(name, timeout: timeout) else {
            Issue.record("timed out waiting for \(name)")
            return [:]
        }
        return try JSONSerialization.jsonObject(with: Data(json.utf8)) as! [String: Any]
    }
}

private let fixtureDir = URL(fileURLWithPath: #filePath)
    .deletingLastPathComponent().appendingPathComponent("Fixtures/crypto")

@Suite("PipHost: the sync loop's Swift I/O", .serialized)
struct PipHostTests {

    // (a) every node.json op opens through JS -> PipHost -> PipCrypto
    @Test func openOpOnEveryNodeFixtureThroughTheHostModule() throws {
        let doc = try JSONSerialization.jsonObject(
            with: Data(contentsOf: fixtureDir.appendingPathComponent("node.json"))) as! [String: Any]
        let rows = (doc["cases"] as! [String: Any])["sealOp"] as! [[String: Any]]
        #expect(rows.count >= 2)
        let input = rows.map { ["key": $0["key"]!, "env": $0["env"]!, "opJson": $0["opJson"]!] }
        let json = String(decoding: try JSONSerialization.data(withJSONObject: input), as: UTF8.self)
        let rig = try HostRig()
        try rig.core.sync { _ = try rig.core.call("PIPHARNESS", "probeOpenOps", [json]) }
        guard let out = rig.events.wait("probe.openOps", timeout: 20) else {
            Issue.record("no probe result"); return
        }
        let r = try JSONSerialization.jsonObject(with: Data(out.utf8)) as! [String: Any]
        #expect(r["error"] == nil, "\(r)")
        let res = r["rows"] as? [[String: Bool]] ?? []
        #expect(res.count == rows.count)
        #expect(res.allSatisfy { $0["ok"] == true && $0["rawEqual"] == true }, "\(res)")
    }

    // (b) fetch shim over URLProtocol
    @Test func fetchShimStatusJsonArrayBufferAbort() throws {
        let rig = try HostRig()
        let before = StubProtocol.hangStops.withLock { $0 }
        let r = try rig.run("""
        (async () => {
          const out = {};
          const r = await fetch("https://stub.test/json", { method: "POST",
            headers: { "X-A": "1", "content-type": "text/plain" }, body: "héllo" });
          out.status = r.status; out.ok = r.ok; out.reply = r.headers.get("x-reply");
          out.ctype = r.headers.get("Content-Type"); out.json = await r.json();
          const b = await fetch("https://stub.test/bin");
          const ab = await b.arrayBuffer();
          out.bytes = Array.from(new Uint8Array(ab)); out.abLen = ab.byteLength;
          const e = await fetch("https://stub.test/err");
          out.errStatus = e.status; out.errOk = e.ok; out.errBody = await e.text();
          const ctl = new AbortController();
          const hung = fetch("https://stub.test/hang", { signal: ctl.signal });
          setTimeout(() => ctl.abort(), 40);
          try { await hung; out.abort = "resolved"; } catch (x) { out.abort = x.name; }
          const pre = AbortSignal.abort();
          try { await fetch("https://stub.test/json", { signal: pre }); out.pre = "resolved"; }
          catch (x) { out.pre = x.name; }
          __pipHost.emit("fetch.done", JSON.stringify(out));
        })();
        """, expecting: "fetch.done")
        #expect(r["status"] as? Int == 201)
        #expect(r["ok"] as? Bool == true)
        #expect(r["reply"] as? String == "yes")
        #expect(r["ctype"] as? String == "application/json")
        let echo = r["json"] as? [String: Any]
        #expect(echo?["method"] as? String == "POST")
        #expect(echo?["xa"] as? String == "1")
        #expect(echo?["body"] as? String == "héllo")
        #expect(r["bytes"] as? [Int] == [0, 1, 2, 254, 255])
        #expect(r["abLen"] as? Int == 5)
        #expect(r["errStatus"] as? Int == 500)
        #expect(r["errOk"] as? Bool == false)
        #expect(r["errBody"] as? String == #"{"error":"boom"}"#)
        #expect(r["abort"] as? String == "AbortError")
        #expect(r["pre"] as? String == "AbortError")
        // The abort reached URLSession (the stub saw the request stopped).
        let deadline = Date().addingTimeInterval(5)
        while StubProtocol.hangStops.withLock({ $0 }) <= before && Date() < deadline {
            Thread.sleep(forTimeInterval: 0.01)
        }
        #expect(StubProtocol.hangStops.withLock { $0 } > before)
    }

    // (c) timers
    @Test func timersFireInOrderAndClearCancels() throws {
        let rig = try HostRig()
        let r = try rig.run("""
        (() => {
          const fired = [];
          setTimeout(() => fired.push("c"), 90);
          setTimeout(() => fired.push("a"), 20);
          const gone = setTimeout(() => fired.push("GONE"), 40);
          setTimeout(() => fired.push("b"), 60);
          clearTimeout(gone);
          let n = 0;
          const iv = setInterval(() => { n++; fired.push("i" + n); if (n === 3) clearInterval(iv); }, 25);
          setTimeout((x, y) => fired.push(x + y), 10, "p", "q");
          setTimeout(() => __pipHost.emit("timers.done", JSON.stringify({ fired })), 250);
        })();
        """, expecting: "timers.done")
        let fired = r["fired"] as? [String] ?? []
        #expect(!fired.contains("GONE"))
        #expect(fired.filter { $0.hasPrefix("i") } == ["i1", "i2", "i3"])
        // one-shots in due order; the interval interleaves but never reorders them
        #expect(fired.filter { ["pq", "a", "b", "c"].contains($0) } == ["pq", "a", "b", "c"])
    }

    // (d) keychain by the web's names; one identity
    @Test func keyStoreLandsInTheKeychainUnderTheWebsNames() throws {
        let rig = try HostRig()
        let r = try rig.run("""
        (async () => {
          const hc = PIPCORE.hostCrypto;
          const st = hc.openKeyStore();
          const id1 = await hc.getDeviceIdentity(st), id2 = await hc.getDeviceIdentity(st);
          const root = await hc.ensureRecoveryRoot(st, "u9");
          const root2 = await hc.ensureRecoveryRoot(st, "u9");
          const k1 = await hc.getUserKey(st, "u9", 1);
          const k1b = await st.get("user/u9/key_e1");
          const env = await hc.sealOp(k1, { a: 1, s: "é" });
          const back = await hc.openOp(k1b, env);
          const sig = await hc.signPayload(id1.sign, "GET\\n/x");
          const ok = await hc.verifyPayload(id1.verify, "GET\\n/x", sig);
          const bad = await hc.verifyPayload(id1.verify, "GET\\n/y", sig);
          await st.put("journal/u9", { root, n: 2, list: [1] });
          const j = await st.get("journal/u9");
          __pipHost.emit("keys.done", JSON.stringify({
            sameId: id1.deviceId === id2.deviceId, devicePrefix: id1.deviceId.slice(0, 4),
            rootLen: root.length, rootSame: root.every((b, i) => b === root2[i]),
            keySame: k1.__pipKey === k1b.__pipKey, back, ok, bad,
            jRootU8: j.root instanceof Uint8Array && j.root.length === 16, jn: j.n,
            keyHasNoMaterial: JSON.stringify(k1).length < 80 }));
        })();
        """, expecting: "keys.done")
        #expect(r["sameId"] as? Bool == true)
        #expect(r["devicePrefix"] as? String == "dev_")
        #expect(r["rootLen"] as? Int == 16)
        #expect(r["rootSame"] as? Bool == true)
        #expect(r["keySame"] as? Bool == true)
        #expect((r["back"] as? [String: Any])?["s"] as? String == "é")
        #expect(r["ok"] as? Bool == true)
        #expect(r["bad"] as? Bool == false)
        #expect(r["jRootU8"] as? Bool == true)
        #expect(r["jn"] as? Int == 2)
        #expect(r["keyHasNoMaterial"] as? Bool == true)
        // The keychain holds raw bytes under PipKeychain's names.
        #expect(try PipKeychain.get("user/u9/root", service: rig.service)?.count == 16)
        #expect(try PipKeychain.get("user/u9/key_e1", service: rig.service)?.count == 32)
        #expect(try PipKeychain.get(PipKeychain.deviceSignName, service: rig.service)?.count == 32)
        #expect(try PipKeychain.get("journal/u9", service: rig.service) != nil)
    }

    // (e) stress: overlapping promises + AppModel-style sync calls
    @Test func twoHundredOverlappingFetchesTimersAndCryptoWhileCallsInterleave() throws {
        let rig = try HostRig()
        try rig.core.sync { _ = try rig.core.evaluate(source: """
        (() => {
          const N = 200; let settled = 0, ok = 0; const ps = [];
          const done = (good) => { settled++; if (good) ok++; };
          for (let i = 0; i < N; i++) {
            ps.push(fetch("https://stub.test/fast/" + i).then((r) => r.text())
              .then((t) => done(t === "n" + i), () => done(false)));
            ps.push(new Promise((res) => setTimeout(res, i % 25)).then(() => done(true)));
            ps.push(PIPCORE.hostio.hostCall("sha256hex", { b64: "AQID" })
              .then((h) => done(h.length === 64), () => done(false)));
          }
          Promise.all(ps).then(() => __pipHost.emit("stress.done", JSON.stringify({ settled, ok, total: 3 * N })));
        })();
        """) }
        // AppModel-style callers hammer the queue from many threads meanwhile.
        let health = OSAllocatedUnfairLock(initialState: 0)
        DispatchQueue.concurrentPerform(iterations: 64) { _ in
            if let _ = try? rig.core.sync({ try rig.core.call("PIPCORE.sync", "syncHealth") }) {
                health.withLock { $0 += 1 }
            }
        }
        #expect(health.withLock { $0 } == 64)
        guard let out = rig.events.wait("stress.done", timeout: 30) else {
            Issue.record("stress: promises never all settled (deadlock or lost completion)"); return
        }
        let r = try JSONSerialization.jsonObject(with: Data(out.utf8)) as! [String: Int]
        #expect(r["settled"] == 600)
        #expect(r["ok"] == 600)
    }

    // (f) real WebSocket against a loopback echo server
    @Test func webSocketRoundTripAgainstLoopbackServer() throws {
        let q = DispatchQueue(label: "ws.echo")
        let params = NWParameters.tcp
        params.defaultProtocolStack.applicationProtocols.insert(NWProtocolWebSocket.Options(), at: 0)
        let listener = try NWListener(using: params)
        let ready = DispatchSemaphore(value: 0)
        listener.stateUpdateHandler = { if case .ready = $0 { ready.signal() } }
        listener.newConnectionHandler = { conn in
            conn.start(queue: q)
            func recv() {
                conn.receiveMessage { data, ctx, _, err in
                    guard err == nil else { return }
                    if let data, let md = ctx?.protocolMetadata(definition: NWProtocolWebSocket.definition)
                        as? NWProtocolWebSocket.Metadata, md.opcode == .text {
                        let out = NWProtocolWebSocket.Metadata(opcode: .text)
                        conn.send(content: Data("echo:".utf8) + data,
                                  contentContext: NWConnection.ContentContext(identifier: "e", metadata: [out]),
                                  isComplete: true, completion: .idempotent)
                    }
                    recv()
                }
            }
            recv()
        }
        listener.start(queue: q)
        #expect(ready.wait(timeout: .now() + 10) == .success)
        defer { listener.cancel() }
        let port = listener.port!.rawValue
        let rig = try HostRig()
        let r = try rig.run("""
        (() => {
          const log = [];
          const ws = new WebSocket("ws://127.0.0.1:\(port)/");
          log.push("state" + ws.readyState);
          ws.onopen = () => { log.push("open" + ws.readyState); ws.send("hi"); };
          ws.onmessage = (ev) => { log.push(ev.data); ws.close(); };
          ws.onclose = () => { log.push("close" + ws.readyState);
            __pipHost.emit("ws.done", JSON.stringify({ log })); };
        })();
        """, expecting: "ws.done")
        #expect(r["log"] as? [String] == ["state0", "open1", "echo:hi", "close3"])
    }
}
