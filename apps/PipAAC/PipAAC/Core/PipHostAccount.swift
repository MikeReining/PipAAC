//
//  PipHostAccount.swift
//  PipAAC
//
//  The host side of supporter accounts (phase 044 C5): the passkey
//  ceremony's seam, the PRF handle table, account-key creation, and the
//  people registry verbs the account facade calls.
//
//  KEY RULE: the passkey's PRF output and the account private key never
//  enter JS. The ceremony leaves the PRF in `prfs`; JS holds only an
//  opaque { __pipPrf: id } and passes it back to `account.create` /
//  `account.open`, which return the account private key as an ECDH key
//  handle (PipHostCrypto's table).
//

import CryptoKit
import Foundation

/// What the core asks the OS to do (base64url strings, as the web's
/// account.mjs carries them).
public nonisolated struct PasskeyRequest: Sendable {
    public var rpId: String
    public var origin: String
    public var challenge: String
    public var userId: String?
    public var name: String?
    public var prfSalt: String?
    public var credentialIds: [String]

    init?(_ a: [String: Any]) {
        guard let rp = a["rpId"] as? String, let ch = a["challenge"] as? String else { return nil }
        rpId = rp
        origin = a["origin"] as? String ?? "https://\(rp)"
        challenge = ch
        userId = a["userId"] as? String
        name = a["name"] as? String
        prfSalt = a["prfSalt"] as? String
        credentialIds = (a["credentialIds"] as? [String]) ?? []
    }
}

/// `fields` cross to JS as strings; `prf` stays here (handle).
public nonisolated struct PasskeyResult: Sendable {
    public var fields: [String: String]
    public var prf: Data?
    public init(fields: [String: String], prf: Data?) { self.fields = fields; self.prf = prf }
}

public typealias PasskeyHandler = @Sendable (_ op: String, _ request: PasskeyRequest) async throws -> PasskeyResult

nonisolated extension PipHost {
    // MARK: PRF handles (queue-only)

    /// Keeps the newest few: a ceremony's PRF is used within the same flow.
    func storePrf(_ data: Data) -> [String: Any] {
        let id = "prf:" + SHA256.hash(data: data + Data(prfOrder.joined().utf8)).prefix(8)
            .map { String(format: "%02x", $0) }.joined()
        prfs[id] = data
        prfOrder.append(id)
        while prfOrder.count > 4 { prfs[prfOrder.removeFirst()] = nil }
        return ["__pipPrf": id]
    }

    /// A PRF argument: a { __pipPrf } handle (the passkey's) or base64url
    /// bytes (the crypto fixtures).
    func prfData(_ any: Any?) throws -> Data {
        if let s = any as? String { return try PipCrypto.unb64u(s) }
        if let h = any as? [String: Any], let id = h["__pipPrf"] as? String, let d = prfs[id] { return d }
        throw PipHostError("unknown PRF handle")
    }

    func dropPrf(_ any: Any?) {
        guard let h = any as? [String: Any], let id = h["__pipPrf"] as? String else { return }
        prfs[id] = nil
        prfOrder.removeAll { $0 == id }
    }

    // MARK: account keys

    /// New account keypair, sealed under the PRF when there is one. The
    /// private key returns as a handle; the sealed copy is what the relay holds.
    func accountCreate(_ prf: Any?) throws -> [String: Any] {
        let k = P256.KeyAgreement.PrivateKey()
        var out: [String: Any] = [
            "pub": PipCrypto.exportDhPublic(k.publicKey),
            "priv": handle(.dhPriv(k)),
        ]
        if prf is NSNull || prf == nil {
            out["sealed"] = NSNull()
        } else {
            let s = try PipCrypto.sealAccountPriv(k.derRepresentation, prf: prfData(prf))
            out["sealed"] = ["iv": s.iv, "sealed": s.sealed]
            dropPrf(prf)
        }
        return out
    }

    // MARK: the ceremony (async; completion hops back via settle)

    func startPasskey(_ id: Int, _ op: String, _ a: [String: Any]) {
        guard let handler = passkeys else {
            settle(id, .failure(PipHostError("Passkeys are not available here.")))
            return
        }
        guard let req = PasskeyRequest(a) else {
            settle(id, .failure(PipHostError("\(op): bad arguments")))
            return
        }
        Task { [weak self] in
            do {
                let r = try await handler(op, req)
                self?.core?.jsQueue.async {
                    guard let self else { return }
                    var out: [String: Any] = r.fields
                    out["prf"] = r.prf.map { self.storePrf($0) } ?? NSNull()
                    do { self.settle(id, .success(try Self.encode(out))) }
                    catch { self.settle(id, .failure(error)) }
                }
            } catch {
                self?.settle(id, .failure(error))
            }
        }
    }

    // MARK: registry verbs (the account facade's userStore)

    func registry(_ op: String, _ a: [String: Any]) throws -> Any? {
        let json = try onRegistry(op, Self.encode(a))
        guard !json.isEmpty else { return nil }
        return try JSONSerialization.jsonObject(with: Data(json.utf8), options: [.fragmentsAllowed])
    }
}
