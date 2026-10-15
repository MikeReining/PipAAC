//
//  AppModel.swift
//  PipAAC
//
//  Owns the PipCore session and the render models the views draw. Every
//  mutation is one bridge call that returns the whole painted state
//  ({speech, bar, strip, board}) — Swift never re-derives product state.
//  Core calls run off the main actor and publish back; the serial core
//  queue keeps tap order.
//

import Combine
import Foundation
import SwiftUI

// MARK: - Render models (scripts/ios/app.mjs)

nonisolated struct CellModel: Decodable, Sendable {
    let type: String            // word | empty | groups | family | next | group
    var slot: Int
    var kind: String?
    var id: String?
    var label: String?
    var role: String?
    var art: String?
    var photoKey: String?
    var reserved: Bool?
    var locked: Bool?           // an anchor/reserved empty: nothing can go here
    var hidden: Bool?
    // family / group / anchors
    var familyId: String?
    var glyph: String?
    var speaks: String?
    var name: String?
    var groupId: String?
    /// BS-21: the child's own 30-day taps (Edit mode + the 📊 badge only).
    var count: Int?
    /// A group door's face (group-glyph.js): an ink icon, a picture key,
    /// a seed emoji, or the initial — the core decides which.
    var icon: String?
    var picture: String?
    var emoji: String?
    var initial: String?
}

nonisolated struct BoardModel: Decodable, Sendable {
    let cols: Int
    let rows: Int
    let cells: [CellModel]
}

nonisolated struct CardModel: Decodable, Sendable {
    let kind: String            // sense | entity | family | more
    var id: String?
    var label: String?
    var role: String?
    var art: String?
    var photoKey: String?
    var glyph: String?
    var speaks: String?
    var nextFamily: String?
}

nonisolated struct StripModel: Decodable, Sendable {
    let cap: Int
    let mode: String            // predict | family
    var familyId: String?
    var page: Int?
    var pages: Int?
    let cards: [CardModel]
    var faces: FacesModel?      // 025: the feeling faces own the last slot
}

nonisolated struct ChipModel: Decodable, Sendable {
    let kind: String?
    let id: String?
    let display: String?
    let art: String?
    let photoKey: String?
}

nonisolated struct IndexPageModel: Decodable, Sendable {
    let page: Int
    let cells: [CellModel]
}
nonisolated struct GroupIndexModel: Decodable, Sendable {
    let cols: Int
    let rows: Int
    let pages: [IndexPageModel]
}
nonisolated struct GroupPageModel: Decodable, Sendable {
    let cols: Int
    let rows: Int
    let groupId: String
    let name: String
    let page: Int
    let pages: Int
    let cells: [CellModel]
}

nonisolated struct SpeechSlotModel: Decodable, Sendable {
    let type: String
    var key: String?
    var text: String?
}

nonisolated struct KbKeyModel: Decodable, Sendable {
    let slot: Int
    let span: Int
    let kind: String          // char | dead | space | backspace | partner | empty
    var value: String?
    var senseId: String?
    var label: String?
    var role: String?
    var art: String?
    var latched: Bool?
}

nonisolated struct KeyboardModel: Decodable, Sendable {
    let mode: String          // pip | device
    let keys: [KbKeyModel]
}

nonisolated struct PaintedState: Decodable, Sendable {
    var speech: SpeechSlotModel? = nil
    var clips: [SpeechSlotModel]? = nil
    var toast: String? = nil
    let bar: [ChipModel]
    let strip: StripModel
    let board: BoardModel
    var typing: String? = nil
    var kb: KeyboardModel? = nil
    var controls: [String]? = nil
    var tense: String? = nil
    var question: Bool? = nil
    var speechRate: Float? = nil   // appSetSetting replies carry the playback rate
    var settings: SettingsModel? = nil
}

/// appSettings() — the synced learner_profile rows the settings sheet
/// renders. Every write goes back through appSetSetting → the shared
/// allowlisted setSetting (it records the op; sync ships it later).
nonisolated struct SettingsModel: Decodable, Sendable {
    struct BarPreset: Decodable, Sendable {
        let id: String, name: String, controls: [String]
    }
    let grammarHelp: Bool
    let freshAfterSpeak: Bool
    let expressiveVoice: Bool
    let groupTopRow: Bool
    let occasionsVisible: Bool
    let shareResearch: Bool
    /// "symbol" (pictures and words) | "label" (words only) — BS-22.
    var look: String = "symbol"
    let speechRate: String
    let keyboardOrder: String
    let keyboardStandardName: String
    let boardLayout: String
    let layouts: [String]
    let barControls: [String]
    let barPresets: [BarPreset]
    let allControls: [String]
    let controlNames: [String: String]
}

