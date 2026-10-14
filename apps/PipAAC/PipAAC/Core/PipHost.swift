//
//  PipHost.swift
//  PipAAC
//
//  Swift's half of the sync loop (phase 044 C2; Platforms_iOS_And_Web § 2
//  "The sync loop runs in the core; Swift supplies its I/O"). The web's
//  sync.mjs / rotation.mjs / sync_client.mjs run UNCHANGED inside the
//  core's JSContext; everything they need from a browser arrives here as
//  `__pipHost` functions that scripts/ios/jsc_shims.mjs and
//  scripts/ios/host/*.mjs call.
//
//  CONCURRENCY RULE (the whole design): JavaScriptCore is touched ONLY on
//  PipCore's serial queue. A host function runs on that queue (JS called
//  it), starts work, and returns. When the work finishes — on whatever
//  thread URLSession, a socket, a timer or the keychain used — the
//  completion calls `core.post { ctx in … }` (queue.async), which is the
//  one place JS is re-entered:
//      __pipSettle(id, ok, json)   resolves/rejects a hostCall promise
//      __pipFire(id)               a timer elapsed
//      __pipWsEvent(id, type, …)   socket open/message/error/close
//      __pipPlatformEvent(kind)    "online" | "visible"
//  Swift never retains a JSValue: the promise's resolve/reject live in
//  JS's `pending` table, keyed by id, and are dropped when settled or
//  aborted, so a late completion for an aborted call is a no-op in JS.
//  Never `queue.sync` from a completion; every JS touch asserts the queue.
//
//  Ownership of `__pipHost` functions (installed by `install(into:)`):
//    call(op, id, argsJSON)  PipHost.dispatch  -> PipHostCrypto (crypto,
//                            keystore, blobs, saveUser) / PipHostNet (fetch)
//    cancel(id)              PipHostNet   aborts an in-flight fetch
//    timerStart/timerCancel  PipHostNet   queue.asyncAfter work items
//    wsOpen/wsSend/wsClose   PipHostNet   URLSessionWebSocketTask
//    emit(name, json)        PipHost      facade events -> `onEvent`
//    baseURL                 PipHost      string property, location.origin
//  (dbExec/dbRun/dbAll/randomUUID/randomBytes/log stay PipCore's.)
//

import CryptoKit
import Foundation
import JavaScriptCore
import Network
import os.log

public nonisolated struct PipHostError: Error, CustomStringConvertible {
    public let description: String
    public init(_ d: String) { description = d }
}

