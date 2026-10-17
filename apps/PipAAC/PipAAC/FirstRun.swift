//
//  FirstRun.swift
//  PipAAC
//
//  First run (phase 044 E7; PF-2, PF-3, PF-4, SN-11): the welcome, the
//  button look, "Tell us about their world", and the scripted demo tour.
//  Every rule and every word of copy comes from the core
//  (PIPCORE.firstrun, scripts/ios/app_firstrun.mjs, mirroring
//  board/onramp-ui.js, board/setup-ui.js and board/tour-ui.js); this file
//  turns those render models into screens and plays the shipped
//  recordings. Nothing here decides what a step says.
//
//  When it shows is the registry row's `needsSetup` (board.js: the first
//  boot's home person is created with it; a join, a restore, a sign-in or
//  a Settings add never is). It is shown once: leaving the welcome clears
//  it. The tour is also what Settings -> "Replay the tour" (ST-9) calls:
//  `FirstRunFlow.replayTour()`.
//

import Combine
import PhotosUI
import SwiftUI
import UIKit

// MARK: - render models (what PIPCORE.firstrun returns)

nonisolated struct FRClip: Decodable, Sendable, Equatable {
    let key: String
    let path: String
}

nonisolated struct FRChoice: Decodable, Sendable, Identifiable {
    let value: String
    let label: String
    let clip: FRClip
    var id: String { value }
}

nonisolated struct FRTile: Decodable, Sendable, Identifiable {
    let id: String
    let label: String
    let role: String
    let art: String?
}

nonisolated struct FRWelcome: Decodable, Sendable {
    let title: String, nameLabel: String, namePlaceholder: String, name: String
    let whoQ: String, go: String, joinLead: String, join: String
    let choices: [FRChoice]
    let clip: FRClip
}

nonisolated struct FRLook: Decodable, Sendable {
    let title: String, sub: String, go: String
    let choices: [FRChoice]
    let preview: [FRTile]
    let clip: FRClip
}

nonisolated struct FRCopy: Decodable, Sendable {
    let welcome: FRWelcome
    let look: FRLook
    let offersWorld: Bool
}

nonisolated struct FRStep: Decodable, Sendable {
    let key: String, title: String, hint: String, next: String
}

nonisolated struct FRPerson: Decodable, Sendable {
    let id: String?
    let name: String
    let photoKey: String?
}

nonisolated struct FRWorld: Decodable, Sendable {
    let steps: [FRStep]
    let examples: [String]
    let otherExample: String
    let namePlaceholder: String
    let people: [FRPerson]
    let addRow: String, skip: String, back: String
}

nonisolated struct FRPreviewRow: Decodable, Sendable, Identifiable {
    let label: String
    let kind: String
    let art: String?
    let initial: String
    let already: Bool
    let tag: String?
    var id: String { label }
}

nonisolated struct FRPreview: Decodable, Sendable { let rows: [FRPreviewRow] }

nonisolated struct FRApply: Decodable, Sendable {
    let wrote: Bool
    let toast: String?
    let state: PaintedState?
}

nonisolated struct FRSaved: Decodable, Sendable {
    let name: String
    let audience: String
}

nonisolated struct FRLookState: Decodable, Sendable {
    let look: String
    let wordsOnly: Bool
}

nonisolated struct FROwed: Decodable, Sendable { let owed: Bool }

nonisolated struct FRTarget: Decodable, Sendable, Equatable {
    let kind: String   // cell | strip | button
    let id: String
}

/// The demo's current card (tour-ui.js show()).
nonisolated struct TourCard: Decodable, Sendable, Equatable {
    let id: String
    let say: String
    let clip: FRClip
    var target: FRTarget?
    let done: Bool
    var skip: String?
    var note: String?
    var voices: String?
    var go: String?
}

nonisolated struct TourModel: Decodable, Sendable {
    let card: TourCard
    let bar: [ChipModel]
    let strip: StripModel
    var tense: String?
    var question: Bool?
    var play: [SpeechSlotModel]?
}

/// A People row being edited in "their world" (setup-ui.js `people`).
struct WorldRow: Identifiable {
    let id = UUID()
    var personId: String?
    var name: String
    var photoKey: String?
    /// A freshly picked photo: shown now, stored when Next is pressed
    /// (setup-ui.js apply -> savePhoto).
    var picked: Data?
}

// MARK: - the flow

@MainActor
final class FirstRunFlow: ObservableObject {
    enum Phase: Equatable { case none, welcome, look, world, tour }

