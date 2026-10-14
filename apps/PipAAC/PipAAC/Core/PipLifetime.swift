//
//  Core/PipLifetime.swift
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
import Combine
import StoreKit

// MARK: - The store seam (StoreKit 2)

public nonisolated struct StoreProduct: Sendable, Equatable {
    public let id: String
    public let displayPrice: String
    public init(id: String, displayPrice: String) { self.id = id; self.displayPrice = displayPrice }
}

/// One signed App Store transaction. `finish` tells Apple we are done with
/// it; the model calls it only after the Worker confirmed.
public nonisolated struct StoreTxn: Sendable {
    public let id: String
    public let originalID: String
    public let jws: String
    /// The person it was bought for (lowercased UUID), as set at purchase.
    public let accountToken: String?
    public let productID: String
    public let revoked: Bool
    public let finish: @Sendable () async -> Void
    public init(id: String, originalID: String, jws: String, accountToken: String?,
                productID: String, revoked: Bool, finish: @escaping @Sendable () async -> Void) {
        self.id = id; self.originalID = originalID; self.jws = jws; self.accountToken = accountToken
        self.productID = productID; self.revoked = revoked; self.finish = finish
    }
}

public nonisolated enum StorePurchase: Sendable {
    case success(StoreTxn)
    case pending
    case cancelled
    case failed(String)
}

public protocol StoreClient: Sendable {
    func product(id: String) async -> StoreProduct?
    func purchase(id: String, accountToken: UUID) async -> StorePurchase
    /// Transactions Apple still holds as unfinished.
    func unfinished() async -> [StoreTxn]
    /// Purchases that finish outside the app's own flow (Ask to Buy
    /// approved, another device, a refund). Started at launch.
    func updates() -> AsyncStream<StoreTxn>
    /// "Restore purchase": ask the App Store to re-sync.
    func sync() async throws
}

public nonisolated struct StoreKitClient: StoreClient {
    public init() {}
    public static func txn(_ v: VerificationResult<StoreKit.Transaction>) -> StoreTxn {
        let t: StoreKit.Transaction
        switch v {
        case .verified(let x): t = x
        // Local verification failing is not ours to judge: the Worker checks
        // Apple's signature and refuses what is not Apple's.
        case .unverified(let x, _): t = x
        }
        return StoreTxn(
            id: String(t.id), originalID: String(t.originalID), jws: v.jwsRepresentation,
            accountToken: t.appAccountToken?.uuidString.lowercased(),
            productID: t.productID, revoked: t.revocationDate != nil,
            finish: { await t.finish() })
    }

    public func product(id: String) async -> StoreProduct? {
        guard let p = try? await Product.products(for: [id]).first else { return nil }
        return StoreProduct(id: p.id, displayPrice: p.displayPrice)
    }

    public func purchase(id: String, accountToken: UUID) async -> StorePurchase {
        guard let p = try? await Product.products(for: [id]).first else {
            return .failed("The App Store isn't answering. Try again in a moment.")
        }
        do {
            switch try await p.purchase(options: [.appAccountToken(accountToken)]) {
            case .success(let v): return .success(Self.txn(v))
            case .pending: return .pending
            case .userCancelled: return .cancelled
            @unknown default: return .cancelled
            }
        } catch {
            return .failed("The purchase didn't go through. Nothing was charged.")
        }
    }

    public func unfinished() async -> [StoreTxn] {
        var out: [StoreTxn] = []
        for await v in StoreKit.Transaction.unfinished { out.append(Self.txn(v)) }
        return out
    }

    public func updates() -> AsyncStream<StoreTxn> {
        AsyncStream { c in
            let task = Task {
                for await v in StoreKit.Transaction.updates { c.yield(Self.txn(v)) }
                c.finish()
            }
            c.onTermination = { _ in task.cancel() }
        }
    }

    public func sync() async throws { try await AppStore.sync() }
}

/// UI-test store (`-PipFakeStore YES`): the App Store sheet cannot be driven
/// from an XCUITest, so a purchase here "succeeds" with a placeholder JWS the
/// test's stub Worker accepts. Never reachable in a normal launch.
public nonisolated final class FakeStoreClient: StoreClient, @unchecked Sendable {
    public init() {}
    private let lock = NSLock()
    private var n = 0
    private var finished: [String] = []
    private func bump() -> Int { lock.lock(); defer { lock.unlock() }; n += 1; return n }
    private func note(_ t: String) { lock.lock(); finished.append(t); lock.unlock() }
    public func product(id: String) async -> StoreProduct? { StoreProduct(id: id, displayPrice: "$48.99") }
    public func purchase(id: String, accountToken: UUID) async -> StorePurchase {
        let tid = "fake-\(bump())"
        return .success(StoreTxn(
            id: tid, originalID: tid, jws: "fake.jws.\(tid)",
            accountToken: accountToken.uuidString.lowercased(), productID: id, revoked: false,
            finish: { [self] in note(tid) }))
    }
    public func unfinished() async -> [StoreTxn] { [] }
    public func updates() -> AsyncStream<StoreTxn> { AsyncStream { _ in } }
    public func sync() async throws {}
}

