//
//  GroupsEditView.swift
//  PipAAC
//
//  Managing groups (044 E4; inventory LW-14, LW-15, ST-7). Rendering and
//  gestures only: every read and write is one bridge call into
//  PIPCORE.groupsEdit (scripts/ios/app_groups.mjs), which calls the same
//  shared owner the web calls (createGroup, renameGroup,
//  deleteGroupUndoable, setGroupHidden, moveGroupBlock, setGroupGlyph),
//  records the sync op, and answers with the whole groups state. Nothing
//  here knows a rule — not which groups can be deleted, not what an order
//  means, not which icon a group wears.
//
//  Words are editor-ui.js groupMenu / renameInline / "New group",
//  group-shows.js, and group-icon-picker.js, verbatim.
//

import Combine
import SwiftUI

// MARK: - Render models (scripts/ios/app_groups.mjs)

nonisolated struct GroupFaceModel: Decodable, Sendable {
    var icon: String?
    var picture: String?
    var emoji: String?
    var initial: String?
}

nonisolated struct GroupRowModel: Decodable, Sendable, Identifiable {
    let id: String
    let name: String
    let kind: String
    let hidden: Bool
    let occasion: Bool
    let canDelete: Bool
    let canPictures: Bool
    let words: Int
    let face: GroupFaceModel
}

/// One row of Settings → Words → Show groups: a group, or the four meal
/// groups folded into one "Meals" row.
nonisolated struct ShowRowModel: Decodable, Sendable, Identifiable {
    let ids: [String]
    let names: [String]
    let meals: Bool
    let on: Bool
    let label: String
    let moveLabel: String
    let switchLabel: String
    let face: GroupFaceModel
    var id: String { ids.joined(separator: " ") }
}

nonisolated struct GroupsState: Decodable, Sendable {
    let groups: [GroupRowModel]
    let shows: [ShowRowModel]
    let mealsOn: Bool
    var toast: EditToastModel?
    var createdId: String?
}

nonisolated struct IconModel: Decodable, Sendable, Identifiable {
    let name: String
    let label: String
    let category: String
    let path: String
    let current: Bool
    let usedBy: String
    var id: String { name }
}

nonisolated struct PictureModel: Decodable, Sendable, Identifiable {
    let key: String
    let label: String
    let current: Bool
    var id: String { key }
}

nonisolated struct IconPickerModel: Decodable, Sendable {
    let id: String
    let name: String
    let face: GroupFaceModel
    let canPictures: Bool
    let hasCustom: Bool
    let categories: [String]
    let icons: [IconModel]
    let pictures: [PictureModel]
}

// MARK: - The editor's state

/// One owner for both screens that manage groups (the full editor and
/// Settings → Show groups): calls the facade, publishes the answer,
/// keeps the board's own group index fresh.
@MainActor
final class GroupsEditor: ObservableObject {
    @Published private(set) var state: GroupsState?
    @Published private(set) var toast: EditToastModel?
    private var toastSeq = 0
    private unowned let model: AppModel

    init(model: AppModel) { self.model = model }

    func load() { run("groupsEditState", []) }

    func create(_ name: String) { run("createGroupNamed", [["name": name]]) }
    func rename(_ id: String, _ name: String) { run("renameGroupTo", [["id": id, "name": name]]) }
    func setShown(_ id: String, _ shown: Bool) {
        run("setGroupShown", [["id": id, "shown": shown]])
    }
    func setMeals(_ on: Bool) { run("setMealsShown", [["on": on]]) }
    func remove(_ id: String) { run("removeGroup", [["id": id]]) }
    func move(_ ids: [String], before: String?, name: String) {
        run("moveGroups", [["ids": ids, "beforeId": before.map { $0 as Any } ?? NSNull(), "name": name]])
    }
    func setIcon(_ id: String, glyph: String?, usedBy: String = "") {
        run("setIcon", [["id": id, "glyph": glyph.map { $0 as Any } ?? NSNull(), "usedBy": usedBy]])
    }
    func undo(_ t: EditToastModel) {
        guard let token = t.undo else { return }
        toast = nil
        run("undoGroups", [["token": token]])
    }