    weak var model: AppModel?
    @Published var phase: Phase = .none
    @Published var copy: FRCopy?
    @Published var name = ""
    @Published var audience: String?
    @Published var lookChoice: String?

    // "their world"
    @Published var world: FRWorld?
    @Published var worldStep = 0
    @Published var rows: [WorldRow] = []
    @Published var listText = ""
    @Published var preview: [FRPreviewRow] = []
    @Published var worldToast: String?
    @Published var busy = false
    private var wrote = false
    /// Opened from Settings -> Words -> People & places (the web's openWizard):
    /// closing it just closes - no tour, no first-run bookkeeping.
    private var fromSettings = false

    var touring: Bool { phase == .tour }

    // MARK: core

    private func call<T: Decodable & Sendable>(_ method: String, _ arg: [String: Any]? = nil) async throws -> T {
        guard let m = model else { throw PipCoreError.evalFailed("no model") }
        let core = m.core
        // The argument crosses as JSON text (Sendable) and is rebuilt on the
        // core's queue.
        let json = try arg.map {
            String(decoding: try JSONSerialization.data(withJSONObject: $0), as: UTF8.self)
        }
        return try await Self.coreCall(core, method, m.appId, json)
    }

    nonisolated private static func coreCall<T: Decodable & Sendable>(
        _ core: PipCore, _ method: String, _ appId: String, _ json: String?
    ) async throws -> T {
        try core.sync {
            var args: [Any] = [appId]
            if let json, let o = try? JSONSerialization.jsonObject(with: Data(json.utf8)) { args.append(o) }
            return try AppModel.decodeRaw(core.call("PIPCORE.firstrun", method, args))
        }
    }

    private func clipSlot(_ c: FRClip) -> SpeechSlotModel? {
        guard let u = PipAssets.url(c.path) else { return nil }
        return SpeechSlotModel(type: "file", key: u.path, text: nil)
    }

    func say(_ c: FRClip) {
        guard let s = clipSlot(c), let m = model else { return }
        m.speaker.play(slot: .init(type: s.type, key: s.key, text: s.text))
    }

    private func play(_ slots: [SpeechSlotModel]) {
        guard let m = model, !slots.isEmpty else { return }
        m.speaker.playSentence(slots.map { .init(type: $0.type, key: $0.key, text: $0.text) })
    }

    private func patch(_ fields: [String: Any]) {
        guard let m = model, let id = m.activeId else { return }
        do {
            try m.registry?.patch(id, fields)
            try m.refreshPeople()
        } catch { m.peopleError = "\(error)" }
    }

    // MARK: when it shows

    /// Called after every person opens (AppModel.open). board.js: a person
    /// who needs setup gets the welcome; anyone else - a joined, restored
    /// or signed-in person - never does, and a welcome still on screen
    /// when one of them opens goes away.
    func personOpened(_ id: String) {
        guard let m = model, let p = m.people.first(where: { $0.id == id }) else { return }
        Task { await refreshLook() }
        if phase != .none && !p.needsSetup {
            phase = .none
            m.tourCard = nil
            return
        }
        if p.needsSetup && !UITestHooks.skipFirstRun && phase == .none {
            Task { await begin(name: p.name) }
        } else if !p.needsSetup && !UITestHooks.skipFirstRun && phase == .none {
            Task { await resumeTourIfOwed(p) }
        }
    }

    /// board.js boot: an app closed mid-tour shows the demo again. The
    /// decision is the web's own `tourIsOwed(me, flag)` (through the core):
    /// past setup and the saved `tourDone === false`. A person from before
    /// the flag (nil) or one who finished or skipped (true) is not owed one.
    private func resumeTourIfOwed(_ p: PersonRecord) async {
        var me: [String: Any] = ["needsSetup": p.needsSetup]
        if let d = p.tourDone { me["tourDone"] = d }
        guard let r: FROwed = try? await call("tourOwed", ["me": me, "flag": false]),
              r.owed, phase == .none, model?.activeId == p.id else { return }
        await startTour()
    }

    func begin(name: String) async {
        do {
            let c: FRCopy = try await call("welcome", ["name": name])
            copy = c
            self.name = c.welcome.name
            audience = nil
            lookChoice = nil
            phase = .welcome
            say(c.welcome.clip)
        } catch { model?.peopleError = "\(error)" }
    }

    // MARK: the look (BS-22 / PF-2)

    func refreshLook() async {
        if let l: FRLookState = try? await call("lookOf") { model?.wordsOnly = l.wordsOnly }
    }

