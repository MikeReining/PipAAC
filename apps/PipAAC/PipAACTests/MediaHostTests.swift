//
//  MediaHostTests.swift
//  PipAACTests
//
//  044 C4: a media file is "available offline" only once its bytes hash
//  to its name (phase 044 section 6 B-C). Driven through the same JS ->
//  PipHost path the sync loop uses (hostCall "blob.save" / "blob.has").
//  The honest states for a webm or not-yet-arrived recording are proven
//  through the real app by SyncMediaE2ETests (scripts/ios/e2e_sync.sh).
//

import CryptoKit
import Foundation
import Testing
import PipAAC

@Suite("PipHost: media blobs are verified", .serialized)
struct MediaHostTests {
    @Test func blobSaveRefusesBytesThatDoNotHashToTheirName() throws {
        let good = Data("a picture".utf8)
        let sha = SHA256.hash(data: good).map { String(format: "%02x", $0) }.joined()
        let goodB64 = good.base64EncodedString()
            .replacingOccurrences(of: "+", with: "-").replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
        let badB64 = Data("something else".utf8).base64EncodedString()
            .replacingOccurrences(of: "+", with: "-").replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
        let rig = try HostRig()
        let r = try rig.run("""
        (async () => {
          const h = PIPCORE.hostio.hostCall;
          const out = {};
          try { await h("blob.save", { sha: "\(sha)", b64: "\(badB64)" }); out.refused = false; }
          catch (e) { out.refused = true; }
          out.hasAfterRefusal = await h("blob.has", { sha: "\(sha)" });
          await h("blob.save", { sha: "\(sha)", b64: "\(goodB64)" });
          out.hasAfterGood = await h("blob.has", { sha: "\(sha)" });
          out.loaded = await h("blob.load", { sha: "\(sha)" });
          __pipHost.emit("probe.blob", JSON.stringify(out));
        })();
        """, expecting: "probe.blob")
        #expect(r["refused"] as? Bool == true, "\(r)")
        #expect(r["hasAfterRefusal"] as? Bool == false, "a refused write leaves no file")
        #expect(r["hasAfterGood"] as? Bool == true, "\(r)")
        #expect(r["loaded"] as? String == goodB64)
    }
}
