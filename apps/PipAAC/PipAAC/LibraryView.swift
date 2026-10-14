//
//  LibraryView.swift
//  PipAAC
//
//  The Word Library (044 E2; inventory LW-16): browse every word, search
//  across all of them, open a word's card, add a word. Mirrors
//  board/library-ui.js — tabs Added | Suggested | All, one search field
//  ("Search words"), each row shows where the word sits ("in …"). Every
//  read is PIPCORE.lib.libraryState (the web's library.mjs); the
//  Library itself never writes — adding goes through the add form.
//

import SwiftUI

nonisolated struct LibraryTab: Decodable, Sendable, Identifiable {
    let id: String
    let label: String
}

nonisolated struct LibraryRow: Decodable, Sendable, Identifiable {
    let key: String
    let kind: String
    let id: String
    let label: String
    let role: String?
    let art: String?
    let photoKey: String?
    let sub: String?
    var rowID: String { key }
}

nonisolated struct LibraryState: Decodable, Sendable {
    let tab: String
    let q: String
    let tabs: [LibraryTab]
    let empty: String?
    let rows: [LibraryRow]
    let total: Int
}

struct LibraryView: View {
    @EnvironmentObject var model: AppModel
    @State private var tab = "added"
    @State private var q = ""
    @State private var state: LibraryState?

    private struct Key: Equatable { var tab: String; var q: String }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 12) {
                Text("Words")
                    .font(.system(size: 26, weight: .bold))
                    .foregroundStyle(PipStyle.ink)
                    .accessibilityAddTraits(.isHeader)
                Spacer()
                Button { model.openAdd(groupId: nil) } label: {
                    Label("Add a word", systemImage: "plus")
                        .font(.system(size: 16, weight: .semibold))
                        .padding(.horizontal, 14).frame(height: 44)
                        .background(PipStyle.ink)
                        .foregroundStyle(Color.white)
                        .clipShape(RoundedRectangle(cornerRadius: 10))
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Add a word")
                .accessibilityIdentifier("lib-add")
                Button("Close") { model.showLibrary = false }
                    .font(.system(size: 17, weight: .medium))
                    .frame(minHeight: 44)
                    .accessibilityIdentifier("lib-close")
            }
            Picker("Show", selection: $tab) {
                ForEach(state?.tabs ?? [], id: \.id) { t in
                    Text(t.label).tag(t.id)
                }
            }
            .pickerStyle(.segmented)
            .accessibilityIdentifier("lib-tabs")
            TextField("Search words", text: $q)
                .textFieldStyle(.roundedBorder)
                .font(.system(size: 20))
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .accessibilityLabel("Search words")
                .accessibilityIdentifier("lib-q")
            if let e = state?.empty {
                Text(e)
                    .foregroundStyle(PipStyle.muted)
                    .accessibilityIdentifier("lib-empty")
            }
            ScrollView {
                LazyVStack(spacing: 6) {
                    ForEach(state?.rows ?? []) { r in row(r) }
                }
            }
        }
        .padding(24)
        .background(PipStyle.cream.ignoresSafeArea())
        .overlay(alignment: .bottom) { EditToastOverlay() }
        .modifier(EditSheets(inLibrary: true))
        .task(id: Key(tab: tab, q: q)) {
            if let s: LibraryState = await model.lib("libraryState", ["tab": tab, "q": q]) {
                state = s
            }
        }
        // A write that changed the Library (add, make, remove) refreshes it.
        .onChange(of: model.card?.sheetID) { _, _ in refresh() }
        .onChange(of: model.addRequest?.id) { _, _ in refresh() }
    }

    private func refresh() {
        Task { @MainActor in
            if let s: LibraryState = await model.lib("libraryState", ["tab": tab, "q": q]) {
                state = s
            }
        }
    }

    private func row(_ r: LibraryRow) -> some View {
        Button { model.openCard(kind: r.kind, id: r.id) } label: {
            HStack(spacing: 12) {
                MatchPic(label: r.label, role: r.role, art: r.art ?? r.photoKey)
                VStack(alignment: .leading, spacing: 2) {
                    Text(r.label)
                        .font(.system(size: 19, weight: .semibold))
                        .foregroundStyle(PipStyle.ink)
                    if let s = r.sub {
                        Text(s).font(.system(size: 14)).foregroundStyle(PipStyle.muted)
                    }
                }
                Spacer()
            }
            .padding(.horizontal, 12).padding(.vertical, 8)
            .frame(maxWidth: .infinity, minHeight: 56, alignment: .leading)
            .background(Color.white)
            .clipShape(RoundedRectangle(cornerRadius: 10))
            .overlay(RoundedRectangle(cornerRadius: 10)
                .stroke(PipStyle.muted.opacity(0.3), lineWidth: 1.5))
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(r.sub.map { "\(r.label), \($0)" } ?? r.label)
        .accessibilityAddTraits(.isButton)
        .accessibilityIdentifier("lib-row:\(r.key)")
    }
}