    func setLook(_ v: String) async {
        if let l: FRLookState = try? await call("setLook", ["look": v]) { model?.wordsOnly = l.wordsOnly }
    }

    // MARK: welcome

    func welcomeContinue() async {
        guard let audience, !busy else { return }
        busy = true; defer { busy = false }
        do {
            let s: FRSaved = try await call("welcomeSave", ["name": name, "audience": audience])
            patch(["name": s.name, "audience": s.audience])
            if audience == "adult" {
                phase = .look
                if let c = copy { say(c.look.clip) }
            } else {
                await afterWelcome()
            }
        } catch { model?.peopleError = "\(error)" }
    }

    func lookContinue() async {
        guard let v = lookChoice, !busy else { return }
        busy = true; defer { busy = false }
        await setLook(v)
        await afterWelcome()
    }

    private func afterWelcome() async {
        if copy?.offersWorld == true { await openWorld() } else { await finishSetup() }
    }

    // MARK: their world

    /// Settings -> Words -> People & places (board.js `open-setup` -> setupUi.openWizard).
    func openWorldFromSettings() {
        fromSettings = true
        name = model?.people.first(where: { $0.id == model?.activeId })?.name ?? ""
        Task { await openWorld() }
    }

    func openWorld() async {
        do {
            let w: FRWorld = try await call("worldOpen", ["name": name])
            world = w
            worldStep = 0
            wrote = false
            worldToast = nil
            loadStep()
            phase = .world
        } catch { model?.peopleError = "\(error)" }
    }

    /// Back to a step's form (setup-ui.js render).
    private func loadStep() {
        guard let w = world else { return }
        if w.steps[worldStep].key == "people" {
            rows = w.people.map { WorldRow(personId: $0.id, name: $0.name, photoKey: $0.photoKey) }
            while rows.count < 2 { rows.append(WorldRow(name: "")) }
        } else {
            listText = ""
            preview = []
        }
    }

    func updatePreview() {
        guard let w = world, w.steps[worldStep].key != "people" else { return }
        let step = w.steps[worldStep].key, text = listText
        Task {
            if let p: FRPreview = try? await call("worldPreview", ["step": step, "text": text]),
               text == listText { preview = p.rows }
        }
    }

    func addRow() { rows.append(WorldRow(name: "")) }

    /// One picture fills the face that was tapped (setup-ui.js photo input).
    func setPhoto(_ rowId: UUID, data: Data) {
        guard let i = rows.firstIndex(where: { $0.id == rowId }) else { return }
        rows[i].picked = data
        if rows[i].name.trimmingCharacters(in: .whitespaces).isEmpty { rows[i].name = "" }
    }

    func worldNext() async {
        guard let w = world, !busy else { return }
        busy = true; defer { busy = false }
        let step = w.steps[worldStep].key
        do {
            var arg: [String: Any] = ["step": step]
            if step == "people" {
                var people: [[String: Any]] = []
                for r in rows {
                    var key: Any = r.photoKey ?? NSNull()
                    if let d = r.picked {
                        if let jpeg = PipPhoto.jpeg(from: d), let k = try? PipBlobs.save(jpeg) {
                            key = k
                        } else {
                            worldToast = "Couldn't use that photo. Try another."
                        }
                    }
                    people.append(["id": r.personId ?? NSNull(), "name": r.name, "photoKey": key])
                }
                arg["people"] = people
            } else {
                arg["text"] = listText
            }
            let r: FRApply = try await call("worldApply", arg)
            if let t = r.toast { worldToast = t }
            if let st = r.state { model?.apply(st) }
            if r.wrote { wrote = true }
            await advance()
        } catch { model?.peopleError = "\(error)" }
    }

    /// "Skip this step" never writes (setup-ui.js #setup-skip).
    func worldSkip() async { await advance() }

    func worldBack() { if worldStep > 0 { worldStep -= 1; loadStep() } }

    /// ✕ closes the pass; a step saves only when you press Next.
    func worldClose() async { await finishWorld() }

    private func advance() async {
        guard let w = world else { return }
        worldStep += 1
        if worldStep >= w.steps.count { await finishWorld() } else { loadStep() }
    }

    private func finishWorld() async {
        if wrote { model?.showToast("Their world is set up") }
        world = nil
        if fromSettings { fromSettings = false; phase = .none; return }
        await finishSetup()
    }

    // MARK: the end of setup, then the demo

