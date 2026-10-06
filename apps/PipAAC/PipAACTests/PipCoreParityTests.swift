//
//  PipCoreParityTests.swift
//  PipAACTests
//
//  A0-S1 (phase 044 § 6): the shared core in JavaScriptCore must answer
//  byte-identically to the node harness that generated the fixtures.
//  Every expected value in Fixtures/ was produced by the same
//  pip-harness.js this target evaluates — a mismatch is an engine or
//  host-shim bug, never a spec reading.
//

import Testing
import Foundation
import JavaScriptCore
import PipAAC

private func ms(_ d: Duration) -> Double {
    let c = d.components
    return Double(c.seconds) * 1000 + Double(c.attoseconds) / 1e15
}

/// JS host + fixture plumbing, shared across the suite. One instance —
/// the core's serial queue is the point under test.
final class CoreHarness {
    let core = PipCore()
    let tmp: URL

    init() throws {
        tmp = FileManager.default.temporaryDirectory
            .appendingPathComponent("pip-a0-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: tmp, withIntermediateDirectories: true)
        try core.sync {
            _ = try core.evaluate(resource: "pip-core.js", bundle: Bundle(for: PipCore.self))
            _ = try core.evaluate(resource: "pip-harness.js", bundle: Bundle(for: CoreHarness.self))
        }
    }

    func fixtureURL(_ name: String) throws -> URL {
        let b = Bundle(for: CoreHarness.self)
        guard let url = b.url(forResource: name, withExtension: nil)
            ?? b.url(forResource: name, withExtension: nil, subdirectory: "Fixtures")
        else { throw PipCoreError.bundleMissing(name) }
        return url
    }

    func fixtureText(_ name: String) throws -> String {
        try String(contentsOf: fixtureURL(name), encoding: .utf8)
    }

    func fixtureObject(_ name: String) throws -> Any {
        try JSONSerialization.jsonObject(with: Data(fixtureText(name).utf8))
    }

    /// A writable copy of a shipped .sqlite, opened as a host db id.
    func openFixtureDb(_ name: String) throws -> Int32 {
        let dst = tmp.appendingPathComponent("\(UUID().uuidString)-\(name)")
        try FileManager.default.copyItem(at: fixtureURL(name), to: dst)
        return try core.sync { try core.openDatabase(path: dst.path) }
    }

    /// PIPHARNESS.<method>(args…) -> Foundation value, on the core queue.
    @discardableResult
    func harness(_ method: String, _ args: [Any] = []) throws -> Any? {
        try core.sync { try core.call("PIPHARNESS", method, args) }
    }

    /// Raw JSValue variant — for canon-checking a result in JS.
    @discardableResult
    func harnessValue(_ method: String, _ args: [Any] = []) throws -> JSValue {
        try core.sync { try core.callValue("PIPHARNESS", method, args) }
    }

    /// canon(got) == canon(parse(json)) — the fixture compare.
    func matchesCanon(_ got: JSValue, _ json: String) throws -> Bool {
        try core.sync {
            try core.callValue("PIPHARNESS", "matchCanonJson", [got, json])
        }.toBool()
    }

    static func jsonString(_ obj: Any) throws -> String {
        String(decoding: try JSONSerialization.data(
            withJSONObject: obj, options: [.sortedKeys]), as: UTF8.self)
    }
}

private func percentile(_ xs: [Double], _ p: Double) -> Double {
    guard !xs.isEmpty else { return 0 }
    let s = xs.sorted()
    return s[min(s.count - 1, Int((Double(s.count) * p).rounded(.down)))]
}

@Suite(.serialized)
struct PipCoreParityTests {

    @Test func coreLoadBudget() throws {
        // "Evaluate bundle + open database" ≤ 300 ms is the A0 target;
        // the simulator number informs, the physical A16 run gates.
        let core = PipCore()
        let tmp = FileManager.default.temporaryDirectory
            .appendingPathComponent("pip-a0-load-\(UUID().uuidString).sqlite")
        let clock = ContinuousClock.now
        let dbId = try core.sync {
            _ = try core.evaluate(resource: "pip-core.js", bundle: Bundle(for: PipCore.self))
            return try core.openDatabase(path: tmp.path)
        }
        let elapsed = ms(clock.duration(to: .now))
        print("A0 core load (eval pip-core.js + open db): \(elapsed) ms")
        try core.sync { core.closeDatabase(id: dbId) }
        #expect(elapsed <= 300, "core load \(elapsed)ms over 300ms")
    }

    @Test func replayFixturesMatchByteForByte() throws {
        let h = try CoreHarness()
        for name in ["replay_20260923.json", "replay_7.json",
                     "replay_424242.json", "replay_pending.json"] {
            let fx = try h.fixtureText(name)
            let dbId = try h.openFixtureDb("base.sqlite")
            let res = try h.harness("runReplay", [dbId, fx]) as? [String: Any]
            try h.core.sync { h.core.closeDatabase(id: dbId) }
            #expect(res?["ok"] as? Bool == true,
                    "\(name): diffs \(res?["diffs"] ?? "?")")
        }
    }