nonisolated struct AppOpenResult: Decodable, Sendable {
    let appId: String
    let locale: String
    let voiceId: String
    var speechRate: Float?
}

// MARK: - AppModel

@MainActor
final class AppModel: ObservableObject {
    enum Surface { case boot, picker, board, index, group }

    @Published private(set) var surface: Surface = .boot
    @Published var board: BoardModel? { didSet { refreshSpot() } }
    /// The attention layer (Spotlight.swift, 044 D5): the core's render model.
    @Published var spot = SpotModel()
    @Published private(set) var strip: StripModel?
    @Published private(set) var bar: [ChipModel] = []
    @Published private(set) var groupIndex: GroupIndexModel?
    @Published var groupPage: GroupPageModel? { didSet { refreshSpot() } }
    @Published private(set) var bootError: String?
    @Published private(set) var typing: String?
    @Published private(set) var kb: KeyboardModel?
    /// Shown bar controls (learner_profile.bar_controls — all six when unset).
    @Published private(set) var controls: Set<String> =
        ["fix", "question", "past", "future", "backspace", "clear"]
    @Published private(set) var tense = "present"
    @Published private(set) var question = false
    @Published private(set) var toast: String?
    @Published var showSettings = false
    // Edit mode + word card (EditMode.swift) — render state only.
    @Published var editing = false
    /// BS-24 / SN-10: the face that is dark while its audio is on the way.
    @Published var speakingFace: String?
    @Published var tryingFace: String?
    @Published var card: WordCardModel?
    // E2: add a word, the Library, "Also in" add, empty-cell placement.
    @Published var addRequest: AddRequest?
    @Published var otherGroups: OtherGroupsModel?
    @Published var placeRequest: PlaceRequest?
    @Published var showLibrary = false
    // E4: group management (GroupsEditView.swift) and the 📊 counts badge.
    @Published var showGroupsEdit = false
    @Published var countsOn = false
    @Published var editToast: EditToastModel?
    // E6: pictures (PicturesModel.swift) - the card's Picture row, the paste form, several photos.
    @Published var picRows: [String: PicRow] = [:]
    @Published var bulkRequest: BulkRequest?
    @Published var bulk: BulkModel?
    @Published var photoRequest: PhotoRequest?
    /// Bumped when a picture changed the board behind an open sheet (the Library refreshes).
    @Published var picTick = 0
    var editToastSeq = 0
    // E8 (CardRows.swift): the swap picker, the editor's save status.
    @Published var swapRequest: SwapRequest?
    @Published var editorStatus = EditorStatus(text: "Saved on this device", tone: "ok")
    /// A core write that threw (editCall): the status says so until one succeeds.
    var saveFailed = false
    /// The synced settings; the "Words only" look follows them (one value for board, bar and first run).
    @Published private(set) var settings: SettingsModel? { didSet { wordsOnly = settings?.look == "label" } }
    /// First run (FirstRun.swift, 044 E7): the demo's current card while it
    /// runs (nil otherwise), and the open person's "Words only" look.
    let firstRun = FirstRunFlow()
    @Published var tourCard: TourCard?
    @Published var wordsOnly = false
    /// The device's people (PeopleRegistry), last opened first, and who is open.
    @Published private(set) var people: [PersonRecord] = []
    @Published private(set) var activeId: String?
    @Published var peopleError: String?
    private var toastSeq = 0

    nonisolated let core = PipCore()
    var registry: PeopleRegistry?
    /// The last clip the speaker played (UI-test probe: `-pipUITestProbe`).
    @Published private(set) var lastClip: String?
    private var coreLoaded = false
    // Sync + pairing (LinkDevices.swift)
    var host: PipHost?
    /// Supporter account + recovery card screens' state (044 C5).
    let flow = AccountFlow()
    /// Team list, device list, deletion (044 F2).
    let team = TeamFlow()
    /// The person the process-wide sync loop runs for (sync.mjs `running`).
    var syncingId: String?
    var syncDbId: Int32 = 0
    /// Callers of stopSyncLoop() waiting for the core's "sync.stopped".
    var stopWaiters: [CheckedContinuation<Void, Never>] = []
    /// Photos/recordings the loop still owes or awaits (media.state).
    @Published var mediaState = MediaState()
    var joinRole = "board"
    @Published var offerSheet: OfferSheetState?
    // Pip Lifetime: buy / restore / the plan (Purchases.swift, LifetimeView.swift).
    let lifetimeBackend = CoreLifetimeBackend()
    lazy var lifetime: LifetimeModel = makeLifetime()
    @Published var showLifetime = false
    @Published var joinSheet: JoinSheetState?
    private(set) var appId = ""
    private(set) var dbId: Int32 = 0
    let speaker = PipSpeaker()