// MARK: - The Worker seam (PIPCORE.purchase)

public nonisolated struct LifetimeStatus: Decodable, Sendable, Equatable {
    public var userId: String?
    public var licensed: Bool = false
    public var endsAt: Double?
    public var issue: String?
    public var issueText: String?
    public init(userId: String? = nil, licensed: Bool = false, endsAt: Double? = nil,
                issue: String? = nil, issueText: String? = nil) {
        self.userId = userId; self.licensed = licensed; self.endsAt = endsAt
        self.issue = issue; self.issueText = issueText
    }
}

public nonisolated struct LifetimeEvent: Decodable, Sendable {
    public var kind: String = ""
    public var ref: String?
    public var ok: Bool?
    public var permanent: Bool?
    public var httpStatus: Int?
    public var error: String?
    public var message: String?
    public var duplicate: Bool?
    public var newlyLinked: Bool?
    public var status: LifetimeStatus?
    public init(kind: String = "", ref: String? = nil, ok: Bool? = nil, permanent: Bool? = nil,
                httpStatus: Int? = nil, error: String? = nil, message: String? = nil,
                duplicate: Bool? = nil, newlyLinked: Bool? = nil, status: LifetimeStatus? = nil) {
        self.kind = kind; self.ref = ref; self.ok = ok; self.permanent = permanent
        self.httpStatus = httpStatus; self.error = error; self.message = message
        self.duplicate = duplicate; self.newlyLinked = newlyLinked; self.status = status
    }

    public static func failure(_ why: String) -> LifetimeEvent {
        LifetimeEvent(kind: "failed", ok: false, permanent: false, error: why)
    }
}

public nonisolated struct LifetimePage: Decodable, Sendable, Equatable {
    public struct Feature: Decodable, Sendable, Equatable { public let title: String; public let detail: String }
    public let owned: Bool
    public let ownedTitle: String
    public let ownedSub: String
    public let title: String
    public let price: String
    public let priceNote: String
    public let priceFine: String
    public let lede: String
    public let trialLine: String?
    public let buyFine: String
    public let featuresLabel: String
    public let features: [Feature]
    public let freeLabel: String
    public let free: [String]
    public let codeLabel: String
    public let codeHint: String
    public let issue: String?
}

@MainActor
public protocol LifetimeBackend: AnyObject {
    func productId() async -> String
    func sync(personId: String) async -> LifetimeEvent
    func redeem(personId: String, jws: String) async -> LifetimeEvent
    func redeemCode(personId: String, code: String) async -> LifetimeEvent
    func page(name: String, status: LifetimeStatus) async -> LifetimePage?
}

// MARK: - The model

public enum LifetimeGate: Equatable { case buy, restore }

@MainActor
public final class LifetimeModel: ObservableObject {
    @Published public private(set) var licensed = false
    @Published public private(set) var endsAt: Double?
    @Published public private(set) var price: String?
    @Published public private(set) var page: LifetimePage?
    @Published public private(set) var busy = false
    @Published public private(set) var message: String?
    @Published public private(set) var codeMessage: String?
    /// A refund or failed payment, kept on the page while it is still true.
    @Published public private(set) var issueLine: String?
    /// Set while the parent gate is up; nothing is bought until it passes.
    @Published public var gate: LifetimeGate?

    /// Help's "Pip Lifetime: yes/no" (HelpModel.appDetails).
    public static var licensedNow = false

    public let store: StoreClient
    public let backend: LifetimeBackend
    /// The open person, and everyone on this device (lowercased ids).
    public var activePerson: () -> (id: String, name: String)? = { nil }
    public var knownPeople: () -> [String] = { [] }
    /// The host app's hooks: the person was just linked to the relay;
    /// a refund / failed-payment line to say; the plan changed.
    public var onLinked: () -> Void = {}
    public var onToast: (String) -> Void = { _ in }
    public var onChanged: () -> Void = {}

    private var listener: Task<Void, Never>?
    private var inFlight = Set<String>()
    private var productID: String?

    public init(store: StoreClient, backend: LifetimeBackend) {
        self.store = store
        self.backend = backend
    }

    // MARK: launch

    /// Start listening for transactions at launch and re-deliver anything
    /// Apple still holds as unfinished. Idempotent.
    public func start() {
        guard listener == nil else { return }
        let updates = store.updates()
        listener = Task { [weak self] in
            for await t in updates { await self?.deliver(t) }
        }
        Task { [weak self] in await self?.sweepUnfinished() }
    }

