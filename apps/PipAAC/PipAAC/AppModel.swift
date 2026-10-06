//
//  AppModel.swift
//  PipAAC
//
//  Owns the PipCore session and the render models the views draw. Every
//  mutation is one bridge call that returns the whole painted state
//  ({speech, bar, strip, board}) — Swift never re-derives product state.
//  Core calls run off the main actor and publish back; the serial core
//  queue keeps tap order.
//

import Combine
import Foundation
import SwiftUI

// MARK: - Render models (scripts/ios/app.mjs)

nonisolated struct CellModel: Decodable, Sendable {
    let type: String            // word | empty | groups | family | next | group
    var slot: Int
    var kind: String?
    var id: String?
    var label: String?
    var role: String?
    var art: String?
    var photoKey: String?
    var reserved: Bool?
    // family / group / anchors
    var familyId: String?
    var glyph: String?
    var speaks: String?
    var name: String?
    var groupId: String?
}

nonisolated struct BoardModel: Decodable, Sendable {
    let cols: Int
    let rows: Int
    let cells: [CellModel]
}

nonisolated struct CardModel: Decodable, Sendable {
    let kind: String            // sense | entity | family | more
    var id: String?
    var label: String?
    var role: String?
    var art: String?
    var photoKey: String?
    var glyph: String?
    var speaks: String?
    var nextFamily: String?
}

nonisolated struct StripModel: Decodable, Sendable {
    let cap: Int
    let mode: String            // predict | family
    var familyId: String?
    var page: Int?
    var pages: Int?
    let cards: [CardModel]
}

nonisolated struct ChipModel: Decodable, Sendable {
    let kind: String?
    let id: String?
    let display: String?
    let art: String?
    let photoKey: String?
}

nonisolated struct IndexPageModel: Decodable, Sendable {
    let page: Int
    let cells: [CellModel]
}
nonisolated struct GroupIndexModel: Decodable, Sendable {
    let cols: Int
    let rows: Int
    let pages: [IndexPageModel]
}
nonisolated struct GroupPageModel: Decodable, Sendable {
    let cols: Int
    let rows: Int
    let groupId: String
    let name: String
    let page: Int
    let pages: Int
    let cells: [CellModel]
}

nonisolated struct SpeechSlotModel: Decodable, Sendable {
    let type: String
    var key: String?
    var text: String?
}

nonisolated struct PaintedState: Decodable, Sendable {
    var speech: SpeechSlotModel? = nil
    var clips: [SpeechSlotModel]? = nil
    let bar: [ChipModel]
    let strip: StripModel
    let board: BoardModel
}

nonisolated struct AppOpenResult: Decodable, Sendable {
    let appId: String
    let locale: String
    let voiceId: String
    var speechRate: Float?
}

// MARK: - AppModel

@MainActor
final class AppModel: ObservableObject {
    enum Surface { case boot, board, index, group }

    @Published private(set) var surface: Surface = .boot
    @Published private(set) var board: BoardModel?
    @Published private(set) var strip: StripModel?
    @Published private(set) var bar: [ChipModel] = []
    @Published private(set) var groupIndex: GroupIndexModel?
    @Published private(set) var groupPage: GroupPageModel?
    @Published private(set) var bootError: String?

    private nonisolated let core = PipCore()
    private var appId = ""
    private var dbId: Int32 = 0
    let speaker = PipSpeaker()

    // MARK: bridge

    /// Decodes a JSValue's Foundation object into a render model.
    nonisolated private static func decodeRaw<T: Decodable>(_ raw: Any?) throws -> T {
        guard let raw else { throw PipCoreError.evalFailed("bridge returned nothing") }
        let data = try JSONSerialization.data(withJSONObject: raw)
        return try JSONDecoder().decode(T.self, from: data)
    }

    /// One bridge call, awaited. Runs on the cooperative pool — the
    /// serial core queue is the only ordering rule, so concurrent taps
    /// serialize there, not on the main actor.
    nonisolated private static func coreCall<T: Decodable & Sendable>(
        _ core: PipCore, _ method: String, _ args: sending [Any]
    ) async throws -> T {
        try core.sync { try decodeRaw(core.call("PIPCORE.app", method, args)) }
    }

    // MARK: boot

    func boot() {
        speaker.configure()
        Task { @MainActor in
            do {
                let (opened, dbId, st) = try await Self.bootCore(core)
                speaker.rate = opened.speechRate ?? 1
                self.appId = opened.appId
                self.dbId = dbId
                apply(st)
                surface = .board
            } catch {
                bootError = "\(error)"
            }
        }
    }

