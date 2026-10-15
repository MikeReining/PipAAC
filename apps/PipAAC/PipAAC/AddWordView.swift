//
//  AddWordView.swift
//  PipAAC
//
//  Add a word (044 E2; inventory LW-2, 3, 4, 12, 18). Rendering and
//  gestures only: every read and write is one bridge call into
//  PIPCORE.lib (scripts/ios/app_library.mjs), which calls the same
//  shared owner the web's add-flow.js calls (placeItem, createEntity,
//  createGroup, addToGroups, placeOnBoard), records the sync op, and
//  answers with the whole painted state. Nothing here knows a rule —
//  not what matches, not where a word lands, not the free-word cap.
//
//  A new word has no recording yet and stays silent; the on-demand voice
//  mint needs transport (a later slice). No device voice, ever.
//

import SwiftUI

// MARK: - Render models (scripts/ios/app_library.mjs)

nonisolated struct CellRef: Sendable, Hashable {
    let page: Int
    let slotIndex: Int
    var json: [String: Any] { ["page": page, "slot_index": slotIndex] }
}

struct AddRequest: Identifiable {
    let id = UUID()
    var groupId: String?
    var cell: CellRef?
}

struct PlaceRequest: Identifiable {
    let slot: Int
    var id: Int { slot }
}

nonisolated struct AddMatch: Decodable, Sendable, Identifiable {
    let key: String
    let kind: String            // entity | sense | make
    let id: String?
    let label: String
    let role: String?
    let art: String?
    let sub: String
    let action: String
    let here: Bool
    let highlighted: Bool
    var capped: Bool?
    var rowID: String { key }
}

nonisolated struct AddGroupRow: Decodable, Sendable, Identifiable {
    let id: String
    let name: String
    let selected: Bool
}

nonisolated struct AddGroupMake: Decodable, Sendable {
    let canMake: Bool
    let label: String
    let name: String
}

nonisolated struct AddPicker: Decodable, Sendable {
    let recent: [AddGroupRow]
    let all: [AddGroupRow]
    let make: AddGroupMake
}

nonisolated struct AddTarget: Decodable, Sendable {
    let id: String
    let name: String
}

nonisolated struct AddCount: Decodable, Sendable {
    let hidden: Bool
    let text: String
}

nonisolated struct AddState: Decodable, Sendable {
    let title: String
    let target: AddTarget
    let count: AddCount
    let matches: [AddMatch]
    var picker: AddPicker?
}

nonisolated struct MakeGroupResult: Decodable, Sendable {
    var groupId: String?
    var toast: EditToastModel?
}

nonisolated struct OtherGroupsModel: Decodable, Sendable, Identifiable {
    let kind: String
    let id: String
    let label: String
    let title: String
    let groups: [WordCardGroupModel]
}

nonisolated struct PlaceRow: Decodable, Sendable, Identifiable {
    let key: String
    let kind: String
    let id: String
    let label: String
    let role: String?
    let count: Int
    var rowID: String { key }
}

nonisolated struct PlaceList: Decodable, Sendable {
    let title: String
    let empty: String?
    let rows: [PlaceRow]
}

// MARK: - AppModel: add a word

extension AppModel {
    nonisolated static let libObject = "PIPCORE.lib"

    nonisolated static func libCore<T: Decodable & Sendable>(
        _ core: PipCore, _ method: String, _ appId: String, _ args: Data
    ) async throws -> T {
        try core.sync {
            let obj = try JSONSerialization.jsonObject(with: args)
            return try decodeRaw(core.call(libObject, method, [appId, obj]))
        }
    }

    /// One read off the main actor, answered on it. nil on a bridge error.
    func lib<T: Decodable & Sendable>(_ method: String, _ args: [String: Any]) async -> T? {
        let appId = self.appId
        let core = self.core
        do {
            // Args cross to the core queue as JSON bytes (Sendable).
            let data = try JSONSerialization.data(withJSONObject: args)
            return try await Self.libCore(core, method, appId, data)
        } catch {
            NSLog("AppModel.lib.\(method) failed: \(error)")
            return nil
        }
    }

    func libWrite(_ method: String, _ args: [String: Any], openCard: Bool = false,
                  then: (@MainActor () -> Void)? = nil) {
        editCall(method, [args], openCard: openCard, object: Self.libObject, then: then)
    }

