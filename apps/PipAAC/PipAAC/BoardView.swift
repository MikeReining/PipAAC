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

    var body: some View {
        VStack(spacing: 8) {
            topBar
            stripRow
            gridArea
        }
        .padding(.horizontal, 10)
        .padding(.bottom, 8)
        .background(PipStyle.cream.ignoresSafeArea())
    }

    // MARK: - Sentence bar

    private var topBar: some View {
        HStack(spacing: 8) {
            ScrollViewReader { proxy in
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 6) {
                        if model.bar.isEmpty {
                            Text("Tap a word to start.")
                                .font(.system(size: 16, weight: .medium))
                                .foregroundStyle(PipStyle.muted)
                                .padding(.horizontal, 10)
                        } else {
                            ForEach(Array(model.bar.enumerated()), id: \.offset) { i, chip in
                                BarChip(display: chip.display ?? "", art: chip.art)
                                    .id(i)
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

            BarButton(system: "delete.backward", label: "Backspace",
                      enabled: !model.bar.isEmpty) { model.backspace() }
            BarButton(system: "xmark", label: "Clear",
                      enabled: !model.bar.isEmpty) { model.clear() }
            BarButton(system: "play.fill", label: "Play",
                      enabled: !model.bar.isEmpty, wide: true) { model.speak() }
        }
        .frame(height: 64)
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
            AnchorTile(icon: "keyboard", label: "Keyboard", dimmed: true) {}
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
                    model.tap(kind: card.kind, id: id,
                              text: card.label ?? "", source: "strip")
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
                if let b = model.board {
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
