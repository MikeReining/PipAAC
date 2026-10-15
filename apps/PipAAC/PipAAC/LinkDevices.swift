//
//  LinkDevices.swift
//  PipAAC
//
//  Linking this iPad with another device and keeping them in step
//  (phase 044 C3; SY-2, SY-3, SY-4, SY-15). The protocol is the web's,
//  running in the core: PIPCORE.pair (scripts/ios/app_pair.mjs) wraps
//  pairClient / wrapUserKey / unwrapUserKey; PIPCORE.sync starts the web's
//  sync loop. Swift owns only what a browser would: the people registry
//  row, the network monitor, the scene signal, and the screens.
//  Copy is public/board/devices-ui.js and index.html "Team & devices".
//

import Combine
import Foundation
import SwiftUI

// MARK: - Relay base

nonisolated enum PipRelay {
    /// Production by default; `-PipBaseURL <url>` is for tests only.
    static var baseURL: String {
        if let o = UserDefaults.standard.string(forKey: "PipBaseURL") { return o }
        // A hermetic UI run (reset / private data dir) with no stub base URL
        // must never reach production: a loopback port that refuses at once.
        // The core then takes its honest offline path.
        if UITestHooks.hermetic { return "http://127.0.0.1:9" }
        return "https://app.pipaac.org"
    }
    /// devices-ui.js deviceName(): "iPad · Safari" -> the app is no browser.
    static let deviceLabel = "iPad · Pip"
}

// MARK: - Sheet state

/// What the "Add a device" sheet shows (devices-ui.js offerFlow).
struct OfferSheetState: Equatable {
    var title = "Add a device"
    var lines: [String] = []
    var code: String?            // "ABCD 2345"
    var done = false
    var canRetry = false
}

/// What the "Join with a code" sheet shows (devices-ui.js joinFlow).
struct JoinSheetState: Equatable {
    var status = ""
    var busy = false
}

private nonisolated struct HostEvent: Decodable {
    var stage: String?
    var code: String?
    var shown: String?
    var who: String?
    var hint: String?
    var waiting: String?
    var lines: [String]?
    var message: String?
    var userId: String?
    var epoch: Double?
    var status: Int?
    var sha: String?
}

// MARK: - AppModel: sync + pairing

extension AppModel {
    /// Wires the host (timers, fetch, sockets, crypto, keychain) into the
    /// core. Called once at boot, BEFORE pip-core.js is evaluated.
    func installHost(registry reg: PeopleRegistry) throws {
        let host = PipHost(
            core: core,
            config: .init(baseURL: PipRelay.baseURL),
            onEvent: { [weak self] name, json in
                Task { @MainActor in self?.handleHostEvent(name, json) }
            },
            onSaveUser: { userId, patchJSON in
                // Runs on the core queue; the throw rejects the JS save so the
                // loop never advances a cursor nothing stored.
                guard let obj = try JSONSerialization.jsonObject(
                        with: Data(patchJSON.utf8)) as? [String: Any]
                else { throw PipHostError("saveUser: bad patch") }
                try reg.patch(userId, obj)
                Task { @MainActor [weak self] in try? self?.refreshPeople() }
            },
            onRegistry: { op, argsJSON in
                try Self.registryVerb(reg, op, argsJSON)
            },
            passkeys: { op, req in try await PasskeyCeremony.shared.run(op, req) })
        flow.model = self
        team.model = self
        try core.sync { try core.install(host) }
        self.host = host
        host.startNetworkMonitor()
    }

    /// The registry verbs the account facade's userStore calls (044 C5):
    /// users.mjs rows in, users.mjs rows out. Runs on the core queue.
    nonisolated static func registryVerb(_ reg: PeopleRegistry, _ op: String, _ argsJSON: String) throws -> String {
        let args = (try JSONSerialization.jsonObject(with: Data(argsJSON.utf8))) as? [String: Any] ?? [:]
        let enc = JSONEncoder()
        func json<T: Encodable>(_ v: T) throws -> String { String(decoding: try enc.encode(v), as: UTF8.self) }
        switch op {
        case "registry.list": return try json(try reg.list())
        case "registry.get":
            guard let id = args["id"] as? String, let r = try reg.list().first(where: { $0.id == id }) else { return "null" }
            return try json(r)
        case "registry.addImported":
            guard let id = args["id"] as? String else { throw PipHostError("registry.addImported: no id") }
            var sync: [String: JSONValue]?
            if case .object(let o) = JSONValue.from(args["sync"]) { sync = o }
            _ = try reg.addImported(id: id, name: args["name"] as? String ?? "",
                                    photo: args["photo"] as? String, sync: sync, role: args["role"] as? String)
            return ""
        default: throw PipHostError("unknown registry op \(op)")
        }
    }