    // MARK: bridge

    /// Decodes a JSValue's Foundation object into a render model.
    nonisolated static func decodeRaw<T: Decodable>(_ raw: Any?) throws -> T {
        guard let raw else { throw PipCoreError.evalFailed("bridge returned nothing") }
        let data = try JSONSerialization.data(withJSONObject: raw)
        return try JSONDecoder().decode(T.self, from: data)
    }

    /// One bridge call, awaited. Runs on the cooperative pool — the
    /// serial core queue is the only ordering rule, so concurrent taps
    /// serialize there, not on the main actor.
    nonisolated static func coreCall<T: Decodable & Sendable>(
        _ core: PipCore, _ method: String, _ args: sending [Any]
    ) async throws -> T {
        try core.sync { try decodeRaw(core.call("PIPCORE.app", method, args)) }
    }

    // MARK: boot

    /// web board.js: the home person opens; a lone person opens; many
    /// people and no home asks "Who's talking?" first.
    func boot() {
        speaker.configure()
        firstRun.model = self
        speaker.onPlay = { [weak self] k in self?.lastClip = k }
        wireMediaStates()
        startMediaTestHook()
        Task { @MainActor in
            do {
                UITestHooks.resetIfRequested()
                let reg = try PipAssets.makeRegistry()
                try reg.bootstrap()
                registry = reg
                try installHost(registry: reg)
                if let svc = host?.config.keychainService { UITestHooks.seedAccountIfRequested(service: svc) }
                try refreshPeople()
                if let me = PeopleRegistry.resolveActive(people) {
                    try await open(me.id)
                } else {
                    surface = .picker
                }
            } catch {
                bootError = "\(error)"
            }
        }
    }

    /// A group write landed (GroupsEditView.swift): the child's index and
    /// the Settings model follow the db.
    func adopt(groupIndex idx: GroupIndexModel?, settings set: SettingsModel?) {
        if let idx { groupIndex = idx }
        if let set { settings = set }
    }

    func refreshPeople() throws {
        people = try registry?.list() ?? []
    }

    /// Opens a person's file and makes them the one on screen. The new
    /// file opens first; the old one closes only once it did, so a
    /// failed open leaves the current person untouched (never a fresh
    /// catalog over anyone's data - phase 044 section 6 B-C).
    func open(_ id: String) async throws {
        guard let registry else { return }
        let url = try registry.openableFile(id)
        // The running loop holds its person's db handle: end it first
        // (stopSync), so the old file can close and the next person's loop
        // starts clean (044 C4; the web reloads the page instead).
        await stopSyncLoop()
        let opened: AppOpenResult, newDb: Int32, st: PaintedState, set: SettingsModel
        do {
            (opened, newDb, st, set) = try await Self.openCore(
                core, url, loaded: coreLoaded, oldApp: appId, oldDb: dbId, keepOldDb: false)
        } catch {
            startSyncIfLinked() // the open failed: the current person keeps syncing
            throw error
        }
        coreLoaded = true
        speaker.rate = opened.speechRate ?? 1
        appId = opened.appId
        dbId = newDb
        activeId = id
        sayIdentify(id)
        picIdentify(id)
        lifetime.start()
        Task { await lifetime.refresh() }
        try registry.touchOpened(id)
        try refreshPeople()
        spot = SpotModel()
        let me = people.first { $0.id == id }
        bindSpot(role: me?.role, name: me?.displayName ?? "")
        groupIndex = nil
        groupPage = nil
        toast = nil
        tense = "present"
        question = false
        controls = Set(set.barControls)
        settings = set
        showSettings = false
        apply(st)
        surface = .board
        firstRun.personOpened(id)
        startSyncIfLinked()
    }

    /// The open person's name, for copy ("Everyone who helps ...").
    var activeName: String { people.first { $0.id == activeId }?.displayName ?? "this person" }

    /// Switch to another person (people-ui.js `switchTo`).
    func openPerson(_ id: String) {
        guard id != activeId else { return }
        Task { @MainActor in
            do { try await open(id) } catch { peopleError = "\(error)" }
        }
    }

    /// Settings > People > Add a person: a name, then straight to
    /// their board (devices-ui.js `usr-add`).
    func addPerson(name: String) {
        Task { @MainActor in
            do {
                guard let registry else { return }
                let added = try registry.add(name: name)
                try await open(added.id)
            } catch { peopleError = "\(error)" }
        }
    }

