//
//  AccountHostTests.swift
//  PipAACTests
//
//  044 C5: the Swift half of supporter accounts and the recovery card.
//   (a) the passkey ceremony's PRF output never reaches JS - only an
//       opaque handle - yet opens the account key sealed by the web
//       (Fixtures/crypto/node.json accountPriv); a different PRF does not;
//   (b) account.create seals under a PRF handle and opens again with it;
//   (c) the recovery card as pixels: the QR decodes back to the card link,
//       and the saved/printed card IMAGE (QR + 12 words) decodes to the
//       same link - what a scanner would read off a printout.
//  The ceremony itself (ASAuthorization) needs a real iPad: see the manual
//  script in docs/phases/044_Native_iOS_App.md section 10 (C5).
//

import CryptoKit
import Foundation
import os
import Testing
import UIKit
import PipAAC

private let fixtureDir = URL(fileURLWithPath: #filePath)
    .deletingLastPathComponent().appendingPathComponent("Fixtures/crypto")

private func accountFixture() throws -> [String: Any] {
    let data = try Data(contentsOf: fixtureDir.appendingPathComponent("node.json"))
    let o = try JSONSerialization.jsonObject(with: data) as! [String: Any]
    return ((o["cases"] as! [String: Any])["accountPriv"] as! [[String: Any]])[0]
}

/// A host whose "passkey" returns the PRF bytes it is told to.
private final class AccountRig: @unchecked Sendable {
    let core = PipCore()
    let events = EventBox()
    let service = "org.pipaac.keys.test.\(UUID().uuidString)"
    let prf = OSAllocatedUnfairLock(initialState: Data())
    var host: PipHost!

    init() throws {
        let events = self.events
        let prf = self.prf
        host = PipHost(
            core: core,
            config: .init(keychainService: service,
                          blobDirectory: FileManager.default.temporaryDirectory
                              .appendingPathComponent("pip-c5-\(UUID().uuidString)")),
            onEvent: { events.add($0, $1) },
            passkeys: { op, _ in
                PasskeyResult(fields: ["credential_id": "cred", "op": op], prf: prf.withLock { $0 })
            })
        try core.sync {
            try core.install(host)
            _ = try core.evaluate(resource: "pip-core.js", bundle: Bundle(for: PipCore.self))
        }
    }

    func run(_ source: String, expecting name: String, timeout: TimeInterval = 20) throws -> [String: Any] {
        try core.sync { _ = try core.evaluate(source: source) }
        guard let json = events.wait(name, timeout: timeout) else {
            Issue.record("timed out waiting for \(name)")
            return [:]
        }
        return try JSONSerialization.jsonObject(with: Data(json.utf8)) as! [String: Any]
    }
}

@Suite("Accounts and the recovery card: the Swift side", .serialized)
struct AccountHostTests {

    @Test func passkeyPRFNeverEntersJSButOpensTheWebsAccountKey() throws {
        let fx = try accountFixture()
        let rig = try AccountRig()
        let prfBytes = try PipCrypto.unb64u(fx["prf"] as! String)
        rig.prf.withLock { $0 = prfBytes }
        let sealed = try JSONSerialization.data(withJSONObject: fx["sealed"]!)
        let r = try rig.run("""
        (async () => {
          const hc = PIPCORE.hostCrypto, hio = PIPCORE.hostio;
          const asn = await hio.hostCall("passkey.get", { rpId: "pipaac.org", challenge: "AAAA", credentialIds: ["x"], prfSalt: "AAAA" });
          const priv = await hc.openAccountPrivWithPrf(\(String(decoding: sealed, as: UTF8.self)), asn.prf);
          // The opened key unwraps a user key wrapped to the fixture's public half.
          const userKey = await hc.newUserKey();
          const grant = await hc.wrapUserKey(userKey, "\(fx["pub"] as! String)");
          const back = await hc.unwrapUserKey(priv, grant);
          const env = await hc.sealOp(userKey, { v: 7 });
          const opened = await hc.openOp(back, env);
          __pipHost.emit("acct.done", JSON.stringify({ prf: asn.prf, fields: Object.keys(asn).sort(), v: opened.v,
            privHandle: priv }));
        })();
        """, expecting: "acct.done")
        let prfHandle = r["prf"] as? [String: Any]
        #expect(prfHandle?.keys.sorted() == ["__pipPrf"], "JS holds a handle, not bytes")
        #expect((prfHandle?["__pipPrf"] as? String)?.hasPrefix("prf:") == true)
        #expect((r["fields"] as? [String])?.contains("prf") == true)
        #expect(r["v"] as? Int == 7, "the PRF opened the account key; it unwrapped and re-opened a user key")
        #expect((r["privHandle"] as? [String: Any])?["kind"] as? String == "ecdh-priv")
    }

    @Test func aDifferentPRFDoesNotOpenIt() throws {
        let fx = try accountFixture()
        let rig = try AccountRig()
        rig.prf.withLock { $0 = Data(repeating: 1, count: 32) }
        let sealed = try JSONSerialization.data(withJSONObject: fx["sealed"]!)
        let r = try rig.run("""
        (async () => {
          const hc = PIPCORE.hostCrypto, hio = PIPCORE.hostio;
          const asn = await hio.hostCall("passkey.get", { rpId: "pipaac.org", challenge: "AAAA", credentialIds: ["x"], prfSalt: "AAAA" });
          let failed = false;
          try { await hc.openAccountPrivWithPrf(\(String(decoding: sealed, as: UTF8.self)), asn.prf); } catch { failed = true; }
          __pipHost.emit("acct.done", JSON.stringify({ failed }));
        })();
        """, expecting: "acct.done")
        #expect(r["failed"] as? Bool == true)
    }

    @Test func createSealsUnderThePRFAndOpensAgain() throws {
        let rig = try AccountRig()
        rig.prf.withLock { $0 = Data((0..<32).map { UInt8($0) }) }
        let r = try rig.run("""
        (async () => {
          const hc = PIPCORE.hostCrypto, hio = PIPCORE.hostio;
          const a1 = await hio.hostCall("passkey.create", { rpId: "pipaac.org", challenge: "AAAA", userId: "AAAA", name: "m@x.org", prfSalt: "AAAA" });
          const acct = await hc.createAccountKeys(a1.prf);
          const a2 = await hio.hostCall("passkey.get", { rpId: "pipaac.org", challenge: "AAAA", credentialIds: ["x"], prfSalt: "AAAA" });
          const priv = await hc.openAccountPrivWithPrf(acct.sealed, a2.prf);
          const userKey = await hc.newUserKey();
          const back = await hc.unwrapUserKey(priv, await hc.wrapUserKey(userKey, acct.pub));
          const opened = await hc.openOp(back, await hc.sealOp(userKey, { ok: 1 }));
          const none = await hc.createAccountKeys(null);
          __pipHost.emit("acct.done", JSON.stringify({ ok: opened.ok, sealedKeys: Object.keys(acct.sealed).sort(),
            privKind: acct.priv.kind, noPrfSealed: none.sealed, leaked: JSON.stringify(acct).includes("MIG") }));
        })();
        """, expecting: "acct.done")
        #expect(r["ok"] as? Int == 1)
        #expect(r["sealedKeys"] as? [String] == ["iv", "sealed"])
        #expect(r["privKind"] as? String == "ecdh-priv")
        #expect(r["noPrfSealed"] is NSNull, "no PRF means nothing is sealed - keys wait for an Allow or a card")
        #expect(r["leaked"] as? Bool == false, "no PKCS8 bytes in what JS received")
    }

    // (c) the card as pixels

    @MainActor
    @Test func theQRAndTheCardImageBothDecodeToTheCardLink() throws {
        let link = "https://app.pipaac.org/#restore=abandon-ability-able-about-above-absent-absorb-abstract-absurd-abuse-access-accident"
        let words = link.components(separatedBy: "restore=")[1].components(separatedBy: "-")
        let qr = try #require(CardKit.qr(link))
        #expect(CardKit.cardText(in: try #require(qr.cgImage)) == link)
        let card = try #require(CardKit.cardImage(payload: link, words: words))
        #expect(card.size.width * card.scale == 640 && card.size.height * card.scale == 864,
                "the web's 640 x 864 canvas")
        #expect(CardKit.cardText(in: try #require(card.cgImage)) == link,
                "the image a person saves or prints reads back as the same card")
        // A QR that is not a Pip card is ignored.
        let other = try #require(CardKit.qr("https://example.com/"))
        #expect(CardKit.cardText(in: try #require(other.cgImage)) == nil)
    }
}
