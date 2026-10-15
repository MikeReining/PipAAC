//
//  LanguageHelp.swift
//  PipAAC
//
//  Phase 044 E9: the Smart bar family editor (SB-7) and the models the
//  Language help / Spotlight pages draw. The rules live in the core
//  (scripts/ios/app_lang.mjs over the web's shared families.mjs); this
//  file renders family-editor.js's sheet - "<name> — fixed order", one row
//  per tile with ‹ › ✕, an "Add a word…" field, Save and Cancel - and
//  writes only through `lang.familySave` (families.setFamilyItems, which
//  records the synced op).
//

import SwiftUI

// MARK: - Render models (PIPCORE.lang)

nonisolated struct FamilyChip: Decodable, Sendable, Identifiable {
    let id: String
    let label: String
}

nonisolated struct FamilyItem: Decodable, Sendable, Identifiable, Equatable {
    let kind: String
    let id: String
    let label: String
    /// Rows are positional; a word may repeat, so identity is the row.
    var rowId = UUID()
    enum CodingKeys: String, CodingKey { case kind, id, label }
    var key: String { "\(kind):\(id)" }
}

nonisolated struct FamilyDraft: Decodable, Sendable {
    let id: String
    let title: String
    let items: [FamilyItem]
}

nonisolated struct FamilyResolve: Decodable, Sendable {
    let ok: Bool
    var item: FamilyItem?
    var toast: String?
}

nonisolated struct FamilySaved: Decodable, Sendable {
    let toast: String
    let families: [FamilyChip]
}

/// spotlight-sheet.js renderModel / renderLook, as text.
nonisolated struct SpotPageModel: Decodable, Sendable {
    let intro: String
    let supporter: Bool
    let roleNow: String
    let modelHint: String
    let pulse: Bool
    let dim: Int
    let modelSpeaks: Bool
    let lookSummary: String
}

// MARK: - The sheet

struct FamilyEditor: View {
    @EnvironmentObject var model: AppModel
    @Environment(\.dismiss) private var dismiss
    let familyId: String
    var onSaved: ([FamilyChip], String) -> Void

    @State private var draft: FamilyDraft?
    @State private var items: [FamilyItem] = []
    @State private var typed = ""
    @State private var problem: String?

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    ForEach(Array(items.enumerated()), id: \.element.rowId) { i, it in
                        HStack(spacing: 10) {
                            Text(it.kind == "family" ? "\(it.label) ▸" : it.label)
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .accessibilityIdentifier("fam:item:\(i)")
                            Button("‹") { swap(i, i - 1) }
                                .disabled(i == 0)
                                .accessibilityLabel("Move \(it.label) earlier")
                                .accessibilityIdentifier("fam:left:\(i)")
                            Button("›") { swap(i, i + 1) }
                                .disabled(i == items.count - 1)
                                .accessibilityLabel("Move \(it.label) later")
                                .accessibilityIdentifier("fam:right:\(i)")
                            Button("✕") { items.remove(at: i) }
                                .accessibilityLabel("Remove \(it.label)")
                                .accessibilityIdentifier("fam:remove:\(i)")
                        }
                        .buttonStyle(.bordered)
                    }
                }
                Section {
                    HStack {
                        TextField("Add a word…", text: $typed)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()
                            .submitLabel(.done)
                            .onSubmit { add() }
                            .accessibilityIdentifier("fam:add")
                        Button("Add") { add() }
                            .accessibilityIdentifier("fam:addBtn")
                    }
                    if let problem {
                        Text(problem).foregroundStyle(.red)
                            .accessibilityIdentifier("fam:problem")
                    }
                }
            }
            .navigationTitle(draft?.title ?? "Family")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Cancel") { dismiss() }
                        .accessibilityIdentifier("fam:cancel")
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Save") { save() }
                        .accessibilityIdentifier("fam:save")
                }
            }
        }
        .task {
            let d: FamilyDraft? = try? await model.coreValueAny(
                "PIPCORE.lang", "familyOpen", [familyId])
            draft = d
            items = d?.items ?? []
        }
    }

    private func swap(_ a: Int, _ b: Int) {
        guard items.indices.contains(a), items.indices.contains(b) else { return }
        items.swapAt(a, b)
    }

    /// family-editor.js #fam-add-btn: the word resolves as the keyboard
    /// resolves it; an unknown word is "No such word".
    private func add() {
        let text = typed
        Task { @MainActor in
            let r: FamilyResolve? = try? await model.coreValueAny(
                "PIPCORE.lang", "familyResolve", [text])
            if let it = r?.item, r?.ok == true {
                items.append(FamilyItem(kind: it.kind, id: it.id, label: it.label))
                typed = ""
                problem = nil
            } else {
                problem = r?.toast ?? "No such word"
            }
        }
    }

    private func save() {
        let payload = items.map { ["kind": $0.kind, "id": $0.id, "label": $0.label] }
        Task { @MainActor in
            do {
                let out: FamilySaved = try await model.coreValueAny(
                    "PIPCORE.lang", "familySave", [familyId, payload])
                onSaved(out.families, out.toast)
                dismiss()
            } catch {
                problem = "Couldn't save that. Try again."
            }
        }
    }
}

// MARK: - The Language help preview

/// index.html `.set-tiles`: three small tiles, the middle one outlined the
/// way the board will outline a likely next word (settings-ui.css
/// `.set-tile`, 3 pt border, `.likely` adds 4 pt inside).
struct LikelyPreview: View {
    private static let green = Color(red: 0x2e / 255.0, green: 0x8b / 255.0, blue: 0x3a / 255.0)
    private static let amber = Color(red: 0xb0 / 255.0, green: 0x7f / 255.0, blue: 0)
    private let tiles: [(String, Color, Bool)] = [
        ("want", green, false), ("go", green, true), ("juice", amber, false),
    ]
    var body: some View {
        HStack(spacing: 8) {
            ForEach(tiles, id: \.0) { t in
                Text(t.0)
                    .font(.system(size: 12, weight: .bold))
                    .foregroundStyle(PipStyle.inkText)
                    .padding(.top, 4)
                    .frame(width: 58, height: 50, alignment: .top)
                    .background(Color.white)
                    .clipShape(RoundedRectangle(cornerRadius: 8))
                    .overlay(RoundedRectangle(cornerRadius: 8).stroke(t.1, lineWidth: 3))
                    .overlay {
                        if t.2 {
                            RoundedRectangle(cornerRadius: 8).inset(by: 3)
                                .strokeBorder(t.1, lineWidth: 4)
                        }
                    }
            }
        }
        .accessibilityHidden(true)
    }
}