    /// scenePhase became active (web: visibilitychange).
    func sceneBecameActive() {
        host?.notifyVisible()
        // A refund or a purchase made elsewhere shows up on the next read.
        if activeId != nil { Task { await lifetime.refresh(); await lifetime.sweepUnfinished() } }
    }

    // MARK: events

    func handleHostEvent(_ name: String, _ json: String) {
        let ev = try? JSONDecoder().decode(HostEvent.self, from: Data(json.utf8))
        switch name {
        case "sync.stopped":
            let ws = stopWaiters
            stopWaiters = []
            for w in ws { w.resume() }
        case "media.ready":
            // A photo or recording just landed on disk and passed its hash.
            if syncingId != nil, syncingId == activeId { repaintFromCore() }
        case "media.state":
            if let m = try? JSONDecoder().decode(MediaState.self, from: Data(json.utf8)) { mediaState = m }
        case "sync.applied":
            if syncingId != nil, syncingId == activeId { repaintFromCore() }
        case "sync.started":
            // A start that threw leaves the loop free to try again.
            if ev?.stage == nil, json.contains("\"ok\":false") { syncingId = nil }
        case "spot.changed", "spot.speak": handleSpotEvent(name, json)
        case "say": handleSay(json)
        case "pic": handlePic(json)
        case "purchase": lifetimeBackend.handle(json)
        case "pair.offer": if let ev { offerEvent(ev) }
        case "pair.join": if let ev { joinEvent(ev) }
        case "account.link", "account.landing", "recovery.linked", "recovery.card", "recovery.restore":
            flow.handle(name, json)
        case "team.state", "team.toast", "team.account", "team.myname", "team.deleted":
            team.handle(name, json)
        default: break
        }
    }

    // MARK: sync

    /// End the running loop and wait until it has (the person's db handle
    /// may close after). sync.mjs stopSync: socket closed, timers cancelled,
    /// pending ops stay pending for the next start. Bounded: a core that
    /// never answers cannot wedge a person switch.
    func stopSyncLoop() async {
        guard syncingId != nil else { return }
        let core = self.core
        await withCheckedContinuation { (c: CheckedContinuation<Void, Never>) in
            stopWaiters.append(c)
            core.enqueue { _ = try? core.call("PIPCORE.sync", "syncStop", ["{}"]) }
            Task { @MainActor [weak self] in
                try? await Task.sleep(for: .seconds(10))
                guard let self, !self.stopWaiters.isEmpty else { return }
                let ws = self.stopWaiters
                self.stopWaiters = []
                for w in ws { w.resume() }
            }
        }
        syncingId = nil
        mediaState = MediaState()
    }

    /// Start the web's loop for the open person when they are linked.
    /// One loop at a time (sync.mjs `running`); switching people ends the
    /// old one first (stopSyncLoop) and starts this person's.
    func startSyncIfLinked() {
        guard syncingId == nil, let id = activeId, let registry,
              let row = try? registry.list().first(where: { $0.id == id }),
              row.syncUserId != nil,
              let json = try? registry.rowJSON(id) else { return }
        syncingId = id
        syncDbId = dbId
        let appId = self.appId, core = self.core, base = PipRelay.baseURL
        core.enqueue {
            _ = try? core.call("PIPCORE.sync", "syncStart", [appId, json, base, "{}"])
        }
    }

    /// Ops landed from another device: the core re-reads what they feed.
    func repaintFromCore() {
        let appId = self.appId, core = self.core
        Task { @MainActor [weak self] in
            guard let self else { return }
            do {
                let st: PaintedState = try await Self.coreCall(core, "appRepaint", [appId])
                guard appId == self.appId else { return }
                apply(st)
                switch surface {
                case .group: if let gp = groupPage { openGroup(gp.groupId, page: gp.page) }
                case .index: openGroups()
                default: break
                }
            } catch { NSLog("appRepaint failed: \(error)") }
        }
    }

    var activeIsLinked: Bool {
        people.first(where: { $0.id == activeId })?.syncUserId != nil
    }

    // MARK: offer a code (devices-ui.js offerFlow)

    func startOffer() {
        guard let id = activeId, let registry, let json = try? registry.rowJSON(id) else { return }
        offerSheet = OfferSheetState(lines: ["Getting a code…"])
        let core = self.core
        core.enqueue {
            _ = try? core.call("PIPCORE.pair", "offer",
                               [PipRelay.baseURL, json, PipRelay.deviceLabel])
        }
    }

    func endOffer() {
        offerSheet = nil
        let core = self.core
        core.enqueue { _ = try? core.call("PIPCORE.pair", "offerCancel", []) }
    }

