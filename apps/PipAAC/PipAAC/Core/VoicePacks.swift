//
//  VoicePacks.swift
//  PipAAC
//
//  Offline voice packs (phase 044 D3, BS-25; Platforms § 3). Pip's voice
//  is bundled (SharedAssets). Every other voice is one pack of clips,
//  downloaded from the same static URLs the web's service worker fills
//  from (sw-audio.json lists each voice's files; a clip's file name is
//  the first 12 hex of the SHA-256 of its bytes, so every file can be
//  verified, not trusted).
//
//  Rules, all enforced here:
//   - a pack is built in .staging/ and only moved to <voice>/ after every
//     file verified and the .complete sentinel is written - an interrupted
//     download never leaves a half pack that looks active;
//   - staging survives an interruption, so the next try resumes;
//   - an update downloads next to the working pack and replaces it only
//     once verified - the old pack keeps speaking until then;
//   - the root is excluded from backup (packs re-download);
//   - no Apple TTS, no fallback voice: a missing pack means the voice is
//     not ready, and the setting is never written for it.
//

import CryptoKit
import Foundation

public nonisolated struct VoiceManifestEntry: Sendable, Equatable {
    public let hash: String
    public let files: [String]       // "/audio/a/<12hex>.mp3"
    public init(hash: String, files: [String]) { self.hash = hash; self.files = files }
}

public nonisolated enum VoicePackError: Error, Equatable {
    case badStatus(String, Int)
    case corrupt(String)
    case unknownVoice(String)
    case incomplete(Int)
}