public nonisolated final class PipHost: @unchecked Sendable {
    public struct Config: @unchecked Sendable {
        /// location.origin for the core — the relay base. The web serves
        /// itself from app.pipaac.org, so its sync_client calls land there.
        public var baseURL: String
        /// Keychain service for key material (tests use a unique one).
        public var keychainService: String
        /// Persistent media bytes, by sha. Never a cache directory.
        public var blobDirectory: URL
        /// Cache Storage replacement (044 D4): the voice clients' named
        /// caches as files - sentence and tile clips, kept so a repeat
        /// plays offline. Follows `-PipDataDir` like the people files.
        public var cacheDirectory: URL
        /// URLSession configuration for fetch (tests install a
        /// URLProtocol stub through it).
        public var sessionConfiguration: URLSessionConfiguration

        public init(baseURL: String = "https://app.pipaac.org",
                    keychainService: String = PipKeychain.defaultService,
                    blobDirectory: URL = PipHost.defaultBlobDirectory(),
                    cacheDirectory: URL = PipHost.defaultCacheDirectory(),
                    sessionConfiguration: URLSessionConfiguration = PipHost.defaultSessionConfiguration()) {
            self.baseURL = baseURL
            self.keychainService = keychainService
            self.blobDirectory = blobDirectory
            self.cacheDirectory = cacheDirectory
            self.sessionConfiguration = sessionConfiguration
        }
    }

    // Immutable after init — safe to read from any thread.
    let config: Config
    let log = Logger(subsystem: "org.pipaac", category: "piphost")
    let onEvent: @Sendable (_ name: String, _ json: String) -> Void
    let onSaveUser: @Sendable (_ userId: String, _ patchJSON: String) throws -> Void
    weak var core: PipCore?
    let session: URLSession
    let wsSession: URLSession
    let wsDelegate = PipWSDelegate()

    // Queue-only state (touched solely on core.jsQueue).
    var keys: [String: KeyBox] = [:]
    var timers: [Int: DispatchWorkItem] = [:]
    var tasks: [Int: URLSessionTask] = [:]
    var sockets: [Int: URLSessionWebSocketTask] = [:]
    var pathMonitor: NWPathMonitor?

    /// - Parameters:
    ///   - onEvent: facade events from `PIPCORE.sync` ("sync.started",
    ///     "sync.applied" -> repaint, "sync.model"). Runs ON the core
    ///     queue: hop to the main actor before touching UI state.
    ///   - onSaveUser: persists the registry row's `sync` patch (the D1
    ///     slice owns the registry file). Runs on the core queue; a throw
    ///     rejects the JS save, so the loop reports it instead of
    ///     advancing a cursor nothing stored.
    public init(core: PipCore,
                config: Config = Config(),
                onEvent: @escaping @Sendable (String, String) -> Void = { _, _ in },
                onSaveUser: @escaping @Sendable (String, String) throws -> Void = { _, _ in }) {
        self.core = core
        self.config = config
        self.onEvent = onEvent
        self.onSaveUser = onSaveUser
        self.session = URLSession(configuration: config.sessionConfiguration)
        let wsConfig = URLSessionConfiguration.default
        wsConfig.waitsForConnectivity = false
        self.wsSession = URLSession(configuration: wsConfig, delegate: wsDelegate, delegateQueue: nil)
        wsDelegate.host = self
        try? FileManager.default.createDirectory(at: config.blobDirectory, withIntermediateDirectories: true)
    }

    public static func defaultBlobDirectory() -> URL {
        // `-PipDataDir <path>` (UI tests read what they assert on from there).
        if let o = UserDefaults.standard.string(forKey: "PipDataDir") {
            return URL(fileURLWithPath: o, isDirectory: true).appendingPathComponent("blobs", isDirectory: true)
        }
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        return base.appendingPathComponent("PipAAC/blobs", isDirectory: true)
    }

    public static func defaultCacheDirectory() -> URL {
        let base = (try? PipAssets.dataBase())
            ?? FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        return base.appendingPathComponent("VoiceCache", isDirectory: true)
    }

    public static func defaultSessionConfiguration() -> URLSessionConfiguration {
        let c = URLSessionConfiguration.default
        c.urlCache = nil
        c.requestCachePolicy = .reloadIgnoringLocalCacheData
        c.waitsForConnectivity = false
        // The OS backstop only; timedFetch's deadline is the product bound.
        c.timeoutIntervalForRequest = 120
        return c
    }

    // MARK: - Lifecycle signals (any thread)

    /// The network came back (NWPathMonitor) — the loop's `wakeup`.
    public func notifyOnline() { fire("online") }
    /// The scene became active.
    public func notifyVisible() { fire("visible") }

    private func fire(_ kind: String) {
        core?.post { [self] ctx in
            call(ctx, "__pipPlatformEvent", [kind])
        }
    }

    /// Starts an NWPathMonitor that reports each unsatisfied -> satisfied
    /// transition. Idempotent. Call on the core queue or before use.
    public func startNetworkMonitor() {
        core?.jsQueue.async { [self] in
            guard pathMonitor == nil else { return }
            let m = NWPathMonitor()
            let box = OSAllocatedUnfairLock(initialState: false)
            m.pathUpdateHandler = { [weak self] path in
                let up = path.status == .satisfied
                let wasUp = box.withLock { s -> Bool in let o = s; s = up; return o }
                if up && !wasUp { self?.notifyOnline() }
            }
            m.start(queue: DispatchQueue(label: "org.pipaac.netmon"))
            pathMonitor = m
        }
    }

    // MARK: - JS re-entry (queue-only)

    /// Calls a global JS function. Queue-only; clears nothing silently —
    /// the context's exceptionHandler already logs.
    func call(_ ctx: JSContext, _ name: String, _ args: [Any]) {
        if let q = core?.jsQueue { dispatchPrecondition(condition: .onQueue(q)) }
        // Before the bundle is evaluated the function does not exist yet (an
        // early scene-active signal): skip rather than raise a TypeError.
        guard let fn = ctx.objectForKeyedSubscript(name), fn.isObject else { return }
        fn.call(withArguments: args)
    }

    /// Settles hostCall `id`. Callable from any thread: the JS touch is
    /// a queue.async hop. `json` of nil settles with `undefined`.
    func settle(_ id: Int, _ result: Result<String, Error>) {
        core?.post { [self] ctx in
            tasks[id] = nil
            switch result {
            case .success(let json): call(ctx, "__pipSettle", [id, true, json])
            case .failure(let e): call(ctx, "__pipSettle", [id, false, "\(e)"])
            }
        }
    }

    static func encode(_ value: Any?) throws -> String {
        guard let value else { return "" }
        let data = try JSONSerialization.data(withJSONObject: value, options: [.fragmentsAllowed])
        return String(decoding: data, as: UTF8.self)
    }

    // MARK: - Install (queue-only)

    func install(into ctx: JSContext) {
        if let q = core?.jsQueue { dispatchPrecondition(condition: .onQueue(q)) }
        guard let host = ctx.objectForKeyedSubscript("__pipHost") else { return }
        host.setValue(config.baseURL, forProperty: "baseURL")

        host.setValue({ [weak self] (op: String, id: Int32, args: String) in
            self?.dispatch(op, Int(id), args)
        } as @convention(block) (String, Int32, String) -> Void, forProperty: "call")

        host.setValue({ [weak self] (id: Int32) in
            self?.cancelFetch(Int(id))
        } as @convention(block) (Int32) -> Void, forProperty: "cancel")

        host.setValue({ [weak self] (id: Int32, ms: Double) in
            self?.timerStart(Int(id), ms)
        } as @convention(block) (Int32, Double) -> Void, forProperty: "timerStart")

        host.setValue({ [weak self] (id: Int32) in
            self?.timerCancel(Int(id))
        } as @convention(block) (Int32) -> Void, forProperty: "timerCancel")

        host.setValue({ [weak self] (id: Int32, url: String) in
            self?.wsOpen(Int(id), url)
        } as @convention(block) (Int32, String) -> Void, forProperty: "wsOpen")

        host.setValue({ [weak self] (id: Int32, text: String) in
            self?.wsSend(Int(id), text)
        } as @convention(block) (Int32, String) -> Void, forProperty: "wsSend")

        host.setValue({ [weak self] (id: Int32) in
            self?.wsClose(Int(id))
        } as @convention(block) (Int32) -> Void, forProperty: "wsClose")

        host.setValue({ [weak self] (name: String, json: String) in
            guard let self else { return }
            self.onEvent(name, json)
        } as @convention(block) (String, String) -> Void, forProperty: "emit")
    }

    // MARK: - hostCall dispatch (queue-only)

    func dispatch(_ op: String, _ id: Int, _ argsJSON: String) {
        if let q = core?.jsQueue { dispatchPrecondition(condition: .onQueue(q)) }
        guard let args = (try? JSONSerialization.jsonObject(with: Data(argsJSON.utf8))) as? [String: Any] else {
            settle(id, .failure(PipHostError("\(op): bad arguments")))
            return
        }
        if op == "fetch" { startFetch(id, args); return }
        do { settle(id, .success(try Self.encode(try run(op, args)))) }
        catch { settle(id, .failure(error)) }
    }
}
