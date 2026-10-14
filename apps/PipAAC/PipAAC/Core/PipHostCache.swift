//
//  PipHostCache.swift
//  PipAAC
//
//  Cache Storage for the core (044 D4): voice_sentence.mjs / voice_tile.mjs
//  keep every clip they fetch in a named cache keyed by a voice.local URL.
//  Here each entry is a file under <data>/VoiceCache/<cache>/<sha256(url)>.mp3
//  with a .json sidecar { url, type }. `get` and `put` answer the file's
//  path too, so the speaker opens the very bytes the cache holds.
//  Persistent (Application Support), not a purgeable cache directory: a
//  played-once sentence must still play on a plane.
//

import CryptoKit
import Foundation

nonisolated extension PipHost {
    private func cacheDir(_ name: String) throws -> URL {
        guard !name.isEmpty, name.utf8.allSatisfy({
            ($0 >= 48 && $0 <= 57) || ($0 >= 97 && $0 <= 122) || $0 == 45
        }) else { throw PipHostError("bad cache name") }
        let d = config.cacheDirectory.appendingPathComponent(name, isDirectory: true)
        try FileManager.default.createDirectory(at: d, withIntermediateDirectories: true)
        return d
    }

    private func cacheKey(_ url: String) -> String {
        SHA256.hash(data: Data(url.utf8)).map { String(format: "%02x", $0) }.joined()
    }

    func cacheOp(_ a: [String: Any]) throws -> Any? {
        guard let op = a["op"] as? String, let name = a["cache"] as? String
        else { throw PipHostError("cache: bad arguments") }
        let dir = try cacheDir(name)
        let fm = FileManager.default
        switch op {
        case "get":
            let key = cacheKey(a["url"] as? String ?? "")
            let file = dir.appendingPathComponent(key + ".mp3")
            guard let data = fm.contents(atPath: file.path) else { return NSNull() }
            let meta = (try? JSONSerialization.jsonObject(
                with: Data(contentsOf: dir.appendingPathComponent(key + ".json")))) as? [String: Any]
            return ["body": data.base64EncodedString(), "type": meta?["type"] as? String ?? "",
                    "file": file.path]
        case "put":
            guard let url = a["url"] as? String, let b64 = a["body"] as? String,
                  let data = Data(base64Encoded: b64) else { throw PipHostError("cache: bad put") }
            let key = cacheKey(url)
            let file = dir.appendingPathComponent(key + ".mp3")
            try data.write(to: file, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
            let meta = try JSONSerialization.data(
                withJSONObject: ["url": url, "type": a["type"] as? String ?? ""])
            try meta.write(to: dir.appendingPathComponent(key + ".json"), options: .atomic)
            return ["file": file.path]
        case "delete":
            let key = cacheKey(a["url"] as? String ?? "")
            let file = dir.appendingPathComponent(key + ".mp3")
            let had = fm.fileExists(atPath: file.path)
            try? fm.removeItem(at: file)
            try? fm.removeItem(at: dir.appendingPathComponent(key + ".json"))
            return had
        case "keys":
            let names = (try? fm.contentsOfDirectory(atPath: dir.path)) ?? []
            return names.filter { $0.hasSuffix(".json") }.compactMap { n -> String? in
                guard let d = try? Data(contentsOf: dir.appendingPathComponent(n)),
                      let o = (try? JSONSerialization.jsonObject(with: d)) as? [String: Any]
                else { return nil }
                return o["url"] as? String
            }
        default:
            throw PipHostError("cache: unknown op \(op)")
        }
    }
}
