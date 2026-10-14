//
//  PipCryptoTests.swift
//  PipAACTests
//
//  A0-S2 (phase 044 § 6): PipCrypto (CryptoKit) vs sync_crypto.mjs
//  (WebCrypto), both directions, every primitive.
//   - node -> swift: every case in Fixtures/crypto/node.json (produced by
//     scripts/ios/export_crypto_fixtures.mjs) opens/verifies here.
//   - swift -> node: this suite writes Fixtures/crypto/swift.json (same
//     schema, same fixed keys) and scripts/ios/crypto_parity.test.mjs
//     opens/verifies it with the JS. The simulator writes straight to the
//     host checkout (path from #filePath).
//   A default run writes NOTHING (it verifies node.json and round-trips
//   fresh in-process seals). swift.json is rewritten only with
//   PIP_WRITE_CRYPTO_FIXTURES=1 — `npm run ios:crypto-fixtures:swift`
//   (xcodebuild forwards TEST_RUNNER_PIP_WRITE_CRYPTO_FIXTURES).
//

import Testing
import Foundation
import CryptoKit
import PipAAC

private typealias C = PipCrypto

private let fixtureDir = URL(fileURLWithPath: #filePath)
    .deletingLastPathComponent().appendingPathComponent("Fixtures/crypto")

private typealias Row = [String: Any]

private struct NodeDoc {
    let keys: [String: String]
    let cases: [String: [Row]]
    init() throws {
        let data = try Data(contentsOf: fixtureDir.appendingPathComponent("node.json"))
        let o = try JSONSerialization.jsonObject(with: data) as! [String: Any]
        keys = o["keys"] as! [String: String]
        cases = o["cases"] as! [String: [Row]]
    }
    func rows(_ name: String) -> [Row] { cases[name] ?? [] }
    func key(_ name: String) throws -> Data { try C.unb64u(keys[name]!) }
}

private func str(_ r: Row, _ k: String) -> String { r[k] as! String }
private func bytes(_ r: Row, _ k: String) throws -> Data { try C.unb64u(str(r, k)) }
private func env(_ r: Row, _ k: String) throws -> C.Envelope { try C.Envelope(object: r[k] as! [String: Any]) }
private func grant(_ r: Row, _ k: String) -> C.Grant {
    let g = r[k] as! [String: String]
    return C.Grant(eph: g["eph"]!, iv: g["iv"]!, wrapped: g["wrapped"]!)
}
private func sealedPriv(_ r: Row, _ k: String) -> C.SealedAccountPriv {
    let g = r[k] as! [String: String]
    return C.SealedAccountPriv(iv: g["iv"]!, sealed: g["sealed"]!)
}
private func sym(_ r: Row, _ k: String) throws -> SymmetricKey { try C.symmetricKey(raw: bytes(r, k)) }
private func obj(_ e: C.Envelope) -> [String: Any] { e.object }
private func obj(_ g: C.Grant) -> [String: Any] { ["eph": g.eph, "iv": g.iv, "wrapped": g.wrapped] }

@Suite("PipCrypto parity with sync_crypto.mjs", .serialized)
struct PipCryptoTests {

    // MARK: node -> swift

    @Test func nodeDeriveEpochKey() throws {
        let rows = try NodeDoc().rows("deriveEpochKey")
        #expect(!rows.isEmpty)
        for r in rows {
            let k = C.deriveEpochKey(try bytes(r, "root"), epoch: r["epoch"] as! Int)
            #expect(C.b64u(C.rawBytes(k)) == str(r, "key"))
        }
    }

    @Test func nodeSealData() throws {
        let rows = try NodeDoc().rows("sealData")
        #expect(!rows.isEmpty)
        for r in rows {
            #expect(try C.openData(sym(r, "key"), env(r, "env")) == bytes(r, "plain"))
        }
    }

    @Test func nodeSealOp() throws {
        let rows = try NodeDoc().rows("sealOp")
        #expect(rows.contains { $0["compressed"] as! Bool })
        #expect(rows.contains { !($0["compressed"] as! Bool) })
        for r in rows {
            let key = try sym(r, "key")
            let e = try env(r, "env")
            #expect(try C.openOp(key, e) == Data(str(r, "opJson").utf8))
            // the deflate marker is inside the ciphertext
            #expect((try C.openData(key, e).first == 0) == (r["compressed"] as! Bool))
        }
    }

    @Test func nodeSealBlob() throws {
        let rows = try NodeDoc().rows("sealBlob")
        #expect(!rows.isEmpty)
        for r in rows {
            let s = r["sealed"] as! Row
            let blob = C.SealedBlob(sha: str(s, "sha"), env: try env(s, "env"))
            #expect(blob.env.e == (r["epoch"] as! Int))
            #expect(try C.openBlob(sym(r, "key"), blob) == bytes(r, "plain"))
            var bad = blob; bad.sha = String(repeating: "0", count: 64)
            #expect(throws: C.Failure.self) { try C.openBlob(sym(r, "key"), bad) }
        }
    }

    @Test func nodeSha256Hex() throws {
        let rows = try NodeDoc().rows("sha256Hex")
        #expect(!rows.isEmpty)
        for r in rows { #expect(try C.sha256Hex(bytes(r, "bytes")) == str(r, "hex")) }
    }

    @Test func nodeSignPayloadAndImportPublicKey() throws {
        let rows = try NodeDoc().rows("signPayload")
        #expect(rows.contains { !($0["valid"] as! Bool) })
        for r in rows {
            let pub = try C.importPublicKey(str(r, "pub"))
            #expect(C.verifyPayload(pub, try bytes(r, "payload"), sig: str(r, "sig")) == (r["valid"] as! Bool))
        }
    }

    @Test func nodeExportKeys() throws {
        let doc = try NodeDoc()
        for r in doc.rows("exportPublicKey") {
            let k = try P256.Signing.PrivateKey(rawRepresentation: bytes(r, "d"))
            #expect(C.exportPublicKey(k.publicKey) == str(r, "spki"))
        }
        for r in doc.rows("exportDhPublic") {
            let k = try P256.KeyAgreement.PrivateKey(rawRepresentation: bytes(r, "d"))
            #expect(C.exportDhPublic(k.publicKey) == str(r, "raw"))
        }
        #expect(!doc.rows("exportPublicKey").isEmpty && !doc.rows("exportDhPublic").isEmpty)
    }

    @Test func nodeWrapUserKey() throws {
        let rows = try NodeDoc().rows("wrapUserKey")
        #expect(!rows.isEmpty)
        for r in rows {
            let priv = try P256.KeyAgreement.PrivateKey(rawRepresentation: bytes(r, "recipientD"))
            let k = try C.unwrapUserKey(priv, grant(r, "grant"))
            #expect(C.rawBytes(k) == (try bytes(r, "userKey")))
        }
    }

    @Test func nodeEpochBundle() throws {
        let rows = try NodeDoc().rows("epochBundle")
        #expect(!rows.isEmpty)
        for r in rows {
            let out = try C.openEpochBundle(root: bytes(r, "root"), json: str(r, "json"))
            let want = r["keys"] as! [String: String]
            #expect(Set(out.keys.map(String.init)) == Set(want.keys))
            for (e, raw) in want { #expect(C.b64u(C.rawBytes(out[Int(e)!]!)) == raw) }
        }
    }

    @Test func nodeAccountPriv() throws {
        let rows = try NodeDoc().rows("accountPriv")
        #expect(!rows.isEmpty)
        for r in rows {
            let key = try C.openAccountPriv(sealedPriv(r, "sealed"), prf: bytes(r, "prf"))
            #expect(C.exportDhPublic(key.publicKey) == str(r, "pub"))
            // the stated PKCS8 (WebCrypto's export) imports into CryptoKit too
            let stated = try P256.KeyAgreement.PrivateKey(derRepresentation: bytes(r, "priv"))
            #expect(stated.rawRepresentation == key.rawRepresentation)
            #expect(throws: (any Error).self) {
                try C.openAccountPriv(sealedPriv(r, "sealed"), prf: Data(repeating: 1, count: 32))
            }
        }
    }

    // MARK: swift -> node

    /// Seals every primitive with the node fixture's fixed keys, checks
    /// Swift can open its own output, and (opt-in) writes swift.json for the JS to
    /// open (scripts/ios/crypto_parity.test.mjs).
    @Test func writeSwiftFixtures() throws {
        let doc = try NodeDoc()
        let aes = try C.symmetricKey(raw: doc.key("aes"))
        let aes2 = try C.symmetricKey(raw: doc.key("aes2"))
        let root = try doc.key("root"), root2 = try doc.key("root2")
        let prf = try doc.key("prf")
        var cases: [String: [Any]] = [:]

        cases["deriveEpochKey"] = doc.rows("deriveEpochKey").map { r in
            ["root": r["root"]!, "epoch": r["epoch"]!,
             "key": C.b64u(C.rawBytes(C.deriveEpochKey(try! bytes(r, "root"), epoch: r["epoch"] as! Int)))] as Row
        }

        cases["sealData"] = try doc.rows("sealData").map { r in
            let plain = try bytes(r, "plain")
            let e = try C.sealData(aes, plain)
            #expect(try C.openData(aes, e) == plain)
            return ["key": str(r, "key"), "plain": str(r, "plain"), "env": obj(e)] as Row
        }

        cases["sealOp"] = try doc.rows("sealOp").map { r in
            let json = Data(str(r, "opJson").utf8)
            let e = try C.sealOp(aes, opJSON: json)
            #expect(try C.openOp(aes, e) == json)
            return ["key": str(r, "key"), "opJson": str(r, "opJson"), "compressed": r["compressed"]!,
                    "env": obj(e)] as Row
        }

        cases["sealBlob"] = try doc.rows("sealBlob").map { r in
            let plain = try bytes(r, "plain"), epoch = r["epoch"] as! Int
            let s = try C.sealBlob(aes, plain, epoch: epoch)
            #expect(try C.openBlob(aes, s) == plain)
            return ["key": str(r, "key"), "plain": str(r, "plain"), "epoch": epoch,
                    "sealed": ["sha": s.sha, "env": obj(s.env)] as Row] as Row
        }

        cases["sha256Hex"] = try doc.rows("sha256Hex").map { r in
            ["bytes": str(r, "bytes"), "hex": C.sha256Hex(try bytes(r, "bytes"))] as Row
        }

        let signD = try doc.key("signD"), dhD = try doc.key("dhD")
        let signKey = try P256.Signing.PrivateKey(rawRepresentation: signD)
        let spki = C.exportPublicKey(signKey.publicKey)
        let msg = Data("sign me \u{2713}".utf8)
        let sig = try C.signPayload(signKey, msg)
        #expect(C.verifyPayload(signKey.publicKey, msg, sig: sig))
        let sigStr = try C.signPayload(signKey, Data("a string payload".utf8))
        cases["signPayload"] = [
            ["pub": spki, "payload": C.b64u(msg), "sig": sig, "valid": true] as Row,
            ["pub": spki, "payload": C.b64u(Data("a string payload".utf8)), "sig": sigStr, "valid": true] as Row,
            ["pub": spki, "payload": C.b64u(Data("sign me".utf8)), "sig": sig, "valid": false] as Row,
        ]
        #expect(!C.verifyPayload(signKey.publicKey, Data("sign me".utf8), sig: sig))
        cases["exportPublicKey"] = [["d": C.b64u(signD), "spki": spki] as Row]

        let dhKey = try P256.KeyAgreement.PrivateKey(rawRepresentation: dhD)
        let dhPub = C.exportDhPublic(dhKey.publicKey)
        cases["exportDhPublic"] = [["d": C.b64u(dhD), "raw": dhPub] as Row]

        cases["wrapUserKey"] = try [aes, aes2].map { k in
            let g = try C.wrapUserKey(k, theirDhPub: dhPub)
            #expect(try C.rawBytes(C.unwrapUserKey(dhKey, g)) == C.rawBytes(k))
            return ["recipientD": C.b64u(dhD), "recipientPub": dhPub, "userKey": C.b64u(C.rawBytes(k)),
                    "grant": obj(g)] as Row
        }

        // bundle: same map shape as the node case (epoch 2 = a stored grant)
        let want = try (doc.rows("epochBundle").first?["keys"] as? [String: String]) ?? [:]
        var map: [Int: SymmetricKey] = [:]
        for (e, raw) in want { map[Int(e)!] = try C.symmetricKey(raw: C.unb64u(raw)) }
        for (e, k) in [1: C.deriveEpochKey(root, epoch: 1), 2: aes2, 3: C.deriveEpochKey(root, epoch: 3)] {
            #expect(C.rawBytes(map[e]!) == C.rawBytes(k))
        }
        let bundle = try C.sealEpochBundle(keys: map, newRoot: root2)
        #expect(try C.openEpochBundle(root: root2, json: bundle).count == map.count)
        cases["epochBundle"] = [["root": C.b64u(root2), "keys": want, "json": bundle] as Row]

        let acct = C.genAccountKeys()
        let sealed = try C.sealAccountPriv(acct.priv, prf: prf)
        let reopened = try C.openAccountPriv(sealed, prf: prf)
        #expect(C.exportDhPublic(reopened.publicKey) == acct.pub)
        cases["accountPriv"] = [["prf": C.b64u(prf), "pub": acct.pub, "priv": C.b64u(acct.priv),
                                 "sealed": ["iv": sealed.iv, "sealed": sealed.sealed]] as Row]

        let out: [String: Any] = ["version": 1, "writer": "swift", "keys": doc.keys, "cases": cases]
        let data = try JSONSerialization.data(
            withJSONObject: out, options: [.prettyPrinted, .sortedKeys, .withoutEscapingSlashes])
        // Swift output is random (IVs, signatures), so a default run writes
        // nothing; `npm run ios:crypto-fixtures:swift` opts in.
        guard ProcessInfo.processInfo.environment["PIP_WRITE_CRYPTO_FIXTURES"] == "1" else { return }
        try data.write(to: fixtureDir.appendingPathComponent("swift.json"))
    }

    // MARK: keychain

    @Test func keychainRoundTrip() throws {
        let svc = "org.pipaac.keys.test.\(UUID().uuidString)"
        let name = PipKeychain.userKeyName("u1", epoch: 2)
        #expect(name == "user/u1/key_e2")
        defer { try? PipKeychain.delete(name, service: svc) }
        #expect(try PipKeychain.get(name, service: svc) == nil)
        try PipKeychain.put(name, Data([1, 2, 3]), service: svc)
        try PipKeychain.put(name, Data([4, 5]), service: svc)
        #expect(try PipKeychain.get(name, service: svc) == Data([4, 5]))
        try PipKeychain.delete(name, service: svc)
        #expect(try PipKeychain.get(name, service: svc) == nil)
    }
}
