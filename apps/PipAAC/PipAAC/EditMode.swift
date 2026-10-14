//
//  EditMode.swift
//  PipAAC
//
//  Edit mode (044 E1; inventory LW-1, 6, 7, 9, 10, 11). Rendering and
//  gestures only: every write is one bridge call into PIPCORE.edit
//  (scripts/ios/app_edit.mjs), which calls the same shared owner the web
//  calls, records the sync op, and answers with the whole repainted
//  state. Nothing here knows a rule — not what a catalog word may do,
//  not where a drop lands.
//

import SwiftUI

// MARK: - Render models (scripts/ios/app_edit.mjs)

nonisolated struct WordCardGroupModel: Decodable, Sendable, Hashable {
    let id: String
    let name: String
}

nonisolated struct WordCardModel: Decodable, Sendable, Identifiable {
    let kind: String            // sense | entity
    let id: String
    let label: String
    let role: String?
    let art: String?
    let photoKey: String?
    /// Picture and Voice rows' state (scripts/ios/app_media.mjs mediaFor).
    var media: CardMedia?
    let isEntity: Bool
    let canRename: Bool
    let canHide: Bool
    let canRemove: Bool
    let hidden: Bool
    let hint: String
    let onMainBoard: Bool
    let groups: [WordCardGroupModel]
    /// Set only on the add's step 2 ("✓ Added to …").
    var justAdded: JustAdded?
    var sheetID: String { "\(kind):\(id)" }
}

nonisolated struct CardMedia: Decodable, Sendable {
    let canUseOurs: Bool
    var voice: CardVoice?
}

nonisolated struct CardVoice: Decodable, Sendable {
    let name: String
    let text: String
    let hasRecording: Bool
    let mineOn: Bool
}

nonisolated struct JustAdded: Decodable, Sendable {
    let groupName: String
}

nonisolated struct ToastWordRef: Decodable, Sendable {
    let kind: String
    let id: String
    let label: String
}

nonisolated struct EditToastModel: Decodable, Sendable {
    let text: String
    var undo: String?
    /// The web's toast action ("Add to other groups" after an add).
    var actionLabel: String?
    var other: ToastWordRef?
}

nonisolated struct EditPaint: Decodable, Sendable {
    let editing: Bool
    var countsOn: Bool?
    let surface: String         // board | group
    let board: BoardModel
    var groupPage: GroupPageModel?
    var card: WordCardModel?
    var toast: EditToastModel?
}

nonisolated struct CardSpeech: Decodable, Sendable {
    var speech: SpeechSlotModel?
}

// MARK: - AppModel: Edit mode

extension AppModel {
    nonisolated static func editCore<T: Decodable & Sendable>(
        _ core: PipCore, _ method: String, _ args: sending [Any],
        object: String = "PIPCORE.edit"
    ) async throws -> T {
        try core.sync { try decodeRaw(core.call(object, method, args)) }
    }

    /// One edit call, awaited off the main actor, applied on it.
    /// `openCard` is true only for the call that is meant to show the card.
    func editCall(_ method: String, _ args: [Any], openCard: Bool = false,
                  clearToast: Bool = false, object: String = "PIPCORE.edit",
                  then: (@MainActor () -> Void)? = nil) {
        let appId = self.appId
        let core = self.core
        Task { @MainActor [weak self] in
            guard let self else { return }
            do {
                let p: EditPaint = try await Self.editCore(core, method, [appId] + args, object: object)
                if clearToast { editToast = nil }
                applyEdit(p, openCard: openCard)
                then?()
            } catch {
                NSLog("AppModel.edit.\(method) failed: \(error)")
            }
        }
    }

    func applyEdit(_ p: EditPaint, openCard: Bool) {
        editing = p.editing
        countsOn = p.countsOn ?? false
        board = p.board
        if let gp = p.groupPage { groupPage = gp }
        if p.card != nil {
            // A rename answered after the sheet was dismissed must not
            // reopen it.
            if openCard || card != nil { card = p.card }
        } else {
            card = nil
        }
        if let t = p.toast { showEditToast(t) }
    }