    // MARK: LW-2 / LW-3 / LW-4

    /// The header's "Add a word" (group page: that group; else My Words),
    /// or an empty group cell (that cell is the picker).
    func openAdd(groupId: String?, cell: CellRef? = nil) {
        addRequest = AddRequest(groupId: groupId, cell: cell)
    }

    func addPlace(groupId: String, cell: CellRef?, match: AddMatch) {
        guard let id = match.id else { return }
        libWrite("addPlace", ["groupId": groupId, "cell": cell?.json ?? NSNull(),
                              "kind": match.kind, "id": id, "label": match.label]) { [weak self] in
            self?.addRequest = nil
        }
    }

    func addMake(groupId: String, cell: CellRef?, text: String) {
        libWrite("addMake", ["groupId": groupId, "cell": cell?.json ?? NSNull(), "text": text],
                 openCard: true) { [weak self] in
            self?.addRequest = nil
        }
    }

    func addOpenExisting(_ match: AddMatch) {
        guard let id = match.id else { return }
        addRequest = nil
        openCard(kind: match.kind, id: id)
    }

    func addMakeGroup(_ name: String) async -> String? {
        guard let r: MakeGroupResult = await lib("addMakeGroup", ["name": name]) else { return nil }
        if let t = r.toast { showEditToast(t) }
        return r.groupId
    }

    // MARK: LW-12

    /// The card's "+ Group" or the toast's "Add to other groups".
    func openOtherGroups(_ w: ToastWordRef) {
        openOtherGroups(kind: w.kind, id: w.id, label: w.label)
    }

    func openOtherGroups(kind: String, id: String, label: String) {
        editToast = nil
        Task { @MainActor [weak self] in
            guard let self else { return }
            let m: OtherGroupsModel? = await lib(
                "otherGroups", ["kind": kind, "id": id, "label": label])
            if let m { card = nil; addRequest = nil; otherGroups = m }
        }
    }

    func saveOtherGroups(_ m: OtherGroupsModel, ids: [String]) {
        libWrite("otherGroupsSave", ["kind": m.kind, "id": m.id, "label": m.label,
                                     "groupIds": ids]) { [weak self] in
            self?.otherGroups = nil
        }
    }

    // MARK: LW-18

    func placePick(slot: Int, row: PlaceRow) {
        libWrite("placePick", ["slot": slot, "kind": row.kind, "id": row.id,
                               "label": row.label]) { [weak self] in
            self?.placeRequest = nil
        }
    }
}

// MARK: - Sheets: one presentation, whichever edit sheet is wanted

/// card / add / other groups / place share ONE sheet so a Make swaps the
/// add form for the new word's card in place. `inLibrary` picks which
/// presenter shows it: the board, or the Library sheet when it is open.
struct EditSheets: ViewModifier {
    @EnvironmentObject var model: AppModel
    let inLibrary: Bool

    enum Item: Identifiable {
        case card(WordCardModel)
        case add(AddRequest)
        case other(OtherGroupsModel)
        case place(PlaceRequest)
        case bulk(BulkRequest)
        case photos(PhotoRequest)
        case swap(SwapRequest)
        var id: String {
            switch self {
            case .card(let c): "card:\(c.sheetID)"
            case .add(let a): "add:\(a.id)"
            case .other(let o): "other:\(o.kind):\(o.id)"
            case .place(let p): "place:\(p.slot)"
            case .bulk(let b): "bulk:\(b.id)"
            case .photos(let p): "photos:\(p.id)"
            case .swap(let s): "swap:\(s.id)"
            }
        }
    }

    private var current: Item? {
        guard model.showLibrary == inLibrary else { return nil }
        if let c = model.card { return .card(c) }
        if let a = model.addRequest { return .add(a) }
        if let o = model.otherGroups { return .other(o) }
        if let p = model.placeRequest { return .place(p) }
        if let b = model.bulkRequest { return .bulk(b) }
        if let p = model.photoRequest { return .photos(p) }
        if let s = model.swapRequest { return .swap(s) }
        return nil
    }

