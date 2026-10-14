//
//  AccountFlow.swift
//  PipAAC
//
//  The state behind Settings -> Your account and Backup & privacy (phase
//  044 C5; AC-1..3, SY-9, SY-10, SY-13). The protocol is the web's, in the
//  core: PIPCORE.account (scripts/ios/app_account.mjs) and PIPCORE.recovery
//  (app_recovery.mjs). This file only turns their host events into screen
//  state, reads the signed-in state back out of the keychain, and adds the
//  restored / signed-in people to the registry.
//
//  Copy is public/index.html "Your account" / "Backup & privacy" and
//  public/board/recovery-ui.js, word for word.
//

import Combine
import Foundation
import SwiftUI

private nonisolated struct FlowEvent: Decodable {
    var stage: String?
    var text: String?
    var message: String?
    var email: String?
    var payload: String?
    var words: [String]?
    var offline: Bool?
    var userId: String?
    var epoch: Double?
    var moved: Bool?
}

enum CardScreen: Equatable {
    case idle
    case working(String)
    case card(payload: String, words: [String], offline: Bool)
    case message(String)
}

@MainActor
final class AccountFlow: ObservableObject {
    weak var model: AppModel?

    // Your account
    @Published var signedInEmail: String?
    @Published var linkStatus = ""
    @Published var signInLine = ""
    @Published var signInBusy = false

    // Recovery card
    @Published var card: CardScreen = .idle
    @Published var replaceNote: String?

    // Restore
    @Published var restoreStatus = ""
    @Published var restoreBusy = false

    // MARK: event router (AppModel.handleHostEvent)

    func handle(_ name: String, _ json: String) {
        guard let ev = try? JSONDecoder().decode(FlowEvent.self, from: Data(json.utf8)) else { return }
        switch name {
        case "account.link":
            linkStatus = ev.message ?? ""
        case "account.landing":
            switch ev.stage {
            case "say": signInLine = ev.text ?? ""
            case "done":
                signInLine = ev.text ?? ""
                signInBusy = false
                refreshAccount()
                try? model?.refreshPeople()
            default:
                signInLine = ev.text ?? "Sign-in failed."
                signInBusy = false
            }
        case "recovery.linked":
            // The first card turned the backup on: this person syncs now.
            try? model?.refreshPeople()
            model?.startSyncIfLinked()
        case "recovery.card":
            switch ev.stage {
            case "card":
                card = .card(payload: ev.payload ?? "", words: ev.words ?? [], offline: ev.offline ?? false)
                replaceNote = nil
                try? model?.refreshPeople()
            case "replaceFailed":
                replaceNote = ev.message
            default:
                card = .message(ev.message ?? "Could not build the card.")
            }
        case "recovery.restore":
            switch ev.stage {
            case "checking", "restoring": restoreStatus = ev.message ?? ""
            case "done":
                if let uid = ev.userId { finishRestore(userId: uid, epoch: ev.epoch ?? 1) }
            default:
                restoreStatus = ev.message ?? ""
                restoreBusy = false
            }
        default: break
        }
    }

    // MARK: Your account (devices-ui.js)

    /// The device-only signed-in state the core keeps in the keychain.
    func refreshAccount() {
        guard let svc = model?.host?.config.keychainService,
              let data = try? PipKeychain.get("account/state", service: svc),
              let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let email = obj["email"] as? String else {
            signedInEmail = nil
            return
        }
        signedInEmail = email
    }

    func sendLink(email: String) {
        linkStatus = ""
        let core = model?.core
        core?.enqueue { _ = try? core?.call("PIPCORE.account", "sendLink", [PipRelay.baseURL, email]) }
    }

    func signIn(pasted: String) {
        signInBusy = true
        signInLine = ""
        let core = model?.core
        core?.enqueue { _ = try? core?.call("PIPCORE.account", "land", [PipRelay.baseURL, pasted]) }
    }

    // MARK: Recovery card

    func showCard() {
        guard let model, let id = model.activeId, let json = try? model.registry?.rowJSON(id) else { return }
        card = .working("Making the card…")
        replaceNote = nil
        let core = model.core
        let offline = !(model.host?.isOnline ?? true)
        core.enqueue {
            _ = try? core.call("PIPCORE.recovery", "card",
                               [PipRelay.baseURL, json, PipRelay.deviceLabel, offline])
        }
    }

    func replaceCard() {
        guard let model, let id = model.activeId, let json = try? model.registry?.rowJSON(id) else { return }
        replaceNote = nil
        let core = model.core
        core.enqueue {
            _ = try? core.call("PIPCORE.recovery", "replace", [PipRelay.baseURL, json, PipRelay.deviceLabel])
        }
    }

    // MARK: Restore (recovery-ui.js restoreFlow)

    func restore(text: String) {
        guard !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return }
        restoreBusy = true
        restoreStatus = "Checking the card…"
        let core = model?.core
        core?.enqueue {
            _ = try? core?.call("PIPCORE.recovery", "restore", [PipRelay.baseURL, text, PipRelay.deviceLabel])
        }
    }

    /// The camera or the photo found a card: run it like a pasted one.
    func restoreFromScan(_ text: String?) {
        guard let text else {
            restoreStatus = "No QR card found in that photo."
            return
        }
        restore(text: text)
    }

    /// doRestore's tail: the restored person joins the registry (the relay
    /// id is the registry id), the card counts as seen, and they open. A
    /// fresh device's untouched placeholder is replaced, not kept beside them.
    private func finishRestore(userId: String, epoch: Double) {
        guard let model, let registry = model.registry else { return }
        Task { @MainActor in
            do {
                try model.refreshPeople()
                let placeholder = model.people.first { $0.id == model.activeId && $0.needsSetup && $0.id != userId }
                try registry.addLinked(
                    id: userId,
                    sync: ["userId": .string(userId), "epoch": .number(epoch), "cursor": .number(0)],
                    role: nil, home: placeholder != nil)
                try registry.patch(userId, ["cardShownAt": Date().timeIntervalSince1970 * 1000])
                try model.refreshPeople()
                try await model.open(userId)
                if let p = placeholder { try? registry.remove(p.id); try model.refreshPeople() }
                restoreStatus = "Restored."
                restoreBusy = false
            } catch {
                restoreStatus = "Could not restore: \(error)"
                restoreBusy = false
            }
        }
    }
}
