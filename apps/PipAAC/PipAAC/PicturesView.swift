//
//  PicturesView.swift
//  PipAAC
//
//  Pictures (044 E6). The word card's Picture row - the pictures to choose
//  from, "Draw it", the Find field and its results (PP-1, PP-2, PP-3) - the
//  pasted-list form (LW-5, PP-6) and the photos-to-words sheet (PP-5).
//  Words are the web's, taken from the core; this file only draws them and
//  forwards the adult's taps. Picking uses PhotosPicker, so the iPad never
//  asks for photo-library access.
//

import PhotosUI
import SwiftUI

// MARK: - A picture thumbnail

/// A candidate or a row thumbnail: the family's blob, our bundled art, or
/// a spinner while the core fetches the bytes.
struct PicThumb: View {
    var art: String?
    var photoKey: String?
    var loading = false
    var letter: String?
    var size: CGFloat = 56

    var body: some View {
        ZStack {
            Color.white
            if let k = photoKey, let ui = PipBlobs.image(forKey: k) {
                Image(uiImage: ui).resizable().scaledToFill()
            } else if let ui = PipAssets.image(art) {
                Image(uiImage: ui).resizable().scaledToFit().padding(3)
            } else if loading {
                ProgressView()
            } else if let l = letter {
                Text(l).font(.system(size: size * 0.45, weight: .bold)).foregroundStyle(PipStyle.muted)
            }
        }
        .frame(width: size, height: size)
        .clipShape(RoundedRectangle(cornerRadius: 8))
        .accessibilityHidden(true)
    }
}

// MARK: - The card's picture choices + Find (word-card-pictures.js)

/// The choice tiles, "Draw it", and everything below the Picture row.
struct CardFinder: View {
    @EnvironmentObject var model: AppModel
    let card: WordCardModel
    @State private var desc = ""
    @FocusState private var descFocus: Bool

    private var row: PicRow? { model.picRows[model.picKey(card)] }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            if let row {
                if !row.line.isEmpty {
                    Text(row.line)
                        .pipFont(15)
                        .foregroundStyle(PipStyle.muted)
                        .accessibilityIdentifier("wc-picstate")
                }
                if let s = row.suggestion {
                    Button { model.picAcceptSuggestion(card) } label: {
                        Text(s).pipFont(16, .semibold)
                            .foregroundStyle(PipStyle.ink)
                            .padding(.horizontal, 14).padding(.vertical, 8)
                            .background(Color.white).clipShape(Capsule())
                            .overlay(Capsule().stroke(PipStyle.muted.opacity(0.4), lineWidth: 1.5))
                    }
                    .buttonStyle(.plain)
                    .accessibilityIdentifier("wc-suggest")
                }
                findForm(row)
                if let r = row.results { results(r) }
                if !row.drawcost.isEmpty {
                    Text(row.drawcost)
                        .pipFont(14)
                        .foregroundStyle(PipStyle.muted)
                        .accessibilityIdentifier("wc-drawcost")
                }
            }
        }
        .task(id: card.sheetID) { await model.picOpen(card) }
        .onChange(of: row?.results == nil) { _, none in if none { desc = "" } }
    }

    private func findForm(_ row: PicRow) -> some View {
        HStack(spacing: 8) {
            TextField(row.placeholder, text: $desc)
                .textFieldStyle(.roundedBorder)
                .pipFont(17)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .submitLabel(.search)
                .focused($descFocus)
                .onSubmit { go(row) }
                .accessibilityLabel(row.placeholder)
                .accessibilityIdentifier("wc-desc")
            Button { go(row) } label: {
                Text("Find").pipFont(17, .semibold)
                    .frame(minWidth: 64, minHeight: 44)
                    .background(canGo(row) ? PipStyle.ink : Color(white: 0.9))
                    .foregroundStyle(canGo(row) ? Color.white : PipStyle.muted)
                    .clipShape(RoundedRectangle(cornerRadius: 10))
            }
            .buttonStyle(.plain)
            .disabled(!canGo(row))
            .accessibilityLabel("Find")
            .accessibilityIdentifier("wc-findgo")
        }
    }

    private func canGo(_ row: PicRow) -> Bool {
        !desc.trimmingCharacters(in: .whitespaces).isEmpty && !row.drawing
    }

    private func go(_ row: PicRow) {
        guard canGo(row) else { return }
        descFocus = false
        model.picFind(card, q: desc)
    }

    /// Our matches, then the Draw tile for those words.
    private func results(_ r: PicResults) -> some View {
        FlowRow {
            ForEach(r.choices) { c in PicChoiceButton(card: card, choice: c, prefix: "wc-result") }
            DrawTile(title: "Draw this", glyph: "\u{270F}\u{FE0F}", label: r.drawLabel, id: "wc-draw-this") {
                model.picDraw(card, desc: r.q)
            }
            .disabled(r.drawDisabled)
        }
    }
}