    /// onramp-ui.js finish(): needsSetup is cleared, then the demo starts.
    private func finishSetup() async {
        // tourDone:false = the demo is owed; tourEnd flips it, so an app
        // closed mid-tour shows the tour again at the next launch.
        patch(["needsSetup": false, "tourDone": false])
        await startTour()
    }

    // MARK: the demo tour (PF-4, SN-11)

    /// Settings -> "Replay the tour" (ST-9) calls this.
    func replayTour() { Task { await startTour() } }

    private func startTour() async {
        guard let m = model else { return }
        if m.surface != .board { m.backToBoard() }
        do {
            let t: TourModel = try await call("tourStart", ["online": m.host?.isOnline ?? true])
            phase = .tour
            show(t)
        } catch { m.peopleError = "\(error)" }
    }

    private func show(_ t: TourModel) {
        guard let m = model, let board = m.board else { return }
        m.tourCard = t.card
        m.apply(PaintedState(bar: t.bar, strip: t.strip, board: board,
                             tense: t.tense, question: t.question))
        play(t.play ?? [])
    }

    func tourTap(kind: String, id: String) {
        Task {
            if let t: TourModel = try? await call("tourTap", ["kind": kind, "id": id,
                                                              "online": model?.host?.isOnline ?? true]) {
                show(t)
            }
        }
    }

    func tourTransform(_ mode: String) {
        Task {
            if let t: TourModel = try? await call("tourTransform", ["mode": mode,
                                                                    "online": model?.host?.isOnline ?? true]) {
                show(t)
            }
        }
    }

    /// Skip, Start talking: the bar clears, the live board paints.
    func tourEnd(thenVoices: Bool = false) {
        Task {
            guard let m = model else { return }
            if let st: PaintedState = try? await call("tourEnd") { m.apply(st) }
            m.tourCard = nil
            phase = .none
            patch(["tourDone": true])
            if thenVoices { m.openSettings() }
        }
    }
}

// MARK: - the screens

private let creamBG = PipStyle.cream

struct FirstRunHost: View {
    @EnvironmentObject var model: AppModel
    @ObservedObject var flow: FirstRunFlow

    var body: some View {
        ZStack {
            switch flow.phase {
            case .welcome:
                WelcomeScreen(flow: flow)
            case .look:
                LookScreen(flow: flow)
            case .world:
                WorldScreen(flow: flow)
            case .tour:
                if let card = model.tourCard { TourCardView(flow: flow, card: card) }
            case .none:
                EmptyView()
            }
        }
        // Welcome / look / world cover the whole board: VoiceOver and Switch
        // Control must not reach the tiles behind them (the tour keeps the
        // board live on purpose).
        .accessibilityAddTraits(flow.phase == .welcome || flow.phase == .look || flow.phase == .world
                                ? .isModal : [])
        // The welcome is its own top layer; the join sheet sits above it.
        .sheet(isPresented: Binding(
            get: { model.joinSheet != nil && flow.phase != .none },
            set: { if !$0 { model.endJoin() } })) {
            JoinSheet().environmentObject(model)
        }
    }
}

/// The calm card on cream (onramp-ui.css .welcome / .welcome-card).
private struct WelcomeFrame<Content: View>: View {
    @ViewBuilder var content: Content
    var body: some View {
        ZStack {
            creamBG.ignoresSafeArea()
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    if let ui = PipAssets.image("brand/pip-mark-ink.svg") {
                        Image(uiImage: ui).resizable().scaledToFit()
                            .frame(width: 56, height: 56).accessibilityHidden(true)
                    }
                    content
                }
                .frame(maxWidth: 560)
                .padding(.horizontal, 24).padding(.vertical, 40)
                .frame(maxWidth: .infinity)
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityAddTraits(.isModal)
    }
}

private struct ChoiceButton: View {
    let choice: FRChoice
    let selected: Bool
    var preview: [FRTile] = []
    var wordsOnly = false
    let idPrefix: String
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            VStack(spacing: 12) {
                if !preview.isEmpty {
                    HStack(spacing: 8) {
                        ForEach(preview) { t in
                            WordTile(label: t.label, role: t.role, art: t.art)
                                .frame(width: 84, height: 84)
                                .environment(\.wordsOnly, wordsOnly)
                        }
                    }
                }
                Text(choice.label)
                    .pipFont(19, .bold)
                    .foregroundStyle(PipStyle.inkText)
            }
            .frame(maxWidth: .infinity, minHeight: 88)
            .padding(16)
            .background(Color.white)
            .clipShape(RoundedRectangle(cornerRadius: 16))
            .overlay(RoundedRectangle(cornerRadius: 16)
                .stroke(selected ? PipStyle.ink : PipStyle.border(nil).opacity(0.35), lineWidth: 2))
            .overlay(RoundedRectangle(cornerRadius: 20)
                .stroke(selected ? PipStyle.ink : .clear, lineWidth: 3).padding(-5))
        }
        .buttonStyle(.plain)
        .accessibilityLabel(choice.label)
        .accessibilityAddTraits(selected ? .isSelected : [])
        .accessibilityIdentifier("\(idPrefix):choice:\(choice.value)")
    }
}

