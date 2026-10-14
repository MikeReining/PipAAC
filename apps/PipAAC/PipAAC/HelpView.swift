//
//  HelpView.swift
//  PipAAC
//
//  Settings -> Help (phase 044 E5; web: board/help-ui.js, phase 042).
//  Answers, topics, search and Write to us, all from the shared core
//  (PIPCORE.help): the words are the web's, the index is bundled so Help
//  works offline, and search runs on the device first, then by meaning
//  when online (GET /api/v1/help/search - the same request the web
//  makes). A "Show me" link names a Settings row by route id; Settings
//  scrolls to it (SettingsView.show). Views render, they never re-derive.
//

import Combine
import Network
import SwiftUI
import UIKit

// MARK: - Render models (scripts/ios/app_help.mjs)

nonisolated struct HelpLoaded: Decodable, Sendable { let version: String; let answers: Int }
nonisolated struct HelpAnswer: Decodable, Sendable, Identifiable {
    let id: String
    let q: String
    let paras: [String]
    let route: String?
}
nonisolated struct HelpTopic: Decodable, Sendable, Identifiable {
    let id: String
    let title: String
    let intro: String?
    let count: Int
    let answers: [HelpAnswer]
}
nonisolated struct HelpHome: Decodable, Sendable {
    let start: [HelpAnswer]
    let topics: [HelpTopic]
}
nonisolated struct HelpHit: Decodable, Sendable, Identifiable {
    let kind: String
    let open: Bool?
    let answer: HelpAnswer?
    let label: String?
    let `where`: String?
    let route: String?
    var id: String { answer.map { "a:\($0.id)" } ?? "s:\(route ?? "")\(label ?? "")" }
}
nonisolated struct HelpSearchResult: Decodable, Sendable {
    let hits: [HelpHit]
    let none: Bool
    let noneText: String
    let prefill: String
}
nonisolated struct HelpWriteCopy: Decodable, Sendable {
    let title: String
    let hint: String
    let messagePlaceholder: String
    let emailPlaceholder: String
    let details: String
}

// MARK: - Network (stubbable: UI tests never reach production)

/// UI-test stub for the Worker: `-pipUITestHelpStub <dir>` answers
/// /api/v1/help/search with a canned meaning hit and records the request
/// URL, and /api/v1/help/write by recording the body it received. Nothing
/// leaves the process.
nonisolated final class HelpStubProtocol: URLProtocol, @unchecked Sendable {
    nonisolated(unsafe) static var dir = ""
    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func stopLoading() {}
    override func startLoading() {
        let url = request.url!
        var body: Data?
        if url.path == "/api/v1/help/write" {
            let data = request.httpBody ?? request.httpBodyStream.map(Self.drain) ?? Data()
            try? data.write(to: URL(fileURLWithPath: Self.dir + "/write-body.json"))
            body = Data(#"{"ok":true,"sent":false}"#.utf8)
        } else if url.path == "/api/v1/help/search" {
            try? url.absoluteString.write(toFile: Self.dir + "/search-url.txt",
                                          atomically: true, encoding: .utf8)
            let version = (PipAssets.url("help.en.json")
                .flatMap { try? Data(contentsOf: $0) }
                .flatMap { try? JSONSerialization.jsonObject(with: $0) as? [String: Any] })?["version"] ?? ""
            let q = URLComponents(url: url, resolvingAgainstBaseURL: false)?
                .queryItems?.first { $0.name == "q" }?.value ?? ""
            // Pretend the model matched "emotions" to the feelings answer.
            let hits: [[String: Any]] = q.lowercased().contains("emotion")
                ? [["id": "a:feelings", "score": 0.9]] : []
            body = try? JSONSerialization.data(withJSONObject: ["version": version, "hits": hits])
        }
        let resp = HTTPURLResponse(url: url, statusCode: body == nil ? 404 : 200,
                                   httpVersion: nil, headerFields: ["content-type": "application/json"])!
        client?.urlProtocol(self, didReceive: resp, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: body ?? Data())
        client?.urlProtocolDidFinishLoading(self)
    }
    private static func drain(_ s: InputStream) -> Data {
        s.open(); defer { s.close() }
        var out = Data(); var buf = [UInt8](repeating: 0, count: 4096)
        while s.hasBytesAvailable {
            let n = s.read(&buf, maxLength: buf.count)
            if n <= 0 { break }
            out.append(buf, count: n)
        }
        return out
    }
}

nonisolated struct HelpNet: Sendable {
    let base: String
    let session: URLSession

    static func make() -> HelpNet {
        let args = ProcessInfo.processInfo.arguments
        let cfg = URLSessionConfiguration.ephemeral
        cfg.timeoutIntervalForRequest = 15
        if let i = args.firstIndex(of: "-pipUITestHelpStub"), i + 1 < args.count {
            HelpStubProtocol.dir = args[i + 1]
            cfg.protocolClasses = [HelpStubProtocol.self]
        }
        return HelpNet(base: PipRelay.baseURL, session: URLSession(configuration: cfg))
    }

    func get(_ path: String) async throws -> Data {
        let (d, r) = try await session.data(from: URL(string: base + path)!)
        guard (r as? HTTPURLResponse)?.statusCode == 200 else { throw URLError(.badServerResponse) }
        return d
    }

    /// help-ui.js `post`: 5xx and 429 throw (queue it), other non-OK
    /// answers are "rejected".
    func post(_ item: Data) async throws -> Bool {
        var req = URLRequest(url: URL(string: base + "/api/v1/help/write")!)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "content-type")
        req.httpBody = item
        let (_, r) = try await session.data(for: req)
        let code = (r as? HTTPURLResponse)?.statusCode ?? 0
        if code >= 500 || code == 429 { throw URLError(.badServerResponse) }
        return (200..<300).contains(code)
    }
}

