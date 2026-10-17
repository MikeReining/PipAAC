//
//  Purchases.swift
//  PipAAC
//
//  Buying and restoring Pip Lifetime on the iPad (phase 044 F1; PU-4,
//  PU-6, PU-7, PU-10). The sale is StoreKit 2; everything else is the
//  Worker's:
//
//    - A purchase is a CONSUMABLE ("Pip Lifetime for one user",
//      Pricing_And_Packaging § 4.5), bought for one person: the person's
//      id is the `appAccountToken`. Apple does not restore consumables, so
//      the Worker is the record.
//    - The signed transaction goes to the Worker (PIPCORE.purchase.redeem
//      -> POST /api/v1/appstore/redeem). The Worker verifies Apple's
//      signature and writes the same entitlement Stripe and codes write.
//      The transaction is FINISHED only after the Worker says yes, so a
//      crash or a dead network re-delivers it (Transaction.updates /
//      unfinished) until it lands. A duplicate is harmless: the Worker
//      grants once per original transaction.
//    - The app reads entitlement only from the Worker (PIPCORE.purchase
//      .sync), as the web does. A refund reaches the Worker through Apple's
//      server notification; the app learns it on the next read.
//    - Nothing is bought or restored without the parent gate.
//
//  The StoreClient and LifetimeBackend seams exist so the tests can drive
//  the REAL logic with StoreKitTest on one side and a stub Worker on the
//  other.
//

import Foundation
import SwiftUI

// MARK: - The real backend: PIPCORE.purchase over the core queue

@MainActor
final class CoreLifetimeBackend: LifetimeBackend {
    weak var app: AppModel?
    private var waiters: [String: CheckedContinuation<LifetimeEvent, Never>] = [:]

    init(app: AppModel? = nil) { self.app = app }

    /// A "purchase" host event from the core.
    func handle(_ json: String) {
        guard let ev = try? JSONDecoder().decode(LifetimeEvent.self, from: Data(json.utf8)),
              let ref = ev.ref, let c = waiters.removeValue(forKey: ref) else { return }
        c.resume(returning: ev)
    }

    private func call(_ personId: String, _ method: String,
                      _ build: @escaping @Sendable (_ appId: String, _ row: String, _ ref: String) -> [String]) async -> LifetimeEvent {
        guard let app, let reg = app.registry, let row = try? reg.rowJSON(personId) else {
            return .failure("no such person")
        }
        let appId = personId == app.activeId ? app.appId : ""
        let core = app.core
        let ref = UUID().uuidString
        let args = build(appId, row, ref)
        return await withCheckedContinuation { c in
            waiters[ref] = c
            core.enqueue { _ = try? core.call("PIPCORE.purchase", method, args as [Any]) }
            Task { [weak self] in
                try? await Task.sleep(for: .seconds(60))
                self?.waiters.removeValue(forKey: ref)?.resume(returning: .failure("timed out"))
            }
        }
    }

    func productId() async -> String {
        guard let app else { return "" }
        let core = app.core
        return (try? await Task.detached { try core.sync { try core.call("PIPCORE.purchase", "productId", []) as? String } }.value) ?? ""
    }

    func sync(personId: String) async -> LifetimeEvent {
        await call(personId, "sync") { appId, row, ref in
            [appId, PipRelay.baseURL, row, PipRelay.deviceLabel, ref] }
    }

    func redeem(personId: String, jws: String) async -> LifetimeEvent {
        await call(personId, "redeem") { appId, row, ref in
            [appId, PipRelay.baseURL, row, jws, PipRelay.deviceLabel, ref] }
    }

    func redeemCode(personId: String, code: String) async -> LifetimeEvent {
        await call(personId, "redeemCode") { appId, row, ref in
            [appId, PipRelay.baseURL, row, code, PipRelay.deviceLabel, ref] }
    }

    func page(name: String, status: LifetimeStatus) async -> LifetimePage? {
        guard let app else { return nil }
        let core = app.core
        let args: [String: Any] = ["name": name, "licensed": status.licensed,
                                   "endsAt": status.endsAt ?? NSNull(), "trialKnown": status.trialKnown ?? false,
                                   "issue": status.issue ?? NSNull()]
        guard let data = try? JSONSerialization.data(withJSONObject: args) else { return nil }
        let json = String(decoding: data, as: UTF8.self)
        return try? await Task.detached {
            try core.sync { try AppModel.decodeRaw(core.call("PIPCORE.purchase", "model", [json])) as LifetimePage }
        }.value
    }
}
