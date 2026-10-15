//
//  PicturesModel.swift
//  PipAAC
//
//  AppModel's picture verbs (044 E6; inventory PP-1, PP-2, PP-3, PP-5, PP-6,
//  LW-5): find a picture by meaning, pick or reject one, Draw it for me, a
//  pasted list of words, several photos as new words. Every rule lives in
//  the core (PIPCORE.pics, scripts/ios/app_pictures.mjs) over the web's own
//  picture client; Swift renders, takes the adult's taps, and stores photo
//  bytes. Anything that talks to the Worker answers at once with the state
//  so far; the outcome arrives later as one host event, "pic".
//

import Foundation

// MARK: - Render models (scripts/ios/app_pictures.mjs)

/// One picture on the card's Picture row: the family's blob, our bundled
/// art, or (while `loading`) bytes the core is still fetching.
nonisolated struct PicChoice: Decodable, Sendable, Identifiable, Hashable {
    let id: String
    let selected: Bool
    let label: String
    var art: String?
    var photoKey: String?
    let loading: Bool
}

nonisolated struct PicResults: Decodable, Sendable {
    let q: String
    let choices: [PicChoice]
    let drawLabel: String
    let drawDisabled: Bool
}

nonisolated struct PicRow: Decodable, Sendable {
    let kind: String
    let id: String
    let name: String
    let choices: [PicChoice]
    let drawIt: Bool
    let line: String
    let drawing: Bool
    let finding: Bool
    var suggestion: String?
    let placeholder: String
    let photoLead: Bool
    let drawcost: String
    var results: PicResults?
}

nonisolated struct BulkThumb: Decodable, Sendable {
    var art: String?
    var photoKey: String?
    var letter: String?
}

nonisolated struct BulkRowModel: Decodable, Sendable, Identifiable {
    let key: String
    let label: String
    let kind: String
    let already: Bool
    let overCap: Bool
    let thumb: BulkThumb
    let cycles: Bool
    let tag: String
    var id: String { key }
}

nonisolated struct BulkModel: Decodable, Sendable {
    let groupId: String
    let title: String
    let placeholder: String
    let rows: [BulkRowModel]
    let addDisabled: Bool
    let addLabel: String
    let note: String
}

nonisolated struct PhotoDraftRow: Decodable, Sendable, Identifiable {
    let key: String
    let name: String
    let placeholder: String
    let tag: String
    var id: String { key }
}

nonisolated struct PhotoDraftsModel: Decodable, Sendable {
    let title: String
    let rows: [PhotoDraftRow]
    let saveLabel: String
    let saveDisabled: Bool
}

nonisolated struct PicEvent: Decodable, Sendable {
    let appId: String
    var kind: String?
    var id: String?
    var row: PicRow?
    var paint: EditPaint?
    var bulk: BulkModel?
    var toast: String?
}

/// bulkAdd answers either "ask once" or the repainted state with a toast.
nonisolated struct BulkAnswer: Decodable, Sendable {
    var armed: Bool?
    var bulk: BulkModel?
}

nonisolated struct SuggestionAnswer: Decodable, Sendable {
    var text: String?
    var current: String?
}

/// The paste form, opened from the add form (that group) or the Library.
struct BulkRequest: Identifiable {
    let id = UUID()
    var groupId: String?
}

/// Several photos, already in the blob store, waiting for names.
struct PhotoRequest: Identifiable {
    let id = UUID()
    var groupId: String?
    var cell: CellRef?
    var keys: [String]
}

// MARK: - AppModel

extension AppModel {
    nonisolated static let picObject = "PIPCORE.pics"

    /// One PIPCORE.pics call off the main actor. `args` always gets the
    /// open appId first.
    func pic<T: Decodable & Sendable>(_ method: String, _ args: [String: Any]) async -> T? {
        let core = self.core
        do {
            let data = try JSONSerialization.data(withJSONObject: args)
            let appId = self.appId
            return try await Self.picCoreApp(core, method, appId, data)
        } catch {
            NSLog("AppModel.pic.\(method) failed: \(error)")
            return nil
        }
    }

    nonisolated private static func picCoreApp<T: Decodable & Sendable>(
        _ core: PipCore, _ method: String, _ appId: String, _ args: Data
    ) async throws -> T {
        try core.sync {
            let obj = try JSONSerialization.jsonObject(with: args)
            return try decodeRaw(core.call(picObject, method, [appId, obj]))
        }
    }

    /// The open person's id is the Worker's `user_id`, the same one the
    /// sentence buttons use. A UI-test launch may also carry a stored
    /// license (`-pipUITestLicense`), as a purchase would leave it.
    func picIdentify(_ personId: String) {
        let core = self.core, appId = self.appId
        let seed = UITestHooks.licenseToSeed
        Task.detached {
            try? core.sync {
                _ = try core.call(Self.picObject, "identify", [appId, personId])
                if let seed { _ = try core.call(Self.picObject, "testSeedLicense", [appId, seed]) }
            }
        }
    }

    // MARK: the card's Picture row (PP-1, PP-2, PP-3)

    func picKey(_ c: WordCardModel) -> String { "\(c.kind):\(c.id)" }

    /// A card opened: the row so far; a personal word runs the finder.
    func picOpen(_ c: WordCardModel) async {
        if let row: PicRow = await pic("cardOpen", ["kind": c.kind, "id": c.id]) {
            picRows[picKey(c)] = row
        }
    }