// MARK: - Model

@MainActor
final class HelpModel: ObservableObject {
    @Published private(set) var home: HelpHome?
    @Published private(set) var result: HelpSearchResult?
    @Published private(set) var loadFailed = false
    @Published private(set) var online = true
    @Published private(set) var copy: HelpWriteCopy?
    @Published private(set) var lastKind = ""
    @Published var status: String?
    @Published var sending = false

    private let core: PipCore
    private let net = HelpNet.make()
    private let monitor = NWPathMonitor()
    private var searchTask: Task<Void, Never>?
    private var loaded = false
    private static let outboxKey = "pip-help-outbox"
    static let emailKey = "pip-help-email"

    init(core: PipCore) {
        self.core = core
        let args = ProcessInfo.processInfo.arguments
        if args.contains("-pipUITestHelpOffline") {
            online = false
        } else if args.contains("-pipUITestHelpOnline") {
            online = true
        } else {
            monitor.pathUpdateHandler = { [weak self] path in
                let ok = path.status == .satisfied
                Task { @MainActor in
                    guard let self else { return }
                    let was = self.online
                    self.online = ok
                    if ok && !was { self.flush() }
                }
            }
            monitor.start(queue: DispatchQueue(label: "pip.help.net"))
        }
    }

    deinit { monitor.cancel() }

    nonisolated static func call<T: Decodable & Sendable>(
        _ core: PipCore, _ method: String, _ args: sending [Any]
    ) async throws -> T {
        try core.sync { try AppModel.decodeRaw(core.call("PIPCORE.help", method, args)) }
    }

    /// A call whose result is a string, a list or an object, read as is.
    nonisolated static func raw(_ core: PipCore, _ method: String,
                                _ args: sending [Any]) async -> Any? {
        try? core.sync { try core.call("PIPCORE.help", method, args) }
    }

    func load(childName: String) async {
        let core = self.core
        if !loaded {
            do {
                let json = try PipAssets.text("help.en.json")
                let _: HelpLoaded = try await Self.call(core, "load", [json])
                loaded = true
            } catch {
                NSLog("Help load failed: \(error)")
                loadFailed = true
                return
            }
        }
        home = try? await Self.call(core, "home", [["online": online]])
        copy = try? await Self.call(core, "writeCopy", [childName])
        flush()
    }

    /// Device pass now; meaning pass 250 ms later when online. A new
    /// query voids the last one's late answer.
    func setQuery(_ q: String) {
        searchTask?.cancel()
        let core = self.core, net = self.net
        let online = self.online
        guard !q.trimmingCharacters(in: .whitespaces).isEmpty else { result = nil; return }
        searchTask = Task { @MainActor in
            guard loaded, let local: HelpSearchResult = try? await Self.call(core, "search", [q]),
                  !Task.isCancelled else { return }
            result = local
            guard online else { return }
            guard let p = await Self.raw(core, "meaningPath", [q]) as? String else { return }
            try? await Task.sleep(for: .milliseconds(250))
            guard !Task.isCancelled,
                  let data = try? await net.get(p),
                  !Task.isCancelled,
                  let body = try? JSONSerialization.jsonObject(with: data),
                  let merged: HelpSearchResult = try? await Self.call(core, "search", [q, body]),
                  !Task.isCancelled else { return }
            result = merged
        }
    }

    // MARK: Write to us

    private var outbox: [[String: Any]] {
        get {
            (UserDefaults.standard.data(forKey: Self.outboxKey))
                .flatMap { try? JSONSerialization.jsonObject(with: $0) as? [[String: Any]] } ?? []
        }
        set {
            UserDefaults.standard.set(try? JSONSerialization.data(withJSONObject: newValue),
                                      forKey: Self.outboxKey)
        }
    }