    private func offerEvent(_ ev: HostEvent) {
        guard offerSheet != nil else { return }
        switch ev.stage {
        case "linked":
            // The relay user exists now: this person syncs (web: initSync).
            try? refreshPeople()
            startSyncIfLinked()
        case "code":
            offerSheet = OfferSheetState(
                title: "Open \(ev.who ?? "this board") on another device",
                lines: [ev.hint, ev.waiting].compactMap { $0 },
                code: ev.shown)
        case "done":
            offerSheet = OfferSheetState(lines: [], done: true)
            offerSheet?.lines = [ev.message ?? ""]
        case "refused":
            offerSheet = OfferSheetState(lines: ev.lines ?? [ev.message ?? ""])
        case "expired":
            offerSheet = OfferSheetState(lines: [ev.message ?? "This code ran out."], canRetry: true)
        default: // error
            offerSheet = OfferSheetState(lines: [ev.message ?? "Could not reach Pip."])
        }
    }

    // MARK: type a code (devices-ui.js joinFlow)

    func startJoin(code: String, role: String) {
        joinRole = role
        joinSheet = JoinSheetState(status: "Connecting…", busy: true)
        let core = self.core
        core.enqueue {
            _ = try? core.call("PIPCORE.pair", "join", [PipRelay.baseURL, code, PipRelay.deviceLabel])
        }
    }

    func endJoin() {
        joinSheet = nil
        let core = self.core
        core.enqueue { _ = try? core.call("PIPCORE.pair", "joinCancel", []) }
    }

    private func joinEvent(_ ev: HostEvent) {
        guard joinSheet != nil else { return }
        switch ev.stage {
        case "claimed":
            joinSheet = JoinSheetState(status: ev.message ?? "", busy: true)
        case "granted":
            guard let uid = ev.userId else { return }
            joinSheet = JoinSheetState(status: "Joined — opening the board…", busy: true)
            finishJoin(userId: uid, epoch: ev.epoch ?? 1)
        default: // refused / error: the code can be tried again
            joinSheet = JoinSheetState(status: ev.message ?? "Could not reach Pip.", busy: false)
        }
    }

    /// waitForGrant's tail: the linked person joins the registry (the
    /// relay id is the registry id) and opens; a fresh device's untouched
    /// placeholder is replaced, not kept beside them.
    private func finishJoin(userId: String, epoch: Double) {
        Task { @MainActor in
            do {
                guard let registry else { return }
                try refreshPeople()
                let placeholder = people.first { $0.id == activeId && $0.needsSetup && $0.id != userId }
                try registry.addLinked(
                    id: userId,
                    sync: ["userId": .string(userId), "epoch": .number(epoch), "cursor": .number(0)],
                    role: joinRole == "supporter" ? "partner" : "board",
                    home: placeholder != nil)
                try refreshPeople()
                try await open(userId)
                if let p = placeholder { try? registry.remove(p.id); try refreshPeople() }
                joinSheet = nil
            } catch {
                joinSheet = JoinSheetState(status: "Could not join: \(error)", busy: false)
            }
        }
    }
}

// MARK: - Screens

/// Settings -> "Team & devices" (index.html data-sec="team").
struct TeamDevicesView: View {
    @EnvironmentObject var model: AppModel
    @ObservedObject private var team: TeamFlow
    private let tick = Timer.publish(every: 3, on: .main, in: .common).autoconnect()

    init(team: TeamFlow) { _team = ObservedObject(wrappedValue: team) }

    var body: some View {
        Form {
            Section {
                Text("Everyone who helps \(model.activeName), and every device the board is on.")
                    .foregroundStyle(PipStyle.muted)
                Button("Join with a code") { model.joinSheet = JoinSheetState() }
                    .accessibilityIdentifier("team:join")
                Text("Each person keeps their own words, groups, and sync. Switching opens that person; the others keep everything they had.")
                    .font(.footnote).foregroundStyle(PipStyle.muted)
            }
            Section("Devices") {
                Text(model.activeIsLinked
                     ? "Linked — this board syncs with the devices you added."
                     : "Only on this device so far.")
                    .foregroundStyle(PipStyle.muted)
                    .accessibilityIdentifier("team:status")
                if model.activeIsLinked, let line = model.mediaState.line {
                    Text(line)
                        .foregroundStyle(PipStyle.muted)
                        .accessibilityIdentifier("team:media")
                }
                if team.state?.owner ?? true {
                    Button("Add a device") { model.startOffer() }
                        .accessibilityIdentifier("team:add")
                }
                Text("Add a device shows a code here — type it on the other device. A linked device sees and edits everything for this person. Removing one locks it out.")
                    .font(.footnote).foregroundStyle(PipStyle.muted)
                DeviceListRows(team: team)
            }
            TeamListSections(team: team)
        }
        .navigationTitle("Team & devices")
        .teamToast(team)
        .onAppear { team.refresh() }
        .onReceive(tick) { _ in team.refresh() }
        .sheet(item: Binding(
            get: { model.offerSheet.map { _ in SheetTag(id: "offer") } },
            set: { if $0 == nil { model.endOffer() } })) { _ in
            OfferSheet().environmentObject(model)
        }
        .sheet(item: Binding(
            get: { model.joinSheet.map { _ in SheetTag(id: "join") } },
            set: { if $0 == nil { model.endJoin() } })) { _ in
            JoinSheet().environmentObject(model)
        }
    }
}

