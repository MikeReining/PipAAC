//
//  IncomingLinks.swift
//  PipAAC
//
//  Universal links (phase 044): the emailed sign-in link
//  `https://app.pipaac.org/?signin=<token>` opens the app instead of
//  Safari. The app does exactly what pasting the link does - Settings ->
//  Your account, the link in the paste field, "Sign in" run - so there is
//  one sign-in path (AccountFlow.signIn -> PIPCORE.account.land). The
//  association is the Worker's AASA (src/worker/aasa.mjs), which claims
//  only this shape; the invite link (`?invite=`) is not claimed because
//  the app has no invitee landing yet.
//

import Foundation

public nonisolated enum IncomingLink {
    /// The AASA component: path "/" with a non-empty `signin` query item, on
    /// the production app host (or the host a test points the app at).
    public static func isSignIn(_ url: URL) -> Bool {
        guard let c = URLComponents(url: url, resolvingAgainstBaseURL: false),
              c.scheme == "https" || c.scheme == "http",
              ["app.pipaac.org", URL(string: PipRelay.baseURL)?.host].contains(c.host),
              c.path.isEmpty || c.path == "/",
              c.queryItems?.contains(where: { $0.name == "signin" && !($0.value ?? "").isEmpty }) == true
        else { return false }
        return true
    }
}

extension AppModel {
    /// onOpenURL / onContinueUserActivity (and the `-PipOpenURL` test
    /// hook) land here. Anything that is not the sign-in link is ignored.
    @discardableResult
    func handleIncomingURL(_ url: URL) -> Bool {
        guard IncomingLink.isSignIn(url) else { return false }
        incomingSignIn = url.absoluteString
        return true
    }

    /// UI tests cannot make iOS deliver a universal link (the simulator
    /// never validates the AASA): `-PipOpenURL <url>` hands the same URL to
    /// the same handler at boot.
    func openURLFromLaunchArgument() {
        if let s = UserDefaults.standard.string(forKey: "PipOpenURL"), let u = URL(string: s) {
            handleIncomingURL(u)
        }
    }
}