    public func stop() { listener?.cancel(); listener = nil }

    public func sweepUnfinished() async {
        for t in await store.unfinished() { await deliver(t) }
    }

    private func pid() async -> String {
        if let productID { return productID }
        let id = await backend.productId()
        productID = id
        return id
    }

    // MARK: reading the plan (the Worker's answer, never ours)

    /// The open person's plan from the Worker, the price from the store.
    public func refresh() async {
        guard let p = activePerson() else { return }
        let ev = await backend.sync(personId: p.id)
        await apply(ev.status, person: p, linked: ev.newlyLinked == true)
        if price == nil, let prod = await store.product(id: await pid()) { price = prod.displayPrice }
    }

    private func apply(_ s: LifetimeStatus?, person: (id: String, name: String), linked: Bool = false) async {
        if linked { onLinked() }
        guard let s else { return }
        let changed = s.licensed != licensed
        licensed = s.licensed
        Self.licensedNow = s.licensed
        endsAt = s.endsAt
        page = await backend.page(name: person.name, status: s)
        if let line = s.issueText { issueLine = line; onToast(line) } else if s.licensed { issueLine = nil }
        if changed { onChanged() }
    }

    // MARK: buying (PU-4) - always behind the parent gate (PU-10)

    public func requestBuy() { gate = .buy }
    public func requestRestore() { gate = .restore }

    /// The gate was passed.
    public func gatePassed() {
        let g = gate
        gate = nil
        Task { [weak self] in
            switch g {
            case .buy: await self?.buy()
            case .restore: await self?.restore()
            case nil: break
            }
        }
    }

    public func buy() async {
        guard !busy, let p = activePerson(), let token = UUID(uuidString: p.id) else { return }
        busy = true; message = nil
        defer { busy = false }
        switch await store.purchase(id: await pid(), accountToken: token) {
        case .success(let t): await deliver(t)
        case .pending: message = "Waiting for approval. Pip Lifetime turns on as soon as it comes through."
        case .cancelled: break
        case .failed(let why): message = why
        }
    }

    /// PU-6. Apple does not restore consumables, so this does three honest
    /// things: ask the App Store to re-sync, hand the Worker anything still
    /// unfinished, and re-read what the Worker says.
    public func restore() async {
        guard !busy, let p = activePerson() else { return }
        busy = true; message = nil
        defer { busy = false }
        // AppStore.sync can wait on an Apple ID prompt; never wait forever.
        let store = self.store
        await withTaskGroup(of: Void.self) { g in
            g.addTask { try? await store.sync() }
            g.addTask { try? await Task.sleep(for: .seconds(8)) }
            await g.next()
            g.cancelAll()
        }
        await sweepUnfinished()
        await refresh()
        message = licensed
            ? "Pip Lifetime is on for \(p.name.isEmpty ? "this person" : p.name)."
            : "Nothing to restore here. Pip Lifetime stays with the person it was bought for: link this iPad in Team & devices, or use their QR card."
    }

    /// PU-5.
    public func useCode(_ code: String) async {
        guard let p = activePerson(), !code.trimmingCharacters(in: .whitespaces).isEmpty else { return }
        busy = true; codeMessage = nil
        defer { busy = false }
        let ev = await backend.redeemCode(personId: p.id, code: code)
        await apply(ev.status, person: p, linked: ev.newlyLinked == true)
        codeMessage = ev.message ?? (ev.ok == true ? nil : "That code didn't work. Check it and try again.")
    }

    // MARK: delivering a transaction to the Worker

    /// Hand one transaction to the Worker; finish it only if the Worker
    /// confirmed (or says it is already refunded - nothing left to grant).
    public func deliver(_ t: StoreTxn) async {
        guard t.productID == (await pid()) else { return }
        // Not one of this device's people: leave it for the device it belongs to.
        guard let token = t.accountToken, knownPeople().contains(token) else { return }
        guard inFlight.insert(t.originalID).inserted else { return }
        defer { inFlight.remove(t.originalID) }
        let ev = await backend.redeem(personId: token, jws: t.jws)
        let person = activePerson().flatMap { $0.id.lowercased() == token ? $0 : nil }
        if let person { await apply(ev.status, person: person, linked: ev.newlyLinked == true) }
        if ev.ok == true || (ev.permanent == true && ev.httpStatus == 410) {
            await t.finish()
            if ev.ok == true, let person {
                message = "Pip Lifetime is on for \(person.name.isEmpty ? "this person" : person.name)."
            }
        } else if ev.permanent == true {
            message = "Pip couldn't add this purchase. Nothing more was charged. Write to us from Help and we'll sort it out."
        } else {
            message = "Pip couldn't reach the internet. Your purchase is safe and finishes when you're back online."
        }
    }
}

