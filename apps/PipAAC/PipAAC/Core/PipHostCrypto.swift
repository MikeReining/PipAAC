//
//  PipHostCrypto.swift
//  PipAAC
//
//  The crypto, key-store, blob and registry ops behind
//  scripts/ios/host/sync_crypto_host.mjs (044 C2). Every primitive is
//  PipCrypto (CryptoKit, held byte-compatible by Fixtures/crypto); key
//  material never crosses into JS. JS holds opaque handles
//  { __pipKey: "<id>", kind } into `keys`; the id is a hash of the key's
//  public/raw bytes, so the same key always gets the same handle and the
//  table is bounded by the distinct keys a session touches.
//
//  Wire conventions with the JS host module: binary values are base64url
//  strings (b64), envelopes/grants are plain objects, an op's JSON is a
//  string (PipCrypto seals bytes; the core owns op shape).
//

import CryptoKit
import Foundation

nonisolated enum KeyBox {
    case aes(SymmetricKey)
    case sigPriv(P256.Signing.PrivateKey)
    case sigPub(P256.Signing.PublicKey)
    case dhPriv(P256.KeyAgreement.PrivateKey)
    case dhPub(P256.KeyAgreement.PublicKey)

    var kind: String {
        switch self {
        case .aes: "aes"
        case .sigPriv: "ecdsa-priv"
        case .sigPub: "ecdsa-pub"
        case .dhPriv: "ecdh-priv"
        case .dhPub: "ecdh-pub"
        }
    }

    var material: Data {
        switch self {
        case .aes(let k): PipCrypto.rawBytes(k)
        case .sigPriv(let k): k.rawRepresentation
        case .sigPub(let k): k.x963Representation
        case .dhPriv(let k): k.rawRepresentation
        case .dhPub(let k): k.x963Representation
        }
    }
}

/// How the keychain stores a name (PipKeychain keeps raw bytes where the
/// web keeps raw values): user/<id>/key_e<n> is a 32-byte AES key,
/// user/<id>/root is raw bytes, everything else UTF-8 JSON.
nonisolated enum KeyNameKind {
    case aes, bytes, json
    init(_ name: String) {
        let p = name.split(separator: "/", omittingEmptySubsequences: false)
        if p.count == 3, p[0] == "user" {
            if p[2].hasPrefix("key_e"), Int(p[2].dropFirst(5)) != nil { self = .aes; return }
            if p[2] == "root" { self = .bytes; return }
        }
        self = .json
    }
}

