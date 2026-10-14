//
//  GroupIconPicker.swift
//  PipAAC
//
//  The group's icon sheet (044 E4; LW-15) and Settings → Words → Show
//  groups (ST-7). Words are group-icon-picker.js and group-shows.js,
//  verbatim. The icon library, who already uses an icon, and the group's
//  own pictures come from PIPCORE.groupsEdit.iconChoices; choosing is
//  setGroupGlyph through the same facade. The web's extra online icons
//  need a network fetch and are not offered here.
//

import SwiftUI

struct GroupIconPicker: View {
    @EnvironmentObject var model: AppModel
    @Environment(\.dismiss) private var dismiss
    @ObservedObject var editor: GroupsEditor
    let group: GroupRowModel
    @State private var picker: IconPickerModel?
    @State private var query = ""
    @State private var category = ""
    @State private var pictures = false

    private var icons: [IconModel] {
        (picker?.icons ?? []).filter { category.isEmpty || $0.category == category }
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    if let p = picker { summary(p) }
                    if picker?.canPictures == true {
                        Picker("", selection: $pictures) {
                            Text("Icons").tag(false)
                            Text("Group pictures").tag(true)
                        }
                        .pickerStyle(.segmented)
                        .accessibilityIdentifier("iconTabs")
                    }
                    if pictures { pictureGrid } else { iconGrid }
                }
                .padding(20)
            }
            .navigationTitle("Icon for \(picker?.name ?? group.name)")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Close") { dismiss() }
                        .accessibilityIdentifier("iconClose")
                }
            }
        }
        .task { await reload() }
        .onChange(of: query) { _, _ in Task { await reload() } }
    }

    private func reload() async {
        picker = await editor.iconPicker(group.id, query: query)
    }

    private func summary(_ p: IconPickerModel) -> some View {
        HStack(spacing: 14) {
            GroupFace(icon: p.face.icon, picture: p.face.picture,
                      emoji: p.face.emoji, initial: p.face.initial, size: 48)
            Text(p.name).font(.title3.weight(.semibold))
            Spacer()
            Button("Use default") {
                editor.setIcon(group.id, glyph: nil)
                dismiss()
            }
            .buttonStyle(.bordered)
            .disabled(!p.hasCustom)
            .accessibilityIdentifier("iconDefault")
        }
    }

    @ViewBuilder
    private var iconGrid: some View {
        HStack {
            TextField("Search icons", text: $query)
                .textFieldStyle(.roundedBorder)
                .accessibilityLabel("Search icons")
                .accessibilityIdentifier("iconSearch")
            Picker("Icon category", selection: $category) {
                Text("All categories").tag("")
                ForEach(picker?.categories ?? [], id: \.self) { Text($0).tag($0) }
            }
            .pickerStyle(.menu)
            .accessibilityIdentifier("iconCategory")
        }
        HStack(spacing: 6) {
            Circle().fill(PipStyle.muted).frame(width: 8, height: 8)
            Text("Used by another group").font(.caption).foregroundStyle(PipStyle.muted)
        }
        Text("\(icons.count) icons").font(.caption).foregroundStyle(PipStyle.muted)
        if icons.isEmpty {
            Text("No icons found. Try another search or category.")
                .foregroundStyle(PipStyle.muted)
        }
        ForEach(picker?.categories.filter { c in icons.contains { $0.category == c } } ?? [],
                id: \.self) { c in
            VStack(alignment: .leading, spacing: 8) {
                Text(c).font(.headline)
                LazyVGrid(columns: [GridItem(.adaptive(minimum: 76), spacing: 10)], spacing: 10) {
                    ForEach(icons.filter { $0.category == c }) { icon in
                        Button {
                            editor.setIcon(group.id, glyph: "icon:\(icon.name)", usedBy: icon.usedBy)
                            dismiss()
                        } label: {
                            iconCell(icon)
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel("\(icon.label)\(icon.current ? ", current icon" : "")\(icon.usedBy.isEmpty ? "" : ", used by \(icon.usedBy)")")
                        .accessibilityIdentifier("icon:\(icon.name)")
                    }
                }
            }
        }
    }

    private func iconCell(_ icon: IconModel) -> some View {
        ZStack(alignment: .topTrailing) {
            Group {
                if let ui = PipAssets.image(icon.path) {
                    Image(uiImage: ui).resizable().scaledToFit().padding(12)
                }
            }
            .frame(width: 76, height: 76)
            .background(Color.white)
            .clipShape(RoundedRectangle(cornerRadius: 12))
            .overlay(RoundedRectangle(cornerRadius: 12)
                .stroke(icon.current ? PipStyle.ink : PipStyle.muted.opacity(0.4),
                        lineWidth: icon.current ? 3 : 1.5))
            if icon.current {
                Image(systemName: "checkmark.circle.fill")
                    .foregroundStyle(Color.white, PipStyle.ink)
                    .padding(4)
            }
            if !icon.usedBy.isEmpty {
                Circle().fill(PipStyle.muted).frame(width: 8, height: 8)
                    .padding(6)
                    .offset(x: icon.current ? -18 : 0)
            }
        }
    }

    @ViewBuilder
    private var pictureGrid: some View {
        Text("Pictures from this group").font(.headline)
        if (picker?.pictures ?? []).isEmpty {
            Text("No pictures in this group yet.").foregroundStyle(PipStyle.muted)
        }
        LazyVGrid(columns: [GridItem(.adaptive(minimum: 76), spacing: 10)], spacing: 10) {
            ForEach(picker?.pictures ?? []) { pic in
                Button {
                    editor.setIcon(group.id, glyph: "picture:\(pic.key)")
                    dismiss()
                } label: {
                    Group {
                        if let ui = PipAssets.image(pic.key) {
                            Image(uiImage: ui).resizable().scaledToFit().padding(6)
                        }
                    }
                    .frame(width: 76, height: 76)
                    .background(Color.white)
                    .clipShape(RoundedRectangle(cornerRadius: 12))
                    .overlay(RoundedRectangle(cornerRadius: 12)
                        .stroke(pic.current ? PipStyle.ink : PipStyle.muted.opacity(0.4),
                                lineWidth: pic.current ? 3 : 1.5))
                }
                .buttonStyle(.plain)
                .accessibilityLabel(pic.label)
                .accessibilityIdentifier("picture:\(pic.key)")
            }
        }
    }
}