    func showEditToast(_ t: EditToastModel) {
        editToastSeq += 1
        let seq = editToastSeq
        editToast = t
        Task { [weak self] in
            try? await Task.sleep(for: .seconds(6))      // edit-shared.js toast: 6 s
            if self?.editToastSeq == seq { self?.editToast = nil }
        }
    }

    // MARK: mode (LW-1)

    /// Settings → "Edit the board" (already behind the PIN gate).
    func enterEdit() {
        editCall("editOpen", [])
    }

    /// ✓ Done — the same view, repainted for the child.
    func exitEdit() {
        editToast = nil
        card = nil
        editCall("editClose", []) { [weak self] in
            guard let self else { return }
            switch surface {
            case .group:
                if let gp = groupPage { openGroup(gp.groupId, page: gp.page) }
            case .index: openGroups()
            default: backToBoard()
            }
        }
    }

    // MARK: the card (LW-6)

    func openCard(kind: String, id: String) {
        editCall("cardOpen", [["kind": kind, "id": id]], openCard: true)
    }

    func speakCard(_ c: WordCardModel) {
        let appId = self.appId
        let core = self.core
        Task { @MainActor [weak self] in
            guard let self else { return }
            do {
                let r: CardSpeech = try await Self.editCore(
                    core, "cardSpeech",
                    [appId, ["kind": c.kind, "id": c.id, "text": c.label]])
                if let s = r.speech {
                    speaker.play(slot: .init(type: s.type, key: s.key, text: s.text))
                }
            } catch { NSLog("AppModel.edit.cardSpeech failed: \(error)") }
        }
    }

    // MARK: writes (LW-7, 9, 10, 11)

    func renameCard(_ c: WordCardModel, to name: String) {
        editCall("cardRename", [["kind": c.kind, "id": c.id, "name": name]])
    }

    func toggleHidden(_ c: WordCardModel) {
        editCall("cardToggleHidden", [["id": c.id]])
    }

    func removeWord(_ c: WordCardModel) {
        editCall("cardRemove", [["id": c.id]])
    }

    /// The ✕ on a group tile (`fromCard` false) or on the card's chip.
    func leaveGroup(kind: String, id: String, groupId: String,
                    label: String, fromCard: Bool) {
        editCall("leaveGroup", [["kind": kind, "id": id, "groupId": groupId,
                                 "label": label, "fromCard": fromCard]])
    }

    func dropOnBoard(_ cell: CellModel, toSlot: Int) {
        guard let id = cell.id else { return }
        editCall("boardDrop", [["kind": cell.kind ?? "sense", "id": id,
                                "toSlot": toSlot, "label": cell.label ?? ""]])
    }

    func dropOnGroup(_ cell: CellModel, toSlot: Int) {
        guard let id = cell.id, let g = groupPage?.groupId else { return }
        editCall("groupDrop", [["groupId": g, "kind": cell.kind ?? "sense",
                                "id": id, "toSlot": toSlot]])
    }

    /// 📊 (board.js #edit-counts, BS-21): the badge is the core's useCounts;
    /// the answer is the repainted board, counts included.
    func toggleCounts() {
        editCall("countsSet", [["on": !countsOn]], object: "PIPCORE.groupsEdit")
    }

    func undo(_ t: EditToastModel) {
        guard let token = t.undo else { return }
        editToast = nil
        editCall("editUndo", [["token": token]])
    }
}

// MARK: - UI-test launch hooks