private struct GoButton: View {
    let title: String
    let enabled: Bool
    let id: String
    let action: () -> Void
    var body: some View {
        Button(action: action) {
            Text(title)
                .pipFont(19, .bold)
                .frame(maxWidth: .infinity, minHeight: 60)
                .background(PipStyle.ink)
                .foregroundStyle(Color.white)
                .clipShape(RoundedRectangle(cornerRadius: 14))
                .opacity(enabled ? 1 : 0.35)
        }
        .buttonStyle(.plain)
        .disabled(!enabled)
        .accessibilityIdentifier(id)
    }
}

struct WelcomeScreen: View {
    @EnvironmentObject var model: AppModel
    @ObservedObject var flow: FirstRunFlow

    var body: some View {
        if let w = flow.copy?.welcome {
            WelcomeFrame {
                Text(w.title).pipFont(34, .bold).foregroundStyle(PipStyle.inkText)
                    .accessibilityAddTraits(.isHeader)
                VStack(alignment: .leading, spacing: 6) {
                    Text(w.nameLabel).pipFont(17, .bold)
                    TextField(w.namePlaceholder, text: $flow.name)
                        .pipFont(20)
                        .padding(14)
                        .background(Color.white)
                        .clipShape(RoundedRectangle(cornerRadius: 12))
                        .overlay(RoundedRectangle(cornerRadius: 12).stroke(PipStyle.border(nil).opacity(0.5), lineWidth: 2))
                        .autocorrectionDisabled()
                        .accessibilityLabel(w.nameLabel)
                        .accessibilityIdentifier("welcome:name")
                }
                Text(w.whoQ).pipFont(17, .bold)
                HStack(spacing: 12) {
                    ForEach(w.choices) { c in
                        ChoiceButton(choice: c, selected: flow.audience == c.value, idPrefix: "welcome") {
                            flow.audience = c.value
                            flow.say(c.clip)
                        }
                    }
                }
                GoButton(title: w.go, enabled: flow.audience != nil && !flow.busy, id: "welcome:continue") {
                    Task { await flow.welcomeContinue() }
                }
                // The second device's front door: type the first one's code.
                HStack(spacing: 0) {
                    Text(w.joinLead).foregroundStyle(PipStyle.muted)
                    Button(w.join) { model.joinSheet = JoinSheetState() }
                        .pipFont(17, .bold)
                        .foregroundStyle(PipStyle.inkText)
                        .underline()
                        .accessibilityIdentifier("welcome:join")
                }
                .frame(maxWidth: .infinity)
            }
        }
    }
}

struct LookScreen: View {
    @ObservedObject var flow: FirstRunFlow

    var body: some View {
        if let l = flow.copy?.look {
            WelcomeFrame {
                Text(l.title).pipFont(34, .bold).foregroundStyle(PipStyle.inkText)
                    .accessibilityAddTraits(.isHeader)
                Text(l.sub).foregroundStyle(PipStyle.muted)
                HStack(spacing: 12) {
                    ForEach(l.choices) { c in
                        ChoiceButton(choice: c, selected: flow.lookChoice == c.value,
                                     preview: l.preview, wordsOnly: c.value == "label", idPrefix: "look") {
                            flow.lookChoice = c.value
                            flow.say(c.clip)
                        }
                    }
                }
                GoButton(title: l.go, enabled: flow.lookChoice != nil && !flow.busy, id: "look:continue") {
                    Task { await flow.lookContinue() }
                }
            }
        }
    }
}

/// "Tell us about their world" (setup-ui.js), one step at a time.
struct WorldScreen: View {
    @ObservedObject var flow: FirstRunFlow
    @State private var choosing = false
    @State private var pickerRow: UUID?
    @State private var item: PhotosPickerItem?

