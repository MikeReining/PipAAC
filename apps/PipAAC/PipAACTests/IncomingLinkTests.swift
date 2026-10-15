//
//  IncomingLinkTests.swift
//  PipAACTests
//
//  044 universal links: which URLs the app takes. Mirrors the AASA
//  component (src/worker/aasa.mjs): path "/" with a non-empty `signin`.
//

import Foundation
import Testing
import PipAAC

struct IncomingLinkTests {
    private func yes(_ s: String) -> Bool { IncomingLink.isSignIn(URL(string: s)!) }

    @Test func theEmailedSignInLinkIsTaken() {
        #expect(yes("https://app.pipaac.org/?signin=AbCdEfGhIjKlMnOpQrStUv"))
        #expect(yes("https://app.pipaac.org?signin=AbCdEfGhIjKlMnOpQrStUv"))
    }

    @Test func everythingElseIsLeftToSafari() {
        #expect(!yes("https://app.pipaac.org/?invite=AbCdEfGhIjKlMnOpQrStUv"))
        #expect(!yes("https://app.pipaac.org/?signin="))
        #expect(!yes("https://app.pipaac.org/other?signin=AbCdEfGhIjKlMnOpQrStUv"))
        #expect(!yes("https://pipaac.org/?signin=AbCdEfGhIjKlMnOpQrStUv"))
        #expect(!yes("https://evil.example/?signin=AbCdEfGhIjKlMnOpQrStUv"))
    }
}
