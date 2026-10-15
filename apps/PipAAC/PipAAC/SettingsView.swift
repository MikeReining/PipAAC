//
//  SettingsView.swift
//  PipAAC
//
//  Settings (settings-ui.js, 044 E4 ST-4/ST-5): full screen, the section
//  list beside one page; under 760 pt the list, then the page with Back.
//  Section names, order, intros and row labels are index.html's `.set-sec`
//  blocks, verbatim. Every row is a synced learner_profile column written
//  through appSetSetting (groups.setSetting records the op); the PIN is
//  the device's own and lives in PipPin. What the sections say about
//  themselves (summaries, checklist, glance, search over Settings rows)
//  comes from PIPCORE.settingsUi — Swift renders, never re-derives.
//
//  Pages live in SettingsPages.swift; the PIN sheet is at the bottom.
//

import Combine
import SwiftUI

// MARK: - Render models (scripts/ios/app_settings.mjs)

nonisolated struct HubSection: Decodable, Sendable, Identifiable {
    let id: String
    let title: String
    var intro: String?
    var group: String = "person"
    let summary: String
}

nonisolated struct HubChecklistItem: Decodable, Sendable, Identifiable {
    let id: String
    let done: Bool
    let label: String
    let hint: String
}

/// SY-11 (settings-ui.js renderProtect): the Protect line above the checklist.
nonisolated struct HubProtect: Decodable, Sendable {
    let visible: Bool
    let title: String
    let summary: String
}

nonisolated struct HubChecklist: Decodable, Sendable {
    let visible: Bool
    let title: String
    let items: [HubChecklistItem]
}

nonisolated struct HubGlance: Decodable, Sendable, Identifiable {
    let sec: String
    let title: String
    let summary: String
    var id: String { sec }
}

nonisolated struct HubModel: Decodable, Sendable {
    let person: String
    let unnamed: Bool
    let sections: [HubSection]
    let checklist: HubChecklist
    let protect: HubProtect
    let glance: [HubGlance]
}

private let sectionIcons: [String: String] = [
    "overview": "house", "words": "square.grid.2x2", "spotlight": "flashlight.on.fill",
    "board": "rectangle.split.3x3",
    "talking": "speaker.wave.2", "lang": "character.bubble", "team": "person.2",
    "backup": "lock.shield", "lifetime": "star", "account": "person.crop.circle", "help": "questionmark.circle",
]

// MARK: - The shell

struct SettingsView: View {
    @EnvironmentObject var model: AppModel
    @Environment(\.dismiss) var dismiss
    @State var pinEditor = false
    @State var pinOn = PipPin.isSet
    @State var note: String?
    @StateObject var voice: VoiceSettings
    // settings-ui.js: which page shows, and what the search says.
    @State var section = "overview"
    @State var query = ""
    @State var hub: HubModel?
    @State var narrowOnPage = false
    /// E9: the Spotlight page's text, the Smart bar families, the editor sheet.
    @State var spotPage: SpotPageModel?
    @State var families: [FamilyChip] = []
    @State var editingFamily: FamilyChip?
    @State var biometricOn = PipBiometric.enabled
    @State var nameText = ""
    @FocusState var nameFocused: Bool
    /// Help (E5): answers + the shared search; one box searches Settings
    /// and Help together.
    @StateObject var help: HelpModel
    /// The row Help pointed at (SettingsRoute ids); lit for a moment.
    @State var focus: String?

    /// E5 route id -> the section page that holds the row.
    static let routeSection: [String: String] = [
        "voice": "talking", "speed": "talking", "bar": "talking",
        "grammar": "lang", "keyboard": "board", "cells": "board",
        "pin": "backup", "research": "backup",
        "editBoard": "overview", "people": "team", "team": "team", "lifetime": "lifetime",
    ]

    init(model: AppModel) {
        _voice = StateObject(wrappedValue: VoiceSettings(model: model))
        _help = StateObject(wrappedValue: HelpModel(core: model.core))
    }