private struct SheetTag: Identifiable { let id: String }

/// The pairing sheet, offering side: the code, then who took it.
private struct OfferSheet: View {
    @EnvironmentObject var model: AppModel

    var body: some View {
        NavigationStack {
            VStack(spacing: 16) {
                if let s = model.offerSheet {
                    if let code = s.code {
                        Text(code)
                            .font(.system(size: 44, weight: .bold, design: .monospaced))
                            .tracking(4)
                            .accessibilityIdentifier("pair:code")
                            .accessibilityLabel("Code \(code)")
                    }
                    ForEach(s.lines, id: \.self) { l in
                        Text(l)
                            .font(.system(size: 17))
                            .foregroundStyle(s.done ? PipStyle.ink : PipStyle.muted)
                            .multilineTextAlignment(.center)
                            .accessibilityIdentifier(s.done ? "pair:done" : "pair:line")
                    }
                    if s.lines.contains(where: LifetimeDoor.matches) {
                        Button("See Pip Lifetime") { model.openLifetime() }
                            .accessibilityIdentifier("pair:lifetime")
                    }
                    if s.canRetry {
                        Button("New code") { model.startOffer() }
                            .accessibilityIdentifier("pair:new")
                    }
                }
                Spacer()
            }
            .padding(24)
            .navigationTitle(model.offerSheet?.title ?? "Add a device")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Close") { model.endOffer() }
                        .accessibilityIdentifier("pair:close")
                }
            }
        }
    }
}

/// The pairing sheet, joining side: who uses this device, then the code.
struct JoinSheet: View {
    @EnvironmentObject var model: AppModel
    @State private var role: String?
    @State private var code = ""
    @FocusState private var focused: Bool

    var body: some View {
        NavigationStack {
            VStack(alignment: .leading, spacing: 14) {
                Text("On the device that already has the board, open Settings → Team & devices → Add a device. Type the code it shows.")
                    .foregroundStyle(PipStyle.muted)
                Text("Who uses this device?").font(.headline)
                HStack(spacing: 10) {
                    roleButton("board", "The person who talks with Pip")
                    roleButton("supporter", "A supporter: parent, teacher, therapist")
                }
                TextField("", text: $code)
                    .accessibilityLabel("Code")
                    .accessibilityIdentifier("pair:input")
                    .textInputAutocapitalization(.characters)
                    .autocorrectionDisabled()
                    .font(.system(size: 28, weight: .semibold, design: .monospaced))
                    .multilineTextAlignment(.center)
                    .padding(10)
                    .background(RoundedRectangle(cornerRadius: 10).stroke(PipStyle.ink.opacity(0.4)))
                    .disabled(model.joinSheet?.busy ?? false)
                    .focused($focused)
                    .onChange(of: code) { _, _ in try_() }
                Text(model.joinSheet?.status ?? "")
                    .foregroundStyle(PipStyle.muted)
                    .accessibilityIdentifier("pair:status")
                    .accessibilityLabel(model.joinSheet?.status ?? "")
                Spacer()
            }
            .padding(24)
            .navigationTitle("Join with a code")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Close") { model.endJoin() }
                        .accessibilityIdentifier("pair:close")
                }
            }
            .onAppear { focused = true }
        }
    }

    private func roleButton(_ v: String, _ title: String) -> some View {
        Button {
            role = v
            try_()
        } label: {
            Text(title)
                .font(.system(size: 16, weight: .semibold))
                .frame(maxWidth: .infinity, minHeight: 48)
                .background(role == v ? PipStyle.ink : Color.white)
                .foregroundStyle(role == v ? Color.white : PipStyle.ink)
                .clipShape(RoundedRectangle(cornerRadius: 10))
                .overlay(RoundedRectangle(cornerRadius: 10).stroke(PipStyle.ink.opacity(0.35)))
        }
        .buttonStyle(.plain)
        .accessibilityLabel(title)
        .accessibilityIdentifier("pair:role:\(v)")
    }

    /// devices-ui.js tryCode: fires on the 8th character, once a role is chosen.
    private func try_() {
        let clean = String(code.uppercased().filter { $0.isLetter || $0.isNumber }.prefix(8))
        guard clean.count == 8, !(model.joinSheet?.busy ?? false) else { return }
        guard let role else {
            model.joinSheet = JoinSheetState(status: "Choose who uses this device first.")
            return
        }
        code = "\(clean.prefix(4)) \(clean.suffix(4))"
        model.startJoin(code: clean, role: role)
    }
}