public nonisolated final class VoicePacks: @unchecked Sendable {
    public static let defaultBase = URL(string: "https://app.pipaac.org")!
    /// The app's pack store; `-PipDataDir` (UI tests) moves it with the data.
    static let shared: VoicePacks = {
        let base = UserDefaults.standard.string(forKey: "PipVoiceBase")
            .flatMap(URL.init(string:)) ?? defaultBase
        let root = ((try? PipAssets.dataBase())
            ?? FileManager.default.temporaryDirectory)
            .appendingPathComponent("VoicePacks", isDirectory: true)
        return VoicePacks(root: root, base: base)
    }()

    let root: URL
    let base: URL
    private let session: URLSession
    private let lock = NSLock()
    private var readyDirs: [String: URL] = [:]

    public init(root: URL, base: URL, session: URLSession? = nil) {
        self.root = root
        self.base = base
        if let session {
            self.session = session
        } else {
            let c = URLSessionConfiguration.ephemeral
            c.timeoutIntervalForRequest = 30
            c.httpMaximumConnectionsPerHost = 6
            c.waitsForConnectivity = false
            self.session = URLSession(configuration: c)
        }
        try? FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        Self.excludeFromBackup(root)
        refresh()
    }

    // MARK: lookup (sync - the speaker calls this on a tap)

    private func packDir(_ voice: String) -> URL {
        root.appendingPathComponent(voice, isDirectory: true)
    }

    private func sentinel(_ dir: URL) -> URL { dir.appendingPathComponent(".complete") }

    /// Re-reads which packs are complete (sentinel present).
    func refresh() {
        var next: [String: URL] = [:]
        let names = (try? FileManager.default.contentsOfDirectory(atPath: root.path)) ?? []
        for n in names where !n.hasPrefix(".") {
            let d = packDir(n)
            if FileManager.default.fileExists(atPath: sentinel(d).path) { next[n] = d }
        }
        lock.lock(); readyDirs = next; lock.unlock()
    }

    public func isReady(_ voice: String) -> Bool {
        lock.lock(); defer { lock.unlock() }
        return readyDirs[voice] != nil
    }

    /// The manifest hash the installed pack was verified against.
    public func installedHash(_ voice: String) -> String? {
        guard let data = try? Data(contentsOf: sentinel(packDir(voice))),
              let o = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
        else { return nil }
        return o["hash"] as? String
    }

    /// A clip key ("audio/a/x.mp3") inside any complete pack. Keys are
    /// content-hashed, so a key belongs to one voice; the core only asks
    /// for the chosen voice's keys.
    public func clipURL(_ key: String) -> URL? {
        lock.lock(); let dirs = Array(readyDirs.values); lock.unlock()
        for d in dirs {
            let u = d.appendingPathComponent(key)
            if FileManager.default.fileExists(atPath: u.path) { return u }
        }
        return nil
    }

    // MARK: manifest

    /// sw-audio.json from the network (what the web's worker reads); the
    /// bundled copy when offline.
    func fetchManifest() async throws -> [String: VoiceManifestEntry] {
        do {
            var req = URLRequest(url: base.appendingPathComponent("sw-audio.json"))
            req.cachePolicy = .reloadIgnoringLocalCacheData
            let (data, resp) = try await session.data(for: req)
            guard (resp as? HTTPURLResponse)?.statusCode == 200 else {
                throw VoicePackError.badStatus("sw-audio.json", (resp as? HTTPURLResponse)?.statusCode ?? 0)
            }
            return try Self.parseManifest(data)
        } catch {
            guard let u = PipAssets.url("sw-audio.json") else { throw error }
            return try Self.parseManifest(try Data(contentsOf: u))
        }
    }

    static func parseManifest(_ data: Data) throws -> [String: VoiceManifestEntry] {
        guard let o = try JSONSerialization.jsonObject(with: data) as? [String: Any],
              let voices = o["voices"] as? [String: [String: Any]]
        else { throw VoicePackError.corrupt("sw-audio.json") }
        var out: [String: VoiceManifestEntry] = [:]
        for (id, v) in voices {
            if let h = v["hash"] as? String, let f = v["files"] as? [String] {
                out[id] = VoiceManifestEntry(hash: h, files: f)
            }
        }
        return out
    }

    // MARK: verify

    /// A clip's name is the first 12 hex of the SHA-256 of its bytes.
    static func matchesName(_ path: String, _ data: Data) -> Bool {
        let stem = ((path as NSString).lastPathComponent as NSString).deletingPathExtension
        let hex = SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
        return hex.hasPrefix(stem)
    }

    private static func excludeFromBackup(_ url: URL) {
        var u = url
        var v = URLResourceValues()
        v.isExcludedFromBackup = true
        try? u.setResourceValues(v)
    }

    // MARK: download

    /// Downloads, verifies and activates one voice's pack. `progress`
    /// gets (files done, total). Throws on any failure or cancel; the
    /// working pack (if any) is untouched and staging is kept to resume.
    public func install(voice: String, entry: VoiceManifestEntry,
                 progress: @escaping @Sendable (Int, Int) -> Void) async throws {
        let fm = FileManager.default
        let stagingRoot = root.appendingPathComponent(".staging", isDirectory: true)
        let staging = stagingRoot.appendingPathComponent("\(voice)-\(entry.hash)", isDirectory: true)
        try fm.createDirectory(at: staging, withIntermediateDirectories: true)
        Self.excludeFromBackup(root)
        // A stale half-pack for an older list of this voice is dead weight.
        for n in (try? fm.contentsOfDirectory(atPath: stagingRoot.path)) ?? []
        where n.hasPrefix("\(voice)-") && n != "\(voice)-\(entry.hash)" {
            try? fm.removeItem(at: stagingRoot.appendingPathComponent(n))
        }
        let working = packDir(voice)
        let total = entry.files.count
        var todo: [String] = []
        var have = 0
        for f in entry.files {
            let rel = String(f.drop(while: { $0 == "/" }))
            let dest = staging.appendingPathComponent(rel)
            if fm.fileExists(atPath: dest.path) { have += 1; continue }
            // Content-addressed: a file already in the working pack is
            // the same bytes, link it instead of fetching.
            let old = working.appendingPathComponent(rel)
            if fm.fileExists(atPath: old.path) {
                try fm.createDirectory(at: dest.deletingLastPathComponent(), withIntermediateDirectories: true)
                if (try? fm.linkItem(at: old, to: dest)) != nil || (try? fm.copyItem(at: old, to: dest)) != nil {
                    have += 1; continue
                }
            }
            todo.append(f)
        }
        let counter = Counter(have)
        progress(have, total)
        let base = self.base, session = self.session
        try await withThrowingTaskGroup(of: Void.self) { group in
            var it = todo.makeIterator()
            func add() -> Bool {
                guard let f = it.next() else { return false }
                group.addTask {
                    try await Self.fetch(f, base: base, session: session, into: staging)
                    progress(counter.bump(), total)
                }
                return true
            }
            for _ in 0..<6 { if !add() { break } }
            while try await group.next() != nil { _ = add() }
        }
        try Task.checkCancellation()
        // Verify every file before the pack can become active.
        var bytes = 0
        for f in entry.files {
            let rel = String(f.drop(while: { $0 == "/" }))
            let u = staging.appendingPathComponent(rel)
            guard let data = try? Data(contentsOf: u), Self.matchesName(rel, data) else {
                try? fm.removeItem(at: u)    // refetched on the next try
                throw VoicePackError.corrupt(rel)
            }
            bytes += data.count
        }
        let meta: [String: Any] = ["voice": voice, "hash": entry.hash,
                                   "files": total, "bytes": bytes]
        try JSONSerialization.data(withJSONObject: meta).write(to: sentinel(staging))
        Self.excludeFromBackup(staging)
        if fm.fileExists(atPath: working.path) {
            _ = try fm.replaceItemAt(working, withItemAt: staging)
        } else {
            try fm.moveItem(at: staging, to: working)
        }
        refresh()
    }

    private static func fetch(_ path: String, base: URL, session: URLSession,
                              into staging: URL) async throws {
        let rel = String(path.drop(while: { $0 == "/" }))
        var last: Error = VoicePackError.corrupt(rel)
        for _ in 0..<2 {
            try Task.checkCancellation()
            do {
                var req = URLRequest(url: base.appendingPathComponent(rel))
                req.cachePolicy = .reloadIgnoringLocalCacheData
                let (data, resp) = try await session.data(for: req)
                let code = (resp as? HTTPURLResponse)?.statusCode ?? 0
                guard code == 200 else { throw VoicePackError.badStatus(rel, code) }
                guard matchesName(rel, data) else { throw VoicePackError.corrupt(rel) }
                let dest = staging.appendingPathComponent(rel)
                try FileManager.default.createDirectory(
                    at: dest.deletingLastPathComponent(), withIntermediateDirectories: true)
                let tmp = dest.appendingPathExtension("part")
                try data.write(to: tmp)
                try? FileManager.default.removeItem(at: dest)
                try FileManager.default.moveItem(at: tmp, to: dest)
                return
            } catch is CancellationError {
                throw CancellationError()
            } catch { last = error }
        }
        throw last
    }

    // MARK: sample (Hear it before a pack is downloaded)

    /// One verified clip fetched into Caches for a preview; never part of
    /// a pack and never made active.
    func sampleFile(voice: String, key: String) async throws -> URL {
        let fm = FileManager.default
        let dir = fm.temporaryDirectory.appendingPathComponent("VoiceSamples/\(voice)", isDirectory: true)
        let dest = dir.appendingPathComponent(key)
        if fm.fileExists(atPath: dest.path) { return dest }
        try await Self.fetch("/" + key, base: base, session: session, into: dir)
        return dest
    }

    private final class Counter: @unchecked Sendable {
        private let l = NSLock()
        private var n: Int
        init(_ n: Int) { self.n = n }
        func bump() -> Int { l.lock(); defer { l.unlock() }; n += 1; return n }
    }
}

/// UI-test instrument: with `-PipTraceAudio YES` the resolved file of every
/// played clip is appended to <data dir>/played_clips.txt, so a test can
/// assert which file the speaker opened (not what a label claims).
nonisolated enum PipAudioTrace {
    static func record(_ url: URL) {
        guard UserDefaults.standard.bool(forKey: "PipTraceAudio"),
              let dir = try? PipAssets.dataBase() else { return }
        let f = dir.appendingPathComponent("played_clips.txt")
        let line = Data((url.path + "\n").utf8)
        if let h = try? FileHandle(forWritingTo: f) {
            defer { try? h.close() }
            _ = try? h.seekToEnd()
            try? h.write(contentsOf: line)
        } else {
            try? line.write(to: f)
        }
    }
}