    private var searching: Bool { !query.trimmingCharacters(in: .whitespaces).isEmpty }
    private var me: PersonRecord? { model.people.first { $0.id == model.activeId } }

    /// Everything the hub's text depends on; a change reloads it.
    private var hubKey: String {
        "\(me?.name ?? "")|\(pinOn)|\(me?.cardShownAt != nil)|\(model.team.state?.owner ?? true)|\(model.lifetime.licensed)|\(model.settings.map { "\($0)" } ?? "")|\(voice.pick?.currentName ?? "")"
    }

    var body: some View {
        GeometryReader { geo in
            let narrow = geo.size.width < 760
            VStack(spacing: 0) {
                header(narrow: narrow)
                Divider()
                if model.settings != nil {
                    if narrow {
                        if narrowOnPage || searching { detail(narrow: true) } else { sidebar }
                    } else {
                        HStack(spacing: 0) {
                            sidebar.frame(width: 300)
                            Divider()
                            detail(narrow: false)
                        }
                    }
                } else {
                    Spacer()
                }
            }
        }
        .background(PipStyle.cream.ignoresSafeArea())
        .sheet(isPresented: $pinEditor) {
            PinSheet(change: true) { saved in
                // pin.js: the toast names what just changed — "changed"
                // when a PIN already existed, "locked" when this set it.
                let wasSet = pinOn
                pinOn = PipPin.isSet
                if saved {
                    flash(wasSet ? "Settings PIN changed."
                                 : "Settings is locked with a PIN.")
                }
            }
            .presentationDetents([.medium])
        }
        .onAppear {
            pinOn = PipPin.isSet; voice.load(); nameText = me?.name ?? ""
            Task { await help.load(childName: model.activeName == "this person" ? "" : model.activeName) }
        }
        .task(id: hubKey) { await loadHub() }
        // A universal sign-in link: land on Your account (AccountView takes it).
        .onChange(of: model.incomingSignIn, initial: true) { _, link in
            if link != nil { section = "account"; narrowOnPage = true }
        }
        .onReceive(model.lifetime.objectWillChange) { _ in Task { await loadHub() } }
        .onChange(of: pinOn) { _, _ in biometricOn = PipBiometric.enabled }
        .onChange(of: query) { _, q in help.setQuery(q) }
        .onChange(of: me?.name) { _, n in if !nameFocused { nameText = n ?? "" } }
    }

    // MARK: header (settings-ui.js .set-top)

    private func header(narrow: Bool) -> some View {
        HStack(spacing: 14) {
            if let me {
                PersonAvatar(person: me, size: 40)
            }
            VStack(alignment: .leading, spacing: 0) {
                Text(hub?.unnamed == false ? (hub?.person ?? "Settings") : "Settings")
                    .font(.system(size: 20, weight: .bold))
                    .foregroundStyle(PipStyle.ink)
                    .accessibilityIdentifier("settingsPerson")
                Text("Settings").font(.caption).foregroundStyle(PipStyle.muted)
            }
            .accessibilityElement(children: .combine)
            TextField("Search or ask: feelings, teacher, bigger…", text: $query)
                .textFieldStyle(.roundedBorder)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .submitLabel(.search)
                .frame(maxWidth: 520)
                .accessibilityLabel("Search settings and help")
                .accessibilityIdentifier("settingsSearch")
            Spacer(minLength: 0)
            Button("Done") { dismiss() }
                .buttonStyle(.borderedProminent)
                .tint(PipStyle.ink)
                .accessibilityIdentifier("settingsDone")
        }
        .padding(.horizontal, 20).padding(.vertical, 12)
    }

    // MARK: sidebar (renderNav)