/// Launch arguments only the XCUITests pass: a clean data file, and one
/// personal word seated on the board (adding words is a later slice;
/// rename and remove need one to act on). Never set in a shipped launch.
nonisolated enum UITestHooks {
    private static let args = ProcessInfo.processInfo.arguments

    /// A UI-test launch: no production traffic unless a stub base URL is given.
    static var hermetic: Bool {
        args.contains("-pipUITestReset") || args.contains("-PipDataDir")
    }

    /// E7: a UI-test launch boots straight to the board (first run is a
    /// fresh-install gate); only a test that is about first run passes
    /// `-pipUITestFirstRun`. The registry row is untouched (a join still
    /// replaces its placeholder) - only the welcome is not shown.
    /// A test's argument-less RELAUNCH of a skipped run still skips: the
    /// skipping launch leaves a marker beside its data.
    static var skipFirstRun: Bool {
        let marker = (try? PipAssets.dataBase())?.appendingPathComponent("test-skip-first-run")
        if hermetic {
            if args.contains("-pipUITestFirstRun") { return false }
            if let marker { try? Data().write(to: marker) }
            return true
        }
        return marker.map { FileManager.default.fileExists(atPath: $0.path) } ?? false
    }

    /// E7: walk the "their world" form inside first run. The web opens it
    /// only from Settings (that row is not built yet), so tests reach it here.
    static var firstRunWorld: Bool { args.contains("-pipUITestFirstRunWorld") }

    /// E7: the file a first-run test's "photo picker" returns (the
    /// simulator's real picker has no usable accessibility tree).
    static var photoFile: String? {
        guard let i = args.firstIndex(of: "-pipUITestPhotoFile"), i + 1 < args.count else { return nil }
        return args[i + 1]
    }

    /// F1: a UI-test launch whose "App Store" is the in-process fake.
    static var fakeStore: Bool { args.contains("-PipFakeStore") }

    static func resetIfRequested() {
        guard args.contains("-pipUITestReset"),
              let base = try? PipAssets.dataBase() else { return }
        // The people registry and every person's file (PeopleRegistry).
        try? FileManager.default.removeItem(at: base.appendingPathComponent("people.json"))
        try? FileManager.default.removeItem(at: base.appendingPathComponent("Users", isDirectory: true))
        UserDefaults.standard.removeObject(forKey: "pip.pin.device") // PipPin's key
        try? PipKeychain.delete("account/state") // 044 C5: signed-in state is device-only
    }

    /// F2: a signed-in supporter account, without the passkey ceremony the
    /// simulator cannot run. `-pipUITestSeedAccount <file>` holds the
    /// {acct_id, email, session} the local Worker issued; it lands in the
    /// keychain exactly where app_account.mjs keeps the real sign-in.
    static func seedAccountIfRequested(service: String) {
        guard let i = args.firstIndex(of: "-pipUITestSeedAccount"), i + 1 < args.count,
              let data = FileManager.default.contents(atPath: args[i + 1]) else { return }
        try? PipKeychain.put("account/state", data, service: service)
    }

    /// E6: `-pipUITestLicense <string>` stores a license for the open person,
    /// as a purchase would leave it (the pictures need one; the purchase
    /// itself is the F1 slice's test).
    static var licenseToSeed: String? {
        guard let i = args.firstIndex(of: "-pipUITestLicense"), i + 1 < args.count else { return nil }
        return args[i + 1]
    }

    /// E6: `-pipUITestPhotoFiles a.png,b.png` - "Add photos" takes these files
    /// through the same save path in place of the system picker.
    static var photoFiles: [String]? {
        guard let i = args.firstIndex(of: "-pipUITestPhotoFiles"), i + 1 < args.count else { return nil }
        return args[i + 1].split(separator: ",").map(String.init)
    }

    static func seedIfRequested(_ core: PipCore, appId: String) {
        guard let i = args.firstIndex(of: "-pipUITestSeedPerson"),
              i + 1 < args.count else { return }
        _ = try? core.call("PIPCORE.edit", "testSeedPerson",
                           [appId, ["name": args[i + 1]]])
    }
}

// MARK: - Views

/// The strip row's place while editing (body.editing: the corner is
/// "Done editing"; the groups way in stays one tap away).
struct EditHeader: View {
    @EnvironmentObject var model: AppModel