    func picFind(_ c: WordCardModel, q: String) {
        Task { @MainActor in
            if let row: PicRow = await pic("find", ["kind": c.kind, "id": c.id, "q": q]) {
                picRows[picKey(c)] = row
            }
        }
    }

    func picPick(_ c: WordCardModel, choice: String) {
        Task { @MainActor in
            if let row: PicRow = await pic("pick", ["kind": c.kind, "id": c.id, "choice": choice]) {
                picRows[picKey(c)] = row
            }
        }
    }

    func picDraw(_ c: WordCardModel, desc: String) {
        Task { @MainActor in
            if let row: PicRow = await pic("draw", ["kind": c.kind, "id": c.id, "desc": desc]) {
                picRows[picKey(c)] = row
            }
        }
    }

    /// "Did you mean banana?": the word takes the spelling, then its picture.
    func picAcceptSuggestion(_ c: WordCardModel) {
        Task { @MainActor in
            guard let a: SuggestionAnswer = await pic("suggestion", ["id": c.id]) else { return }
            if let t = a.text, t != c.label { renameCard(c, to: t) }
        }
    }

    // MARK: events

    func handlePic(_ json: String) {
        guard let ev = try? JSONDecoder().decode(PicEvent.self, from: Data(json.utf8)),
              ev.appId == appId else { return }
        if let row = ev.row { picRows["\(row.kind):\(row.id)"] = row }
        if let b = ev.bulk, bulkRequest != nil { bulk = b }
        if let p = ev.paint {
            // The board wears the new picture; an open card is refreshed in
            // place, a closed one is never reopened.
            board = p.board
            if let gp = p.groupPage { groupPage = gp }
            if let c = p.card, card?.sheetID == c.sheetID { card = c }
            picTick += 1
        }
        if let msg = ev.toast { showEditToast(.init(text: msg)) }
    }

    // MARK: a pasted list (LW-5, PP-6)

    func bulkRefresh(groupId: String?, text: String) async {
        let g: Any = groupId ?? NSNull()
        if let m: BulkModel = await pic("bulkState", ["groupId": g, "text": text]) { bulk = m }
    }

    func bulkCycle(groupId: String?, text: String, key: String) {
        let g: Any = groupId ?? NSNull()
        Task { @MainActor in
            if let m: BulkModel = await pic("bulkCycle", ["groupId": g, "text": text, "key": key]) { bulk = m }
        }
    }

    /// The Add button. The first press of a big drawing list only asks.
    func bulkAdd(groupId: String?, text: String) {
        let g: Any = groupId ?? NSNull()
        let core = self.core, appId = self.appId
        Task { @MainActor [weak self] in
            guard let self else { return }
            guard let data = try? JSONSerialization.data(withJSONObject: ["groupId": g, "text": text]),
                  let raw: Data = try? await Self.picData(core, "bulkAdd", appId, data) else { return }
            if let a = try? JSONDecoder().decode(BulkAnswer.self, from: raw), a.armed == true {
                bulk = a.bulk
                return
            }
            if let p = try? JSONDecoder().decode(EditPaint.self, from: raw) {
                bulkRequest = nil
                bulk = nil
                applyEdit(p, openCard: false)
                picTick += 1
            }
        }
    }

    nonisolated private static func picData(
        _ core: PipCore, _ method: String, _ appId: String, _ args: Data
    ) async throws -> Data {
        try core.sync {
            let obj = try JSONSerialization.jsonObject(with: args)
            let raw = try core.call(picObject, method, [appId, obj])
            return try JSONSerialization.data(withJSONObject: raw as Any)
        }
    }

    // MARK: several photos as new words (PP-5)

    /// The chosen photos: each is stored upright in the blob store, then
    /// the sheet asks for a name for each.
    func addPhotos(groupId: String?, cell: CellRef?, datas: [Data]) {
        var keys: [String] = []
        for d in datas {
            if let jpeg = PipPhoto.jpeg(from: d), let k = try? PipBlobs.save(jpeg) { keys.append(k) }
        }
        guard !keys.isEmpty else {
            showEditToast(.init(text: "Couldn't use those photos. Try others."))
            return
        }
        addRequest = nil
        photoRequest = PhotoRequest(groupId: groupId, cell: cell, keys: keys)
    }

    func photoDrafts(groupId: String?, drafts: [[String: String]]) async -> PhotoDraftsModel? {
        let g: Any = groupId ?? NSNull()
        return await pic("photoDrafts", ["groupId": g, "drafts": drafts])
    }

    func photosSave(_ r: PhotoRequest, drafts: [[String: String]]) {
        let g: Any = r.groupId ?? NSNull()
        let cell: Any = r.cell?.json ?? NSNull()
        let core = self.core, appId = self.appId
        Task { @MainActor [weak self] in
            guard let self else { return }
            guard let data = try? JSONSerialization.data(
                withJSONObject: ["groupId": g, "cell": cell, "drafts": drafts]),
                  let raw: Data = try? await Self.picData(core, "photosSave", appId, data),
                  let p = try? JSONDecoder().decode(EditPaint.self, from: raw) else { return }
            photoRequest = nil
            applyEdit(p, openCard: false)
            picTick += 1
        }
    }
}
