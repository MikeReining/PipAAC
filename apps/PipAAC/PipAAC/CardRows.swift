//
//  CardRows.swift
//  PipAAC
//
//  The word-card and editor rows added in 044 slice E8: Swap (LW-8),
//  Colour (LW-13), "Sounds wrong" (LW-20) and the editor's save status
//  (LW-22). Rendering and gestures only: every rule and write is one
//  bridge call into PIPCORE.card / PIPCORE.say (scripts/ios/app_card.mjs,
//  app_say.mjs), which call the same shared owners the web calls
//  (board/place-ui.js + board.js onPick/onGroupPick, word-card.js
//  paintKind, tile.flag, board/editor-find.js editorStatus). The
//  library's Suggested tab (LW-17) needed no Swift: LibraryView already
//  draws librarySuggested's answer.
//

import SwiftUI

// MARK: - Render models

nonisolated struct CardKindModel: Decodable, Sendable, Identifiable {
    let role: String
    let label: String
    let selected: Bool
    var id: String { role }
}

/// Where the card's word holds a cell: the home cell on the main board,
/// or this group's seat (editor-ui.js showCard).
nonisolated struct CardSwapContext: Decodable, Sendable {
    let `where`: String         // main | group
    var groupId: String?
    var page: Int?
    let slot: Int
}

nonisolated struct SwapHead: Decodable, Sendable {
    let kind: String
    let id: String
    let label: String
    let role: String?
    let count: Int
}

nonisolated struct SwapList: Decodable, Sendable {
    let head: SwapHead?
    let empty: String?
    let rows: [PlaceRow]
}

/// The swap sheet: which word, and which cell it holds.
struct SwapRequest: Identifiable {
    let kind: String
    let wordId: String
    let label: String
    let context: CardSwapContext
    var id: String { "\(kind):\(wordId)" }
}

nonisolated struct EditorStatus: Decodable, Sendable, Equatable {
    var text: String
    var tone: String
}

private nonisolated struct FlagAck: Decodable, Sendable { var accepted: Bool? }
private nonisolated struct FlagAnswer: Decodable, Sendable {
    let appId: String
    let ok: Bool
    let toast: String
}

// MARK: - AppModel

extension AppModel {
    nonisolated static let cardObject = "PIPCORE.card"

    /// LW-8: Swap for another word. The card closes first, as the web's
    /// onReplace does (closeCard), then the picker takes the sheet.
    func openSwap(_ c: WordCardModel) {
        guard let ctx = c.swap else { return }
        card = nil
        swapRequest = SwapRequest(kind: c.kind, wordId: c.id, label: c.label, context: ctx)
    }

    func swapList(_ r: SwapRequest, q: String) async -> SwapList? {
        let appId = self.appId, core = self.core
        var a: [String: Any] = ["kind": r.kind, "id": r.wordId, "q": q]
        if r.context.where == "group" { a["groupId"] = r.context.groupId ?? "" }
        return try? await Self.editCore(core, "swapList", [appId, a], object: Self.cardObject)
    }

    func swapPick(_ r: SwapRequest, row: PlaceRow) {
        var a: [String: Any] = ["kind": r.kind, "id": r.wordId, "label": r.label,
                                "slot": r.context.slot, "page": r.context.page ?? 0,
                                "pickKind": row.kind, "pickId": row.id, "pickLabel": row.label]
        if r.context.where == "group" { a["groupId"] = r.context.groupId ?? "" }
        editCall("swapPick", [a], object: Self.cardObject) { [weak self] in
            self?.swapRequest = nil
        }
    }

    /// The picker's ✎: back to the word's card (place-ui.js onEdit).
    func swapEdit(_ r: SwapRequest) {
        swapRequest = nil
        openCard(kind: r.kind, id: r.wordId)
    }

    /// LW-13: a swatch. The answer is the repainted card and board.
    func setKind(_ c: WordCardModel, role: String) {
        editCall("cardSetKind", [["id": c.id, "role": role]], object: Self.cardObject)
    }

    /// LW-20: "Sounds wrong". The answer arrives as the "card.flag" event
    /// (a Promise cannot cross the bridge); the toast is the web's.
    func flagCard(_ c: WordCardModel) {
        let appId = self.appId, core = self.core, label = c.label
        Task { @MainActor in
            let _: FlagAck? = try? await Self.editCore(core, "flagTile", [appId, label],
                                                       object: "PIPCORE.say")
        }
    }

    func handleCardFlag(_ json: String) {
        guard let ev = try? JSONDecoder().decode(FlagAnswer.self, from: Data(json.utf8)),
              ev.appId == appId else { return }
        showEditToast(EditToastModel(text: ev.toast))
    }

    /// LW-22: the honest save status (editor-find.js editorStatus). The
    /// network and whether a sync loop runs are Swift's to know; the
    /// pending-op count and the loop's health are read in the core.
    func refreshEditorStatus() async {
        let appId = self.appId, core = self.core
        let args: [String: Any] = ["linked": syncingId != nil,
                                   "online": host?.isOnline ?? true,
                                   "saveError": saveFailed]
        if let s: EditorStatus = try? await Self.editCore(
            core, "editorStatusOf", [appId, args], object: Self.cardObject),
           s != editorStatus {
            editorStatus = s
        }
    }
}

// MARK: - Card rows

/// "Swap for another word" beside the tile (word-card.js #wc-replace).
struct CardSwapButton: View {
    @EnvironmentObject var model: AppModel
    let card: WordCardModel