    func removePerson(_ id: String) {
        guard id != activeId else { return }
        do {
            try registry?.remove(id)
            try refreshPeople()
        } catch { peopleError = "\(error)" }
    }

    /// "When Pip opens": a person, or nil for the list.
    func setHomePerson(_ id: String?) {
        do {
            try registry?.setHome(id)
            try refreshPeople()
        } catch { peopleError = "\(error)" }
    }

    /// Open heavy lane - bundle eval (once) + catalog import must not
    /// run on the main actor. The previous person's session and file
    /// close after the new one opened.
    nonisolated private static func openCore(
        _ core: PipCore, _ dbURL: URL, loaded: Bool, oldApp: String, oldDb: Int32,
        keepOldDb: Bool
    ) async throws -> (AppOpenResult, Int32, PaintedState, SettingsModel) {
        let catalog = try PipAssets.text("catalog.json")
        let phrases = try PipAssets.text("suggest_answers.en.json")
        let forms = try PipAssets.text("form_answers.en.json")
        return try core.sync {
            if !loaded { _ = try core.evaluate(resource: "pip-core", bundle: .main) }
            let dbId = try core.openDatabase(path: dbURL.path)
            do {
                let opened: AppOpenResult = try decodeRaw(
                    core.call("PIPCORE.app", "appOpen", [dbId, catalog, phrases, forms]))
                if !loaded { UITestHooks.seedIfRequested(core, appId: opened.appId) }
                let st = PaintedState(
                    bar: try decodeRaw(core.call("PIPCORE.app", "appBar", [opened.appId])),
                    strip: try decodeRaw(core.call("PIPCORE.app", "appStrip", [opened.appId])),
                    board: try decodeRaw(core.call("PIPCORE.app", "appBoard", [opened.appId])))
                let set: SettingsModel = try decodeRaw(
                    core.call("PIPCORE.app", "appSettings", [opened.appId]))
                if !oldApp.isEmpty {
                    _ = try core.call("PIPCORE.app", "appClose", [oldApp])
                    if !keepOldDb { core.closeDatabase(id: oldDb) }
                }
                return (opened, dbId, st, set)
            } catch {
                core.closeDatabase(id: dbId)
                throw error
            }
        }
    }

    // MARK: taps

    private func mutate(_ method: String, _ args: [Any]) {
        let appId = self.appId
        let core = self.core
        Task { @MainActor [weak self] in
            guard let self else { return }
            do {
                let st: PaintedState = try await Self.coreCall(core, method, [appId] + args)
                // A sentence clip list owns the audio (Enter/transform) —
                // a lone word slot would only ever be cut off mid-play.
                if let clips = st.clips {
                    speaker.playSentence(clips.map {
                        .init(type: $0.type, key: $0.key, text: $0.text)
                    })
                } else if let s = st.speech {
                    speaker.play(slot: .init(type: s.type, key: s.key, text: s.text))
                }
                apply(st)
            } catch {
                NSLog("AppModel.\(method) failed: \(error)")
            }
        }
    }

    func apply(_ st: PaintedState) {
        bar = st.bar
        strip = st.strip
        board = st.board
        typing = st.typing
        kb = st.kb
        if let c = st.controls { controls = Set(c) }
        if let t = st.tense { tense = t }
        if let q = st.question { question = q }
        if let rate = st.speechRate { speaker.rate = rate }
        if let m = st.settings { settings = m }
        if let msg = st.toast { showToast(msg) }
    }

    func showToast(_ msg: String) {
        toastSeq += 1
        let seq = toastSeq
        toast = msg
        Task { [weak self] in
            // edit-shared.js toast(): six seconds, long enough to reach "See Pip Lifetime".
            try? await Task.sleep(for: .seconds(6))
            if self?.toastSeq == seq { self?.toast = nil }
        }
    }

    func tap(kind: String, id: String, text: String, source: String = "grid") {
        // A supporter's spotlight: the tap lights the word on the child's board.
        if spot.modeling { modelTap(kind: kind, id: id, text: text); return }
        // The first-run demo owns the board: its own tap, never logged (SN-11).
        if tourCard != nil { firstRun.tourTap(kind: kind, id: id); return }
        mutate("appTap", [["kind": kind, "id": id, "text": text, "source": source]])
    }

    func backspace() { if tourCard == nil { mutate("appBackspace", []) } }
    func clear() { if tourCard == nil { mutate("appClear", []) } }