    /// Boot's heavy lane — the bundle eval + catalog import must not
    /// run on the main actor, so this is `async` (suspends to the pool)
    /// even though nothing inside awaits.
    nonisolated private static func bootCore(_ core: PipCore) async throws -> (AppOpenResult, Int32, PaintedState) {
        let dbURL = try PipAssets.userDbURL()
        let catalog = try PipAssets.text("catalog.json")
        let phrases = try PipAssets.text("suggest_answers.en.json")
        let forms = try PipAssets.text("form_answers.en.json")
        return try core.sync {
            _ = try core.evaluate(resource: "pip-core", bundle: .main)
            let dbId = try core.openDatabase(path: dbURL.path)
            let opened: AppOpenResult = try decodeRaw(
                core.call("PIPCORE.app", "appOpen", [dbId, catalog, phrases, forms]))
            let st = PaintedState(
                bar: try decodeRaw(core.call("PIPCORE.app", "appBar", [opened.appId])),
                strip: try decodeRaw(core.call("PIPCORE.app", "appStrip", [opened.appId])),
                board: try decodeRaw(core.call("PIPCORE.app", "appBoard", [opened.appId])))
            return (opened, dbId, st)
        }
    }

    // MARK: taps

    private func mutate(_ method: String, _ args: [Any]) {
        let appId = self.appId
        let core = self.core
        Task { @MainActor [weak self] in
            guard let self else { return }
            do {
                let st: PaintedState = try await Self.coreCall(core, method, [appId] + args)
                if let s = st.speech {
                    speaker.play(slot: .init(type: s.type, key: s.key, text: s.text))
                }
                apply(st)
            } catch {
                NSLog("AppModel.\(method) failed: \(error)")
            }
        }
    }

    private func apply(_ st: PaintedState) {
        bar = st.bar
        strip = st.strip
        board = st.board
    }

    func tap(kind: String, id: String, text: String, source: String = "grid") {
        mutate("appTap", [["kind": kind, "id": id, "text": text, "source": source]])
    }

    func backspace() { mutate("appBackspace", []) }
    func clear() { mutate("appClear", []) }

    func speak() {
        let appId = self.appId
        let core = self.core
        Task { @MainActor [weak self] in
            guard let self else { return }
            do {
                let st: PaintedState = try await Self.coreCall(core, "appSpeak", [appId])
                speaker.playSentence((st.clips ?? []).map {
                    .init(type: $0.type, key: $0.key, text: $0.text)
                })
                apply(st)
            } catch {
                NSLog("AppModel.speak failed: \(error)")
            }
        }
    }

    // MARK: navigation

    private func navCall<T: Decodable & Sendable>(
        _ method: String, _ args: [Any],
        then: @escaping @MainActor (T) -> Void
    ) {
        let appId = self.appId
        let core = self.core
        Task { @MainActor in
            do {
                then(try await Self.coreCall(core, method, [appId] + args))
            } catch {
                NSLog("AppModel.\(method) failed: \(error)")
            }
        }
    }

    func openGroups() {
        navCall("appGroups", []) { [weak self] (idx: GroupIndexModel) in
            self?.groupIndex = idx
            self?.surface = .index
        }
    }

    func openGroup(_ groupId: String, page: Int = 0) {
        navCall("appGroupPage", [groupId, page]) { [weak self] (gp: GroupPageModel) in
            self?.groupPage = gp
            self?.surface = .group
        }
        // The strip re-ranks for the open group.
        navCall("appStrip", []) { [weak self] (st: StripModel) in
            self?.strip = st
        }
    }

    func nextGroupPage() {
        guard let gp = groupPage else { return }
        openGroup(gp.groupId, page: (gp.page + 1) % max(1, gp.pages))
    }

    func backToBoard() {
        let appId = self.appId
        let core = self.core
        Task { @MainActor [weak self] in
            guard let self else { return }
            do {
                let st: PaintedState = try await Self.showBoardCore(core, appId)
                apply(st)
                surface = .board
            } catch { NSLog("appShowBoard failed: \(error)") }
        }
    }

    /// appShowBoard flips the view first — the strip then re-ranks for
    /// the board, not the open group.
    nonisolated private static func showBoardCore(_ core: PipCore, _ appId: String) async throws -> PaintedState {
        try core.sync {
            let board: BoardModel = try decodeRaw(core.call("PIPCORE.app", "appShowBoard", [appId]))
            return PaintedState(
                bar: try decodeRaw(core.call("PIPCORE.app", "appBar", [appId])),
                strip: try decodeRaw(core.call("PIPCORE.app", "appStrip", [appId])),
                board: board)
        }
    }

    // MARK: family strip

    func openFamily(_ familyId: String) {
        navCall("appOpenFamily", [familyId, 0]) { [weak self] (st: StripModel) in
            self?.strip = st
        }
    }

    func familyMore() {
        navCall("appFamilyPage", []) { [weak self] (st: StripModel) in
            self?.strip = st
        }
    }
}