    var body: some View {
        if card.swap != nil {
            Button { model.openSwap(card) } label: {
                Label("Swap for another word", systemImage: "arrow.left.arrow.right")
                    .pipFont(16, .semibold)
                    .padding(.horizontal, 14).frame(minHeight: 44)
                    .background(Color.white)
                    .foregroundStyle(PipStyle.ink)
                    .clipShape(RoundedRectangle(cornerRadius: 10))
                    .overlay(RoundedRectangle(cornerRadius: 10)
                        .stroke(PipStyle.ink.opacity(0.35), lineWidth: 1.5))
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Swap \(card.label) for another word")
            .accessibilityIdentifier("wc-replace")
        }
    }
}

/// The Colour row: neutral plus the six kinds as swatches (personal words).
struct CardColourRow: View {
    @EnvironmentObject var model: AppModel
    let card: WordCardModel

    var body: some View {
        if card.canColour == true, let kinds = card.kinds, !kinds.isEmpty {
            VStack(alignment: .leading, spacing: 8) {
                HStack(spacing: 8) {
                    Text("Colour")
                        .pipFont(14, .semibold)
                        .foregroundStyle(PipStyle.muted)
                    Text(card.kindName ?? "")
                        .pipFont(14)
                        .foregroundStyle(PipStyle.muted)
                        .accessibilityIdentifier("wc-kind")
                }
                HStack(spacing: 12) {
                    ForEach(kinds) { k in
                        Button { model.setKind(card, role: k.role) } label: {
                            Circle()
                                .fill(PipStyle.fill(k.role))
                                .overlay(Circle().stroke(PipStyle.border(k.role), lineWidth: 2))
                                .overlay(Circle()
                                    .stroke(PipStyle.ink, lineWidth: k.selected ? 3 : 0)
                                    .padding(-5))
                                .frame(width: 34, height: 34)
                                .frame(width: 48, height: 48)
                                .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel(k.label)
                        .accessibilityValue(k.selected ? "Selected" : "")
                        .accessibilityAddTraits(k.selected ? [.isButton, .isSelected] : .isButton)
                        .accessibilityIdentifier("wc-kind:\(k.role)")
                    }
                }
            }
            .frame(maxWidth: 520, alignment: .leading)
        }
    }
}

// MARK: - The swap picker (place-ui.js, in a group or on the board)

struct SwapView: View {
    @EnvironmentObject var model: AppModel
    let request: SwapRequest
    @State private var q = ""
    @State private var list: SwapList?

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                if let h = list?.head {
                    Text(h.label)
                        .pipFont(22, .semibold)
                        .foregroundStyle(PipStyle.inkText)
                        .padding(.horizontal, 14).padding(.vertical, 8)
                        .background(PipStyle.fill(h.role))
                        .clipShape(RoundedRectangle(cornerRadius: 8))
                        .accessibilityIdentifier("swap-head")
                    Text(String(h.count))
                        .pipFont(15)
                        .foregroundStyle(PipStyle.muted)
                        .accessibilityLabel("\(h.count) taps in the last 30 days")
                    Button { model.swapEdit(request) } label: {
                        Image(systemName: "pencil")
                            .frame(width: 44, height: 44)
                    }
                    .accessibilityLabel("Change \(h.label)")
                    .accessibilityIdentifier("swap-edit")
                }
                Spacer()
                Button("Close") { model.swapRequest = nil }
                    .frame(minHeight: 44)
                    .accessibilityIdentifier("swap-close")
            }
            TextField("🔍", text: $q)
                .textFieldStyle(.roundedBorder)
                .pipFont(20)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .accessibilityLabel("Search words")
                .accessibilityIdentifier("swap-q")
            ScrollView {
                VStack(spacing: 6) {
                    if let e = list?.empty {
                        Text(e).foregroundStyle(PipStyle.muted)
                            .accessibilityIdentifier("swap-empty")
                    }
                    ForEach(list?.rows ?? []) { r in
                        Button { model.swapPick(request, row: r) } label: {
                            HStack {
                                Text(r.label)
                                    .pipFont(19, .semibold)
                                    .foregroundStyle(PipStyle.inkText)
                                    .padding(.horizontal, 12).padding(.vertical, 8)
                                    .background(PipStyle.fill(r.role))
                                    .clipShape(RoundedRectangle(cornerRadius: 8))
                                Spacer()
                                Text(String(r.count))
                                    .pipFont(15)
                                    .foregroundStyle(PipStyle.muted)
                            }
                            .padding(.horizontal, 8).frame(minHeight: 48)
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel(r.label)
                        .accessibilityIdentifier("swap-row:\(r.key)")
                    }
                }
            }
        }
        .padding(24)
        .background(PipStyle.cream.ignoresSafeArea())
        .overlay(alignment: .bottom) { EditToastOverlay() }
        .task(id: q) {
            if let l = await model.swapList(request, q: q) { list = l }
        }
    }
}

// MARK: - Save status (the editor's top bar)

/// editor-ui.js #ed-status: one honest line, polled each second while
/// the editor is open.
struct EditorStatusLabel: View {
    @EnvironmentObject var model: AppModel

    var body: some View {
        Text(model.editorStatus.text)
            .pipFont(14, .semibold)
            .foregroundStyle(model.editorStatus.tone == "warn"
                             ? Color(red: 0.62, green: 0.30, blue: 0.0) : PipStyle.muted)
            .lineLimit(1)
            .fixedSize(horizontal: true, vertical: false)
            .layoutPriority(2)
            .accessibilityLabel(model.editorStatus.text)
            .accessibilityIdentifier("editStatus")
            .task {
                while !Task.isCancelled {
                    await model.refreshEditorStatus()
                    try? await Task.sleep(for: .seconds(1))
                }
            }
    }
}
