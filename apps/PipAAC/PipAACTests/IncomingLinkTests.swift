//
//  IncomingLinkTests.swift
//  PipAACTests
//
//  044 universal links: which URLs the app takes. Mirrors the AASA
//  components (src/worker/aasa.mjs): path "/" with a non-empty `signin` or
//  a non-empty `invite` (044 IL).
//

import Foundation
import Testing
import PipAAC

struct IncomingLinkTests {
    private func yes(_ s: String) -> Bool { IncomingLink.isSignIn(URL(string: s)!) }
    private func invite(_ s: String) -> Bool { IncomingLink.isInvite(URL(string: s)!) }

    @Test func theEmailedSignInLinkIsTaken() {
        #expect(yes("https://app.pipaac.org/?signin=AbCdEfGhIjKlMnOpQrStUv"))
        #expect(yes("https://app.pipaac.org?signin=AbCdEfGhIjKlMnOpQrStUv"))
    }

    @Test func theEmailedSupporterInviteIsTaken() {
        #expect(invite("https://app.pipaac.org/?invite=AbCdEfGhIjKlMnOpQrStUv"))
        #expect(invite("https://app.pipaac.org?invite=AbCdEfGhIjKlMnOpQrStUv"))
        #expect(invite("https://app.pipaac.org/?x=1&invite=AbCdEfGhIjKlMnOpQrStUv"))
        #expect(!yes("https://app.pipaac.org/?invite=AbCdEfGhIjKlMnOpQrStUv"), "an invite is not a sign-in")
        #expect(!invite("https://app.pipaac.org/?signin=AbCdEfGhIjKlMnOpQrStUv"), "a sign-in is not an invite")
    }

    @Test func theInviteShapeIsAsStrictAsTheSignInShape() {
        #expect(!invite("https://app.pipaac.org/?invite="))
        #expect(!invite("https://app.pipaac.org/other?invite=AbCdEfGhIjKlMnOpQrStUv"))
        #expect(!invite("https://pipaac.org/?invite=AbCdEfGhIjKlMnOpQrStUv"))
        #expect(!invite("https://evil.example/?invite=AbCdEfGhIjKlMnOpQrStUv"))
    }

    @Test func everythingElseIsLeftToSafari() {
        #expect(!yes("https://app.pipaac.org/?signin="))
        #expect(!yes("https://app.pipaac.org/other?signin=AbCdEfGhIjKlMnOpQrStUv"))
        #expect(!yes("https://pipaac.org/?signin=AbCdEfGhIjKlMnOpQrStUv"))
        #expect(!yes("https://evil.example/?signin=AbCdEfGhIjKlMnOpQrStUv"))
    }
}