    var body: some View {
        if let w = flow.world {
            let step = w.steps[flow.worldStep]
            WelcomeFrame {
                HStack(spacing: 6) {
                    ForEach(0..<w.steps.count, id: \.self) { i in
                        Capsule()
                            .fill(i == flow.worldStep ? PipStyle.ink : PipStyle.muted.opacity(i < flow.worldStep ? 0.6 : 0.25))
                            .frame(width: i == flow.worldStep ? 24 : 8, height: 8)
                    }
                    Spacer()
                    Button { Task { await flow.worldClose() } } label: {
                        Image(systemName: "xmark").pipFont(17, .semibold)
                            .frame(width: 44, height: 44)
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Close")
                    .accessibilityIdentifier("world:close")
                }
                .accessibilityElement(children: .contain)
                .accessibilityLabel("Step \(flow.worldStep + 1) of \(w.steps.count)")
                VStack(alignment: .leading, spacing: 6) {
                    Text(step.title).pipFont(26, .bold).foregroundStyle(PipStyle.inkText)
                        .accessibilityAddTraits(.isHeader)
                        .accessibilityIdentifier("world:title")
                    Text(step.hint).pipFont(15).foregroundStyle(PipStyle.muted)
                }
                if step.key == "people" { peopleForm(w) } else { listForm(w) }
                if let t = flow.worldToast {
                    Text(t).pipFont(15, .semibold).foregroundStyle(PipStyle.ink)
                        .accessibilityIdentifier("world:toast")
                }
                HStack(spacing: 10) {
                    if flow.worldStep > 0 {
                        Button(w.back) { flow.worldBack() }
                            .pipFont(18, .bold)
                            .frame(maxWidth: .infinity, minHeight: 56)
                            .background(Color.white)
                            .clipShape(RoundedRectangle(cornerRadius: 14))
                            .overlay(RoundedRectangle(cornerRadius: 14).stroke(PipStyle.ink.opacity(0.35), lineWidth: 1.5))
                            .foregroundStyle(PipStyle.ink)
                            .accessibilityIdentifier("world:back")
                    }
                    GoButton(title: step.next, enabled: !flow.busy, id: "world:next") {
                        Task { await flow.worldNext() }
                    }
                }
                Button(w.skip) { Task { await flow.worldSkip() } }
                    .pipFont(16)
                    .foregroundStyle(PipStyle.muted)
                    .underline()
                    .frame(maxWidth: .infinity)
                    .accessibilityIdentifier("world:skip")
            }
            .photosPicker(isPresented: $choosing, selection: $item, matching: .images)
            .onChange(of: item) { _, picked in
                guard let picked, let row = pickerRow else { return }
                item = nil
                Task {
                    if let d = try? await picked.loadTransferable(type: Data.self) { flow.setPhoto(row, data: d) }
                }
            }
            .onChange(of: flow.listText) { _, _ in flow.updatePreview() }
        }
    }

    @ViewBuilder
    private func peopleForm(_ w: FRWorld) -> some View {
        VStack(spacing: 10) {
            ForEach(Array(flow.rows.enumerated()), id: \.element.id) { i, row in
                HStack(spacing: 12) {
                    Button { pick(row) } label: { face(row) }
                        .buttonStyle(.plain)
                        .accessibilityLabel(row.picked != nil || row.photoKey != nil
                            ? "Change photo of \(row.name.isEmpty ? "this person" : row.name)"
                            : "Add a photo of \(row.name.isEmpty ? "this person" : row.name)")
                        .accessibilityIdentifier("world:face:\(i)")
                    TextField(row.personId != nil ? w.namePlaceholder
                              : "\(w.namePlaceholder) — like \(i < w.examples.count ? w.examples[i] : w.otherExample)",
                              text: Binding(get: { flow.rows[safe: i]?.name ?? "" },
                                            set: { if i < flow.rows.count { flow.rows[i].name = $0 } }))
                        .pipFont(19)
                        .padding(12)
                        .background(Color.white)
                        .clipShape(RoundedRectangle(cornerRadius: 12))
                        .overlay(RoundedRectangle(cornerRadius: 12).stroke(PipStyle.border(nil).opacity(0.5), lineWidth: 2))
                        .autocorrectionDisabled()
                        .accessibilityLabel(w.namePlaceholder)
                        .accessibilityIdentifier("world:name:\(i)")
                }
            }
            Button { flow.addRow() } label: {
                HStack(spacing: 12) {
                    Text("＋").pipFont(24).frame(width: 56, height: 56)
                        .overlay(Circle().strokeBorder(style: StrokeStyle(lineWidth: 1.5, dash: [5, 3]))
                            .foregroundStyle(PipStyle.muted))
                    Text(w.addRow).pipFont(17, .semibold)
                    Spacer()
                }
                .foregroundStyle(PipStyle.ink)
            }
            .buttonStyle(.plain)
            .accessibilityIdentifier("world:addrow")
        }
    }

    private func face(_ row: WorldRow) -> some View {
        ZStack {
            Circle().fill(Color.white)
            if let d = row.picked, let ui = UIImage(data: d) {
                Image(uiImage: ui).resizable().scaledToFill().clipShape(Circle())
            } else if let k = row.photoKey, let ui = PipAssets.image(k) {
                Image(uiImage: ui).resizable().scaledToFill().clipShape(Circle())
            } else {
                Image(systemName: "camera").pipFont(22).foregroundStyle(PipStyle.muted)
            }
        }
        .frame(width: 56, height: 56)
        .overlay(Circle().stroke(PipStyle.border(nil).opacity(0.5), lineWidth: 2))
    }

    /// UI-test hook `-pipUITestPhotoFile <path>`: the simulator's picker
    /// has no usable accessibility tree, so a test names the file the
    /// "picker" returns. Production never sets it.
    private func pick(_ row: WorldRow) {
        if let path = UITestHooks.photoFile, let d = try? Data(contentsOf: URL(fileURLWithPath: path)) {
            flow.setPhoto(row.id, data: d)
            return
        }
        pickerRow = row.id
        choosing = true
    }

    @ViewBuilder
    private func listForm(_ w: FRWorld) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            TextEditor(text: $flow.listText)
                .pipFont(19)
                .frame(minHeight: 110)
                .scrollContentBackground(.hidden)
                .padding(8)
                .background(Color.white)
                .clipShape(RoundedRectangle(cornerRadius: 12))
                .overlay(RoundedRectangle(cornerRadius: 12).stroke(PipStyle.border(nil).opacity(0.5), lineWidth: 2))
                .overlay(alignment: .topLeading) {
                    if flow.listText.isEmpty {
                        Text("One per line").foregroundStyle(PipStyle.muted.opacity(0.7))
                            .padding(16).allowsHitTesting(false)
                    }
                }
                .autocorrectionDisabled()
                .accessibilityLabel("One per line")
                .accessibilityIdentifier("world:list")
            ForEach(flow.preview) { r in
                HStack(spacing: 10) {
                    ZStack {
                        Color.white
                        if let ui = PipAssets.image(r.art) {
                            Image(uiImage: ui).resizable().scaledToFit().padding(3)
                        } else {
                            Text(r.initial).pipFont(18, .bold).foregroundStyle(PipStyle.muted)
                        }
                    }
                    .frame(width: 40, height: 40)
                    .clipShape(RoundedRectangle(cornerRadius: 8))
                    .overlay(RoundedRectangle(cornerRadius: 8)
                        .strokeBorder(style: StrokeStyle(lineWidth: 1.5, dash: r.kind == "new" ? [4, 3] : []))
                        .foregroundStyle(PipStyle.muted.opacity(0.6)))
                    Text(r.label).strikethrough(r.already).foregroundStyle(r.already ? PipStyle.muted : PipStyle.inkText)
                    if let tag = r.tag {
                        Text(tag).pipFont(13, .semibold).foregroundStyle(PipStyle.muted)
                    }
                    Spacer()
                }
                .accessibilityElement(children: .combine)
            }
        }
    }
}