    private func run(_ method: String, _ args: [Any]) {
        let appId = model.appIdValue, core = model.core
        Task { @MainActor [weak self] in
            guard let self else { return }
            do {
                let s: GroupsState = try await AppModel.editCore(
                    core, method, [appId] + args, object: "PIPCORE.groupsEdit")
                state = s
                if let t = s.toast { show(t) }
                await model.groupsChanged()
            } catch { NSLog("GroupsEditor.\(method) failed: \(error)") }
        }
    }

    private func show(_ t: EditToastModel) {
        toastSeq += 1
        let seq = toastSeq
        toast = t
        Task { [weak self] in
            try? await Task.sleep(for: .seconds(6))
            if self?.toastSeq == seq { self?.toast = nil }
        }
    }

    func iconPicker(_ id: String, query: String) async -> IconPickerModel? {
        let appId = model.appIdValue, core = model.core
        return try? await AppModel.editCore(
            core, "iconChoices", [appId, ["id": id, "query": query]],
            object: "PIPCORE.groupsEdit")
    }
}

extension AppModel {
    var appIdValue: String { appId }

    /// A group write landed: the child's group index and the Settings
    /// model (occasions_visible) follow the db.
    func groupsChanged() async {
        var idx: GroupIndexModel?
        if surface == .index {
            idx = try? await Self.coreCall(core, "appGroups", [appId])
        }
        let set: SettingsModel? = try? await Self.coreCall(core, "appSettings", [appId])
        adopt(groupIndex: idx, settings: set)
    }
}

// MARK: - The toast the sheets show (EditToastOverlay sits under a sheet)

struct GroupToastBar: View {
    @ObservedObject var editor: GroupsEditor
    var body: some View {
        if let t = editor.toast {
            HStack(spacing: 14) {
                Text(t.text)
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(PipStyle.ink)
                    .accessibilityIdentifier("groupsToastText")
                if t.undo != nil {
                    Button("Undo") { editor.undo(t) }
                        .font(.system(size: 16, weight: .bold))
                        .accessibilityIdentifier("groupsToastUndo")
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
            .accessibilityIdentifier("groupsToast")
        }
    }
}

// MARK: - The full editor (LW-14, LW-15)

struct GroupsEditView: View {
    @EnvironmentObject var model: AppModel
    @Environment(\.dismiss) private var dismiss
    @StateObject private var editor: GroupsEditor
    @State private var naming = false
    @State private var newName = ""
    @State private var renaming: GroupRowModel?
    @State private var renameText = ""
    @State private var iconFor: GroupRowModel?

    init(model: AppModel) {
        _editor = StateObject(wrappedValue: GroupsEditor(model: model))
    }

    var body: some View {
        NavigationStack {
            Group {
                if let st = editor.state {
                    list(st)
                } else {
                    ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
                }
            }
            .navigationTitle("Groups")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") { dismiss() }
                        .accessibilityIdentifier("groupsEditDone")
                }
            }
        }
        .overlay(alignment: .bottom) { GroupToastBar(editor: editor) }
        .animation(.easeInOut(duration: 0.2), value: editor.toast?.text)
        .onAppear { editor.load() }
        .alert("New group", isPresented: $naming) {
            TextField("Name the new group", text: $newName)
                .accessibilityIdentifier("groupNewName")
            Button("Cancel", role: .cancel) {}
            Button("Create") { editor.create(newName) }
                .accessibilityIdentifier("groupNewCreate")
        }
        .alert("Rename", isPresented: Binding(
            get: { renaming != nil }, set: { if !$0 { renaming = nil } })) {
            TextField("Name", text: $renameText)
                .accessibilityIdentifier("groupRenameName")
            Button("Cancel", role: .cancel) {}
            Button("Rename") {
                if let g = renaming { editor.rename(g.id, renameText) }
            }
            .accessibilityIdentifier("groupRenameSave")
        }
        .sheet(item: $iconFor) { g in
            GroupIconPicker(editor: editor, group: g)
                .environmentObject(model)
        }
    }

