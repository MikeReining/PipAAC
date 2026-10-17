//
//  IncomingLinks.swift
//  PipAAC
//
//  Universal links (phase 044): the emailed sign-in link
//  `https://app.pipaac.org/?signin=<token>` opens the app instead of
//  Safari. The app does exactly what pasting the link does - Settings ->
//  Your account, the link in the paste field, "Sign in" run - so there is
//  one sign-in path (AccountFlow.signIn -> PIPCORE.account.land). The
//  emailed supporter invite `https://app.pipaac.org/?invite=<token>` opens
//  the invitee landing (InviteLanding.swift -> PIPCORE.invite, 044 IL). The
//  association is the Worker's AASA (src/worker/aasa.mjs), which claims
//  exactly these two shapes.
//

import Foundation

public nonisolated enum IncomingLink {
    /// The AASA component: path "/" with a non-empty `signin` query item, on
    /// the production app host (or the host a test points the app at).
    public static func isSignIn(_ url: URL) -> Bool { carries(url, "signin") }

    /// The second AASA component: the same shape with a non-empty `invite`.
    public static func isInvite(_ url: URL) -> Bool { carries(url, "invite") }

    private static func carries(_ url: URL, _ name: String) -> Bool {
        guard let c = URLComponents(url: url, resolvingAgainstBaseURL: false),
              c.scheme == "https" || c.scheme == "http",
              ["app.pipaac.org", URL(string: PipRelay.baseURL)?.host].contains(c.host),
              c.path.isEmpty || c.path == "/",
              c.queryItems?.contains(where: { $0.name == name && !($0.value ?? "").isEmpty }) == true
        else { return false }
        return true
    }
}

extension AppModel {
    /// onOpenURL / onContinueUserActivity (and the `-PipOpenURL` test
    /// hook) land here. Anything that is neither the sign-in link nor the
    /// supporter invite is ignored.
    @discardableResult
    func handleIncomingURL(_ url: URL) -> Bool {
        if IncomingLink.isSignIn(url) {
            incomingSignIn = url.absoluteString
            return true
        }
        if IncomingLink.isInvite(url) {
            incomingInvite = url.absoluteString
            return true
        }
        return false
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