private extension Array {
    subscript(safe i: Int) -> Element? { indices.contains(i) ? self[i] : nil }
}

// MARK: - the demo

/// The caption card (onramp-ui.css .tour-card): the instruction, Skip;
/// the last card offers the voices and "Start talking".
struct TourCardView: View {
    @ObservedObject var flow: FirstRunFlow
    let card: TourCard

    var body: some View {
        VStack {
            Spacer()
            VStack(alignment: .leading, spacing: 10) {
                Tour.say(card.say)
                    .pipFont(20, .heavy)
                    .foregroundStyle(PipStyle.inkText)
                    .accessibilityLabel(PipSpoken.words(card.say))
                    .accessibilityIdentifier("tour:say")
                if let note = card.note {
                    Tour.say(note).pipFont(14).foregroundStyle(PipStyle.muted)
                        .accessibilityLabel(PipSpoken.words(note))
                        .accessibilityIdentifier("tour:note")
                }
                HStack(spacing: 10) {
                    if let skip = card.skip {
                        Spacer()
                        Button(skip) { flow.tourEnd() }
                            .pipFont(17)
                            .foregroundStyle(PipStyle.muted)
                            .underline()
                            .padding(6)
                            .accessibilityIdentifier("tour:skip")
                    }
                    if card.done {
                        if let v = card.voices {
                            Button(v) { flow.tourEnd(thenVoices: true) }
                                .pipFont(18, .bold)
                                .frame(maxWidth: .infinity, minHeight: 52)
                                .background(Color.white)
                                .clipShape(RoundedRectangle(cornerRadius: 12))
                                .overlay(RoundedRectangle(cornerRadius: 12).stroke(PipStyle.ink.opacity(0.35), lineWidth: 1.5))
                                .foregroundStyle(PipStyle.ink)
                                .accessibilityIdentifier("tour:voices")
                        }
                        if let go = card.go {
                            Button(go) { flow.tourEnd() }
                                .pipFont(18, .bold)
                                .frame(maxWidth: .infinity, minHeight: 52)
                                .background(PipStyle.ink)
                                .clipShape(RoundedRectangle(cornerRadius: 12))
                                .foregroundStyle(Color.white)
                                .accessibilityIdentifier("tour:go")
                        }
                    }
                }
            }
            .padding(.horizontal, 18).padding(.vertical, 16)
            .frame(maxWidth: 460)
            .background(Color.white)
            .clipShape(RoundedRectangle(cornerRadius: 16))
            .shadow(color: .black.opacity(0.25), radius: 18, y: 8)
            .padding(.bottom, 20)
            .accessibilityElement(children: .contain)
            .accessibilityIdentifier("tour:card")
        }
        .padding(.horizontal, 16)
    }
}