    func body(content: Content) -> some View {
        content.sheet(item: Binding(
            get: { current },
            set: { if $0 == nil { dismissAll() } }
        )) { item in
            Group {
                switch item {
                case .card(let c): WordCardView(card: c)
                case .add(let a): AddWordView(request: a)
                case .other(let o): OtherGroupsView(model: o)
                case .place(let p): PlaceView(slot: p.slot)
                case .bulk(let b): BulkListView(request: b)
                case .photos(let p): PhotoDraftsView(request: p)
                case .swap(let s): SwapView(request: s)
                }
            }
            .environmentObject(model)
        }
    }

    private func dismissAll() {
        model.card = nil
        model.addRequest = nil
        model.otherGroups = nil
        model.placeRequest = nil
        model.bulkRequest = nil
        model.bulk = nil
        model.photoRequest = nil
        model.swapRequest = nil
    }
}

// MARK: - The add form (add-flow.js openAddForm)

struct AddWordView: View {
    @EnvironmentObject var model: AppModel
    let request: AddRequest

    @State private var text = ""
    @State private var targetId: String?
    @State private var cell: CellRef?
    @State private var pickerQuery: String?     // nil = picker closed
    @State private var naming = false
    @State private var state: AddState?
    @FocusState private var focus: Field?
    enum Field { case word, group }