    private func headerButton(_ title: String, system: String, id: String,
                              action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Label(title, systemImage: system)
                .font(.system(size: 16, weight: .semibold))
                .lineLimit(1)
                .fixedSize()
                .padding(.horizontal, 12)
                .frame(height: 48)
                .background(Color.white)
                .foregroundStyle(PipStyle.ink)
                .clipShape(RoundedRectangle(cornerRadius: 10))
                .overlay(RoundedRectangle(cornerRadius: 10)
                    .stroke(PipStyle.ink.opacity(0.35), lineWidth: 1.5))
        }
        .buttonStyle(.plain)
        .accessibilityLabel(title)
        .accessibilityIdentifier(id)
    }

    var body: some View {
        HStack(spacing: 12) {
            Button { model.exitEdit() } label: {
                Label("Done", systemImage: "checkmark")
                    .font(.system(size: 18, weight: .semibold))
                    .padding(.horizontal, 16)
                    .frame(height: 48)
                    .background(PipStyle.ink)
                    .foregroundStyle(Color.white)
                    .clipShape(RoundedRectangle(cornerRadius: 10))
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Done editing")
            .accessibilityIdentifier("editDone")
            Text("Editing the board. Tap a word to change it; drag to move it.")
                .font(.system(size: 16, weight: .medium))
                .foregroundStyle(PipStyle.muted)
                .lineLimit(2)
                .minimumScaleFactor(0.7)
            Spacer(minLength: 4)
            // 018 D10: 📊 puts the child's own 30-day taps on every tile.
            Button { model.toggleCounts() } label: {
                Image(systemName: "chart.bar.fill")
                    .font(.system(size: 18, weight: .semibold))
                    .frame(width: 48, height: 48)
                    .background(model.countsOn ? PipStyle.ink : Color.white)
                    .foregroundStyle(model.countsOn ? Color.white : PipStyle.ink)
                    .clipShape(RoundedRectangle(cornerRadius: 10))
                    .overlay(RoundedRectangle(cornerRadius: 10)
                        .stroke(PipStyle.ink.opacity(0.35), lineWidth: 1.5))
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Show how often each word is used")
            .accessibilityValue(model.countsOn ? "On" : "Off")
            .accessibilityIdentifier("editCounts")
            headerButton("Edit groups", system: "folder.badge.gearshape", id: "editGroupsManage") {
                model.showGroupsEdit = true
            }
            headerButton("Add a word", system: "plus", id: "editAdd") {
                model.openAdd(groupId: model.surface == .group ? model.groupPage?.groupId : nil)
            }
            headerButton("All words", system: "books.vertical", id: "editLibrary") {
                model.showLibrary = true
            }
            Button {
                if model.surface == .board { model.openGroups() } else { model.backToBoard() }
            } label: {
                Label(model.surface == .board ? "Groups" : "Board",
                      systemImage: model.surface == .board ? "folder.fill" : "square.grid.3x3.fill")
                    .font(.system(size: 16, weight: .semibold)).lineLimit(1).fixedSize()
                    .padding(.horizontal, 14)
                    .frame(height: 48)
                    .background(Color.white)
                    .foregroundStyle(PipStyle.ink)
                    .clipShape(RoundedRectangle(cornerRadius: 10))
                    .overlay(RoundedRectangle(cornerRadius: 10)
                        .stroke(PipStyle.ink.opacity(0.35), lineWidth: 1.5))
            }
            .buttonStyle(.plain)
            .accessibilityIdentifier("editGroups")
        }
        .frame(height: 64)
    }
}

/// A word tile in Edit mode: tap opens its card, a drag moves it (the
/// release point's slot decides; the core decides whether it lands).
/// Dashed ring = the editing look; a hidden word is a faded ghost.
struct EditCell: View {
    @EnvironmentObject var model: AppModel
    let cell: CellModel
    let slotAt: (CGPoint) -> Int?
    @Environment(\.wordsOnly) private var wordsOnly

    @State private var offset: CGSize = .zero
    @State private var dragging = false

    private var inGroup: Bool { model.surface == .group }
    /// Reserved cells on a group page show the home board's word: not
    /// group content, never movable — only a hidden one opens its card.
    private var reserved: Bool { cell.reserved == true }
    private var movable: Bool { !reserved }

    var body: some View {
        ZStack(alignment: .topTrailing) {
            tile
            if inGroup && !reserved, let id = cell.id,
               let g = model.groupPage {
                Button {
                    model.leaveGroup(kind: cell.kind ?? "sense", id: id,
                                     groupId: g.groupId,
                                     label: cell.label ?? "", fromCard: false)
                } label: {
                    Image(systemName: "xmark.circle.fill")
                        .font(.system(size: 22))
                        .symbolRenderingMode(.palette)
                        .foregroundStyle(Color.white, PipStyle.ink)
                        .padding(4)
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Remove from \(g.name)")
                .accessibilityIdentifier("x:\(id)")
            }
        }
        .offset(offset)
        .zIndex(dragging ? 5 : 0)
    }

    private var tile: some View {
        WordTile(label: cell.label ?? "", role: cell.role, art: cell.art ?? cell.photoKey,
                 count: cell.count)
            .opacity(cell.hidden == true ? 0.4 : 1)
            .overlay(RoundedRectangle(cornerRadius: 10)
                .strokeBorder(style: StrokeStyle(lineWidth: 2, dash: [6, 4]))
                .foregroundStyle(PipStyle.ink.opacity(0.55)))
            .shadow(color: .black.opacity(dragging ? 0.25 : 0), radius: 8, y: 4)
            .contentShape(Rectangle())
            .onTapGesture {
                if reserved && cell.hidden != true { return }
                if let id = cell.id { model.openCard(kind: cell.kind ?? "sense", id: id) }
            }
            .gesture(
                DragGesture(minimumDistance: 10, coordinateSpace: .named("slotgrid"))
                    .onChanged { v in
                        guard movable else { return }
                        dragging = true
                        offset = v.translation
                    }
                    .onEnded { v in
                        defer { dragging = false; offset = .zero }
                        guard movable, let to = slotAt(v.location), to != cell.slot
                        else { return }
                        if inGroup { model.dropOnGroup(cell, toSlot: to) }
                        else { model.dropOnBoard(cell, toSlot: to) }
                    }
            )
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(cell.label ?? "")
            .accessibilityHint(reserved && cell.hidden != true
                               ? "Always here, from the main board"
                               : "Opens this word's card")
            .accessibilityAddTraits(.isButton)
            .accessibilityIdentifier("tile:\(cell.id ?? "")")
            .accessibilityValue(tileValue(
                photo: (cell.art ?? cell.photoKey)?.hasPrefix("blob:") == true,
                wordsOnly: wordsOnly, count: cell.count))
    }
}

/// The one-at-a-time undo toast (edit-shared.js toast): text, Undo for
/// six seconds.
struct EditToastOverlay: View {
    @EnvironmentObject var model: AppModel

    var body: some View {
        if let t = model.editToast {
            HStack(spacing: 14) {
                Text(t.text)
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(PipStyle.ink)
                    .accessibilityIdentifier("editToastText")
                if LifetimeDoor.matches(t.text) {
                    Button("See Pip Lifetime") { model.openLifetime() }
                        .font(.system(size: 16, weight: .bold))
                        .accessibilityIdentifier("toast-lifetime")
                }
                if t.undo != nil {
                    Button("Undo") { model.undo(t) }
                        .font(.system(size: 16, weight: .bold))
                        .accessibilityIdentifier("toast-undo")
                }
                if let label = t.actionLabel, let w = t.other {
                    Button(label) { model.openOtherGroups(w) }
                        .font(.system(size: 16, weight: .bold))
                        .accessibilityIdentifier("toast-action")
                }
            }
            .padding(.horizontal, 18).padding(.vertical, 12)
            .background(Color.white)
            .clipShape(RoundedRectangle(cornerRadius: 12))
            .overlay(RoundedRectangle(cornerRadius: 12)
                .stroke(PipStyle.ink.opacity(0.3), lineWidth: 1.5))
            .shadow(color: .black.opacity(0.12), radius: 8, y: 3)
            .padding(.bottom, 24)
            .transition(.move(edge: .bottom).combined(with: .opacity))
            .accessibilityElement(children: .contain)
            .accessibilityIdentifier("editToast")
        }
    }
}
