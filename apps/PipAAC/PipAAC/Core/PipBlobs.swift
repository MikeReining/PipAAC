//
//  PipBlobs.swift
//  PipAAC
//
//  The family's photos and recordings (phase 044 E3; Platforms § 3).
//  Content-addressed exactly like the web's OPFS `blobs/` (db.js
//  savePhoto): the file is named by the SHA-256 (lowercase hex) of its
//  raw bytes and the synced key is `blob:<sha>`, so a web device reads
//  the same bytes after sync. This is the same directory the sync host
//  (`blob.save` / `blob.load`) uses, so the later media-upload slice
//  finds these files. Persistent user media: Application Support,
//  included in backup, never a cache.
//

import CryptoKit
import Foundation
import UIKit

nonisolated enum PipBlobs {
    static var directory: URL { PipHost.defaultBlobDirectory() }

    static func sha256Hex(_ data: Data) -> String {
        SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
    }

    /// Stores `data` under its hash and returns the key to record
    /// (`blob:<sha256>`). Identical bytes are one file.
    static func save(_ data: Data) throws -> String {
        let sha = sha256Hex(data)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        let url = directory.appendingPathComponent(sha)
        if !FileManager.default.fileExists(atPath: url.path) {
            try data.write(to: url, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
        }
        return "blob:\(sha)"
    }

    static func sha(of key: String) -> String? {
        guard key.hasPrefix("blob:") else { return nil }
        let sha = String(key.dropFirst(5))
        return sha.count == 64 && sha.utf8.allSatisfy({ ($0 >= 48 && $0 <= 57) || ($0 >= 97 && $0 <= 102) })
            ? sha : nil
    }

    static func url(forKey key: String) -> URL? {
        guard let sha = sha(of: key) else { return nil }
        let u = directory.appendingPathComponent(sha)
        return FileManager.default.fileExists(atPath: u.path) ? u : nil
    }

    static func data(forKey key: String) -> Data? {
        url(forKey: key).flatMap { try? Data(contentsOf: $0) }
    }

    private nonisolated(unsafe) static let cache = NSCache<NSString, UIImage>()

    static func image(forKey key: String) -> UIImage? {
        if let hit = cache.object(forKey: key as NSString) { return hit }
        guard let d = data(forKey: key), let img = UIImage(data: d) else { return nil }
        cache.setObject(img, forKey: key as NSString)
        return img
    }
}

/// A photo as the card stores it: upright JPEG, long side at most 1600 px.
/// (The web stores the picked file's bytes as they are — a camera JPEG or
/// HEIC; the same blob format, smaller bytes, and a JPEG every browser
/// draws.)
nonisolated enum PipPhoto {
    static let maxSide: CGFloat = 1600

    static func jpeg(from data: Data) -> Data? {
        guard let src = UIImage(data: data) else { return nil }
        return jpeg(from: src)
    }

    static func jpeg(from src: UIImage) -> Data? {
        let longest = max(src.size.width, src.size.height)
        guard longest > 0 else { return nil }
        let scale = min(1, maxSide / longest)
        let size = CGSize(width: (src.size.width * scale).rounded(),
                          height: (src.size.height * scale).rounded())
        let fmt = UIGraphicsImageRendererFormat.default()
        fmt.scale = 1
        fmt.opaque = true
        // Drawing bakes the EXIF orientation in: the stored pixels are upright.
        let out = UIGraphicsImageRenderer(size: size, format: fmt).image { ctx in
            UIColor.white.setFill()
            ctx.fill(CGRect(origin: .zero, size: size))
            src.draw(in: CGRect(origin: .zero, size: size))
        }
        return out.jpegData(compressionQuality: 0.85)
    }
}
