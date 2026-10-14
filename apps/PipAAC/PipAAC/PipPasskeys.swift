//
//  PipPasskeys.swift
//  PipAAC
//
//  The passkey ceremony (phase 044 C5; AC-1, AC-2). Swift owns ONLY the
//  OS prompt: ASAuthorizationPlatformPublicKeyCredentialProvider with
//  relying party `pipaac.org` (the same passkeys as the web, via the
//  `webcredentials:pipaac.org` entitlement and the live AASA file) and the
//  PRF extension (iOS 18+) whose output unlocks the account key. Every
//  decision around it - challenges, what to register, what to do with the
//  assertion - is the core's (scripts/ios/app_account.mjs).
//
//  What crosses to the core: base64url strings (credential id, attestation
//  object, authenticator data, client data JSON, signature). The PRF output
//  does NOT: PipHost keeps it and hands JS a handle (PipHostAccount.swift).
//

import AuthenticationServices
import CryptoKit
import Foundation
import UIKit

@MainActor
final class PasskeyCeremony: NSObject, ASAuthorizationControllerDelegate,
                             ASAuthorizationControllerPresentationContextProviding {
    static let shared = PasskeyCeremony()

    private var continuation: CheckedContinuation<ASAuthorization, Error>?
    private var controller: ASAuthorizationController?

    /// The core's `hostCall("passkey.create" | "passkey.get")`.
    func run(_ op: String, _ r: PasskeyRequest) async throws -> PasskeyResult {
        let challenge = try PipCrypto.unb64u(r.challenge)
        let provider = ASAuthorizationPlatformPublicKeyCredentialProvider(relyingPartyIdentifier: r.rpId)
        let salt = try r.prfSalt.map { try PipCrypto.unb64u($0) }
        switch op {
        case "passkey.create":
            guard let name = r.name, let uid = r.userId else { throw PipHostError("passkey.create: missing name") }
            let req = provider.createCredentialRegistrationRequest(
                challenge: challenge, name: name, userID: try PipCrypto.unb64u(uid))
            req.attestationPreference = .none
            req.userVerificationPreference = .preferred
            if let salt {
                req.prf = .inputValues(.init(saltInput1: salt))
            }
            let auth = try await perform([req])
            guard let cred = auth.credential as? ASAuthorizationPlatformPublicKeyCredentialRegistration,
                  let attestation = cred.rawAttestationObject else {
                throw PipHostError("The passkey was not created.")
            }
            var prf: Data?
            if let out = cred.prf, let first = out.first { prf = first.withUnsafeBytes { Data($0) } }
            return PasskeyResult(fields: [
                "id": PipCrypto.b64u(cred.credentialID),
                "attestationObject": PipCrypto.b64u(attestation),
            ], prf: prf)
        case "passkey.get":
            let req = provider.createCredentialAssertionRequest(challenge: challenge)
            req.allowedCredentials = try r.credentialIds.map {
                .init(credentialID: try PipCrypto.unb64u($0))
            }
            if let salt {
                req.prf = .inputValues(.init(saltInput1: salt))
            }
            let auth = try await perform([req])
            guard let cred = auth.credential as? ASAuthorizationPlatformPublicKeyCredentialAssertion else {
                throw PipHostError("The passkey did not sign in.")
            }
            return PasskeyResult(fields: [
                "credential_id": PipCrypto.b64u(cred.credentialID),
                "authenticator_data": PipCrypto.b64u(cred.rawAuthenticatorData),
                "client_data_json": PipCrypto.b64u(cred.rawClientDataJSON),
                "signature": PipCrypto.b64u(cred.signature),
            ], prf: cred.prf.map { $0.first.withUnsafeBytes { Data($0) } })
        default:
            throw PipHostError("unknown passkey op \(op)")
        }
    }

    private func perform(_ requests: [ASAuthorizationRequest]) async throws -> ASAuthorization {
        guard continuation == nil else { throw PipHostError("A passkey prompt is already open.") }
        return try await withCheckedThrowingContinuation { c in
            continuation = c
            let ctl = ASAuthorizationController(authorizationRequests: requests)
            ctl.delegate = self
            ctl.presentationContextProvider = self
            controller = ctl
            ctl.performRequests()
        }
    }

    // MARK: delegate

    func authorizationController(controller: ASAuthorizationController,
                                 didCompleteWithAuthorization authorization: ASAuthorization) {
        continuation?.resume(returning: authorization)
        continuation = nil
        self.controller = nil
    }

    func authorizationController(controller: ASAuthorizationController, didCompleteWithError error: Error) {
        // The core treats the word "cancel" as the person backing out (it
        // must not go on to make a second passkey).
        let msg = (error as? ASAuthorizationError)?.code == .canceled
            ? "passkey cancelled" : "The passkey did not work: \(error.localizedDescription)"
        continuation?.resume(throwing: PipHostError(msg))
        continuation = nil
        self.controller = nil
    }

    func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor {
        let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
        return scenes.flatMap(\.windows).first(where: \.isKeyWindow)
            ?? scenes.first?.windows.first ?? ASPresentationAnchor()
    }
}