// MARK: - Settings → Words → Show groups (ST-7)

/// One switch per group, in index order; the four meal groups are one
/// row at the first meal group's place (group-shows.js). A switch is the
/// same setGroupHidden the Edit-mode door uses; the grip reorders with
/// moveGroupBlock (the meals row moves as one block) and shows an Undo.
struct GroupShowsPage: View {
    @EnvironmentObject var model: AppModel
    @StateObject private var editor: GroupsEditor

    init(model: AppModel) {
        _editor = StateObject(wrappedValue: GroupsEditor(model: model))
    }

    var body: some View {
        Group {
            if let st = editor.state {
                List {
                    Section {
                        ForEach(st.shows) { r in
                            HStack(spacing: 12) {
                                GroupFace(icon: r.face.icon, picture: r.face.picture,
                                          emoji: r.face.emoji, initial: r.face.initial, size: 48)
                                Text(r.label)
                                    .font(.body)
                                    .frame(maxWidth: .infinity, alignment: .leading)
                                // A list in reorder mode swallows a Toggle's tap;
                                // a Button drawn as the switch keeps working.
                                Button {
                                    if r.meals { editor.setMeals(!r.on) }
                                    else { editor.setShown(r.ids[0], !r.on) }
                                } label: {
                                    Capsule()
                                        .fill(r.on ? Color.green : Color(white: 0.82))
                                        .frame(width: 51, height: 31)
                                        .overlay(alignment: r.on ? .trailing : .leading) {
                                            Circle().fill(Color.white).padding(2)
                                                .shadow(radius: 1)
                                        }
                                        .animation(.easeInOut(duration: 0.15), value: r.on)
                                }
                                .buttonStyle(.plain)
                                .accessibilityLabel(r.switchLabel)
                                .accessibilityValue(r.on ? "1" : "0")
                                .accessibilityAddTraits(.isToggle)
                                .accessibilityIdentifier("show:\(r.ids[0])")
                                .accessibilityAction(named: "Move up") { nudge(st, r, by: -1) }
                                .accessibilityAction(named: "Move down") { nudge(st, r, by: 1) }
                            }
                        }
                        .onMove { from, to in
                            guard let i = from.first else { return }
                            drop(st, st.shows[i], to: to)
                        }
                    } footer: {
                        Text("One order, the same on the board, here and in the editor. Drag the grip to move a group; a hidden group keeps its words and its place. To add or rename groups, edit them on the board.")
                    }
                }
                .environment(\.editMode, .constant(.active))
            } else {
                ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
        .navigationTitle("Show groups")
        .overlay(alignment: .bottom) { GroupToastBar(editor: editor) }
        .animation(.easeInOut(duration: 0.2), value: editor.toast?.text)
        .onAppear { editor.load() }
    }

    /// The row lands just before the row now at `to` (null = last).
    private func drop(_ st: GroupsState, _ r: ShowRowModel, to: Int) {
        let before = to < st.shows.count ? st.shows[to].ids[0] : nil
        if let b = before, r.ids.contains(b) { return }
        editor.move(r.ids, before: before, name: r.meals ? "Meals" : r.names[0])
    }

    private func nudge(_ st: GroupsState, _ r: ShowRowModel, by d: Int) {
        guard let i = st.shows.firstIndex(where: { $0.id == r.id }) else { return }
        let j = i + d
        guard j >= 0, j < st.shows.count else { return }
        drop(st, r, to: d < 0 ? j : j + 1)
    }
}