/// One choice on the Picture row or in the Find results.
struct PicChoiceButton: View {
    @EnvironmentObject var model: AppModel
    let card: WordCardModel
    let choice: PicChoice
    var prefix = "wc-pic"

    var body: some View {
        Button { if !choice.selected { model.picPick(card, choice: choice.id) } } label: {
            PicThumb(art: choice.art, photoKey: choice.photoKey, loading: choice.loading, size: 64)
                .overlay(RoundedRectangle(cornerRadius: 8)
                    .stroke(choice.selected ? PipStyle.ink : PipStyle.muted.opacity(0.4),
                            lineWidth: choice.selected ? 3 : 1.5))
        }
        .buttonStyle(.plain)
        .accessibilityLabel(choice.label)
        .accessibilityAddTraits(choice.selected ? [.isButton, .isSelected] : .isButton)
        .accessibilityIdentifier("\(prefix):\(choice.id)")
    }
}

/// The dashed "Draw it" / "Draw this" tile.
struct DrawTile: View {
    let title: String
    let glyph: String
    let label: String
    let id: String
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            VStack(spacing: 2) {
                Text(glyph).pipFont(22)
                Text(title).pipFont(13, .semibold)
            }
            .foregroundStyle(PipStyle.ink)
            .frame(width: 64, height: 64)
            .overlay(RoundedRectangle(cornerRadius: 8)
                .strokeBorder(style: StrokeStyle(lineWidth: 1.5, dash: [5, 3]))
                .foregroundStyle(PipStyle.muted))
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
        .accessibilityIdentifier(id)
    }
}

// MARK: - The pasted list (add-flow.js openBulkForm)