    private struct Key: Equatable { var text: String; var target: String?; var picker: String? }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            header
            if pickerQuery != nil { groupPicker } else { wordField; matches; AddListLinks(groupId: target.id, cell: cell) }
            Spacer(minLength: 0)
        }
        .padding(24)
        .background(PipStyle.cream.ignoresSafeArea())
        .overlay(alignment: .bottom) { EditToastOverlay() }
        .task(id: Key(text: text, target: targetId, picker: pickerQuery)) { await refresh() }
        .onAppear {
            targetId = request.groupId
            cell = request.cell
            focus = .word
        }
    }

    private func refresh() async {
        var args: [String: Any] = [
            "groupId": targetId ?? NSNull(), "cell": cell?.json ?? NSNull(),
            "text": text, "picker": pickerQuery ?? NSNull(),
        ]
        if targetId == nil { args["groupId"] = request.groupId ?? NSNull() }
        if let s: AddState = await model.lib("addState", args) { state = s }
    }

    private var target: AddTarget { state?.target ?? AddTarget(id: "grp_my_words", name: "My Words") }

    // MARK: header + destination chip (§ 3)

    private var header: some View {
        HStack(spacing: 12) {
            Text(state?.title ?? "Add a word")
                .font(.system(size: 24, weight: .bold))
                .foregroundStyle(PipStyle.ink)
                .accessibilityAddTraits(.isHeader)
            Button {
                if pickerQuery == nil { pickerQuery = ""; naming = false; focus = .group }
                else { pickerQuery = nil; focus = .word }
            } label: {
                HStack(spacing: 4) {
                    Text("to").foregroundStyle(PipStyle.muted)
                    Text(target.name).fontWeight(.bold)
                    Image(systemName: "chevron.down").font(.system(size: 12, weight: .bold))
                }
                .font(.system(size: 17))
                .foregroundStyle(PipStyle.ink)
                .padding(.horizontal, 12).frame(minHeight: 44)
                .background(Color.white)
                .clipShape(Capsule())
                .overlay(Capsule().stroke(PipStyle.muted.opacity(0.4), lineWidth: 1.5))
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Choose a group, now \(target.name)")
            .accessibilityIdentifier("add-dest")
            Spacer()
            Button { model.addRequest = nil } label: {
                Image(systemName: "xmark.circle.fill")
                    .font(.system(size: 28))
                    .symbolRenderingMode(.palette)
                    .foregroundStyle(Color.white, PipStyle.muted)
                    .frame(width: 44, height: 44)
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Close")
            .accessibilityIdentifier("add-close")
        }
    }

    // MARK: the word field + matches (§ 3)

    private var wordField: some View {
        TextField("Type a word", text: $text)
            .textFieldStyle(.roundedBorder)
            .font(.system(size: 22))
            .textInputAutocapitalization(.never)
            .autocorrectionDisabled()
            .submitLabel(.done)
            .focused($focus, equals: .word)
            .onSubmit { if let m = state?.matches.first(where: \.highlighted) { run(m) } }
            .accessibilityLabel("Type a word")
            .accessibilityIdentifier("add-word")
    }

    @ViewBuilder private var matches: some View {
        if let st = state {
            if !st.count.hidden {
                Text(st.count.text)
                    .font(.system(size: 14))
                    .foregroundStyle(PipStyle.muted)
                    .accessibilityIdentifier("add-count")
            }
            ScrollView {
                VStack(spacing: 8) {
                    ForEach(st.matches) { m in matchRow(m) }
                }
            }
        }
    }

    private func matchRow(_ m: AddMatch) -> some View {
        Button { run(m) } label: {
            HStack(spacing: 12) {
                MatchPic(label: m.label, role: m.role, art: m.art, plus: m.kind == "make")
                VStack(alignment: .leading, spacing: 2) {
                    Text(m.label)
                        .font(.system(size: 20, weight: .semibold))
                        .foregroundStyle(PipStyle.ink)
                    Text(m.sub)
                        .font(.system(size: 14))
                        .foregroundStyle(PipStyle.muted)
                }
                Spacer()
                Text(m.action)
                    .font(.system(size: 15, weight: .bold))
                    .foregroundStyle(m.here ? PipStyle.muted : PipStyle.ink)
            }
            .padding(.horizontal, 14).padding(.vertical, 10)
            .frame(maxWidth: .infinity, minHeight: 60, alignment: .leading)
            .background(m.highlighted ? PipStyle.fill(m.role) : Color.white)
            .clipShape(RoundedRectangle(cornerRadius: 12))
            .overlay(RoundedRectangle(cornerRadius: 12)
                .stroke(m.highlighted ? PipStyle.ink : PipStyle.muted.opacity(0.35),
                        lineWidth: m.highlighted ? 2 : 1.5))
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(m.label), \(m.sub)")
        .accessibilityHint(m.action)
        .accessibilityAddTraits(m.highlighted ? [.isButton, .isSelected] : .isButton)
        .accessibilityIdentifier(m.kind == "make" ? "add-new" : "add-match:\(m.key)")
    }

    private func run(_ m: AddMatch) {
        let g = target.id
        switch m.kind {
        case "make" where m.capped == true: model.openLifetime() // "See Pip Lifetime"
        case "make": model.addMake(groupId: g, cell: cell, text: text.trimmingCharacters(in: .whitespaces))
        default:
            if m.here { model.addOpenExisting(m) }
            else { model.addPlace(groupId: g, cell: cell, match: m) }
        }
    }

    // MARK: the group picker (§ 3.1)

    private var groupPicker: some View {
        VStack(alignment: .leading, spacing: 8) {
            TextField(naming ? "Name the new group" : "Find a group",
                      text: Binding(get: { pickerQuery ?? "" }, set: { pickerQuery = $0 }))
                .textFieldStyle(.roundedBorder)
                .font(.system(size: 20))
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .submitLabel(.go)
                .focused($focus, equals: .group)
                .onSubmit { submitPicker() }
                .accessibilityLabel(naming ? "Name the new group" : "Find a group")
                .accessibilityIdentifier("add-groupq")
            ScrollView {
                VStack(alignment: .leading, spacing: 6) {
                    if let p = state?.picker {
                        if !p.recent.isEmpty {
                            head("Recent")
                            ForEach(p.recent) { g in groupRow(g, prefix: "recent") }
                        }
                        if (pickerQuery ?? "").isEmpty { head("All groups") }
                        ForEach(p.all) { g in groupRow(g, prefix: "all") }
                        newGroupRow(p.make)
                    }
                }
            }
        }
    }

    private func head(_ s: String) -> some View {
        Text(s).font(.system(size: 14, weight: .semibold))
            .foregroundStyle(PipStyle.muted).padding(.top, 6)
    }

    private func groupRow(_ g: AddGroupRow, prefix: String) -> some View {
        Button { choose(g.id) } label: {
            HStack {
                Text(g.name).font(.system(size: 19, weight: .medium))
                Spacer()
                if g.selected { Text("✓").font(.system(size: 19, weight: .bold)) }
            }
            .foregroundStyle(PipStyle.ink)
            .padding(.horizontal, 14).frame(maxWidth: .infinity, minHeight: 48, alignment: .leading)
            .background(Color.white)
            .clipShape(RoundedRectangle(cornerRadius: 10))
            .overlay(RoundedRectangle(cornerRadius: 10)
                .stroke(PipStyle.muted.opacity(0.35), lineWidth: 1.5))
        }
        .buttonStyle(.plain)
        .accessibilityLabel(g.name)
        .accessibilityAddTraits(g.selected ? [.isButton, .isSelected] : .isButton)
        .accessibilityIdentifier("add-group:\(prefix):\(g.id)")
    }

    private func newGroupRow(_ make: AddGroupMake) -> some View {
        Button {
            if make.canMake { makeGroup(make.name) }
            else { pickerQuery = ""; naming = true; focus = .group }
        } label: {
            HStack(spacing: 8) {
                Text("+").font(.system(size: 22, weight: .bold))
                Text(make.label).font(.system(size: 19, weight: .medium))
                Spacer()
            }
            .foregroundStyle(PipStyle.ink)
            .padding(.horizontal, 14).frame(maxWidth: .infinity, minHeight: 48, alignment: .leading)
            .background(PipStyle.fill(nil))
            .clipShape(RoundedRectangle(cornerRadius: 10))
        }
        .buttonStyle(.plain)
        .accessibilityLabel(make.label)
        .accessibilityIdentifier("add-newgroup")
    }

    private func choose(_ id: String) {
        if id != targetId { cell = nil }     // that cell belonged to the other group
        targetId = id
        pickerQuery = nil
        naming = false
        focus = .word
    }

    private func makeGroup(_ name: String) {
        Task { @MainActor in
            if let id = await model.addMakeGroup(name) { choose(id) }
        }
    }

    private func submitPicker() {
        let q = pickerQuery ?? ""
        if naming { if !q.trimmingCharacters(in: .whitespaces).isEmpty { makeGroup(q) }; return }
        guard let p = state?.picker else { return }
        if let first = p.all.first { choose(first.id) }
        else if p.make.canMake { makeGroup(p.make.name) }
    }
}

/// The small picture on a match / Library / place row: the catalog art
/// when there is some, else the first letter on the role colour; "+" for
/// Make.
struct MatchPic: View {
    let label: String
    let role: String?
    let art: String?
    var plus = false

    var body: some View {
        ZStack {
            PipStyle.fill(role)
            if let ui = PipAssets.image(art) {
                Image(uiImage: ui).resizable().scaledToFit().padding(3)
            } else {
                Text(plus ? "+" : String(label.first.map { String($0).uppercased() } ?? ""))
                    .font(.system(size: 22, weight: .bold))
                    .foregroundStyle(PipStyle.inkText)
            }
        }
        .frame(width: 44, height: 44)
        .clipShape(RoundedRectangle(cornerRadius: 8))
        .overlay(RoundedRectangle(cornerRadius: 8)
            .stroke(PipStyle.border(role), lineWidth: 2))
        .accessibilityHidden(true)
    }
}

// MARK: - Add to other groups (groups-ui.js openAddToBoards)

struct OtherGroupsView: View {
    @EnvironmentObject var model: AppModel
    let model_: OtherGroupsModel
    @State private var picked = Set<String>()

    init(model: OtherGroupsModel) { self.model_ = model }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text(model_.title)
                .font(.system(size: 22, weight: .bold))
                .foregroundStyle(PipStyle.ink)
                .accessibilityAddTraits(.isHeader)
            Text("Only the groups you pick change. Groups that already have this word are not listed.")
                .font(.system(size: 15))
                .foregroundStyle(PipStyle.muted)
            ScrollView {
                FlowRow {
                    ForEach(model_.groups, id: \.id) { g in
                        let on = picked.contains(g.id)
                        Button {
                            if on { picked.remove(g.id) } else { picked.insert(g.id) }
                        } label: {
                            Text(g.name)
                                .font(.system(size: 16, weight: .medium))
                                .foregroundStyle(on ? Color.white : PipStyle.ink)
                                .padding(.horizontal, 14).padding(.vertical, 10)
                                .background(on ? PipStyle.ink : Color.white)
                                .clipShape(Capsule())
                                .overlay(Capsule().stroke(PipStyle.muted.opacity(0.5), lineWidth: 1.5))
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel(g.name)
                        .accessibilityAddTraits(on ? [.isButton, .isSelected] : .isButton)
                        .accessibilityIdentifier("boards-chip:\(g.id)")
                    }
                }
            }
            HStack(spacing: 12) {
                Button {
                    model.saveOtherGroups(model_, ids: model_.groups.map(\.id).filter(picked.contains))
                } label: {
                    Text("Add").font(.system(size: 18, weight: .semibold))
                        .frame(minWidth: 100, minHeight: 48)
                        .background(picked.isEmpty ? Color(white: 0.9) : PipStyle.ink)
                        .foregroundStyle(picked.isEmpty ? PipStyle.muted : Color.white)
                        .clipShape(RoundedRectangle(cornerRadius: 10))
                }
                .buttonStyle(.plain)
                .disabled(picked.isEmpty)
                .accessibilityIdentifier("boards-save")
                Button { model.otherGroups = nil } label: {
                    Text("Cancel").font(.system(size: 18, weight: .semibold))
                        .frame(minWidth: 100, minHeight: 48)
                        .background(Color.white)
                        .foregroundStyle(PipStyle.ink)
                        .clipShape(RoundedRectangle(cornerRadius: 10))
                        .overlay(RoundedRectangle(cornerRadius: 10)
                            .stroke(PipStyle.ink.opacity(0.35), lineWidth: 1.5))
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("boards-cancel")
            }
        }
        .padding(24)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .background(PipStyle.cream.ignoresSafeArea())
    }
}

// MARK: - Pick a place for a word (place-ui.js)

struct PlaceView: View {
    @EnvironmentObject var model: AppModel
    let slot: Int
    @State private var q = ""
    @State private var list: PlaceList?

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text(list?.title ?? "What goes here?")
                    .font(.system(size: 24, weight: .bold))
                    .foregroundStyle(PipStyle.ink)
                    .accessibilityAddTraits(.isHeader)
                Spacer()
                Button("Close") { model.placeRequest = nil }
                    .accessibilityIdentifier("place-close")
            }
            TextField("Search words", text: $q)
                .textFieldStyle(.roundedBorder)
                .font(.system(size: 20))
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .accessibilityIdentifier("place-q")
            ScrollView {
                VStack(spacing: 6) {
                    if let e = list?.empty {
                        Text(e).foregroundStyle(PipStyle.muted)
                    }
                    ForEach(list?.rows ?? []) { r in
                        Button { model.placePick(slot: slot, row: r) } label: {
                            HStack {
                                Text(r.label)
                                    .font(.system(size: 19, weight: .semibold))
                                    .foregroundStyle(PipStyle.inkText)
                                    .padding(.horizontal, 12).padding(.vertical, 8)
                                    .background(PipStyle.fill(r.role))
                                    .clipShape(RoundedRectangle(cornerRadius: 8))
                                Spacer()
                                Text(String(r.count))
                                    .font(.system(size: 15))
                                    .foregroundStyle(PipStyle.muted)
                            }
                            .padding(.horizontal, 8).frame(minHeight: 48)
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel(r.label)
                        .accessibilityIdentifier("place-row:\(r.key)")
                    }
                }
            }
        }
        .padding(24)
        .background(PipStyle.cream.ignoresSafeArea())
        .overlay(alignment: .bottom) { EditToastOverlay() }
        .task(id: q) {
            if let l: PlaceList = await model.lib("placeList", ["q": q]) { list = l }
        }
    }
}

// MARK: - An empty cell in Edit mode

/// grid.js: in Edit an empty cell is a door — on a group page it opens
/// the add form filed into that exact cell; on the home board the place
/// picker ("Place a word or person here").
struct EditEmptyCell: View {
    @EnvironmentObject var model: AppModel
    let slot: Int

    var body: some View {
        Button {
            if model.surface == .group, let g = model.groupPage {
                model.openAdd(groupId: g.groupId, cell: CellRef(page: g.page, slotIndex: slot))
            } else {
                model.placeRequest = PlaceRequest(slot: slot)
            }
        } label: {
            ZStack {
                EmptyCell()
                Image(systemName: "plus")
                    .font(.system(size: 18, weight: .semibold))
                    .foregroundStyle(PipStyle.muted.opacity(0.6))
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(model.surface == .group ? "Add a word here"
                            : "Place a word or person here")
        .accessibilityIdentifier("emptycell:\(slot)")
    }
}
