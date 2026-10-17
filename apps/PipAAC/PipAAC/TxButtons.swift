//
//  TxButtons.swift
//  PipAAC
//
//  Which of ✨ ❓ ⏪ ⏩ are pressable. The answer is the web's own
//  `txButtonDisabled` (public/shared/txbar.mjs, board.js syncTxButtons),
//  asked through the core (PIPCORE.txbuttons) - not re-decided here. A
//  press needs words and, for the model, the internet; except a
//  supporter's modeling session, where ✨ / ❓ are pressable on an empty
//  bar (the press lights the child's button and never reads this bar).
//  Docs: docs/product/Sentence_Bar.md.
//

import Foundation

nonisolated struct TxDisabled: Decodable, Sendable, Equatable {
    var fix = true, question = true, past = true, future = true
}

extension AppModel {
    /// Is this transform button pressable right now?
    func txEnabled(_ mode: String) -> Bool {
        switch mode {
        case "fix": return !txOff.fix
        case "question": return !txOff.question
        case "past": return !txOff.past
        case "future": return !txOff.future
        default: return false
        }
    }

    /// Re-ask the core. Called when the bar, the modeling session, the demo
    /// or the network verdict changes; the newest answer wins.
    func refreshTx() {
        guard !appId.isEmpty else { return }
        txSeq += 1
        let seq = txSeq
        let arg: [String: Any] = [
            "words": !bar.isEmpty,
            "modeling": spot.modeling,
            "offline": !(host?.isOnline ?? true),
            "tour": tourCard != nil,
        ]
        Task { @MainActor [weak self] in
            guard let self else { return }
            do {
                let r: TxDisabled = try await self.coreValueAny("PIPCORE.txbuttons", "disabled", [arg])
                if seq == self.txSeq, r != self.txOff { self.txOff = r }
            } catch { NSLog("txbuttons.disabled failed: \(error)") }
        }
    }
}