enum Tour {
    /// withIcons: ✨ and ❓ show as the real sentence-bar buttons' icons,
    /// never as emoji and never as "tap more" text (Sentence_Bar.md).
    static func say(_ text: String) -> Text {
        var out = Text("")
        var run = ""
        func flush() { if !run.isEmpty { out = out + Text(run); run = "" } }
        for ch in text {
            switch ch {
            case "\u{2728}": flush(); out = out + Text(Image(systemName: "wand.and.stars"))
            case "\u{2753}": flush(); out = out + Text(Image(systemName: "questionmark"))
            case "\u{23EA}": flush(); out = out + Text(Image(systemName: "backward.fill"))
            case "\u{25B6}": flush(); out = out + Text(Image(systemName: "play.fill"))
            default: run.append(ch)
            }
        }
        flush()
        return out
    }
}

/// The pulsing ring on the one thing to tap (onramp-ui.css .tour-ring).
struct TourRing: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var pulse = false
    var body: some View {
        RoundedRectangle(cornerRadius: 14)
            .stroke(PipStyle.ink, lineWidth: 4)
            .padding(-6)
            .background(RoundedRectangle(cornerRadius: 14).stroke(PipStyle.cream, lineWidth: 4).padding(-2))
            .shadow(color: PipStyle.ink.opacity(pulse ? 0.25 : 0), radius: pulse ? 7 : 0)
            .allowsHitTesting(false)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("Tap here")
            .accessibilityIdentifier("tour:ring")
            .onAppear {
                guard !reduceMotion else { return }
                withAnimation(.easeInOut(duration: 1.4).repeatForever(autoreverses: true)) { pulse = true }
            }
    }
}

extension View {
    /// While the demo runs only its target takes a tap (the web's hooks
    /// ignore every other tap) and the target wears the ring.
    func tour(_ card: TourCard?, kind: String, id: String?) -> some View {
        modifier(TourGate(card: card, kind: kind, id: id))
    }

    /// body.touring #corner, .anchor, #backspace, #clear, #tx-past,
    /// #tx-future, #speak: quiet.
    func tourQuiet(_ card: TourCard?) -> some View {
        opacity(card == nil ? 1 : 0.35).allowsHitTesting(card == nil)
    }
}

private struct TourGate: ViewModifier {
    let card: TourCard?
    let kind: String
    let id: String?
    @ViewBuilder
    func body(content: Content) -> some View {
        if card == nil {
            content // untouched when no demo runs: identity and accessibility as before
        } else {
            let isTarget = card?.target.map { $0.kind == kind && $0.id == id } ?? false
            content
                .allowsHitTesting(isTarget)
                .overlay { if isTarget { TourRing() } }
        }
    }
}
