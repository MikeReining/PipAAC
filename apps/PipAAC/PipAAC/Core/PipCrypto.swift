//
//  PipCrypto.swift
//  PipAAC
//
//  Sync crypto in CryptoKit — byte-compatible with public/shared/
//  sync_crypto.mjs (WebCrypto), which is the truth owner (044 § 6 S2;
//  Platforms_iOS_And_Web § 2: encryption is Swift, op semantics stay in
//  the JS core). Never adjust this to a JS quirk by changing the JS —
//  Fixtures/crypto/{node,swift}.json prove both directions.
//
//  Wire details that are easy to get wrong:
//   - every binary field is base64url, no padding;
//   - AES-GCM: 12-byte random iv, ct = ciphertext || 16-byte tag, no AAD;
//   - envelope { v:1, alg:"A256GCM", iv, ct } (+ e on a blob's env);
//   - ECDSA signatures are raw r||s (64 bytes), SHA-256, never DER;
//   - device public keys are SPKI DER; DH public keys are raw X9.63
//     (65 bytes, 0x04||x||y); account private keys are PKCS8 DER;
//   - ECDH wrap key = the raw shared-secret X coordinate, no KDF;
//   - HKDF-SHA256: epoch/bundle keys use salt "pip-board-key"; the
//     account KEK uses salt "pip account kek", info "pip-account-v1";
//   - ops over 4096 UTF-8 bytes are raw-DEFLATEd (RFC 1951, no zlib
//     header) behind a leading 0x00 marker byte inside the ciphertext.
//

import CryptoKit
import Foundation

