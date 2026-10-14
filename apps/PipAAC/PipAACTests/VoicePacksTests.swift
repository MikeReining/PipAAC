//
//  VoicePacksTests.swift
//  PipAACTests
//
//  044 D3: voice pack download rules over a URLProtocol stub (no real
//  network, no real voice pack):
//   - an interrupted download leaves no active pack and the staging for
//     a resume; a retry fetches only what is missing, then activates;
//   - a file whose bytes do not match its name is rejected;
//   - an update replaces the working pack only after it verified, and a
//     failed update keeps the old pack speaking;
//   - the pack store is excluded from backup.
//

import CryptoKit
import Foundation
import Testing
import PipAAC

final class VoiceStub: URLProtocol, @unchecked Sendable {
    nonisolated(unsafe) static var files: [String: Data] = [:]   // "/audio/x.mp3" -> bytes
    nonisolated(unsafe) static var failAfter: Int? = nil          // fail every request past N
    nonisolated(unsafe) static var served: [String] = []
    private static let lock = NSLock()

    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func stopLoading() {}
    override func startLoading() {
        let path = request.url?.path ?? ""
        Self.lock.lock()
        let n = Self.served.count
        let fail = Self.failAfter.map { n >= $0 } ?? false
        if !fail { Self.served.append(path) }
        let data = Self.files[path]
        Self.lock.unlock()
        if fail { client?.urlProtocol(self, didFailWithError: URLError(.networkConnectionLost)); return }
        guard let data else {
            let r = HTTPURLResponse(url: request.url!, statusCode: 404, httpVersion: nil, headerFields: nil)!
            client?.urlProtocol(self, didReceive: r, cacheStoragePolicy: .notAllowed)
            client?.urlProtocolDidFinishLoading(self); return
        }
        let r = HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!
        client?.urlProtocol(self, didReceive: r, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: data)
        client?.urlProtocolDidFinishLoading(self)
    }
}

@Suite(.serialized) struct VoicePacksTests {
    /// A clip whose name is the first 12 hex of its own SHA-256.
    static func clip(_ seed: String) -> (path: String, data: Data) {
        let data = Data("clip-\(seed)".utf8)
        let name = SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined().prefix(12)
        return ("/audio/\(seed.prefix(1))/\(name).mp3", data)
    }

    static func fixture(_ seeds: [String]) -> (VoicePacks, VoiceManifestEntry, URL) {
        let clips = seeds.map(clip)
        VoiceStub.files = Dictionary(uniqueKeysWithValues: clips.map { ($0.path, $0.data) })
        VoiceStub.failAfter = nil
        VoiceStub.served = []
        let c = URLSessionConfiguration.ephemeral
        c.protocolClasses = [VoiceStub.self]
        let root = FileManager.default.temporaryDirectory
            .appendingPathComponent("pip-voicepacks-\(UUID().uuidString)", isDirectory: true)
        let packs = VoicePacks(root: root, base: URL(string: "https://stub.test")!,
                               session: URLSession(configuration: c))
        return (packs, VoiceManifestEntry(hash: "h1", files: clips.map(\.path)), root)
    }

    @Test func interruptedDownloadLeavesNoActivePackAndResumes() async throws {
        let (packs, entry, root) = Self.fixture((0..<30).map { "e\($0)" })
        VoiceStub.failAfter = 12                       // the network drops midway
        await #expect(throws: (any Error).self) {
            try await packs.install(voice: "voi_mia_en", entry: entry) { _, _ in }
        }
        #expect(!packs.isReady("voi_mia_en"))
        #expect(!FileManager.default.fileExists(atPath: root.appendingPathComponent("voi_mia_en").path))
        #expect(packs.clipURL(String(entry.files[0].dropFirst())) == nil)
        let fetchedBefore = VoiceStub.served.count

        VoiceStub.failAfter = nil                      // back online: resume
        try await packs.install(voice: "voi_mia_en", entry: entry) { _, _ in }
        #expect(packs.isReady("voi_mia_en"))
        #expect(VoiceStub.served.count - fetchedBefore <= 30 - fetchedBefore + 6,
                "resume must not refetch what already verified")
        for f in entry.files {
            let u = try #require(packs.clipURL(String(f.dropFirst())))
            #expect(u.path.contains("/voi_mia_en/"))
        }
        #expect(packs.installedHash("voi_mia_en") == "h1")
        let v = try root.resourceValues(forKeys: [.isExcludedFromBackupKey])
        #expect(v.isExcludedFromBackup == true)
    }

    @Test func aFileThatDoesNotMatchItsNameIsRejected() async throws {
        let (packs, entry, _) = Self.fixture(["a1", "b2", "c3"])
        VoiceStub.files[entry.files[1]] = Data("tampered".utf8)
        await #expect(throws: (any Error).self) {
            try await packs.install(voice: "voi_leo_en", entry: entry) { _, _ in }
        }
        #expect(!packs.isReady("voi_leo_en"))
    }

    @Test func aFailedUpdateKeepsTheWorkingPack() async throws {
        let (packs, v1, _) = Self.fixture(["a1", "b2", "c3"])
        try await packs.install(voice: "voi_sam_en", entry: v1) { _, _ in }
        let old = try #require(packs.clipURL(String(v1.files[0].dropFirst())))

        let extra = Self.clip("d4")
        VoiceStub.files[extra.path] = extra.data
        let v2 = VoiceManifestEntry(hash: "h2", files: v1.files + [extra.path])
        VoiceStub.failAfter = VoiceStub.served.count     // every new request fails
        await #expect(throws: (any Error).self) {
            try await packs.install(voice: "voi_sam_en", entry: v2) { _, _ in }
        }
        #expect(packs.isReady("voi_sam_en"))
        #expect(packs.installedHash("voi_sam_en") == "h1")
        #expect(FileManager.default.fileExists(atPath: old.path))

        VoiceStub.failAfter = nil
        try await packs.install(voice: "voi_sam_en", entry: v2) { _, _ in }
        #expect(packs.installedHash("voi_sam_en") == "h2")
        #expect(packs.clipURL(String(extra.path.dropFirst())) != nil)
    }
}