    func appDetails() -> [String: String] {
        let info = Bundle.main.infoDictionary
        let v = info?["CFBundleShortVersionString"] as? String ?? "?"
        let b = info?["CFBundleVersion"] as? String ?? "?"
        let size = UIApplication.shared.connectedScenes
            .compactMap { ($0 as? UIWindowScene)?.screen.bounds.size }.first ?? .zero
        return [
            "Pip version": "\(v) · build \(b)",
            "Device": "iPad · iOS \(UIDevice.current.systemVersion)",
            "Screen": "\(Int(size.width))×\(Int(size.height))",
            "Online": online ? "yes" : "no",
            // Pip Lifetime is a web purchase; the app has no purchase yet.
            "Pip Lifetime": "no",
            "This device": "the user's own",
        ]
    }

    func send(message: String, email: String, includeDetails: Bool) async {
        let core = self.core, net = self.net
        let details: Any = includeDetails ? appDetails() : NSNull()
        let hasEmail = !email.trimmingCharacters(in: .whitespaces).isEmpty
        let input: [String: Any] = ["message": message, "email": email, "details": details]
        guard let item = await Self.raw(core, "writeItem", [input]) as? [String: Any],
              let data = try? JSONSerialization.data(withJSONObject: item) else { return }
        UserDefaults.standard.set(item["email"] as? String ?? "", forKey: Self.emailKey)
        sending = true
        defer { sending = false }
        var kind = "queued"
        do {
            guard online else { throw URLError(.notConnectedToInternet) }
            kind = try await net.post(data) ? "sent" : "rejected"
        } catch {
            nonisolated(unsafe) let args: [Any] = [outbox, item]
            if let box = await Self.raw(core, "outboxPush", args) as? [[String: Any]] {
                outbox = box
            }
        }
        status = await Self.raw(core, "writeStatus", [kind, hasEmail]) as? String
        lastKind = kind
    }

    func flush() {
        let box = outbox
        guard !box.isEmpty, online else { return }
        let net = self.net
        Task { @MainActor in
            var left: [[String: Any]] = []
            for item in box {
                guard let data = try? JSONSerialization.data(withJSONObject: item) else { continue }
                do { _ = try await net.post(data) } catch { left.append(item) }
            }
            outbox = left
        }
    }
}

// MARK: - Views

/// An answer: tap the question to fold it open. `onShow` carries the
/// Settings route for "Show me" (web: goTo(sec, row)).
struct HelpAnswerRow: View {
    let answer: HelpAnswer
    var open = false
    var onShow: (String) -> Void
    @State private var isOpen = false

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Button {
                isOpen.toggle()
            } label: {
                HStack(alignment: .top) {
                    Text(answer.q).font(.headline).foregroundStyle(PipStyle.ink)
                        .multilineTextAlignment(.leading)
                    Spacer()
                    Image(systemName: isOpen ? "chevron.up" : "chevron.down")
                        .foregroundStyle(PipStyle.muted)
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel(answer.q)
            .accessibilityValue(isOpen ? "expanded" : "collapsed")
            .accessibilityIdentifier("help:answer:\(answer.id)")
            if isOpen {
                ForEach(Array(answer.paras.enumerated()), id: \.offset) { i, p in
                    Text(p).foregroundStyle(PipStyle.ink)
                        .fixedSize(horizontal: false, vertical: true)
                        .accessibilityIdentifier("help:body:\(answer.id):\(i)")
                }
                if let route = answer.route {
                    Button("Show me") { onShow(route) }
                        .buttonStyle(.bordered)
                        .accessibilityIdentifier("help:show:\(answer.id)")
                }
            }
        }
        .padding(.vertical, 4)
        .onAppear { isOpen = open }
    }
}

/// Search hits: answers and the Settings rows that exist natively.
struct HelpResults: View {
    let result: HelpSearchResult
    var onShow: (String) -> Void
    var onAsk: (String) -> Void

    var body: some View {
        ForEach(result.hits) { hit in
            if hit.kind == "answer", let a = hit.answer {
                HelpAnswerRow(answer: a, open: hit.open ?? false, onShow: onShow)
            } else if let route = hit.route {
                Button {
                    onShow(route)
                } label: {
                    VStack(alignment: .leading) {
                        Text(hit.label ?? "").font(.headline).foregroundStyle(PipStyle.ink)
                        Text(hit.where ?? "").font(.callout).foregroundStyle(PipStyle.muted)
                    }
                }
                .accessibilityIdentifier("help:setting:\(route)")
            }
        }
        if result.none {
            HStack {
                Text(result.noneText).foregroundStyle(PipStyle.muted)
                Button("Ask us") { onAsk(result.prefill) }
                    .accessibilityIdentifier("help:ask")
            }
        }
    }
}