struct BulkListView: View {
    @EnvironmentObject var model: AppModel
    let request: BulkRequest
    @State private var text = ""
    @FocusState private var focus: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text(model.bulk?.title ?? "Add a list")
                    .pipFont(24, .bold)
                    .foregroundStyle(PipStyle.ink)
                    .accessibilityAddTraits(.isHeader)
                    .accessibilityIdentifier("bulk-title")
                Spacer()
                Button { model.bulkRequest = nil; model.bulk = nil } label: {
                    Image(systemName: "xmark.circle.fill")
                        .pipFont(28)
                        .symbolRenderingMode(.palette)
                        .foregroundStyle(Color.white, PipStyle.muted)
                        .frame(width: 44, height: 44)
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Close")
                .accessibilityIdentifier("bulk-close")
            }
            ZStack(alignment: .topLeading) {
                TextEditor(text: $text)
                    .pipFont(19)
                    .scrollContentBackground(.hidden)
                    .focused($focus)
                    .autocorrectionDisabled()
                    .textInputAutocapitalization(.never)
                    .padding(6)
                    .background(Color.white)
                    .clipShape(RoundedRectangle(cornerRadius: 10))
                    .overlay(RoundedRectangle(cornerRadius: 10).stroke(PipStyle.muted.opacity(0.4), lineWidth: 1.5))
                    .accessibilityLabel(model.bulk?.placeholder ?? "One word or short phrase per line")
                    .accessibilityIdentifier("bulk-paste")
                if text.isEmpty {
                    Text(model.bulk?.placeholder ?? "One word or short phrase per line")
                        .pipFont(19)
                        .foregroundStyle(PipStyle.muted.opacity(0.7))
                        .padding(.horizontal, 12).padding(.top, 14)
                        .allowsHitTesting(false)
                        .accessibilityHidden(true)
                }
            }
            .frame(height: 150)
            ScrollView {
                VStack(spacing: 6) {
                    ForEach(model.bulk?.rows ?? []) { r in row(r) }
                }
            }
            if let note = model.bulk?.note, !note.isEmpty {
                Text(note)
                    .pipFont(15)
                    .foregroundStyle(PipStyle.muted)
                    .accessibilityIdentifier("bulk-note")
            }
            Button { model.bulkAdd(groupId: request.groupId, text: text) } label: {
                let b = model.bulk
                Text(b?.addLabel ?? "Add all")
                    .pipFont(18, .semibold)
                    .frame(maxWidth: .infinity, minHeight: 52)
                    .background((b?.addDisabled ?? true) ? Color(white: 0.9) : PipStyle.ink)
                    .foregroundStyle((b?.addDisabled ?? true) ? PipStyle.muted : Color.white)
                    .clipShape(RoundedRectangle(cornerRadius: 12))
            }
            .buttonStyle(.plain)
            .disabled(model.bulk?.addDisabled ?? true)
            .accessibilityIdentifier("bulk-add")
        }
        .padding(24)
        .background(PipStyle.cream.ignoresSafeArea())
        .overlay(alignment: .bottom) { EditToastOverlay() }
        .task(id: text) { await model.bulkRefresh(groupId: request.groupId, text: text) }
        .onAppear { focus = true }
    }

    private func row(_ r: BulkRowModel) -> some View {
        HStack(spacing: 12) {
            Button {
                if r.cycles { model.bulkCycle(groupId: request.groupId, text: text, key: r.key) }
            } label: {
                PicThumb(art: r.thumb.art, photoKey: r.thumb.photoKey, letter: r.thumb.letter, size: 44)
                    .overlay(RoundedRectangle(cornerRadius: 8).stroke(PipStyle.muted.opacity(0.35), lineWidth: 1.5))
            }
            .buttonStyle(.plain)
            .disabled(!r.cycles)
            .accessibilityLabel(r.cycles ? "Another picture for \(r.label)" : "Picture for \(r.label)")
            .accessibilityIdentifier("bulk-thumb:\(r.key)")
            Text(r.label)
                .pipFont(19, .semibold)
                .foregroundStyle(PipStyle.ink)
            Spacer()
            Text(r.tag)
                .pipFont(14, .semibold)
                .foregroundStyle(r.already || r.overCap ? PipStyle.muted : PipStyle.ink)
                .accessibilityIdentifier("bulk-tag:\(r.key)")
        }
        .padding(.horizontal, 12).padding(.vertical, 6)
        .frame(maxWidth: .infinity, minHeight: 56, alignment: .leading)
        .background(Color.white.opacity(r.already ? 0.6 : 1))
        .clipShape(RoundedRectangle(cornerRadius: 10))
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("bulk-row:\(r.key)")
    }
}

// MARK: - Several photos as new words (add-flow.js renderPhotoDrafts)

struct PhotoDraftsView: View {
    @EnvironmentObject var model: AppModel
    let request: PhotoRequest
    @State private var names: [String]
    @State private var sheet: PhotoDraftsModel?

    init(request: PhotoRequest) {
        self.request = request
        _names = State(initialValue: Array(repeating: "", count: request.keys.count))
    }

