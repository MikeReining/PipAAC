//
//  PipKeychain.swift
//  PipAAC
//
//  The native seat of the web's keyStore (sync_crypto.mjs openKeyStore:
//  IndexedDB `pip-keys`). Raw bytes by name, device-only, readable after
//  first unlock so background sync works with the screen locked. Not wired
//  into the UI yet (044 A0-S2). Unlike IndexedDB it holds key BYTES, not
//  CryptoKey objects — wrap with PipCrypto on the way in and out.
//

import Foundation
import Security

public nonisolated enum PipKeychain {
    /// Same names the JS keyStore uses (sync_crypto.mjs).
    public static func userKeyName(_ userId: String, epoch: Int) -> String { "user/\(userId)/key_e\(epoch)" }
    public static func userRootName(_ userId: String) -> String { "user/\(userId)/root" }
    public static func retiredRootsName(_ userId: String) -> String { "user/\(userId)/roots" }
    /// Device identity: JS stores one "device" record { sig, dh }; here the
    /// two private scalars are separate items.
    public static let deviceSignName = "device/sig"
    public static let deviceDhName = "device/dh"

    public struct Failure: Error, Equatable { public let status: OSStatus }

    public static let defaultService = "org.pipaac.keys"

    private static func query(_ name: String, _ service: String) -> [String: Any] {
        [kSecClass as String: kSecClassGenericPassword,
         kSecAttrService as String: service,
         kSecAttrAccount as String: name]
    }

    public static func get(_ name: String, service: String = defaultService) throws -> Data? {
        var q = query(name, service)
        q[kSecReturnData as String] = true
        q[kSecMatchLimit as String] = kSecMatchLimitOne
        var out: CFTypeRef?
        let s = SecItemCopyMatching(q as CFDictionary, &out)
        if s == errSecItemNotFound { return nil }
        guard s == errSecSuccess else { throw Failure(status: s) }
        return out as? Data
    }

    public static func put(_ name: String, _ data: Data, service: String = defaultService) throws {
        let q = query(name, service)
        let attrs: [String: Any] = [
            kSecValueData as String: data,
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly,
        ]
        var s = SecItemUpdate(q as CFDictionary, attrs as CFDictionary)
        if s == errSecItemNotFound { s = SecItemAdd(q.merging(attrs) { $1 } as CFDictionary, nil) }
        guard s == errSecSuccess else { throw Failure(status: s) }
    }

    public static func delete(_ name: String, service: String = defaultService) throws {
        let s = SecItemDelete(query(name, service) as CFDictionary)
        guard s == errSecSuccess || s == errSecItemNotFound else { throw Failure(status: s) }
    }
}
