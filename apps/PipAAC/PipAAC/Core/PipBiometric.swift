//
//  PipBiometric.swift
//  PipAAC
//
//  ST-3 (phase 044 § 6 D-F): "Face ID may stand in for typing the PIN; it
//  does not change who may do what." The web has no equivalent, and the
//  phase doc settles only that sentence, so this is the narrowest reading:
//
//   - Face ID (or Touch ID, whichever the iPad has) is a device-local
//     choice, off by default, offered only once a Settings PIN exists and
//     the iPad can do it. Like the PIN it is never synced.
//   - It stands in for the 4 digits at the Settings gate and nowhere else:
//     the PIN is still what is set, changed, and typed when Face ID is
//     cancelled, fails, or is off. Turning the PIN off turns it off too.
//   - Turning it on proves it works once (a successful scan), so a
//     choice that cannot open Settings is never saved.
//   - Authentication is `.deviceOwnerAuthenticationWithBiometrics`: no
//     device-passcode fallback, because the Settings PIN is the fallback
//     (a child who knows the iPad passcode must not open Settings).
//
//  UI tests cannot drive the system prompt; `-pipUITestBiometric pass|fail`
//  stands in for the answer the system would give (never set in a build
//  a person runs).
//

import Foundation
import LocalAuthentication

enum PipBiometric {
    private static let defaultsKey = "pip.pin.biometric"

    private static var stub: String? {
        let a = ProcessInfo.processInfo.arguments
        guard let i = a.firstIndex(of: "-pipUITestBiometric"), i + 1 < a.count else { return nil }
        return a[i + 1]
    }

    /// The saved choice (device-local, like the PIN).
    static var enabled: Bool {
        UserDefaults.standard.bool(forKey: defaultsKey) && PipPin.isSet
    }

    static func setEnabled(_ on: Bool) {
        if on { UserDefaults.standard.set(true, forKey: defaultsKey) }
        else { UserDefaults.standard.removeObject(forKey: defaultsKey) }
    }

    /// Can this iPad scan a face or a finger right now?
    static var available: Bool {
        if let stub { return stub == "pass" || stub == "fail" }
        var err: NSError?
        return LAContext().canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: &err)
    }

    /// "Face ID" or "Touch ID", as the system names it.
    static var name: String {
        if stub != nil { return "Face ID" }
        let ctx = LAContext()
        _ = ctx.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: nil)
        return ctx.biometryType == .touchID ? "Touch ID" : "Face ID"
    }

    /// One scan. False on cancel, failure, or no biometrics - the caller
    /// falls back to typing the PIN.
    static func evaluate(reason: String) async -> Bool {
        if let stub { return stub == "pass" }
        let ctx = LAContext()
        ctx.localizedCancelTitle = "Use PIN"
        do {
            return try await ctx.evaluatePolicy(.deviceOwnerAuthenticationWithBiometrics,
                                                localizedReason: reason)
        } catch {
            return false
        }
    }
}