nonisolated extension PipHost {
    // MARK: handles (queue-only)

    func handle(_ box: KeyBox) -> [String: Any] {
        let digest = SHA256.hash(data: box.material).prefix(12).map { String(format: "%02x", $0) }.joined()
        let id = "\(box.kind):\(digest)"
        keys[id] = box
        return ["__pipKey": id, "kind": box.kind]
    }

    func box(_ any: Any?) throws -> KeyBox {
        guard let h = any as? [String: Any], let id = h["__pipKey"] as? String, let b = keys[id]
        else { throw PipHostError("unknown key handle") }
        return b
    }

    func aes(_ any: Any?) throws -> SymmetricKey {
        guard case .aes(let k) = try box(any) else { throw PipHostError("expected an AES key handle") }
        return k
    }

    // MARK: arg helpers

    private func str(_ a: [String: Any], _ k: String) throws -> String {
        guard let v = a[k] as? String else { throw PipHostError("missing \(k)") }
        return v
    }
    private func bytes(_ a: [String: Any], _ k: String) throws -> Data {
        try PipCrypto.unb64u(str(a, k))
    }
    private func envelope(_ a: [String: Any], _ k: String) throws -> PipCrypto.Envelope {
        guard let o = a[k] as? [String: Any] else { throw PipHostError("missing \(k)") }
        return try PipCrypto.Envelope(object: o)
    }

    // MARK: the ops (queue-only; return JSON-able value, nil = undefined)

    func run(_ op: String, _ a: [String: Any]) throws -> Any? {
        let C = PipCrypto.self
        switch op {
        case "pubkey.export":
            guard case .sigPub(let k) = try box(a["key"]) else { throw PipHostError("expected ECDSA public key") }
            return C.exportPublicKey(k)
        case "pubkey.import":
            return handle(.sigPub(try C.importPublicKey(str(a, "b64"))))
        case "identity":
            return try identity()
        case "epochKey.derive":
            guard let epoch = a["epoch"] as? Int else { throw PipHostError("missing epoch") }
            return handle(.aes(C.deriveEpochKey(try bytes(a, "root"), epoch: epoch)))
        case "aes.generate":
            return handle(.aes(SymmetricKey(size: .bits256)))
        case "aes.import":
            return handle(.aes(try C.symmetricKey(raw: bytes(a, "b64"))))
        case "bundle.seal":
            guard let m = a["keys"] as? [String: Any] else { throw PipHostError("missing keys") }
            var byEpoch: [Int: SymmetricKey] = [:]
            for (e, h) in m {
                guard let n = Int(e) else { throw PipHostError("bad epoch \(e)") }
                byEpoch[n] = try aes(h)
            }
            return try C.sealEpochBundle(keys: byEpoch, newRoot: bytes(a, "root"))
        case "bundle.open":
            var out: [String: Any] = [:]
            for (e, k) in try C.openEpochBundle(root: bytes(a, "root"), json: str(a, "json")) {
                out[String(e)] = handle(.aes(k))
            }
            return out
        case "data.seal":
            return try C.sealData(aes(a["key"]), bytes(a, "b64")).object
        case "data.open":
            return C.b64u(try C.openData(aes(a["key"]), envelope(a, "env")))
        case "op.seal":
            return try C.sealOp(aes(a["key"]), opJSON: Data(str(a, "json").utf8)).object
        case "op.open":
            return String(decoding: try C.openOp(aes(a["key"]), envelope(a, "env")), as: UTF8.self)
        case "blob.seal":
            let s = try C.sealBlob(aes(a["key"]), bytes(a, "b64"), epoch: a["epoch"] as? Int ?? 1)
            return ["sha": s.sha, "env": s.env.object]
        case "blob.open":
            guard let s = a["sealed"] as? [String: Any], let sha = s["sha"] as? String else {
                throw PipHostError("missing sealed")
            }
            return C.b64u(try C.openBlob(aes(a["key"]),
                C.SealedBlob(sha: sha, env: envelope(s, "env"))))
        case "sha256":
            return C.b64u(Data(SHA256.hash(data: try bytes(a, "b64"))))
        case "sha256hex":
            return C.sha256Hex(try bytes(a, "b64"))
        case "sign":
            guard case .sigPriv(let k) = try box(a["key"]) else { throw PipHostError("expected ECDSA private key") }
            return try C.signPayload(k, bytes(a, "b64"))
        case "verify":
            guard case .sigPub(let k) = try box(a["key"]) else { throw PipHostError("expected ECDSA public key") }
            return C.verifyPayload(k, try bytes(a, "b64"), sig: try str(a, "sig"))
        case "dhpub.export":
            guard case .dhPub(let k) = try box(a["key"]) else { throw PipHostError("expected ECDH public key") }
            return C.exportDhPublic(k)
        case "key.wrap":
            let g = try C.wrapUserKey(aes(a["key"]), theirDhPub: str(a, "dhPub"))
            return ["eph": g.eph, "iv": g.iv, "wrapped": g.wrapped]
        case "key.unwrap":
            guard case .dhPriv(let k) = try box(a["key"]),
                  let g = a["grant"] as? [String: Any],  // grants carry extras (epoch, keys, user_id)
                  let eph = g["eph"] as? String, let iv = g["iv"] as? String, let w = g["wrapped"] as? String
            else { throw PipHostError("bad unwrap arguments") }
            return handle(.aes(try C.unwrapUserKey(k, C.Grant(eph: eph, iv: iv, wrapped: w))))
        case "account.gen":
            let (pub, priv) = C.genAccountKeys()
            return ["pub": pub, "priv": C.b64u(priv)]
        case "account.seal":
            let s = try C.sealAccountPriv(bytes(a, "priv"), prf: bytes(a, "prf"))
            return ["iv": s.iv, "sealed": s.sealed]
        case "account.import":
            return handle(.dhPriv(try P256.KeyAgreement.PrivateKey(derRepresentation: bytes(a, "priv"))))
        case "account.open":
            guard let e = a["env"] as? [String: String], let iv = e["iv"], let sealed = e["sealed"]
            else { throw PipHostError("missing env") }
            return handle(.dhPriv(try C.openAccountPriv(
                C.SealedAccountPriv(iv: iv, sealed: sealed), prf: bytes(a, "prf"))))
        case "keystore.get":
            return try keystoreGet(str(a, "name"))
        case "keystore.put":
            try keystorePut(a)
            return nil
        case "keystore.del":
            try PipKeychain.delete(str(a, "name"), service: config.keychainService)
            return nil
        case "blob.save":
            try blobWrite(str(a, "sha"), bytes(a, "b64"))
            return nil
        case "blob.has":
            return FileManager.default.fileExists(atPath: try blobURL(str(a, "sha")).path)
        case "blob.load":
            return try blobRead(str(a, "sha")).map { C.b64u($0) } ?? NSNull()
        case "cache":
            return try cacheOp(a)
        case "saveUser":
            guard let patch = a["patch"] else { throw PipHostError("missing patch") }
            try onSaveUser(str(a, "userId"), Self.encode(patch))
            return nil
        default:
            throw PipHostError("unknown host op \(op)")
        }
    }

    // MARK: device identity

    /// { deviceId, sign, verify, dh:{publicKey, privateKey} }. The pairs
    /// are created once and live in the keychain as raw scalars
    /// (device/sign, device/dh); creation runs on the core queue, so two
    /// concurrent callers can never mint two identities.
    func identity() throws -> [String: Any] {
        let svc = config.keychainService
        let sig: P256.Signing.PrivateKey
        if let d = try PipKeychain.get(PipKeychain.deviceSignName, service: svc) {
            sig = try P256.Signing.PrivateKey(rawRepresentation: d)
        } else {
            sig = P256.Signing.PrivateKey()
            try PipKeychain.put(PipKeychain.deviceSignName, sig.rawRepresentation, service: svc)
        }
        let dh: P256.KeyAgreement.PrivateKey
        if let d = try PipKeychain.get(PipKeychain.deviceDhName, service: svc) {
            dh = try P256.KeyAgreement.PrivateKey(rawRepresentation: d)
        } else {
            dh = P256.KeyAgreement.PrivateKey()
            try PipKeychain.put(PipKeychain.deviceDhName, dh.rawRepresentation, service: svc)
        }
        // sync_crypto.mjs: "dev_" + first 16 hex of SHA-256(raw SPKI point).
        let fp = PipCrypto.sha256Hex(sig.publicKey.x963Representation).prefix(16)
        return [
            "deviceId": "dev_\(fp)",
            "sign": handle(.sigPriv(sig)),
            "verify": handle(.sigPub(sig.publicKey)),
            "dh": ["publicKey": handle(.dhPub(dh.publicKey)), "privateKey": handle(.dhPriv(dh))],
        ]
    }

    // MARK: key store (the keychain, by the web's names)

    func keystoreGet(_ name: String) throws -> Any {
        guard let data = try PipKeychain.get(name, service: config.keychainService) else { return NSNull() }
        switch KeyNameKind(name) {
        case .aes: return ["k": "key", "key": handle(.aes(try PipCrypto.symmetricKey(raw: data)))]
        case .bytes: return ["k": "bytes", "b64": PipCrypto.b64u(data)]
        case .json: return ["k": "json", "text": String(decoding: data, as: UTF8.self)]
        }
    }

    func keystorePut(_ a: [String: Any]) throws {
        let name = try str(a, "name")
        let svc = config.keychainService
        switch (KeyNameKind(name), a["k"] as? String) {
        case (.aes, "key"):
            try PipKeychain.put(name, PipCrypto.rawBytes(aes(a["key"])), service: svc)
        case (.bytes, "bytes"):
            try PipKeychain.put(name, bytes(a, "b64"), service: svc)
        case (.json, "json"):
            try PipKeychain.put(name, Data(str(a, "text").utf8), service: svc)
        default:
            throw PipHostError("keystore: \(name) cannot hold a \(a["k"] as? String ?? "?") value")
        }
    }

    // MARK: media blobs (persistent, content-addressed)

    private func blobURL(_ sha: String) throws -> URL {
        guard !sha.isEmpty, sha.utf8.allSatisfy({ ($0 >= 48 && $0 <= 57) || ($0 >= 97 && $0 <= 102) })
        else { throw PipHostError("bad blob name") }
        return config.blobDirectory.appendingPathComponent(sha)
    }

    /// A file is "available offline" only once its bytes hash to its name
    /// (phase 044 section 6 B-C): the name IS the SHA-256, checked here, on
    /// the way to disk, whoever asks. Writes are atomic - no partial file
    /// ever carries a real name.
    func blobWrite(_ sha: String, _ data: Data) throws {
        let digest = SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
        guard digest == sha else { throw PipHostError("blob hash mismatch") }
        try FileManager.default.createDirectory(at: config.blobDirectory, withIntermediateDirectories: true)
        try data.write(to: blobURL(sha), options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
    }

    func blobRead(_ sha: String) throws -> Data? {
        let url = try blobURL(sha)
        guard FileManager.default.fileExists(atPath: url.path) else { return nil }
        return try Data(contentsOf: url)
    }
}
