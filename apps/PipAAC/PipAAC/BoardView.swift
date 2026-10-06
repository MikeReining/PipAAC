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

    var body: some View {
        VStack(spacing: 8) {
            topBar
            stripRow
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
        .sheet(isPresented: $model.showSettings) {
            SettingsView()
                .environmentObject(model)
        }
        .overlay(alignment: .top) {
            if let toast = model.toast {
                Text(toast)
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(PipStyle.ink)
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
            cornerButton
            ScrollViewReader { proxy in
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 6) {
                        if model.bar.isEmpty && model.typing == nil {
                            Text("Tap a word to start.")
                                .font(.system(size: 16, weight: .medium))
                                .foregroundStyle(PipStyle.muted)
                                .padding(.horizontal, 10)
                        } else {
                            ForEach(Array(model.bar.enumerated()), id: \.offset) { i, chip in
                                BarChip(display: chip.display ?? "", art: chip.art)
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
                .onTapGesture {
                    if !model.bar.isEmpty { model.speak() }
                }
                .onChange(of: model.bar.count) { _, n in
                    if n > 0 { withAnimation { proxy.scrollTo(n - 1, anchor: .trailing) } }
                }
            }
            .layoutPriority(1)
            .accessibilityIdentifier("sentenceBar")

            let editable = !model.bar.isEmpty || model.typing != nil
            if model.controls.contains("backspace") {
                BarButton(system: "delete.backward", label: "Backspace",
                          enabled: editable) { model.backspace() }
            }
            if model.controls.contains("clear") {
                BarButton(system: "xmark", label: "Clear",
                          enabled: editable) { model.clear() }
            }
            if model.controls.contains("fix") {
                TxButton(system: "wand.and.stars", label: "Fix it",
                         enabled: !model.bar.isEmpty) { model.transform("fix") }
            }
            if model.controls.contains("question") {
                TxButton(system: "questionmark", label: "Ask it",
                         selected: model.question,
                         enabled: !model.bar.isEmpty) { model.transform("question") }
            }
            if model.controls.contains("past") {
                TxButton(system: "backward.fill", label: "Say it in the past",
                         selected: model.tense == "past",
                         enabled: !model.bar.isEmpty) { model.transform("past") }
            }
            BarButton(system: "play.fill", label: "Play",
                      enabled: !model.bar.isEmpty, wide: true) { model.speak() }
            if model.controls.contains("future") {
                TxButton(system: "forward.fill", label: "Say it in the future",
                         selected: model.tense == "future",
                         enabled: !model.bar.isEmpty) { model.transform("future") }
            }
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
            ForEach(0..<cap, id: \.self) { i in
                if i < cards.count {
                    stripButton(cards[i])
                } else {
                    EmptyCell().frame(maxHeight: .infinity)
                }
            }
            .frame(maxWidth: .infinity)
            AnchorTile(icon: "folder.fill", label: "Groups") {
                switch model.surface {
                case .board: model.openGroups()
                case .group: model.openGroups()
                case .index: model.backToBoard()
                case .boot: break
                }
            }
            AnchorTile(icon: "keyboard",
                       label: model.kb == nil ? "Keyboard" : "Board") {
                model.toggleKeyboard()
            }
            .accessibilityIdentifier("anchor:keyboard")
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
                          role: card.role, art: card.art)
            }
            .buttonStyle(.plain)
            .accessibilityIdentifier("strip:\(card.id ?? card.label ?? "?")")
        }
    }

    // MARK: - Grid

    private var gridArea: some View {
        GeometryReader { geo in
            switch model.surface {
            case .boot:
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
        return VStack(spacing: gap) {
            ForEach(0..<rows, id: \.self) { r in
                HStack(spacing: gap) {
                    ForEach(0..<cols, id: \.self) { c in
                        let slot = r * cols + c
                        cellView(cells.first(where: { $0.slot == slot }))
                            .frame(width: w, height: h)
                    }
                }
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    @ViewBuilder
    private func cellView(_ cell: CellModel?) -> some View {
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
                         role: cell?.role, art: cell?.art)
            }
            .buttonStyle(.plain)
            .accessibilityIdentifier("tile:\(cell?.id ?? "")")
        case "groups":
            AnchorTile(icon: "folder.fill", label: "Groups") { model.openGroups() }
        case "family":
            ChromeTile(label: cell?.glyph ?? cell?.label ?? "?") {
                if let f = cell?.familyId { model.openFamily(f) }
            }
        case "group":
            GroupDoor(label: cell?.name ?? "", glyph: cell?.glyph) {
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
        return VStack(spacing: gap) {
            ForEach(0..<rows, id: \.self) { r in
                HStack(spacing: gap) {
                    ForEach(kb.keys.filter { $0.slot / cols == r }.sorted { $0.slot < $1.slot },
                            id: \.slot) { key in
                        kbKeyView(key)
                            .frame(width: w * CGFloat(key.span) + gap * CGFloat(key.span - 1),
                                   height: h)
                    }
                }
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    @ViewBuilder
    private func kbKeyView(_ key: KbKeyModel) -> some View {
        switch key.kind {
        case "partner":
            Button { if let id = key.senseId { model.kbPartner(id) } } label: {
                WordTile(label: key.label ?? "", role: key.role, art: key.art)
            }
            .buttonStyle(.plain)
            .accessibilityIdentifier("kbpartner:\(key.senseId ?? "")")
        case "empty":
            EmptyCell()
        default:
            Button { if let v = key.value { model.kbPress(v) } } label: {
                KbKeyCap(key: key)
            }
            .buttonStyle(.plain)
            .accessibilityIdentifier("kbkey:\(key.value ?? "?")")
            .accessibilityLabel(key.kind == "backspace" ? "Delete" : (key.value ?? ""))
        }
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
        .frame(width: 92)
        .accessibilityLabel(label)
    }
}

/// A group door on the index — name + glyph (or photo later).
struct GroupDoor: View {
    let label: String
    let glyph: String?
    var action: () -> Void
    var body: some View {
        Button(action: action) {
            VStack(spacing: 4) {
                Text(glyph ?? "▸").font(.system(size: 26))
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
    var action: () -> Void
    var body: some View {
        Button(action: action) {
            Image(systemName: system)
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
        .accessibilityLabel(label)
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
