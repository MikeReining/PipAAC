//
//  PipPin.swift
//  PipAAC
//
//  The Settings PIN — shared/pin.mjs owns the rules (023 §1e): four
//  digits, one per device, never synced, stored only as the SHA-256 of
//  "pip-pin:device:<pin>". No PIN set means Settings opens with one
//  tap; Forgot is the reset phrase, never a lockout. The store is the
//  device's — UserDefaults here is the web keyStore's native seat.
//

import CryptoKit
import Foundation

enum PipPin {
    private static let defaultsKey = "pip.pin.device"
    static let resetPhrase = "new pin"

    static var isSet: Bool {
        UserDefaults.standard.string(forKey: defaultsKey) != nil
    }

    private static func hash(_ pin: String) -> String {
        SHA256.hash(data: Data("pip-pin:device:\(pin)".utf8))
            .map { String(format: "%02x", $0) }
            .joined()
    }

    static func check(_ pin: String) -> Bool {
        guard let stored = UserDefaults.standard.string(forKey: defaultsKey)
        else { return false }
        return stored == hash(pin)
    }

    static func set(_ pin: String) -> Bool {
        guard pin.range(of: #"^\d{4}$"#, options: .regularExpression) != nil
        else { return false }
        UserDefaults.standard.set(hash(pin), forKey: defaultsKey)
        return true
    }

    static func clear() {
        UserDefaults.standard.removeObject(forKey: defaultsKey)
    }

    static func isResetPhrase(_ text: String) -> Bool {
        text.lowercased()
            .split(whereSeparator: \.isWhitespace)
            .joined(separator: " ") == resetPhrase
    }
}
