//
//  PipAssets.swift
//  PipAAC
//
//  The SharedAssets bundle folder (scripts/ios/bundle_assets.mjs): a
//  blue folder reference, so db keys — clip.key "audio/…", image.key
//  "symbols/…" — are literal paths inside it. SVG keys resolve to the
//  rasterized "<key>.png" twin; `blob:` keys are family photos/recordings
//  that live in the app's documents store (slice B: none exist yet).
//

import Foundation
import UIKit

nonisolated enum PipAssets {
    static let root: URL = {
        guard let u = Bundle.main.resourceURL?.appendingPathComponent("SharedAssets", isDirectory: true),
              FileManager.default.fileExists(atPath: u.path) else {
            fatalError("SharedAssets folder missing from the app bundle")
        }
        return u
    }()

    static func url(_ rel: String) -> URL? {
        let u = root.appendingPathComponent(rel)
        return FileManager.default.fileExists(atPath: u.path) ? u : nil
    }

    /// The drawable file for an `image.key`/`art` value: webp/png as-is,
    /// svg → the "<key>.png" twin emitted by bundle_assets.
    static func artURL(_ key: String?) -> URL? {
        guard let key, !key.isEmpty, !key.hasPrefix("blob:") else { return nil }
        if key.hasSuffix(".svg") { return url("\(key).png") }
        return url(key)
    }

    /// Pip's bundled clips first, then a downloaded voice pack (D3).
    static func clipURL(_ key: String) -> URL? {
        url(key) ?? VoicePacks.shared.clipURL(key)
    }

    static func text(_ rel: String) throws -> String {
        guard let u = url(rel) else {
            throw NSError(domain: "org.pipaac", code: 1,
                          userInfo: [NSLocalizedDescriptionKey: "missing bundled asset \(rel)"])
        }
        return try String(contentsOf: u, encoding: .utf8)
    }

    // MARK: - Art cache

    private nonisolated(unsafe) static let cache = NSCache<NSString, UIImage>()

    static func image(_ key: String?) -> UIImage? {
        if let key, key.hasPrefix("blob:") { return PipBlobs.image(forKey: key) } // a family photo
        guard let u = artURL(key) else { return nil }
        let path = u.path as NSString
        if let hit = cache.object(forKey: path) { return hit }
        guard let img = UIImage(contentsOfFile: u.path) else { return nil }
        cache.setObject(img, forKey: path)
        return img
    }

    // MARK: - People (PeopleRegistry.swift)

    /// Where people.json and Users/<id>.sqlite live: Application Support,
    /// or the `-PipDataDir <path>` launch argument (UI tests read the
    /// files they assert on from there).
    static func dataBase() throws -> URL {
        let base: URL
        if let o = UserDefaults.standard.string(forKey: "PipDataDir") {
            base = URL(fileURLWithPath: o, isDirectory: true)
        } else {
            base = try FileManager.default.url(
                for: .applicationSupportDirectory, in: .userDomainMask,
                appropriateFor: nil, create: true)
        }
        try FileManager.default.createDirectory(at: base, withIntermediateDirectories: true)
        return base
    }

    static func makeRegistry() throws -> PeopleRegistry {
        PeopleRegistry(base: try dataBase(), seed: url("fresh_db.sqlite"))
    }
}