    private func list(_ st: GroupsState) -> some View {
        let shown = st.groups.filter { !$0.hidden }
        let hidden = st.groups.filter { $0.hidden }
        return ScrollViewReader { proxy in
          List {
            Section {
                Button {
                    newName = ""; naming = true
                } label: {
                    Label("New group", systemImage: "plus")
                }
                .accessibilityIdentifier("groupNew")
            }
            Section {
                ForEach(shown) { g in row(g) }
                    .onMove { from, to in move(shown, st.groups, from, to) }
            } footer: {
                Text("One order, the same on the board, in Settings and here. Drag the grip to move a group.")
            }
            if !hidden.isEmpty {
                Section("Hidden (\(hidden.count))") {
                    ForEach(hidden) { g in row(g) }
                }
            }
          }
          // The grip is always there, as in group-shows.js (⠿ on every row).
          .environment(\.editMode, .constant(.active))
          // A new group lands at the end of the order: show it.
          .onChange(of: editor.state?.createdId) { _, id in
              if let id { withAnimation { proxy.scrollTo("row:\(id)", anchor: .center) } }
          }
        }
    }

    private var firstShownId: String? {
        editor.state?.groups.first(where: { !$0.hidden })?.id
    }

    private func row(_ g: GroupRowModel) -> some View {
        HStack(spacing: 12) {
            GroupFace(icon: g.face.icon, picture: g.face.picture,
                      emoji: g.face.emoji, initial: g.face.initial, size: 48)
            VStack(alignment: .leading, spacing: 2) {
                Text(g.name).font(.body.weight(.semibold))
                    .foregroundStyle(g.hidden ? PipStyle.muted : PipStyle.ink)
                Text(g.words == 1 ? "1 word" : "\(g.words) words")
                    .font(.caption).foregroundStyle(PipStyle.muted)
            }
            Spacer()
            Menu {
                Button("Rename") { renameText = g.name; renaming = g }
                    .accessibilityIdentifier("groupMenuRename")
                if !g.hidden, let first = firstShownId, first != g.id {
                    // A long list: dragging a group across it is slow, so
                    // the menu can put it first (moveGroupBlock, same Undo).
                    Button("Move to the top") {
                        editor.move([g.id], before: first, name: g.name)
                    }
                    .accessibilityIdentifier("groupMenuTop")
                }
                Button("Change icon") { iconFor = g }
                    .accessibilityIdentifier("groupMenuIcon")
                Button(g.hidden ? "Show" : "Hide") { editor.setShown(g.id, g.hidden) }
                    .accessibilityIdentifier("groupMenuHide")
                if g.canDelete {
                    Button("Delete", role: .destructive) { editor.remove(g.id) }
                        .accessibilityIdentifier("groupMenuDelete")
                }
            } label: {
                Image(systemName: "ellipsis.circle")
                    .font(.system(size: 22))
                    .frame(width: 44, height: 44)
            }
            .accessibilityLabel("More for \(g.name)")
            .accessibilityIdentifier("groupMore:\(g.id)")
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("groupRow:\(g.id)")
        .id("row:\(g.id)")
    }

    /// onMove -> moveGroupBlock(ids, beforeId): the dragged group lands
    /// just before the row now at `to`, or after the last shown one.
    private func move(_ shown: [GroupRowModel], _ all: [GroupRowModel],
                      _ from: IndexSet, _ to: Int) {
        guard let i = from.first else { return }
        let g = shown[i]
        let before: String?
        if to < shown.count {
            before = shown[to].id
        } else if let last = shown.last, let at = all.firstIndex(where: { $0.id == last.id }) {
            before = at + 1 < all.count ? all[at + 1].id : nil
        } else { before = nil }
        if before == g.id { return }
        editor.move([g.id], before: before, name: g.name)
    }
}
