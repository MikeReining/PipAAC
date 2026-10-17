//
//  SoftPasskey.swift
//  PipAAC
//
//  UI-test stand-in for the passkey sheet (phase 044 slice IL). The
//  simulator cannot finish an ASAuthorization ceremony, so an XCUITest that
//  needs a REAL sign-in (the invitee landing: open the invite, make a
//  passkey, register the account on the Worker) passes
//  `-pipUITestSoftPasskey`; the ceremony then runs here, in software.
//
//  What it is: a P-256 credential and a PRF that both live only in this
//  process. `passkey.create` answers like the OS does - a credential id, a
//  "none"-format attestationObject carrying the COSE public key (the core
//  parses it into the JWK the Worker stores), and a PRF output the host keeps
//  as an opaque handle. `passkey.get` is NOT implemented: the flows that
//  need an assertion (a returning sign-in) stay with the manual C5 script and
//  with the node tests' software authenticator.
//
//  Only reachable through the launch argument; the production ceremony is
//  PipPasskeys.swift.
//

import CryptoKit
import Foundation

nonisolated enum SoftPasskey {
    /// `-pipUITestSoftPasskey`: tests only.
    static var requested: Bool {
        ProcessInfo.processInfo.arguments.contains("-pipUITestSoftPasskey")
    }

    /// The authenticator's PRF secret: per process, never leaves.
    private static let secret = Data((0..<32).map { _ in UInt8.random(in: 0...255) })

    static func run(_ op: String, _ r: PasskeyRequest) async throws -> PasskeyResult {
        guard op == "passkey.create" else {
            throw PipHostError("The soft passkey only makes passkeys (\(op)).")
        }
        let key = P256.Signing.PrivateKey()
        let raw = key.publicKey.rawRepresentation   // x || y, 64 bytes
        let id = Data((0..<16).map { _ in UInt8.random(in: 0...255) })
        let cose = Data([0xa5, 0x01, 0x02, 0x03, 0x26, 0x20, 0x01, 0x21, 0x58, 0x20])
            + raw.prefix(32) + Data([0x22, 0x58, 0x20]) + raw.suffix(32)
        var authData = Data(SHA256.hash(data: Data(r.rpId.utf8)))
        authData += Data([0x45, 0, 0, 0, 0])                      // UP | UV | AT, counter 0
        authData += Data(count: 16)                               // aaguid
        authData += Data([UInt8(id.count >> 8), UInt8(id.count & 255)]) + id + cose
        var att = Data([0xa3])
        att += text("fmt") + text("none") + text("attStmt") + Data([0xa0])
        att += text("authData") + bytes(authData)
        var prf: Data?
        if let salt = r.prfSalt {
            let mac = HMAC<SHA256>.authenticationCode(
                for: Data("WebAuthn PRF\0".utf8) + (try PipCrypto.unb64u(salt)),
                using: SymmetricKey(data: secret))
            prf = Data(mac)
        }
        return PasskeyResult(fields: [
            "id": PipCrypto.b64u(id),
            "attestationObject": PipCrypto.b64u(att),
        ], prf: prf)
    }

    private static func head(_ major: UInt8, _ n: Int) -> Data {
        if n < 24 { return Data([major << 5 | UInt8(n)]) }
        if n < 256 { return Data([major << 5 | 24, UInt8(n)]) }
        return Data([major << 5 | 25, UInt8(n >> 8), UInt8(n & 255)])
    }
    private static func text(_ s: String) -> Data { head(3, s.utf8.count) + Data(s.utf8) }
    private static func bytes(_ d: Data) -> Data { head(2, d.count) + d }
}