public nonisolated enum PipCrypto {
    public enum Failure: Error, Equatable {
        case badEnvelope
        case badEncoding
        case badKey
        case blobHashMismatch
        case compression
    }

    /// `{ v, alg, iv, ct }`, plus `e` (key epoch) on a blob envelope.
    public nonisolated struct Envelope: Sendable, Equatable {
        public var iv: String
        public var ct: String
        public var e: Int?
        public init(iv: String, ct: String, e: Int? = nil) {
            self.iv = iv; self.ct = ct; self.e = e
        }

        public var object: [String: Any] {
            var o: [String: Any] = ["v": 1, "alg": "A256GCM", "iv": iv, "ct": ct]
            if let e { o["e"] = e }
            return o
        }

        public init(object o: [String: Any]) throws {
            guard (o["v"] as? Int) == 1, (o["alg"] as? String) == "A256GCM",
                  let iv = o["iv"] as? String, let ct = o["ct"] as? String
            else { throw Failure.badEnvelope }
            self.init(iv: iv, ct: ct, e: o["e"] as? Int)
        }

        /// JSON text in the same key order as JS `JSON.stringify`.
        public var json: String {
            let tail = e.map { ",\"e\":\($0)" } ?? ""
            return "{\"v\":1,\"alg\":\"A256GCM\",\"iv\":\"\(iv)\",\"ct\":\"\(ct)\"\(tail)}"
        }

        public init(json: String) throws {
            guard let o = try JSONSerialization.jsonObject(with: Data(json.utf8)) as? [String: Any]
            else { throw Failure.badEnvelope }
            try self.init(object: o)
        }
    }

    public nonisolated struct SealedBlob: Sendable, Equatable {
        public var sha: String
        public var env: Envelope
        public init(sha: String, env: Envelope) { self.sha = sha; self.env = env }
    }

    /// `{ eph, iv, wrapped }` — a user key wrapped to a device/account.
    public nonisolated struct Grant: Sendable, Equatable {
        public var eph: String
        public var iv: String
        public var wrapped: String
        public init(eph: String, iv: String, wrapped: String) {
            self.eph = eph; self.iv = iv; self.wrapped = wrapped
        }
    }

    public nonisolated struct SealedAccountPriv: Sendable, Equatable {
        public var iv: String
        public var sealed: String
        public init(iv: String, sealed: String) { self.iv = iv; self.sealed = sealed }
    }

    // MARK: base64url

    public static func b64u(_ d: some DataProtocol) -> String {
        Data(d).base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
    }

    public static func unb64u(_ s: String) throws -> Data {
        var t = s.replacingOccurrences(of: "-", with: "+").replacingOccurrences(of: "_", with: "/")
        while t.count % 4 != 0 { t += "=" }
        guard let d = Data(base64Encoded: t) else { throw Failure.badEncoding }
        return d
    }

    private static func random(_ n: Int) -> Data {
        var g = SystemRandomNumberGenerator()
        return Data((0..<n).map { _ in UInt8.random(in: 0...255, using: &g) })
    }

    // MARK: epoch keys + recovery bundle

    private static let hkdfSalt = Data("pip-board-key".utf8)

    private static func hkdf(_ ikm: Data, salt: Data, info: String) -> SymmetricKey {
        HKDF<SHA256>.deriveKey(inputKeyMaterial: SymmetricKey(data: ikm), salt: salt,
                               info: Data(info.utf8), outputByteCount: 32)
    }

    public static func symmetricKey(raw: Data) throws -> SymmetricKey {
        guard raw.count == 32 else { throw Failure.badKey }
        return SymmetricKey(data: raw)
    }

    public static func rawBytes(_ key: SymmetricKey) -> Data { key.withUnsafeBytes { Data($0) } }

    /// HKDF(root, salt "pip-board-key", info "epoch:<n>").
    public static func deriveEpochKey(_ root: Data, epoch: Int) -> SymmetricKey {
        hkdf(root, salt: hkdfSalt, info: "epoch:\(epoch)")
    }

    private static func deriveBundleKey(_ root: Data) -> SymmetricKey {
        hkdf(root, salt: hkdfSalt, info: "recovery-bundle")
    }

    /// Seal an already-resolved epoch → key map to `newRoot`. (Choosing
    /// which keys to include — stored grants win over derived ones — is the
    /// key-store layer's job, as `sealEpochBundle(store, …)` is in JS.)
    public static func sealEpochBundle(keys: [Int: SymmetricKey], newRoot: Data) throws -> String {
        let body = keys.keys.sorted()
            .map { "\"\($0)\":\"\(b64u(rawBytes(keys[$0]!)))\"" }
            .joined(separator: ",")
        let env = try sealData(deriveBundleKey(newRoot), Data("{\(body)}".utf8))
        return env.json
    }

    public static func openEpochBundle(root: Data, json: String) throws -> [Int: SymmetricKey] {
        let plain = try openData(deriveBundleKey(root), Envelope(json: json))
        guard let map = try JSONSerialization.jsonObject(with: plain) as? [String: String]
        else { throw Failure.badEnvelope }
        var out: [Int: SymmetricKey] = [:]
        for (e, raw) in map {
            guard let n = Int(e) else { throw Failure.badEnvelope }
            out[n] = try symmetricKey(raw: unb64u(raw))
        }
        return out
    }

    // MARK: sealing

    public static func sealData(_ key: SymmetricKey, _ bytes: Data) throws -> Envelope {
        let box = try AES.GCM.seal(bytes, using: key, nonce: AES.GCM.Nonce(data: random(12)))
        return Envelope(iv: b64u(Data(box.nonce)), ct: b64u(box.ciphertext + box.tag))
    }

    private static func box(iv: String, ct: String) throws -> AES.GCM.SealedBox {
        let iv = try unb64u(iv), ct = try unb64u(ct)
        guard iv.count == 12, ct.count >= 16 else { throw Failure.badEnvelope }
        return try AES.GCM.SealedBox(nonce: AES.GCM.Nonce(data: iv),
                                     ciphertext: ct.dropLast(16), tag: ct.suffix(16))
    }

    public static func openData(_ key: SymmetricKey, _ env: Envelope) throws -> Data {
        try AES.GCM.open(box(iv: env.iv, ct: env.ct), using: key)
    }

    /// Ops over this many UTF-8 bytes are deflated before sealing.
    public static let deflateOver = 4096

    private static func rawDeflate(_ d: Data) throws -> Data {
        // Foundation's .zlib is headerless RFC 1951 DEFLATE (Compression's
        // COMPRESSION_ZLIB), i.e. WebCrypto's "deflate-raw".
        do { return try (d as NSData).compressed(using: .zlib) as Data }
        catch { throw Failure.compression }
    }

    private static func rawInflate(_ d: Data) throws -> Data {
        do { return try (d as NSData).decompressed(using: .zlib) as Data }
        catch { throw Failure.compression }
    }

    /// `opJSON` is the op's JSON text exactly as JS `JSON.stringify` would
    /// produce it (the core owns op shape; this layer seals bytes).
    public static func sealOp(_ key: SymmetricKey, opJSON: Data) throws -> Envelope {
        if opJSON.count <= deflateOver { return try sealData(key, opJSON) }
        return try sealData(key, Data([0]) + rawDeflate(opJSON))
    }

    public static func openOp(_ key: SymmetricKey, _ env: Envelope) throws -> Data {
        let bytes = try openData(key, env)
        return bytes.first == 0 ? try rawInflate(Data(bytes.dropFirst())) : bytes
    }

    public static func sealBlob(_ key: SymmetricKey, _ bytes: Data, epoch: Int = 1) throws -> SealedBlob {
        var env = try sealData(key, bytes)
        env.e = epoch
        return SealedBlob(sha: sha256Hex(bytes), env: env)
    }

    public static func openBlob(_ key: SymmetricKey, _ sealed: SealedBlob) throws -> Data {
        let bytes = try openData(key, sealed.env)
        guard sha256Hex(bytes) == sealed.sha else { throw Failure.blobHashMismatch }
        return bytes
    }

    public static func sha256Hex(_ bytes: Data) -> String {
        SHA256.hash(data: bytes).map { String(format: "%02x", $0) }.joined()
    }

    // MARK: device signatures

    /// SPKI base64url — the form the relay stores for a device.
    public static func exportPublicKey(_ k: P256.Signing.PublicKey) -> String {
        b64u(k.derRepresentation)
    }

    public static func importPublicKey(_ b64: String) throws -> P256.Signing.PublicKey {
        try P256.Signing.PublicKey(derRepresentation: unb64u(b64))
    }

    /// Raw r||s (64 bytes), base64url.
    public static func signPayload(_ key: P256.Signing.PrivateKey, _ bytes: Data) throws -> String {
        b64u(try key.signature(for: bytes).rawRepresentation)
    }

    public static func verifyPayload(_ key: P256.Signing.PublicKey, _ bytes: Data, sig: String) -> Bool {
        guard let raw = try? unb64u(sig),
              let s = try? P256.Signing.ECDSASignature(rawRepresentation: raw)
        else { return false }
        return key.isValidSignature(s, for: bytes)
    }

    // MARK: user-key transport

    /// Raw X9.63 uncompressed point, base64url.
    public static func exportDhPublic(_ k: P256.KeyAgreement.PublicKey) -> String {
        b64u(k.x963Representation)
    }

    private static func importDhPublic(_ b64: String) throws -> P256.KeyAgreement.PublicKey {
        try P256.KeyAgreement.PublicKey(x963Representation: unb64u(b64))
    }

    /// WebCrypto's ECDH→AES-GCM deriveKey is the raw shared secret itself.
    private static func wrapKey(_ priv: P256.KeyAgreement.PrivateKey,
                                _ pub: P256.KeyAgreement.PublicKey) throws -> SymmetricKey {
        let secret = try priv.sharedSecretFromKeyAgreement(with: pub)
        return secret.withUnsafeBytes { SymmetricKey(data: Data($0)) }
    }

    public static func wrapUserKey(_ userKey: SymmetricKey, theirDhPub: String) throws -> Grant {
        let eph = P256.KeyAgreement.PrivateKey()
        let wk = try wrapKey(eph, importDhPublic(theirDhPub))
        let sealed = try AES.GCM.seal(rawBytes(userKey), using: wk, nonce: AES.GCM.Nonce(data: random(12)))
        return Grant(eph: exportDhPublic(eph.publicKey), iv: b64u(Data(sealed.nonce)),
                     wrapped: b64u(sealed.ciphertext + sealed.tag))
    }

    public static func unwrapUserKey(_ myDhPriv: P256.KeyAgreement.PrivateKey, _ grant: Grant) throws -> SymmetricKey {
        let wk = try wrapKey(myDhPriv, importDhPublic(grant.eph))
        return try symmetricKey(raw: AES.GCM.open(box(iv: grant.iv, ct: grant.wrapped), using: wk))
    }

    // MARK: supporter accounts

    /// → (pub, priv): pub is the raw DH public key (b64u); priv is PKCS8 DER.
    public static func genAccountKeys() -> (pub: String, priv: Data) {
        let k = P256.KeyAgreement.PrivateKey()
        return (exportDhPublic(k.publicKey), k.derRepresentation)
    }

    private static func accountKek(_ prf: Data) -> SymmetricKey {
        hkdf(prf, salt: Data("pip account kek".utf8), info: "pip-account-v1")
    }

    public static func sealAccountPriv(_ privPkcs8: Data, prf: Data) throws -> SealedAccountPriv {
        let sealed = try AES.GCM.seal(privPkcs8, using: accountKek(prf), nonce: AES.GCM.Nonce(data: random(12)))
        return SealedAccountPriv(iv: b64u(Data(sealed.nonce)), sealed: b64u(sealed.ciphertext + sealed.tag))
    }

    /// Throws if the PRF output is wrong (GCM tag fails).
    public static func openAccountPriv(_ s: SealedAccountPriv, prf: Data) throws -> P256.KeyAgreement.PrivateKey {
        try P256.KeyAgreement.PrivateKey(
            derRepresentation: AES.GCM.open(box(iv: s.iv, ct: s.sealed), using: accountKek(prf)))
    }
}
