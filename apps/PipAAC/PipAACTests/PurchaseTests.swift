//
//  PurchaseTests.swift
//  PipAACTests
//
//  F1 works tests (phase 044 PU-4, PU-6, PU-7, PU-10): the REAL
//  LifetimeModel and the REAL StoreKit client against StoreKitTest
//  (SKTestSession over apps/PipAAC/StoreKit/Pip.storekit), with a stub
//  Worker standing in for POST /api/v1/appstore/redeem and for the entitlement
//  Apple's server notification flips.
//
//  Instruments the code cannot influence: StoreKit's own unfinished queue
//  (`Transaction.unfinished`) for "finished only after the Worker said yes",
//  the signed transaction's payload for what the Worker is sent, and
//  SKTestSession.refundTransaction for the refund.
//

import Foundation
import StoreKit
import StoreKitTest
import Testing
import PipAAC

private let productID = "org.pipaac.lifetime.user"
private let maya = UUID()

private func storekitFile() -> URL {
    URL(fileURLWithPath: #filePath)
        .deletingLastPathComponent().deletingLastPathComponent()
        .appendingPathComponent("StoreKit/Pip.storekit")
}

/// The Worker, as far as the iPad can see it.
@MainActor
private final class StubWorker: LifetimeBackend {
    var entitled = false
    var down = false
    /// originalTransactionIds a REFUND notification has already revoked.
    var refunded = Set<String>()
    var redeemed: [(personId: String, jws: String)] = []
    func productId() async -> String { productID }
    func status() -> LifetimeStatus { LifetimeStatus(licensed: entitled) }
    func sync(personId: String) async -> LifetimeEvent {
        LifetimeEvent(kind: "status", ok: true, status: status())
    }
    func redeem(personId: String, jws: String) async -> LifetimeEvent {
        redeemed.append((personId, jws))
        if down { return LifetimeEvent(kind: "redeemed", ok: false, permanent: false, httpStatus: 502) }
        let p = Self.payload(jws)
        if p["revocationDate"] != nil || refunded.contains(String(describing: p["originalTransactionId"] ?? "")) {
            // The refund notification has already reached the Worker: it
            // answers a revoked transaction 410 and the entitlement is gone.
            return LifetimeEvent(kind: "redeemed", ok: false, permanent: true, httpStatus: 410, status: status())
        }
        entitled = true
        return LifetimeEvent(kind: "redeemed", ok: true, status: status())
    }
    func redeemCode(personId: String, code: String) async -> LifetimeEvent { LifetimeEvent(kind: "code", ok: false) }
    func page(name: String, status: LifetimeStatus) async -> LifetimePage? { nil }

    nonisolated static func payload(_ jws: String) -> [String: Any] {
        let parts = jws.split(separator: ".")
        guard parts.count == 3 else { return [:] }
        var b = String(parts[1]).replacingOccurrences(of: "-", with: "+").replacingOccurrences(of: "_", with: "/")
        while b.count % 4 != 0 { b += "=" }
        guard let d = Data(base64Encoded: b),
              let o = try? JSONSerialization.jsonObject(with: d) as? [String: Any] else { return [:] }
        return o
    }
}

/// The real StoreKit client, with a count of how often a purchase was started.
private final class CountingStore: StoreClient, @unchecked Sendable {
    let real = StoreKitClient()
    private let lock = NSLock()
    private var n = 0
    var purchases: Int { lock.withLock { n } }
    func product(id: String) async -> StoreProduct? { await real.product(id: id) }
    func purchase(id: String, accountToken: UUID) async -> StorePurchase {
        lock.withLock { n += 1 }
        return await real.purchase(id: id, accountToken: accountToken)
    }
    func unfinished() async -> [StoreTxn] { await real.unfinished() }
    func updates() -> AsyncStream<StoreTxn> { real.updates() }
    func sync() async throws { try await real.sync() }
}

@MainActor
private func wait(_ what: String, _ cond: () -> Bool) async {
    for _ in 0..<150 {
        if cond() { return }
        try? await Task.sleep(for: .milliseconds(100))
    }
    Issue.record("timed out waiting for: \(what)")
}

@MainActor
private func rig() throws -> (SKTestSession, CountingStore, StubWorker, LifetimeModel) {
    let session = try SKTestSession(contentsOf: storekitFile())
    session.resetToDefaultState()
    session.clearTransactions()
    session.disableDialogs = true
    let store = CountingStore()
    let worker = StubWorker()
    let model = LifetimeModel(store: store, backend: worker)
    model.activePerson = { (maya.uuidString, "Maya") }
    model.knownPeople = { [maya.uuidString.lowercased()] }
    return (session, store, worker, model)
}

@MainActor
@Suite(.serialized)
struct PurchaseTests {
    @Test func theStoreKitFileSellsTheOneConsumable() async throws {
        let (_, store, _, _) = try rig()
        let p = await store.product(id: productID)
        #expect(p?.id == productID)
        #expect(p?.displayPrice.isEmpty == false)
    }

    @Test func nothingIsBoughtUntilTheParentGateIsPassed() async throws {
        let (_, store, worker, model) = try rig()
        model.requestBuy()
        try? await Task.sleep(for: .milliseconds(300))
        #expect(model.gate == .buy)
        #expect(store.purchases == 0, "no purchase sheet before the gate")
        #expect(worker.redeemed.isEmpty)
        model.gatePassed()
        await wait("purchase after the gate") { worker.redeemed.count == 1 }
        #expect(store.purchases == 1)
        #expect(model.gate == nil)
    }

    @Test func aPurchaseIsFinishedOnlyAfterTheWorkerConfirms() async throws {
        let (_, store, worker, model) = try rig()
        // The Worker is down: the person still paid, so Apple keeps the transaction.
        worker.down = true
        await model.buy()
        #expect(worker.redeemed.count == 1)
        let sent = StubWorker.payload(worker.redeemed[0].jws)
        #expect(sent["productId"] as? String == productID)
        #expect((sent["appAccountToken"] as? String)?.lowercased() == maya.uuidString.lowercased(),
                "the transaction is bound to the person it was bought for")
        #expect(worker.redeemed[0].personId == maya.uuidString.lowercased())
        #expect(await store.unfinished().count == 1, "not finished: the Worker never said yes")
        #expect(model.licensed == false)
        #expect(model.message?.contains("safe") == true)

        // Back online: the same transaction is handed over again and now finishes.
        worker.down = false
        await model.sweepUnfinished()
        #expect(worker.redeemed.count == 2)
        #expect(await store.unfinished().isEmpty, "finished after the Worker confirmed")
        #expect(model.licensed == true)
        #expect(worker.entitled)

        // Duplicate delivery (Transaction.updates replay, a second device): still one entitlement.
        await model.sweepUnfinished()
        #expect(worker.redeemed.count == 2, "nothing left to deliver")
    }

    /// StoreKitTest refunds only a transaction that is still unfinished (a
    /// finished consumable is gone from Apple's history), so this is the
    /// refund that races a slow Worker: bought, not yet confirmed, refunded.
    /// Apple's REFUND notification reaches the Worker first; the redeem that
    /// follows is answered 410 and the person never gets Lifetime.
    @Test func aPurchaseRefundedBeforeTheWorkerHeardIsNeverGranted() async throws {
        let (session, store, worker, model) = try rig()
        worker.down = true
        await model.buy()
        #expect(await store.unfinished().count == 1)
        let tx = try #require(session.allTransactions().first)
        try session.refundTransaction(identifier: tx.identifier)
        // The instrument: StoreKit's own history now says revoked.
        var revoked = false
        for _ in 0..<30 where !revoked {
            for await v in StoreKit.Transaction.all { revoked = revoked || v.unsafePayloadValue.revocationDate != nil }
            if !revoked { try? await Task.sleep(for: .milliseconds(100)) }
        }
        #expect(revoked, "StoreKit refunded it")

        let otid = String(describing: StubWorker.payload(worker.redeemed[0].jws)["originalTransactionId"] ?? "")
        worker.refunded.insert(otid)           // the notification, as the Worker applies it
        worker.down = false
        await model.sweepUnfinished()
        #expect(worker.entitled == false, "a refunded purchase grants nothing")
        #expect(model.licensed == false)
        #expect(await store.unfinished().isEmpty, "cleared, not retried forever")
    }

    /// The usual refund: Apple's server notification reaches the Worker and
    /// flips the entitlement; the iPad learns on its next read.
    @Test func aRefundIsReflectedOnTheNextReadOfTheWorker() async throws {
        let (_, _, worker, model) = try rig()
        await model.buy()
        #expect(model.licensed == true)
        #expect(LifetimeModel.licensedNow == true)

        worker.entitled = false              // the REFUND notification, as the Worker applies it
        await model.refresh()                // launch / coming back to the app
        #expect(model.licensed == false)
        #expect(LifetimeModel.licensedNow == false)
    }

    @Test func aTransactionForAnotherDevicesPersonIsLeftAlone() async throws {
        let (session, store, worker, model) = try rig()
        _ = try await session.buyProduct(identifier: productID)   // no appAccountToken
        await model.sweepUnfinished()
        #expect(worker.redeemed.isEmpty, "not one of this iPad's people")
        #expect(await store.unfinished().count == 1, "left for the device it belongs to")
    }

    @Test func restoreSyncsReHandsOverAndReadsTheWorker() async throws {
        let (_, _, worker, model) = try rig()
        worker.down = true
        await model.buy()
        worker.down = false
        model.requestRestore()
        #expect(model.gate == .restore)
        model.gatePassed()
        await wait("restore done") { model.licensed }
        #expect(model.licensed)
        #expect(worker.entitled)
    }
}