    /// ✨ ❓ ⏪ ⏩ — the core asks the Worker (masked names, 15 s bound,
    /// stale replies dropped) and speaks the result; offline it speaks the
    /// bar as built and says why (SayBar.swift, Sentence_Bar.md).
    func transform(_ mode: String) {
        if spot.modeling, mode == "fix" || mode == "question" { modelControl(mode); return }
        // The demo's ✨/❓ are scripted: no Worker call (SN-11).
        if tourCard != nil { firstRun.tourTransform(mode); return }
        sayTransform(mode)
    }

    // MARK: settings (settings-ui.js / settings-sync.js)

    func openSettings() {
        navCall("appSettings", []) { [weak self] (m: SettingsModel) in
            self?.settings = m
            self?.showSettings = true
            self?.sayTrialRefresh()
        }
    }

    /// Every write is the shared synced-profile path — groups.setSetting
    /// allowlists the column and records the op; sync ships it later.
    func setSetting(_ key: String, _ value: Any) {
        mutate("appSetSetting", [key, value])
    }

    /// Same write, awaited (the voice picker switches only once the write
    /// landed) - D3.
    func setSettingAwait(_ key: String, _ value: String) async throws {
        let st: PaintedState = try await Self.coreCall(core, "appSetSetting", [appId, key, value] as [Any])
        apply(st)
    }

    /// One core call outside the app facade (PIPCORE.<object>) - D3.
    func coreValue<T: Decodable & Sendable>(
        _ object: String, _ method: String, _ args: [String]
    ) async throws -> T {
        let core = self.core
        let all: [Any] = [appId] + args
        return try await Self.coreSend(core, object, method, all)
    }

    nonisolated private static func coreSend<T: Decodable & Sendable>(
        _ core: PipCore, _ object: String, _ method: String, _ args: sending [Any]
    ) async throws -> T {
        try core.sync { try decodeRaw(core.call(object, method, args)) }
    }

    // MARK: keyboard

    func toggleKeyboard() {
        mutate(kb == nil ? "appKbOpen" : "appKbClose", [])
    }

    func kbPress(_ key: String) { mutate("appKbPress", [key]) }
    func kbPartner(_ senseId: String) { mutate("appKbPartner", [senseId]) }

    /// ▶ — the whole-sentence cloud clip when online, her word clips
    /// otherwise (SayBar.swift).
    func speak() { if tourCard == nil { saySpeak() } }

    // MARK: navigation

    private func navCall<T: Decodable & Sendable>(
        _ method: String, _ args: [Any],
        then: @escaping @MainActor (T) -> Void
    ) {
        let appId = self.appId
        let core = self.core
        Task { @MainActor in
            do {
                then(try await Self.coreCall(core, method, [appId] + args))
            } catch {
                NSLog("AppModel.\(method) failed: \(error)")
            }
        }
    }

    func openGroups() {
        navCall("appGroups", []) { [weak self] (idx: GroupIndexModel) in
            self?.groupIndex = idx
            self?.surface = .index
        }
    }

    func openGroup(_ groupId: String, page: Int = 0) {
        navCall("appGroupPage", [groupId, page]) { [weak self] (gp: GroupPageModel) in
            self?.groupPage = gp
            self?.surface = .group
        }
        // The strip re-ranks for the open group.
        navCall("appStrip", []) { [weak self] (st: StripModel) in
            self?.strip = st
        }
    }

    func nextGroupPage() {
        guard let gp = groupPage else { return }
        openGroup(gp.groupId, page: (gp.page + 1) % max(1, gp.pages))
    }

    func backToBoard() {
        let appId = self.appId
        let core = self.core
        Task { @MainActor [weak self] in
            guard let self else { return }
            do {
                let st: PaintedState = try await Self.showBoardCore(core, appId)
                apply(st)
                surface = .board
            } catch { NSLog("appShowBoard failed: \(error)") }
        }
    }

    /// appShowBoard flips the view first — the strip then re-ranks for
    /// the board, not the open group.
    nonisolated private static func showBoardCore(_ core: PipCore, _ appId: String) async throws -> PaintedState {
        try core.sync {
            let board: BoardModel = try decodeRaw(core.call("PIPCORE.app", "appShowBoard", [appId]))
            return PaintedState(
                bar: try decodeRaw(core.call("PIPCORE.app", "appBar", [appId])),
                strip: try decodeRaw(core.call("PIPCORE.app", "appStrip", [appId])),
                board: board)
        }
    }

    // MARK: family strip

    func openFamily(_ familyId: String) {
        navCall("appOpenFamily", [familyId, 0]) { [weak self] (st: StripModel) in
            self?.strip = st
        }
    }

    func familyMore() {
        navCall("appFamilyPage", []) { [weak self] (st: StripModel) in
            self?.strip = st
        }
    }
}
