//
//  SayBar.swift
//  PipAAC
//
//  The sentence buttons and the cloud voice (phase 044 D4; SN-2, SN-6,
//  SN-7, BS-6, BS-10, KB-8). Every rule lives in the core (PIPCORE.say,
//  scripts/ios/app_say.mjs) over the web's own shared clients; Swift only
//  starts a press, plays what the core says to play, and paints.
//
//  A press returns at once with the painted bar. The outcome (the fixed
//  sentence, the toast, the clip to speak) arrives later as ONE host event,
//  "say" - a Promise cannot cross the bridge. The core already dropped a
//  stale reply, so an event that arrives is one that should be heard.
//

import Foundation

/// The "say" host event (app_say.mjs emit): what to play, what to say, and
/// the repainted state when the bar changed.
nonisolated struct SayEvent: Decodable, Sendable {
    let appId: String
    var play: [SpeechSlotModel]?
    var toast: String?
    var state: PaintedState?
    var done: String?   // "face" | "try": a feeling press has been answered
}

private nonisolated struct SayAck: Decodable, Sendable { var ok: Bool? }

extension AppModel {
    /// One PIPCORE.say call off the main actor; a press answers with the
    /// painted state, which the caller applies.
    nonisolated private static func sayRaw<T: Decodable & Sendable>(
        _ core: PipCore, _ method: String, _ args: sending [Any]
    ) async throws -> T {
        try core.sync { try decodeRaw(core.call("PIPCORE.say", method, args)) }
    }

    /// The open person's id is the Worker's `user_id` (the web's `me.id`).
    /// Starts the trial clock and the tile queue drain in the core.
    func sayIdentify(_ personId: String) {
        let appId = self.appId, core = self.core
        Task { @MainActor in
            let _: SayAck? = try? await Self.sayRaw(core, "identify", [appId, personId])
        }
    }

    /// board.js:874 - opening Settings re-reads the trial clock (and the
    /// voice follows it, as on the web).
    func sayTrialRefresh() {
        let appId = self.appId, core = self.core
        Task { @MainActor in
            let _: SayAck? = try? await Self.sayRaw(core, "trialRefresh", [appId])
        }
    }

    /// ✨ ❓ ⏪ ⏩.
    func sayTransform(_ mode: String) { sayPress("transform", [mode]) }
    /// ▶.
    func saySpeak() { sayPress("speak", []) }

    private func sayPress(_ method: String, _ args: [Any]) {
        let appId = self.appId, core = self.core
        Task { @MainActor [weak self] in
            guard let self else { return }
            do {
                let st: PaintedState = try await Self.sayRaw(core, method, [appId] + args)
                apply(st)
            } catch {
                NSLog("AppModel.say.\(method) failed: \(error)")
            }
        }
    }

    /// The core's answer to a press (or a tile tap, or Enter).
    func handleSay(_ json: String) {
        guard let ev = try? JSONDecoder().decode(SayEvent.self, from: Data(json.utf8)),
              ev.appId == appId else { return }
        if ev.done == "face" { speakingFace = nil }
        if ev.done == "try" { tryingFace = nil }
        if let st = ev.state { apply(st) }
        if let msg = ev.toast { showToast(msg) }
        if let play = ev.play, !play.isEmpty {
            speaker.playSentence(play.map { .init(type: $0.type, key: $0.key, text: $0.text) })
        }
    }
}