    private var sidebar: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 4) {
                ForEach(hub?.sections ?? []) { sec in
                    // settings-ui.js renderNav: a heading where the group changes.
                    if sec.id == hub?.sections.first?.id || sec.group != group(before: sec) {
                        Text(sec.group == "you" ? "You"
                             : (hub?.unnamed == false ? (hub?.person ?? "") : "This person"))
                            .font(.system(size: 12, weight: .bold))
                            .foregroundStyle(PipStyle.muted)
                            .textCase(.uppercase)
                            .padding(.horizontal, 12).padding(.top, 10).padding(.bottom, 4)
                    }
                    Button {
                        query = ""
                        section = sec.id
                        narrowOnPage = true
                    } label: {
                        HStack(spacing: 12) {
                            Image(systemName: sectionIcons[sec.id] ?? "gearshape")
                                .font(.system(size: 18))
                                .frame(width: 26)
                            VStack(alignment: .leading, spacing: 2) {
                                Text(sec.title).font(.system(size: 17, weight: .semibold))
                                if !sec.summary.isEmpty {
                                    Text(sec.summary)
                                        .font(.system(size: 13))
                                        .foregroundStyle(PipStyle.muted)
                                        .lineLimit(2)
                                        .multilineTextAlignment(.leading)
                                }
                            }
                            Spacer(minLength: 0)
                        }
                        .foregroundStyle(PipStyle.ink)
                        .padding(.horizontal, 12).padding(.vertical, 10)
                        .background(section == sec.id && !searching
                                    ? PipStyle.ink.opacity(0.10) : Color.clear)
                        .clipShape(RoundedRectangle(cornerRadius: 10))
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityElement(children: .combine)
                    .accessibilityAddTraits(section == sec.id ? .isSelected : [])
                    .accessibilityIdentifier("settingsSection:\(sec.id)")
                }
            }
            .padding(10)
        }
        .background(PipStyle.cream)
    }

    private func group(before sec: HubSection) -> String? {
        guard let s = hub?.sections, let i = s.firstIndex(where: { $0.id == sec.id }), i > 0
        else { return nil }
        return s[i - 1].group
    }

    // MARK: detail

    @ViewBuilder
    private func detail(narrow: Bool) -> some View {
        NavigationStack {
            ScrollViewReader { proxy in
                Group {
                    if searching { resultsPage } else { page(section) }
                }
                .onChange(of: focus) { _, r in
                    if let r { withAnimation { proxy.scrollTo(r, anchor: .center) } }
                }
            }
            .toolbar {
                if narrow {
                    ToolbarItem(placement: .topBarLeading) {
                        Button("‹ Settings") { query = ""; narrowOnPage = false }
                            .accessibilityIdentifier("settingsBack")
                    }
                }
            }
        }
        .id(searching ? "results" : section)
    }

    @ViewBuilder
    func page(_ id: String) -> some View {
        if let s = model.settings {
            switch id {
            case "words": wordsPage()
            case "spotlight": spotlightPage(s)
            case "board": boardPage(s)
            case "talking": talkingPage(s)
            case "lang": langPage(s)
            case "team": teamPage()
            case "backup": backupPage(s)
            case "account": AccountView(flow: model.flow, team: model.team)
            case "help": HelpView(help: help, onShow: show)
            case "lifetime": LifetimeView(life: model.lifetime)
            default: overviewPage()
            }
        }
    }

    // MARK: search (runSearch)

    /// settings-ui.js: the top box searches Settings and Help together
    /// (E5's shared two-pass search): answers, and the Settings rows that
    /// exist natively.
    private var resultsPage: some View {
        Form {
            Section {
                if let r = help.result {
                    HelpResults(result: r, onShow: show) { _ in
                        query = ""
                        section = "help"
                        narrowOnPage = true
                    }
                }
            }
        }
        .navigationTitle("Results for “\(query.trimmingCharacters(in: .whitespaces))”")
        .navigationBarTitleDisplayMode(.inline)
    }

    /// Help -> a Settings row (help-ui.js goTo): open its section page,
    /// scroll there, light the row for a moment.
    func show(_ route: String) {
        query = ""
        section = Self.routeSection[route] ?? section
        narrowOnPage = true
        Task {
            try? await Task.sleep(for: .milliseconds(450))
            focus = route
            try? await Task.sleep(for: .milliseconds(1600))
            if focus == route { focus = nil }
        }
    }

    private func loadHub() async {
        let h: HubModel? = try? await model.coreValueAny(
            "PIPCORE.settingsUi", "hub", [["name": me?.name ?? "", "pinOn": pinOn, "licensed": model.lifetime.licensed,
                                      "cardMade": me?.cardShownAt != nil, "team": model.team.state?.owner == false]])
        if let h { hub = h }
        spotPage = try? await model.coreValueAny(
            "PIPCORE.lang", "spotlightPage", [["role": me?.role ?? "", "name": me?.name ?? ""]])
        families = (try? await model.coreValueAny("PIPCORE.lang", "families", [])) ?? families
    }

    func flash(_ msg: String) {
        note = msg
        Task { [msg] in
            try? await Task.sleep(for: .seconds(3))
            if note == msg { note = nil }
        }
    }

    /// Close Settings, then do `then` once the cover is gone (a sheet or
    /// Edit mode opens on the board underneath).
    func leaveSettings(then: @escaping @MainActor () -> Void) {
        dismiss()
        Task { @MainActor in
            try? await Task.sleep(for: .milliseconds(450))
            then()
        }
    }
}