    private var drafts: [[String: String]] {
        zip(request.keys, names).map { ["key": $0, "name": $1] }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text(sheet?.title ?? "Add photos")
                    .pipFont(24, .bold)
                    .foregroundStyle(PipStyle.ink)
                    .accessibilityAddTraits(.isHeader)
                    .accessibilityIdentifier("photo-title")
                Spacer()
                Button("Cancel") { model.photoRequest = nil }
                    .pipFont(17, .medium)
                    .frame(minHeight: 44)
                    .accessibilityIdentifier("photo-cancel")
            }
            ScrollView {
                VStack(spacing: 8) {
                    ForEach(Array(request.keys.enumerated()), id: \.offset) { i, key in
                        HStack(spacing: 12) {
                            PicThumb(photoKey: key, size: 64)
                            TextField(sheet?.rows[safe: i]?.placeholder ?? "Name this one",
                                      text: $names[i])
                                .textFieldStyle(.roundedBorder)
                                .pipFont(19)
                                .submitLabel(.done)
                                .accessibilityIdentifier("photo-name:\(i)")
                            Text(sheet?.rows[safe: i]?.tag ?? "")
                                .pipFont(14, .semibold)
                                .foregroundStyle(PipStyle.muted)
                                .accessibilityIdentifier("photo-tag:\(i)")
                        }
                        .padding(8)
                        .background(Color.white)
                        .clipShape(RoundedRectangle(cornerRadius: 10))
                    }
                }
            }
            Button { model.photosSave(request, drafts: drafts) } label: {
                let off = sheet?.saveDisabled ?? true
                Text(sheet?.saveLabel ?? "Save")
                    .pipFont(18, .semibold)
                    .frame(maxWidth: .infinity, minHeight: 52)
                    .background(off ? Color(white: 0.9) : PipStyle.ink)
                    .foregroundStyle(off ? PipStyle.muted : Color.white)
                    .clipShape(RoundedRectangle(cornerRadius: 12))
            }
            .buttonStyle(.plain)
            .disabled(sheet?.saveDisabled ?? true)
            .accessibilityIdentifier("photo-save")
        }
        .padding(24)
        .background(PipStyle.cream.ignoresSafeArea())
        .overlay(alignment: .bottom) { EditToastOverlay() }
        .task(id: names) { sheet = await model.photoDrafts(groupId: request.groupId, drafts: drafts) }
    }
}

private extension Array {
    subscript(safe i: Int) -> Element? { indices.contains(i) ? self[i] : nil }
}

// MARK: - The add form's two links

/// "Paste a list" · "Add photos" under the match list (index.html #add-bulk,
/// #add-photos). The photos link is a multi-select PhotosPicker; a UI-test
/// launch can name files instead (`-pipUITestPhotoFiles a.png,b.png`) and
/// they go through the same save path.
struct AddListLinks: View {
    @EnvironmentObject var model: AppModel
    let groupId: String
    let cell: CellRef?
    @State private var picked: [PhotosPickerItem] = []

    var body: some View {
        HStack(spacing: 6) {
            Button("Paste a list") {
                model.addRequest = nil
                model.bulkRequest = BulkRequest(groupId: groupId)
            }
            .buttonStyle(.borderless)
            .accessibilityIdentifier("add-bulk")
            Text("·").foregroundStyle(PipStyle.muted)
            if let files = UITestHooks.photoFiles {
                Button("Add photos") {
                    model.addPhotos(groupId: groupId, cell: cell, datas: files.compactMap { FileManager.default.contents(atPath: $0) })
                }
                .buttonStyle(.borderless)
                .accessibilityIdentifier("add-photos")
            } else {
                PhotosPicker(selection: $picked, matching: .images, photoLibrary: .shared()) {
                    Text("Add photos")
                }
                .accessibilityIdentifier("add-photos")
            }
            Spacer()
        }
        .pipFont(17, .medium)
        .frame(minHeight: 44)
        .onChange(of: picked) { _, items in
            guard !items.isEmpty else { return }
            picked = []
            Task { @MainActor in
                var datas: [Data] = []
                for it in items {
                    if let d = try? await it.loadTransferable(type: Data.self) { datas.append(d) }
                }
                model.addPhotos(groupId: groupId, cell: cell, datas: datas)
            }
        }
    }
}