    @Test func tapProbesMatchAndMeetBudget() throws {
        let h = try CoreHarness()
        let kids = try h.fixtureText("suggest_answers.en.json")
        let forms = try h.fixtureText("form_answers.en.json")
        let probes = try h.fixtureObject("probes.json") as! [String: Any]
        let sentences = probes["sentences"] as! [[String: Any]]
        let dbId = try h.openFixtureDb("heavy.sqlite")
        let sid = try h.harness("probeBegin", [dbId, kids, forms]) as! String

        var times: [Double] = []
        var mismatches: [Int] = []
        for (si, s) in sentences.enumerated() {
            _ = try h.harness("probeSentenceStart", [sid, s["at"] as Any])
            for (ti, t) in (s["taps"] as! [[String: Any]]).enumerated() {
                let clock = ContinuousClock.now
                let got = try h.harness("probeTap", [sid, t["tap"] as Any, t["at"] as Any])
                times.append(ms(clock.duration(to: .now)))
                if got as? String != t["expect"] as? String {
                    mismatches.append(si * 1000 + ti)
                }
            }
            _ = try h.harness("probeSentenceEnd", [sid, s["at"] as Any])
        }
        _ = try h.harness("probeFinish", [sid])

        let p50 = percentile(times, 0.50), p95 = percentile(times, 0.95)
        let p99 = percentile(times, 0.99)
        print("A0 probe taps: n=\(times.count) p50=\(p50) p95=\(p95) p99=\(p99) ms")
        #expect(mismatches.isEmpty, "canon mismatches at \(mismatches.prefix(5))")
        // Budgets (A0 pass): p95 ≤ 30 ms, p99 ≤ 60 ms — simulator informs.
        #expect(p95 <= 30, "Smart bar + forms p95 \(p95) ms over 30 ms")
        #expect(p99 <= 60, "Smart bar + forms p99 \(p99) ms over 60 ms")
    }

    @Test func catchupDrainMatchesAndMeetBudget() throws {
        let h = try CoreHarness()
        let fx = try h.fixtureObject("catchup.json") as! [String: Any]
        let relayJson = try CoreHarness.jsonString(fx["relay"]!)
        let expectJson = try CoreHarness.jsonString(fx["expect"]!)
        let dbId = try h.openFixtureDb("heavy.sqlite")
        let clock = ContinuousClock.now
        let dump = try h.harnessValue("runDrain", [dbId, relayJson])
        let elapsed = ms(clock.duration(to: .now))
        print("A0 catch-up drain: \(elapsed) ms for \((fx["relay"] as! [Any]).count) ops")
        #expect(elapsed <= 3000, "catch-up \(elapsed) ms over 3000 ms")
        let ok = try h.matchesCanon(dump, expectJson)
        #expect(ok, "catch-up dump diverged")
    }

    @Test func editOpRecordBudget() throws {
        let h = try CoreHarness()
        let fx = try h.fixtureObject("edits.json") as! [String: Any]
        let dbId = try h.openFixtureDb("heavy.sqlite")
        var times: [Double] = []
        for e in fx["edits"] as! [[String: Any]] {
            let clock = ContinuousClock.now
            _ = try h.harness("oneEdit", [dbId, e["call"] as Any, e["args"] as Any])
            times.append(ms(clock.duration(to: .now)))
        }
        let p95 = percentile(times, 0.95)
        print("A0 edit+op record: n=\(times.count) p95=\(p95) ms")
        #expect(p95 <= 30, "edit+op p95 \(p95) ms over 30 ms")
    }

    @Test func goldenBarCasesMatch() throws {
        let h = try CoreHarness()
        let kids = try h.fixtureText("suggest_answers.en.json")
        let fx = try h.fixtureObject("goldens_bar.json") as! [String: Any]
        for (i, c) in (fx["cases"] as! [[String: Any]]).enumerated() {
            let dbId = try h.openFixtureDb("base.sqlite")
            var k = c
            k["kids"] = kids
            let got = try h.harnessValue("barGolden", [dbId, k])
            try h.core.sync { h.core.closeDatabase(id: dbId) }
            let ok = try h.matchesCanon(got, CoreHarness.jsonString(c["node"]!))
            #expect(ok, "bar case \(i) diverged")
        }
    }

    @Test func goldenFormCasesMatch() throws {
        let h = try CoreHarness()
        let kids = try h.fixtureText("suggest_answers.en.json")
        let forms = try h.fixtureText("form_answers.en.json")
        let fx = try h.fixtureObject("goldens_form.json") as! [String: Any]
        for (i, c) in (fx["cases"] as! [[String: Any]]).enumerated() {
            let dbId = try h.openFixtureDb("base.sqlite")
            let k: [String: Any] = [
                "taps": c["taps"] ?? NSNull(),
                "speak": c["speak"] ?? NSNull(),
                "barRank": c["barRank"] ?? NSNull(),
                "at": c["at"] ?? NSNull(),
                "kids": kids,
                "forms": forms,
            ]
            let got = try h.harnessValue("formGolden", [dbId, k])
            try h.core.sync { h.core.closeDatabase(id: dbId) }
            let ok = try h.matchesCanon(got, CoreHarness.jsonString(c["node"]!))
            #expect(ok, "form case \(i) diverged")
        }
    }
}