extension AppModel {
    /// One core call into any PIPCORE object with structured arguments.
    func coreValueAny<T: Decodable & Sendable>(
        _ object: String, _ method: String, _ args: sending [Any]
    ) async throws -> T {
        let core = self.core
        let id = appId
        nonisolated(unsafe) let all: [Any] = [id] + args
        return try await Self.editCore(core, method, all, object: object)
    }

    /// person-card.js #person-name change: the synced person_name (core)
    /// and the people list's copy (device) move together. Blank is refused.
    func setPersonName(_ name: String) {
        let clean = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !clean.isEmpty, let id = activeId else { return }
        Task { @MainActor [weak self] in
            guard let self else { return }
            do {
                let _: PersonNameAnswer = try await coreValueAny(
                    "PIPCORE.settingsUi", "nameSet", [["name": clean]])
                try registry?.patch(id, ["name": clean])
                try refreshPeople()
            } catch { peopleError = "\(error)" }
        }
    }
}

nonisolated struct PersonNameAnswer: Decodable, Sendable { let name: String? }

// MARK: - PIN sheet (pin.js gatePin)

/// The 4-digit gate and editor — same state machine as pin.js:
/// check → (forgot →) new → confirm. `change` starts at `new` and
/// never asks for the old PIN — the gate was just passed.
struct PinSheet: View {
    enum Step { case check, forgot, fresh, confirm }
    let change: Bool
    var onDone: (Bool) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var step: Step
    @State private var input = ""
    @State private var first = ""
    @State private var error: String?
    @State private var reset = false
    @FocusState private var focused: Bool

    init(change: Bool, onDone: @escaping (Bool) -> Void) {
        self.change = change
        self.onDone = onDone
        _step = State(initialValue: change ? .fresh : .check)
    }

