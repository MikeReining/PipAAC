//
//  SettingsPages.swift
//  PipAAC
//
//  The pages of Settings (044 E4): index.html's `.set-sec` blocks, one
//  per section, with the web's row labels and help text verbatim. A row
//  is a label, its control, and its hint (footer). Every control writes
//  through appSetSetting; nothing here decides a rule. Rows the iPad has
//  no feature for yet (Spotlight, Progress, Pip Lifetime, the recovery
//  card, Your account, Help) are not drawn.
//

import SwiftUI

extension SettingsView {
    private var person: String { hub?.person ?? "this person" }

    /// The page's one-line intro (`.set-intro`).
    @ViewBuilder
    private func introSection(_ id: String) -> some View {
        if let t = hub?.sections.first(where: { $0.id == id })?.intro {
            Section {
                Text(t).foregroundStyle(PipStyle.muted)
                    .accessibilityIdentifier("settingsIntro:\(id)")
            }
        }
    }

    // MARK: Overview (ST-5)

    func overviewPage() -> some View {
        Form {
            // person-card.js: name and photo lead the page.
            Section {
                HStack(spacing: 14) {
                    if let me = model.people.first(where: { $0.id == model.activeId }) {
                        PersonAvatar(person: me, size: 56)
                    }
                    TextField("Their name", text: $nameText)
                        .font(.system(size: 22, weight: .semibold))
                        .focused($nameFocused)
                        .submitLabel(.done)
                        .onSubmit { model.setPersonName(nameText) }
                        .accessibilityLabel("Name")
                        .accessibilityIdentifier("person:name")
                }
            } header: {
                Text("Name")
            }
            PersonPhotoSection()

            // The board card: editing is what adults come here for most.
            Section {
                Button("Edit the board") {
                    dismiss()
                    model.enterEdit()
                }
                .accessibilityIdentifier("editBoard")
                .settingsRow("editBoard", focus)
                Button("Add a word") {
                    leaveSettings { model.openAdd(groupId: nil) }
                }
                .accessibilityIdentifier("settings:addWord")
            }

            if let c = hub?.checklist, c.visible {
                Section {
                    ForEach(c.items) { it in
                        Button {
                            if it.id == "name" { nameFocused = true }
                            else { leaveSettings { model.openAdd(groupId: nil) } }
                        } label: {
                            HStack(spacing: 12) {
                                Image(systemName: it.done ? "checkmark.circle.fill" : "circle")
                                    .foregroundStyle(it.done ? PipStyle.ink : PipStyle.muted)
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(it.label).font(.headline).foregroundStyle(PipStyle.ink)
                                    Text(it.hint).font(.subheadline).foregroundStyle(PipStyle.muted)
                                }
                            }
                        }
                        .disabled(it.done)
                        .accessibilityIdentifier("setup:\(it.id)")
                    }
                } header: {
                    Text(c.title).accessibilityIdentifier("setupTitle")
                }
            }

            Section {
                Button("Replay the tour") {
                    leaveSettings { model.firstRun.replayTour() }
                }
                .accessibilityIdentifier("settings:replayTour")
            }

            Section("How it's set up") {
                ForEach(hub?.glance ?? []) { g in
                    Button {
                        section = g.sec
                        narrowOnPage = true
                    } label: {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(g.title).font(.headline).foregroundStyle(PipStyle.ink)
                            Text(g.summary).font(.subheadline).foregroundStyle(PipStyle.muted)
                        }
                    }
                    .accessibilityIdentifier("glance:\(g.sec)")
                }
            }
        }
        .navigationTitle("Overview")
        .navigationBarTitleDisplayMode(.inline)
    }

    // MARK: Words (ST-7)

    func wordsPage() -> some View {
        Form {
            introSection("words")
            Section {
                Button("Add a word") {
                    leaveSettings { model.openAdd(groupId: nil) }
                }
                .accessibilityIdentifier("settings:addWord")
                Button("All words") {
                    leaveSettings { model.showLibrary = true }
                }
                .accessibilityIdentifier("settings:allWords")
            }
            Section {
                Button("Names, photos, and places") {
                    leaveSettings { model.firstRun.openWorldFromSettings() }
                }
                .accessibilityIdentifier("settings:peoplePlaces")
            } header: {
                Text("People & places")
            } footer: {
                Text("The people \(person) calls for and the places Pip should suggest.")
            }
            Section {
                NavigationLink("Show groups") {
                    GroupShowsPage(model: model)
                }
                .accessibilityIdentifier("settings:showGroups")
                Button("Edit groups on the board") {
                    dismiss()
                    model.enterEdit()
                    Task { @MainActor in
                        try? await Task.sleep(for: .milliseconds(450))
                        model.showGroupsEdit = true
                    }
                }
                .accessibilityIdentifier("settings:editGroups")
            } footer: {
                Text("One order, the same on the board, here and in the editor. Drag the grip to move a group; a hidden group keeps its words and its place. To add or rename groups, edit them on the board.")
            }
        }
        .navigationTitle("Words")
        .navigationBarTitleDisplayMode(.inline)
    }

    // MARK: Board (BS-22)

    func boardPage(_ s: SettingsModel) -> some View {
        Form {
            introSection("board")
            Section {
                Picker("Buttons per screen", selection: strBinding("board_layout", s.boardLayout)) {
                    ForEach(s.layouts.sorted { cellCount($0) < cellCount($1) }, id: \.self) { l in
                        Text("\(cellCount(l))").tag(l)
                    }
                }
                .pickerStyle(.segmented)
                .accessibilityIdentifier("board:cells")
                .settingsRow("cells", focus)
            } header: {
                Text("Buttons per screen")
            } footer: {
                Text("Fewer, bigger buttons are easier to hit. More buttons reach a word in fewer taps. Pip shows what moves before anything changes.")
            }
            Section {
                Picker("Buttons show", selection: strBinding("presentation_mode", s.look)) {
                    Text("Pictures and words").tag("symbol")
                    Text("Words only").tag("label")
                }
                .pickerStyle(.segmented)
                .accessibilityIdentifier("board:look")
                .accessibilityValue(s.look == "label" ? "Words only" : "Pictures and words")
            } header: {
                Text("Buttons show")
            } footer: {
                Text("Words only removes every picture. Each button keeps its place and its color; the word gets bigger.")
            }
            Section {
                toggle("Keep the top row in every group", "group_top_row", s.groupTopRow)
            } footer: {
                Text("The same words stay in the same place when \(person) opens a group.")
            }
            Section {
                Picker("Letter layout", selection: strBinding("keyboard_order", s.keyboardOrder)) {
                    Text(s.keyboardStandardName).tag("standard")
                    Text("ABC").tag("abc")
                }
                .pickerStyle(.segmented)
                .settingsRow("keyboard", focus)
            } header: {
                Text("Letter layout")
            } footer: {
                Text("Pick once. Switching moves every letter, and \(person) has to relearn them.")
            }
        }
        .navigationTitle("Board")
        .navigationBarTitleDisplayMode(.inline)
    }

    // MARK: Talking

    func talkingPage(_ s: SettingsModel) -> some View {
        Form {
            introSection("talking")
            Section {
                VoiceRow(voice: voice)
                    .settingsRow("voice", focus)
            } header: {
                Text("Voice")
            } footer: {
                Text("More voices are coming. Every word and sentence speaks in the one voice you choose.")
            }
            Section {
                Picker("Speaking speed", selection: rateBinding(s)) {
                    Text("Slower").tag("slower")
                    Text("Normal").tag("normal")
                    Text("Faster").tag("faster")
                }
                .pickerStyle(.segmented)
                .settingsRow("speed", focus)
            } header: {
                Text("Speaking speed")
            } footer: {
                Text("Every word and sentence plays at this speed. The voice keeps its pitch.")
            }
            Section {
                toggle("Feeling faces", "expressive_voice", s.expressiveVoice)
            } footer: {
                Text(s.expressiveVoice
                     ? "Tap a face to hear it. In the Smart bar, faces let \(person) say a sentence happy, sad, or angry."
                     : "Off — the Smart bar shows word suggestions instead.")
            }
            Section {
                Picker("After Play", selection: Binding(
                    get: { s.freshAfterSpeak ? 1 : 0 },
                    set: { model.setSetting("fresh_after_speak", $0) })) {
                    Text("Keep the sentence").tag(0)
                    Text("Start a new one").tag(1)
                }
                .pickerStyle(.segmented)
                .accessibilityIdentifier("talking:afterPlay")
            } header: {
                Text("After Play")
            } footer: {
                Text("After \"I want juice\" is played, tapping \"more\" either adds on or starts a fresh sentence.")
            }
            Section {
                ForEach(s.allControls, id: \.self) { c in
                    Toggle(controlName(s, c), isOn: controlBinding(s, c))
                        .settingsRow(c == s.allControls.first ? "bar" : nil, focus)
                }
            } header: {
                Text("Sentence bar")
            } footer: {
                Text("This is the bar \(person) sees. Tap a button to hide it or bring it back.")
            }
            Section {
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
                }
            } header: {
                Text("Quick setups")
            } footer: {
                Text("Play is always there, and so is Clear or Backspace, so a wrong word can always come off. Hidden buttons give their space to Play.")
            }
        }
        .navigationTitle("Talking")
        .navigationBarTitleDisplayMode(.inline)
    }

    // MARK: Language help

    func langPage(_ s: SettingsModel) -> some View {
        Form {
            introSection("lang")
            Section {
                toggle("Grammar help", "grammar_help", s.grammarHelp)
                    .settingsRow("grammar", focus)
            } footer: {
                Text("Words take the form the sentence needs: after \"he\", the board reads wants, has, him.")
            }
        }
        .navigationTitle("Language help")
        .navigationBarTitleDisplayMode(.inline)
    }

    // MARK: Team & devices

    func teamPage() -> some View {
        Form {
            introSection("team")
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
                    TeamDevicesView(team: model.team)
                } label: {
                    Text("Devices")
                }
                .accessibilityIdentifier("settings:team")
                .settingsRow("team", focus)
            }
        }
        .navigationTitle("Team & devices")
        .navigationBarTitleDisplayMode(.inline)
    }

    // MARK: Backup & privacy

    func backupPage(_ s: SettingsModel) -> some View {
        // C5's page (intro + the recovery card) leads; the PIN, the
        // anonymous counts and the speaking voice follow, as on the web.
        BackupView(flow: model.flow, team: model.team) {
            Section {
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
                    Button("Turn off the PIN") {
                        PipPin.clear()
                        pinOn = false
                        flash("PIN turned off. Settings opens with one tap.")
                    }
                    .accessibilityIdentifier("pin:off")
                }
                if let note {
                    Text(note).foregroundStyle(PipStyle.muted)
                }
            } header: {
                Text("Settings PIN")
            } footer: {
                Text("One PIN for everyone on this device. Pip never shows it, so a child watching can't learn it. Forgot it? Tap “Forgot the PIN?” and type “new pin”.")
            }
            Section {
                toggle("Share anonymous counts with Pip", "share_research", s.shareResearch)
                    .settingsRow("research", focus)
            } footer: {
                Text("Daily totals only: word counts, sentence lengths, speed. Never names, \(person)'s own words, sentences, or tap times.")
            }
            Section {
                Text("Word labels you type or add are sent to a voice provider (ElevenLabs) to speak them in the board's voice — including names like \(person)'s. Only the word text is sent: never an account, email, photo, or recording.")
                    .foregroundStyle(PipStyle.muted)
            } header: {
                Text("The speaking voice")
            }
        }
    }

    // MARK: bindings

    /* Each binding reads the rendered `s` — a write republishes
       model.settings and the view re-renders with the shared layer's
       answer, so the page never shows a value the db doesn't hold. */
    func toggle(_ title: String, _ key: String, _ value: Bool) -> some View {
        Toggle(title, isOn: Binding(
            get: { value },
            set: { model.setSetting(key, $0 ? 1 : 0) }))
    }

    func strBinding(_ key: String, _ value: String) -> Binding<String> {
        Binding(get: { value }, set: { model.setSetting(key, $0) })
    }

    func rateBinding(_ s: SettingsModel) -> Binding<String> {
        strBinding("speech_rate", s.speechRate)
    }

    func controlBinding(_ s: SettingsModel, _ c: String) -> Binding<Bool> {
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

    func controlName(_ s: SettingsModel, _ c: String) -> String {
        s.controlNames[c] ?? c
    }

    /// cells-sheet.js: a layout's button is its cell count ("grid60" → 60).
    func cellCount(_ layout: String) -> Int {
        Int(layout.filter(\.isNumber)) ?? 0
    }
}