struct HelpView: View {
    @EnvironmentObject var app: AppModel
    @ObservedObject var help: HelpModel
    /// Settings pops back to its row (SettingsView.show).
    var onShow: (String) -> Void

    @State private var query = ""
    @State private var message = ""
    @State private var email = UserDefaults.standard.string(forKey: HelpModel.emailKey) ?? ""
    @State private var details = true
    @State private var openTopic: String?
    @State private var gate = false
    @FocusState private var messageFocused: Bool

    private var searching: Bool { !query.trimmingCharacters(in: .whitespaces).isEmpty }

    var body: some View {
        ScrollViewReader { proxy in
            Form {
                Section {
                    TextField("Ask in your own words: feelings, bigger buttons, teacher…",
                              text: $query)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .submitLabel(.search)
                        .accessibilityLabel("Ask a question")
                        .accessibilityIdentifier("help:q")
                        .onChange(of: query) { _, q in help.setQuery(q) }
                }
                if searching {
                    Section {
                        if let r = help.result {
                            HelpResults(result: r, onShow: onShow) { prefill in
                                query = ""
                                if message.trimmingCharacters(in: .whitespaces).isEmpty {
                                    message = prefill
                                }
                                withAnimation { proxy.scrollTo("write", anchor: .center) }
                                messageFocused = true
                            }
                        }
                    }
                } else if let h = help.home {
                    Section("Start here") {
                        ForEach(h.start) { HelpAnswerRow(answer: $0, onShow: onShow) }
                    }
                    Section {
                        ForEach(h.topics) { t in
                            VStack(alignment: .leading) {
                                Button {
                                    openTopic = openTopic == t.id ? nil : t.id
                                } label: {
                                    HStack {
                                        Text(t.title).font(.headline).foregroundStyle(PipStyle.ink)
                                        Spacer()
                                        Text("\(t.count)").foregroundStyle(PipStyle.muted)
                                    }
                                    .contentShape(Rectangle())
                                }
                                .buttonStyle(.plain)
                                .accessibilityLabel(t.title)
                                .accessibilityIdentifier("help:topic:\(t.id)")
                                if openTopic == t.id {
                                    if let intro = t.intro {
                                        Text(intro).font(.callout).foregroundStyle(PipStyle.muted)
                                    }
                                    ForEach(t.answers) { HelpAnswerRow(answer: $0, onShow: onShow) }
                                }
                            }
                        }
                    }
                } else if help.loadFailed {
                    Text("Help is not available on this iPad.").foregroundStyle(PipStyle.muted)
                }
                write.id("write")
                if !searching {
                    Section("More help") {
                        // The only outside link in Help: behind the parent gate.
                        Button("hello@pipaac.org") { gate = true }
                            .accessibilityIdentifier("help:mail")
                    }
                }
            }
        }
        .navigationTitle("Help")
        .navigationBarTitleDisplayMode(.inline)
        .task { await help.load(childName: app.activeName == "this person" ? "" : app.activeName) }
        .parentGate(isPresented: $gate,
                    reason: "This opens your email app to write to hello@pipaac.org.") {
            if let url = URL(string: "mailto:hello@pipaac.org") { UIApplication.shared.open(url) }
        }
    }

    @ViewBuilder private var write: some View {
        let c = help.copy
        Section(c?.title ?? "Write to us") {
            Text(c?.hint ?? "").foregroundStyle(PipStyle.muted)
            TextField(c?.messagePlaceholder ?? "", text: $message, axis: .vertical)
                .lineLimit(4...10)
                .focused($messageFocused)
                .accessibilityLabel("Your message")
                .accessibilityIdentifier("help:msg")
            TextField(c?.emailPlaceholder ?? "", text: $email)
                .keyboardType(.emailAddress)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .accessibilityLabel("Your email")
                .accessibilityIdentifier("help:email")
            Toggle(c?.details.trimmingCharacters(in: .whitespaces) ?? "", isOn: $details)
                .accessibilityIdentifier("help:details")
            Button("Send") {
                let m = message, e = email, d = details
                Task {
                    await help.send(message: m, email: e, includeDetails: d)
                    if help.lastKind != "rejected" && help.lastKind != "" { message = "" }
                }
            }
            .disabled(help.sending)
            .accessibilityIdentifier("help:send")
            if let s = help.status {
                Text(s).foregroundStyle(PipStyle.muted)
                    .accessibilityIdentifier("help:status")
            }
        }
    }
}