    var body: some View {
        NavigationStack {
            VStack(spacing: 18) {
                Text(title).font(.title2.weight(.semibold))
                if !hint.isEmpty {
                    Text(hint)
                        .font(.callout)
                        .foregroundStyle(PipStyle.muted)
                        .multilineTextAlignment(.center)
                }
                field
                if let error {
                    Text(error).foregroundStyle(.red)
                }
                if step == .forgot {
                    Button("Continue") { submit() }
                        .buttonStyle(.borderedProminent)
                }
                if step == .check {
                    // ST-3: Face ID stands in for the digits; the PIN stays the fallback.
                    if !change && PipBiometric.enabled && PipBiometric.available {
                        Button("Use \(PipBiometric.name)") { tryBiometric() }
                            .font(.callout)
                            .accessibilityIdentifier("pin:biometric")
                    }
                    Button("Forgot the PIN?") { step = .forgot; input = "" }
                        .font(.callout)
                }
                Spacer()
            }
            .padding(28)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Cancel") { dismiss(); onDone(false) }
                }
            }
        }
        .onAppear {
            focused = true
            if !change && PipBiometric.enabled && PipBiometric.available { tryBiometric() }
        }
    }

    /// One scan in place of the 4 digits; cancel or failure leaves the
    /// PIN field as it was.
    private func tryBiometric() {
        Task { @MainActor in
            if await PipBiometric.evaluate(reason: "Open Settings") {
                dismiss(); onDone(true)
            }
        }
    }

    private var title: String {
        switch step {
        case .check: return "Settings PIN"
        case .forgot: return "Forgot the PIN?"
        case .fresh:
            return reset ? "Choose a new PIN"
                : PipPin.isSet ? "New Settings PIN" : "Choose a PIN"
        case .confirm: return "Type it again"
        }
    }

    private var hint: String {
        switch step {
        case .forgot:
            return "Your words stay just as they are. To choose a new PIN, type “new pin” below."
        case .fresh:
            return "4 digits, for everyone on this device. Pick one you're happy to share with the team. Don't reuse your phone or bank PIN."
        case .confirm:
            return "The same 4 digits, to be sure."
        case .check:
            return ""
        }
    }

    @ViewBuilder private var field: some View {
        if step == .forgot {
            TextField("new pin", text: $input)
                .textFieldStyle(.roundedBorder)
                .focused($focused)
                .onSubmit { submit() }
                .accessibilityIdentifier("pin:input")
        } else {
            TextField("4 digits", text: $input)
                .textFieldStyle(.roundedBorder)
                .keyboardType(.numberPad)
                .focused($focused)
                .multilineTextAlignment(.center)
                .font(.system(size: 28, weight: .medium, design: .monospaced))
                .frame(maxWidth: 220)
                // Four digits is the whole PIN: act on the fourth.
                .onChange(of: input) { _, v in
                    let digits = String(v.filter(\.isNumber).prefix(4))
                    if digits != v { input = digits }
                    if digits.count == 4 { submit() }
                }
                .accessibilityIdentifier("pin:input")
        }
    }

    private func submit() {
        let v = input.trimmingCharacters(in: .whitespaces)
        switch step {
        case .check:
            if PipPin.check(v) { dismiss(); onDone(true) }
            else { input = ""; error = "Not that PIN." }
        case .forgot:
            if PipPin.isResetPhrase(v) { reset = true; step = .fresh; input = ""; error = nil }
            else { error = "Type the two words: \(PipPin.resetPhrase)" }
        case .fresh:
            guard v.range(of: #"^\d{4}$"#, options: .regularExpression) != nil
            else { error = "4 digits."; return }
            first = v; step = .confirm; input = ""; error = nil
        case .confirm:
            if v != first {
                step = .fresh; input = ""
                error = "Those didn't match. Start again."
                return
            }
            _ = PipPin.set(v)
            dismiss(); onDone(true)
        }
    }
}
extension View {
    /// A Settings row Help can point at: a stable scroll id and a quiet
    /// highlight while `focus` names it (the web's `set-found`).
    func settingsRow(_ route: String?, _ focus: String?) -> some View {
        modifier(SettingsRowMark(route: route, focus: focus))
    }
}

private struct SettingsRowMark: ViewModifier {
    let route: String?
    let focus: String?
    @ViewBuilder func body(content: Content) -> some View {
        let lit = route != nil && route == focus
        if let route {
            content.id(route)
                .modifier(Lit(lit: lit, route: route))
        } else {
            content
        }
    }
}

private struct Lit: ViewModifier {
    let lit: Bool
    let route: String
    func body(content: Content) -> some View {
        content
            .listRowBackground(lit ? Color.yellow.opacity(0.35) : nil)
            .overlay(alignment: .topLeading) {
                if lit {
                    Color.clear.frame(width: 1, height: 1)
                        .accessibilityElement()
                        .accessibilityIdentifier("found:\(route)")
                }
            }
    }
}

