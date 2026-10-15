//
//  BoardView.swift
//  PipAAC
//
//  The board screen — sentence bar, prediction strip (Groups/Keyboard
//  anchors), and the coordinate-map grid, plus the group index and
//  group pages as board surfaces (027: a board mode, not a modal).
//

import SwiftUI

struct BoardView: View {
    @EnvironmentObject var model: AppModel
    @State private var pinGate = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        VStack(spacing: 8) {
            if model.editing {
                EditHeader()           // EditMode.swift — Done, Groups/Board
            } else {
                topBar
                stripRow
            }
            gridArea
        }
        .padding(.horizontal, 10)
        .padding(.bottom, 8)
        .background(PipStyle.cream.ignoresSafeArea())
        .sheet(isPresented: $pinGate) {
            // 023 §1e — every Settings open asks once a PIN is set.
            PinSheet(change: false) { ok in
                if ok { model.openSettings() }
            }
            .presentationDetents([.medium])
        }
        // The web's Settings is a full-screen overlay: a section list
        // beside one page (settings-ui.js).
        .fullScreenCover(isPresented: $model.showSettings) {
            SettingsView(model: model)
                .environmentObject(model)
                .environment(\.wordsOnly, model.wordsOnly)
        }
        // A universal sign-in link opens Settings like the gear does - PIN
        // first when one is set - and Settings lands on Your account.
        .onChange(of: "\(model.incomingSignIn ?? "")|\(model.activeId ?? "")", initial: true) { _, _ in
            // (keyed on the open person too: a cold-launch link waits for the core)
            guard model.incomingSignIn != nil, model.activeId != nil, !model.showSettings else { return }
            if PipPin.isSet { pinGate = true } else { model.openSettings() }
        }
        .sheet(isPresented: $model.showLifetime) {
            LifetimeSheet().environmentObject(model)
        }
        .sheet(isPresented: $model.showLibrary) {
            LibraryView()                // LibraryView.swift
                .environmentObject(model)
        }
        .sheet(isPresented: $model.showGroupsEdit) {
            GroupsEditView(model: model)  // GroupsEditView.swift
                .environmentObject(model)
        }
        // Presentation mode (BS-22): one value, read by every tile.
        .environment(\.wordsOnly, model.wordsOnly)
        // card / add a word / "Also in" / place — one sheet (AddWordView.swift)
        .modifier(EditSheets(inLibrary: false))
        .overlay(alignment: .bottom) { EditToastOverlay() }
        .animation(.easeInOut(duration: 0.2), value: model.editToast?.text)
        .overlay(alignment: .top) {
            if let toast = model.toast {
                HStack(spacing: 12) {
                    Text(toast)
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(PipStyle.ink)
                    if LifetimeDoor.matches(toast) {
                        Button("See Pip Lifetime") { model.openLifetime() }
                            .font(.system(size: 15, weight: .bold))
                            .accessibilityIdentifier("toast-lifetime")
                    }
                }
                    .padding(.horizontal, 16).padding(.vertical, 10)
                    .background(Color.white)
                    .clipShape(RoundedRectangle(cornerRadius: 12))
                    .overlay(RoundedRectangle(cornerRadius: 12)
                        .stroke(PipStyle.ink.opacity(0.3), lineWidth: 1.5))
                    .shadow(color: .black.opacity(0.12), radius: 8, y: 3)
                    .padding(.top, 76)
                    .transition(.move(edge: .top).combined(with: .opacity))
                    .accessibilityIdentifier("toast")
            }
        }
        .animation(.easeInOut(duration: 0.2), value: model.toast)
    }

    // MARK: - Sentence bar

    /// Web order: the scroll holds chips, then ⌫ ✕ inside the bar; the
    /// model buttons ✨ ❓ sit apart from the time transport ⏪ ▶ ⏩
    /// (index.html #bar + tx-* — docs/product/Sentence_Bar.md).
    private var topBar: some View {
        HStack(spacing: 8) {
            cornerButton.tourQuiet(model.tourCard)
            ScrollViewReader { proxy in
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 6) {
                        if model.bar.isEmpty && model.typing == nil {
                            Text("Tap a word to start.")
                                .font(.system(size: 16, weight: .medium))
                                .foregroundStyle(PipStyle.muted)
                                .padding(.horizontal, 10)
                                .frame(minHeight: 44)
                                .contentShape(Rectangle())
                                .accessibilityElement(children: .combine)
                        } else {
                            ForEach(Array(model.bar.enumerated()), id: \.offset) { i, chip in
                                BarChip(display: chip.display ?? "", art: chip.art ?? chip.photoKey)
                                    .id(i)
                            }
                            if let typing = model.typing {
                                Text(typing + "▌")
                                    .font(.system(size: 22, weight: .semibold))
                                    .foregroundStyle(PipStyle.ink)
                                    .padding(.horizontal, 4)
                                    .id("typing")
                            }
                        }
                    }
                    .padding(.vertical, 4)
                }
                // An empty bar has nothing to play: no tap target (a tiny
                // "Tap a word to start." that claimed to be tappable failed the audit).
                .modifier(PlayOnTap(enabled: !model.bar.isEmpty) { model.speak() })
                .onChange(of: model.bar.count) { _, n in
                    if n > 0 { if reduceMotion { proxy.scrollTo(n - 1, anchor: .trailing) }
                        else { withAnimation { proxy.scrollTo(n - 1, anchor: .trailing) } } }
                }
            }
            .layoutPriority(1)
            // The chips stay their own elements (VoiceOver reads the words in
            // order); the bar itself offers Play as an action.
            .accessibilityElement(children: .contain)
            .accessibilityLabel("Sentence")
            .accessibilityAction(named: "Play") { if !model.bar.isEmpty { model.speak() } }
            .accessibilityIdentifier("sentenceBar")

            let editable = !model.bar.isEmpty || model.typing != nil
            if model.controls.contains("backspace") {
                BarButton(system: "delete.backward", label: "Backspace",
                          enabled: editable) { model.backspace() }
                    .tourQuiet(model.tourCard)
            }
            if model.controls.contains("clear") {
                BarButton(system: "xmark", label: "Clear",
                          enabled: editable) { model.clear() }
                    .tourQuiet(model.tourCard)
            }
            if model.controls.contains("fix") {
                TxButton(system: "wand.and.stars", label: "Fix it",
                         enabled: !model.bar.isEmpty,
                         spot: model.spot.controls["fix"]) { model.transform("fix") }
                    .tour(model.tourCard, kind: "button", id: "fix")
            }
            if model.controls.contains("question") {
                TxButton(system: "questionmark", label: "Ask it as a question",
                         selected: model.question,
                         enabled: !model.bar.isEmpty,
                         spot: model.spot.controls["question"]) { model.transform("question") }
                    .tour(model.tourCard, kind: "button", id: "question")
            }
            if model.controls.contains("past") {
                TxButton(system: "backward.fill", label: "Say it in the past",
                         selected: model.tense == "past",
                         enabled: !model.bar.isEmpty) { model.transform("past") }
                    .tourQuiet(model.tourCard)
            }
            BarButton(system: "play.fill", label: "Play",
                      enabled: !model.bar.isEmpty, wide: true) { model.speak() }
                .tourQuiet(model.tourCard)
            if model.controls.contains("future") {
                TxButton(system: "forward.fill", label: "Say it in the future",
                         selected: model.tense == "future",
                         enabled: !model.bar.isEmpty) { model.transform("future") }
                    .tourQuiet(model.tourCard)
            }
            SpotChip()               // Spotlight.swift - "🔦 Name · End" while a glow runs
        }
        .frame(height: 64)
    }

    /// The settings gear — small, quiet, borderless, far top-left
    /// (base.css #corner). While a group or the index is open the
    /// corner becomes Home instead.
    @ViewBuilder
    private var cornerButton: some View {
        if model.surface == .board {
            Button {
                if PipPin.isSet { pinGate = true } else { model.openSettings() }
            } label: {
                Image(systemName: "gearshape")
                    .font(.system(size: 22))
                    .foregroundStyle(PipStyle.muted)
                    .frame(width: 44, height: 48)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Settings")
            .accessibilityIdentifier("settingsGear")
        } else {
            Button { model.backToBoard() } label: {
                Image(systemName: "house.fill")
                    .font(.system(size: 22))
                    .foregroundStyle(PipStyle.ink)
                    .frame(width: 44, height: 48)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Home")
        }
    }

    // MARK: - Strip

    private var stripRow: some View {
        HStack(spacing: 8) {
            let cap = model.strip?.cap ?? 4
            let cards = model.strip?.cards ?? []
            if model.spot.modeling {
                // A supporter's spotlight: the line sits where the suggestions were.
                ModelBar(spot: model.spot)
            } else {
                // 025 § 1: the faces take the last slot; word suggestions fill the rest.
                let wordSlots = cap - (model.facesShown ? 1 : 0)
                ForEach(0..<wordSlots, id: \.self) { i in
                    if i < cards.count {
                        stripButton(cards[i])
                    } else {
                        EmptyCell().frame(maxHeight: .infinity)
                    }
                }
                .frame(maxWidth: .infinity)
                if model.facesShown, let faces = model.strip?.faces {
                    FaceCard(faces: faces).frame(maxWidth: .infinity)
                }
            }
            AnchorTile(icon: "folder.fill", label: "Groups", glow: model.spot.groups) {
                switch model.surface {
                case .board: model.openGroups()
                case .group: model.openGroups()
                case .index: model.backToBoard()
                case .boot, .picker: break
                }
            }
            .tourQuiet(model.tourCard)
            AnchorTile(icon: "keyboard",
                       label: model.kb == nil ? "Keyboard" : "Board") {
                model.toggleKeyboard()
            }
            .accessibilityIdentifier("anchor:keyboard")
            .tourQuiet(model.tourCard)
        }
        .frame(height: 76)
    }

    @ViewBuilder
    private func stripButton(_ card: CardModel) -> some View {
        switch card.kind {
        case "more":
            ChromeTile(label: card.label ?? "more ›") { model.familyMore() }
        case "family":
            ChromeTile(label: card.label ?? card.glyph ?? "?") {
                if let next = card.nextFamily { model.openFamily(next) }
            }
        default:
            Button {
                if let id = card.id {
                    model.tap(kind: card.kind, id: id, text: card.label ?? "",
                              source: model.strip?.mode == "complete" ? "keyboard" : "strip")
                }
            } label: {
                StripCard(label: card.label ?? "",
                          role: card.role, art: card.art ?? card.photoKey)
            }
            .buttonStyle(.plain)
            .accessibilityLabel(card.label ?? "")
            .accessibilityIdentifier("strip:\(card.id ?? card.label ?? "?")")
            .tour(model.tourCard, kind: "strip", id: card.id)
        }
    }

    // MARK: - Grid

    private var gridArea: some View {
        GeometryReader { geo in
            switch model.surface {
            case .boot, .picker:
                ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
            case .board:
                if let kb = model.kb {
                    kbGrid(kb, in: geo.size)
                } else if let b = model.board {
                    slotGrid(cols: b.cols, rows: b.rows, cells: b.cells, in: geo.size)
                }
            case .index:
                if let idx = model.groupIndex, let page = idx.pages.first {
                    slotGrid(cols: idx.cols, rows: idx.rows, cells: page.cells, in: geo.size)
                }
            case .group:
                if let gp = model.groupPage {
                    slotGrid(cols: gp.cols, rows: gp.rows, cells: gp.cells, in: geo.size)
                }
            }
        }
    }

    private func slotGrid(cols: Int, rows: Int, cells: [CellModel], in size: CGSize) -> some View {
        let gap: CGFloat = 6
        let w = (size.width - gap * CGFloat(cols - 1)) / CGFloat(cols)
        let h = (size.height - gap * CGFloat(rows - 1)) / CGFloat(rows)
        // Edit mode: the slot under a release point (EditCell drag).
        let slotAt: (CGPoint) -> Int? = { p in
            let c = Int(p.x / (w + gap)), r = Int(p.y / (h + gap))
            guard p.x >= 0, p.y >= 0, c < cols, r < rows else { return nil }
            return r * cols + c
        }
        return VStack(spacing: gap) {
            ForEach(0..<rows, id: \.self) { r in
                HStack(spacing: gap) {
                    ForEach(0..<cols, id: \.self) { c in
                        let slot = r * cols + c
                        cellView(cells.first(where: { $0.slot == slot }), slot: slot, slotAt: slotAt)
                            .frame(width: w, height: h)
                    }
                }
                .zIndex(model.editing ? Double(rows - r) : 0)
            }
        }
        .coordinateSpace(name: "slotgrid")
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    @ViewBuilder
    private func cellView(_ cell: CellModel?, slot: Int,
                          slotAt: @escaping (CGPoint) -> Int?) -> some View {
        if model.editing, let cell, cell.type == "word" {
            EditCell(cell: cell, slotAt: slotAt)
        } else if model.editing, cell == nil || cell?.type == "empty",
                  cell?.locked != true, model.surface == .board || model.surface == .group {
            EditEmptyCell(slot: slot)      // AddWordView.swift — a door in Edit mode
        } else {
            plainCell(cell)
                .tour(model.tourCard, kind: "cell", id: cell?.type == "word" ? cell?.id : nil)
        }
    }

    @ViewBuilder
    private func plainCell(_ cell: CellModel?) -> some View {
        let spotMark = model.spot.mark(cell?.kind ?? "sense", cell?.id)
        // SB-9: board only - never in a group, with the keyboard open, or editing.
        let outlined = model.surface == .board && model.kb == nil && !model.editing
            && cell?.id.map { model.likely.contains($0) } == true
        switch cell?.type {
        case "word":
            Button {
                if let id = cell?.id {
                    model.tap(kind: cell?.kind ?? "sense", id: id,
                              text: cell?.label ?? "",
                              source: model.surface == .group ? "group" : "grid")
                }
            } label: {
                WordTile(label: cell?.label ?? "",
                         role: cell?.role, art: cell?.art ?? cell?.photoKey,
                         likely: outlined)
            }
            .buttonStyle(.plain)
            .spotMark(spotMark, dim: model.spot.dim)
            // The word itself; Pip speaks it on tap, so no hint or second
            // spoken form (044 A0: VoiceOver must not say it twice).
            .accessibilityLabel(cell?.label ?? "")
            .accessibilityIdentifier("tile:\(cell?.id ?? "")")
            .accessibilityValue([
                tileValue(photo: ((cell?.art ?? cell?.photoKey).flatMap { PipBlobs.url(forKey: $0) }) != nil,
                          wordsOnly: model.wordsOnly, count: nil),
                spotMark?.a11y,
                outlined ? "likely next" : nil,
            ].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: ", "))
        case "groups":
            AnchorTile(icon: "folder.fill", label: "Groups", glow: model.spot.groups) { model.openGroups() }
        case "family":
            ChromeTile(label: cell?.glyph ?? cell?.label ?? "?") {
                if let f = cell?.familyId { model.openFamily(f) }
            }
        case "group":
            GroupDoor(label: cell?.name ?? "", glyph: cell?.glyph, face: cell) {
                if let g = cell?.groupId { model.openGroup(g) }
            }
            .accessibilityIdentifier("group:\(cell?.groupId ?? "")")
        case "next":
            ChromeTile(label: "Next ›") { model.nextGroupPage() }
        default:
            EmptyCell()
        }
    }

    // MARK: - Keyboard

    /// The locale's key map in the grid's place — 50 slots, 5 rows of
    /// 10 (keyboard.mjs). Span keys (space) stretch across their slots;
    /// partner keys draw as the word's own board tile.
    private func kbGrid(_ kb: KeyboardModel, in size: CGSize) -> some View {
        let gap: CGFloat = 6
        let cols = 10, rows = 5
        let w = (size.width - gap * CGFloat(cols - 1)) / CGFloat(cols)
        let h = (size.height - gap * CGFloat(rows - 1)) / CGFloat(rows)
        let device = kb.mode == "device"
        return VStack(spacing: gap) {
            ForEach(0..<rows, id: \.self) { r in
                if device && r == 1 {
                    // KB-7 (keyboard-ui.js buildKbDevice): the system keyboard
                    // types into one field across row 2.
                    DeviceKeyboardField().frame(height: h)
                } else {
                    let keys = kb.keys.filter { $0.slot / cols == r }.sorted { $0.slot < $1.slot }
                    HStack(spacing: gap) {
                        // The answer keys sit in the last columns of row 1.
                        if let first = keys.first, first.slot % cols > 0 {
                            Color.clear.frame(width: (w + gap) * CGFloat(first.slot % cols) - gap, height: h)
                        }
                        ForEach(keys, id: \.slot) { key in
                            kbKeyView(key)
                                .frame(width: w * CGFloat(key.span) + gap * CGFloat(key.span - 1),
                                       height: h)
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
            }
            if device { Spacer(minLength: 0) }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
    }

    @ViewBuilder
    private func kbKeyView(_ key: KbKeyModel) -> some View {
        switch key.kind {
        case "partner":
            Button { if let id = key.senseId { model.kbPartner(id) } } label: {
                WordTile(label: key.label ?? "", role: key.role, art: key.art)
            }
            .buttonStyle(.plain)
            .accessibilityLabel(key.label ?? "")
            .accessibilityIdentifier("kbpartner:\(key.senseId ?? "")")
        case "empty":
            EmptyCell()
        default:
            Button { if let v = key.value { model.kbPress(v) } } label: {
                KbKeyCap(key: key)
            }
            .buttonStyle(.plain)
            .accessibilityIdentifier("kbkey:\(key.value ?? "?")")
            .accessibilityLabel(key.kind == "backspace" ? "Backspace"
                                : key.kind == "space" ? "space" : (key.value ?? ""))
            .accessibilityAddTraits(key.latched == true ? .isSelected : [])
        }
    }
}

/// Tap the bar to play it - only while there is something to play.
private struct PlayOnTap: ViewModifier {
    let enabled: Bool
    let play: () -> Void
    @ViewBuilder func body(content: Content) -> some View {
        if enabled { content.onTapGesture(perform: play) } else { content }
    }
}

// MARK: - Chrome pieces

/// A plain chrome tile (glyph + label) — groups anchor, family tile,
/// group doors, Next.
struct ChromeTile: View {
    let label: String
    var action: () -> Void
    var body: some View {
        Button(action: action) {
            Text(label)
                .font(.system(size: 18, weight: .semibold))
                .foregroundStyle(PipStyle.ink)
                .multilineTextAlignment(.center)
                .lineLimit(2)
                .minimumScaleFactor(0.6)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .background(Color.white)
                .clipShape(RoundedRectangle(cornerRadius: 10))
                .overlay(RoundedRectangle(cornerRadius: 10)
                    .stroke(PipStyle.muted.opacity(0.5), lineWidth: 2))
        }
        .buttonStyle(.plain)
    }
}

/// The strip's utility anchors: icon over a small caption.
struct AnchorTile: View {
    let icon: String
    let label: String
    var dimmed = false
    /// Spotlight (D5): a target sits inside a group - the Groups button glows.
    var glow = false
    var action: () -> Void
    var body: some View {
        Button(action: action) {
            VStack(spacing: 2) {
                Image(systemName: icon).font(.system(size: 22))
                Text(label).font(.system(size: 11, weight: .medium))
            }
            .foregroundStyle(PipStyle.ink)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(Color.white)
            .clipShape(RoundedRectangle(cornerRadius: 10))
            .overlay(RoundedRectangle(cornerRadius: 10)
                .stroke(PipStyle.muted.opacity(0.5), lineWidth: 2))
            .opacity(dimmed ? 0.45 : 1)
        }
        .buttonStyle(.plain)
        .disabled(dimmed)
        .spotMark(glow ? SpotMark(glow: true) : nil, dim: 1)
        .frame(width: 92)
        .accessibilityLabel(label)
        .accessibilityValue(glow ? "glowing" : "")
    }
}

/// A group's face (group-glyph.js): the core says which — an ink icon, a
/// picture (a pinned one, or a family group's first word), an emoji, or an
/// initial. Swift only draws it.
struct GroupFace: View {
    let icon: String?
    let picture: String?
    let emoji: String?
    let initial: String?
    var size: CGFloat = 34

    init(_ cell: CellModel?, size: CGFloat = 34) {
        icon = cell?.icon; picture = cell?.picture
        emoji = cell?.emoji ?? cell?.glyph; initial = cell?.initial
        self.size = size
    }
    init(icon: String?, picture: String?, emoji: String?, initial: String?, size: CGFloat = 34) {
        self.icon = icon; self.picture = picture; self.emoji = emoji
        self.initial = initial; self.size = size
    }

    var body: some View {
        Group {
            if let ui = PipAssets.image(picture) {
                Image(uiImage: ui).resizable().scaledToFit()
                    .clipShape(RoundedRectangle(cornerRadius: 6))
            } else if let ui = PipAssets.image(icon) {
                Image(uiImage: ui).resizable().scaledToFit()
            } else if let emoji, !emoji.isEmpty {
                Text(emoji).font(.system(size: size * 0.78))
            } else {
                Text(initial ?? "•")
                    .font(.system(size: size * 0.7, weight: .bold))
                    .foregroundStyle(PipStyle.ink)
            }
        }
        .frame(width: size, height: size)
        .accessibilityHidden(true)
    }
}

/// A group door on the index — name + face.
struct GroupDoor: View {
    let label: String
    let glyph: String?
    var face: CellModel? = nil
    var action: () -> Void
    var body: some View {
        Button(action: action) {
            VStack(spacing: 4) {
                if face?.icon != nil || face?.picture != nil || face?.emoji != nil || face?.initial != nil {
                    GroupFace(face, size: 54)
                } else {
                    Text(glyph ?? "▸").font(.system(size: 26))
                }
                Text(label)
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(PipStyle.ink)
                    .multilineTextAlignment(.center)
                    .lineLimit(2)
                    .minimumScaleFactor(0.6)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(Color.white)
            .clipShape(RoundedRectangle(cornerRadius: 10))
            .overlay(RoundedRectangle(cornerRadius: 10)
                .stroke(PipStyle.muted.opacity(0.5), lineWidth: 2))
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
        .accessibilityValue(face?.icon ?? face?.picture ?? "")
    }
}

/// A keyboard key — big centered cap; ⌫ and space get the util style;
/// a latched dead key lights (two taps in a fixed order, never a
/// long-press — keyboard.mjs).
struct KbKeyCap: View {
    let key: KbKeyModel
    var body: some View {
        let util = key.kind != "char"
        VStack(spacing: 0) {
            Text(key.kind == "space" ? "␣"
                 : key.kind == "backspace" ? "⌫"
                 : key.value ?? "")
                .font(.system(size: util ? 22 : 30, weight: util ? .semibold : .bold))
            if key.kind == "space" {
                Text("space").font(.system(size: 10, weight: .medium))
                    .foregroundStyle(PipStyle.muted)
            }
        }
        .foregroundStyle(PipStyle.ink)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(key.latched == true ? PipStyle.ink.opacity(0.15) : Color.white)
        .clipShape(RoundedRectangle(cornerRadius: 8))
        .overlay(RoundedRectangle(cornerRadius: 8)
            .stroke(PipStyle.ink.opacity(util ? 0.25 : 0.4),
                    lineWidth: key.latched == true ? 2.5 : 1.5))
    }
}

/// A transform button — same footprint as the bar buttons, `selected`
/// fills it (the tense trio is a three-position switch; ❓ lights while
/// the bar is a question — Sentence_Bar § 4.2).
struct TxButton: View {
    let system: String
    let label: String
    var selected = false
    var enabled = true
    /// Spotlight (D5): ✨ / ❓ as targets get the same ring as a word.
    var spot: SpotControl?
    var action: () -> Void
    var body: some View {
        Button(action: action) {
            Image(systemName: system)
                .accessibilityHidden(true)
                .font(.system(size: 18, weight: .semibold))
                .frame(width: 44, height: 48)
                .background(selected ? PipStyle.ink
                            : enabled ? Color.white : Color(white: 0.94))
                .foregroundStyle(selected ? Color.white
                                 : enabled ? PipStyle.ink : PipStyle.muted.opacity(0.5))
                .clipShape(RoundedRectangle(cornerRadius: 10))
                .overlay(RoundedRectangle(cornerRadius: 10)
                    .stroke(PipStyle.ink.opacity(0.35), lineWidth: 1.5))
        }
        .buttonStyle(.plain)
        .disabled(!enabled)
        .accessibilityAddTraits(selected ? .isSelected : [])
        .spotMark(spot.map { SpotMark(glow: $0.glow, modeled: $0.modeled, count: $0.count) }, dim: 1)
        .accessibilityLabel(label)
        .accessibilityValue(spot?.modeled == true ? "modeled" : (spot?.glow == true ? "glowing" : ""))
    }
}

struct BarButton: View {
    let system: String
    let label: String
    var enabled = true
    var wide = false
    var action: () -> Void
    var body: some View {
        Button(action: action) {
            Image(systemName: system)
                .accessibilityHidden(true)
                .font(.system(size: 20, weight: .semibold))
                .frame(width: wide ? 64 : 48, height: 48)
                .background(enabled ? Color.white : Color(white: 0.94))
                .foregroundStyle(enabled ? PipStyle.ink : PipStyle.muted.opacity(0.5))
                .clipShape(RoundedRectangle(cornerRadius: 10))
                .overlay(RoundedRectangle(cornerRadius: 10)
                    .stroke(PipStyle.ink.opacity(0.35), lineWidth: 1.5))
        }
        .buttonStyle(.plain)
        .disabled(!enabled)
        .accessibilityLabel(label)
    }
}
