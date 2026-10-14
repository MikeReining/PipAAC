//
//  SettingsView.swift
//  PipAAC
//
//  The settings sheet (settings-ui.js) + the PIN gate (pin.js — 023
//  §1e). Every row is a synced learner_profile column written through
//  appSetSetting (groups.setSetting records the op); the PIN is the
//  device's own and lives in PipPin.
//

import SwiftUI

struct SettingsView: View {
    @EnvironmentObject var model: AppModel
    @Environment(\.dismiss) private var dismiss
    @State private var pinEditor = false
    @State private var pinOn = PipPin.isSet
    @State private var note: String?
    @StateObject private var voice: VoiceSettings
    @StateObject private var help: HelpModel
    /// Pushed screens, so Help's "Show me" can pop back to a row (E5).
    @State private var path: [SettingsDest] = []
    /// The row Help pointed at (SettingsRoute ids); lit for a moment.
    @State private var focus: String?
    @State private var query = ""

    enum SettingsDest: Hashable { case help }

    init(model: AppModel) {
        _voice = StateObject(wrappedValue: VoiceSettings(model: model))
        _help = StateObject(wrappedValue: HelpModel(core: model.core))
    }

    var body: some View {
        NavigationStack(path: $path) {
            if let s = model.settings {
              ScrollViewReader { proxy in
                Group {
                  if !query.trimmingCharacters(in: .whitespaces).isEmpty {
                    // settings-ui.js: the top box searches Settings and Help
                    // together (shared two-pass search).
                    Form {
                        Section {
                            if let r = help.result {
                                HelpResults(result: r, onShow: show) { _ in
                                    query = ""
                                    path = [.help]
                                }
                            }
                        }
                    }
                  } else {
                Form {
                    Section {
                        // index.html #edit-groups — Edit mode is reached
                        // from Settings, so the PIN gate already passed.
                        Button("Edit the board") {
                            dismiss()
                            model.enterEdit()
                        }
                        .accessibilityIdentifier("editBoard")
                        .settingsRow("editBoard", focus)
                    }
                    Section {
                        LifetimeRow(life: model.lifetime)
                            .settingsRow("lifetime", focus)
                    }
                    Section {
                        NavigationLink {
                            PeopleView()
                        } label: {
                            HStack {
                                Text("People on this device")
                                Spacer()
                                Text("\(model.people.count)")
                                    .foregroundStyle(PipStyle.muted)
                            }
                        }
                        .accessibilityIdentifier("settings:people")
                        .settingsRow("people", focus)
                        NavigationLink {
                            TeamDevicesView()
                        } label: {
                            Text("Team & devices")
                        }
                        .accessibilityIdentifier("settings:team")
                        .settingsRow("team", focus)
                        NavigationLink {
                            BackupView(flow: model.flow)
                        } label: {
                            Text("Backup & privacy")
                        }
                        .accessibilityIdentifier("settings:backup")
                        NavigationLink {
                            AccountView(flow: model.flow)
                        } label: {
                            Text("Your account")
                        }
                        .accessibilityIdentifier("settings:account")
                    }
                    Section("Talking") {
                        VoiceRow(voice: voice)
                            .settingsRow("voice", focus)
                        toggle("Grammar help", "grammar_help", s.grammarHelp)
                            .settingsRow("grammar", focus)
                        toggle("Start fresh after speaking", "fresh_after_speak",
                               s.freshAfterSpeak)
                        Picker("Speaking speed", selection: rateBinding(s)) {
                            Text("Slower").tag("slower")
                            Text("Normal").tag("normal")
                            Text("Faster").tag("faster")
                        }
                        .pickerStyle(.segmented)
                        .settingsRow("speed", focus)
                    }
                    Section("Sentence bar") {
                        ForEach(s.barPresets, id: \.id) { p in
                            Button {
                                model.setSetting("bar_controls", p.controls)
                            } label: {
                                HStack {
                                    Text(p.name).foregroundStyle(PipStyle.ink)
                                    Spacer()
                                    if Set(p.controls) == Set(s.barControls) {
                                        Image(systemName: "checkmark")
                                            .foregroundStyle(PipStyle.ink)
                                    }
                                }
                            }
                            .settingsRow(p.id == s.barPresets.first?.id ? "bar" : nil, focus)
                        }
                        ForEach(s.allControls, id: \.self) { c in
                            Toggle(controlName(s, c), isOn: controlBinding(s, c))
                        }
                    }
                    Section("Keyboard") {
                        Picker("Letter order", selection: strBinding(
                            "keyboard_order", s.keyboardOrder)) {
                            Text(s.keyboardStandardName).tag("standard")
                            Text("ABC").tag("abc")
                        }
                        .pickerStyle(.segmented)
                        .settingsRow("keyboard", focus)
                    }
                    Section("Board") {
                        Picker("Cells", selection: strBinding(
                            "board_layout", s.boardLayout)) {
                            ForEach(s.layouts, id: \.self) { l in
                                Text(cellName(l)).tag(l)
                            }
                        }
                        .settingsRow("cells", focus)
                        toggle("Top row on group pages", "group_top_row",
                               s.groupTopRow)
                        toggle("Occasions in Groups", "occasions_visible",
                               s.occasionsVisible)
                    }
                    Section("Privacy") {
                        toggle("Help improve Pip — share anonymous use",
                               "share_research", s.shareResearch)
                            .settingsRow("research", focus)
                    }
                    Section("Settings PIN") {
                        Text(pinOn
                             ? "Settings is locked with a PIN."
                             : "No PIN yet: Settings opens with one tap.")
                            .foregroundStyle(PipStyle.muted)
                            .settingsRow("pin", focus)
                        Button(pinOn ? "Change PIN" : "Lock Settings with a PIN") {
                            pinEditor = true
                        }
                        .accessibilityIdentifier("pin:change")
                        if pinOn {
                            Button("Turn the PIN off") {
                                PipPin.clear()
                                pinOn = false
                                flash("PIN turned off. Settings opens with one tap.")
                            }
                            .accessibilityIdentifier("pin:off")
                        }
                        if let note {
                            Text(note).foregroundStyle(PipStyle.muted)
                        }
                    }
                    Section {
                        // settings-ui.js: Help is a Settings page (042).
                        NavigationLink(value: SettingsDest.help) {
                            Text("Help")
                        }
                        .accessibilityIdentifier("settings:help")
                    }
                }
                  }
                }
                .onChange(of: focus) { _, r in
                    if let r { withAnimation { proxy.scrollTo(r, anchor: .center) } }
                }
              }
                .searchable(text: $query,
                            placement: .navigationBarDrawer(displayMode: .always),
                            prompt: "Search or ask: feelings, teacher, bigger…")
                .onChange(of: query) { _, q in help.setQuery(q) }
                .navigationDestination(for: SettingsDest.self) { _ in
                    HelpView(help: help, onShow: show)
                }
                .navigationTitle("Settings")
                .toolbar {
                    ToolbarItem(placement: .topBarTrailing) {
                        Button("Done") { dismiss() }
                            .accessibilityIdentifier("settingsDone")
                    }
                }
            }
        }
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
            pinOn = PipPin.isSet; voice.load()
            Task { await help.load(childName: model.activeName == "this person" ? "" : model.activeName) }
        }
    }

    /// Help -> a Settings row: back to the list, scroll there, light the
    /// row for a moment (help-ui.js goTo).
    private func show(_ route: String) {
        query = ""
        path = []
        Task {
            try? await Task.sleep(for: .milliseconds(450))
            focus = route
            try? await Task.sleep(for: .milliseconds(1600))
            if focus == route { focus = nil }
        }
    }

    private func flash(_ msg: String) {
        note = msg
        Task { [msg] in
            try? await Task.sleep(for: .seconds(3))
            if note == msg { note = nil }
        }
    }

    /* Each binding reads the rendered `s` — a write republishes
       model.settings and the view re-renders with the shared layer's
       answer, so the sheet never shows a value the db doesn't hold. */
    private func toggle(_ title: String, _ key: String,
                        _ value: Bool) -> some View {
        Toggle(title, isOn: Binding(
            get: { value },
            set: { model.setSetting(key, $0 ? 1 : 0) }))
    }

    private func strBinding(_ key: String, _ value: String) -> Binding<String> {
        Binding(get: { value }, set: { model.setSetting(key, $0) })
    }

    private func rateBinding(_ s: SettingsModel) -> Binding<String> {
        strBinding("speech_rate", s.speechRate)
    }

    private func controlBinding(_ s: SettingsModel, _ c: String) -> Binding<Bool> {
        Binding(
            get: { s.barControls.contains(c) },
            set: { on in
                var set = Set(s.barControls)
                if on { set.insert(c) } else { set.remove(c) }
                // bar.mjs keeps at least one edit control on the bar —
                // the shared layer adds Clear back if both are gone.
                model.setSetting("bar_controls",
                                 s.allControls.filter { set.contains($0) })
            })
    }

    private func controlName(_ s: SettingsModel, _ c: String) -> String {
        s.controlNames[c] ?? c
    }

    private func cellName(_ layout: String) -> String {
        layout.replacingOccurrences(of: "grid", with: "") + " cells"
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
        .onAppear { focused = true }
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
