//
//  TeamFlow.swift
//  PipAAC
//
//  The state behind Settings -> Team & devices (the Team list, the device
//  list), Backup & privacy (Delete from Pip) and Your account (Your name,
//  Delete your account) - phase 044 F2; AC-4..AC-10, SY-7, SY-8, SY-14.
//  The protocol is the web's, in the core: PIPCORE.team
//  (scripts/ios/app_team.mjs) wraps rotation.mjs, account.mjs, sync_client
//  and team_names. This file only turns its host events into screen state
//  and sends the person's taps back as named actions. Copy is
//  public/board/devices-ui.js and index.html "Team & devices", word for
//  word.
//

import Combine
import Foundation
import SwiftUI

// MARK: - Render model (what "team.state" carries)

nonisolated struct TeamButton: Decodable, Equatable, Identifiable {
    var title: String
    var action: String
    var args: JSONValue
    var id: String { "\(action):\(title)" }
}

nonisolated struct TeamRow: Decodable, Equatable, Identifiable {
    var key: String
    var label: String
    var buttons: [TeamButton]
    var id: String { key }
}

nonisolated struct TeamDevice: Decodable, Equatable, Identifiable {
    var id: String
    var mine: Bool
    var title: String
    var addedAt: Double?
    var removable: Bool
}

nonisolated struct TeamDeleteState: Decodable, Equatable {
    var scheduled: Bool
    var at: Double?
    var text: String
    var warning: String?
}

nonisolated struct TeamState: Decodable, Equatable {
    var userId: String?
    var linked: Bool
    var owner: Bool
    var devices: [TeamDevice]
    var deviceNote: String
    var plan: String
    var teamNote: String?
    var rows: [TeamRow]
    var emptyTeam: String
    var canInvite: Bool
    var deleteState: TeamDeleteState
    var showDelete: Bool
    var account: TeamAccount?
    var myName: String
    var regrantPending: Bool
    var error: String?
}

nonisolated struct TeamAccount: Decodable, Equatable { var email: String }

private nonisolated struct TeamToastEvent: Decodable { var text: String }
private nonisolated struct TeamAccountEvent: Decodable { var email: String? }
private nonisolated struct TeamNameEvent: Decodable { var name: String }
private nonisolated struct TeamDeletedEvent: Decodable { var ok: Bool; var message: String? }

// MARK: - The flow

@MainActor
final class TeamFlow: ObservableObject {
    weak var model: AppModel?

    @Published private(set) var state: TeamState?
    /// The web's toast (devices-ui.js toast), shown at the bottom of a screen.
    @Published var toast: String?
    /// "Delete this user?" sheet: nil when closed; the message is an error line.
    @Published var deleteSheet: String?
    @Published var deleteBusy = false
    @Published var myName = ""
    private var toastSeq = 0

    // MARK: events (AppModel.handleHostEvent)

    func handle(_ name: String, _ json: String) {
        let data = Data(json.utf8)
        switch name {
        case "team.state":
            guard let s = try? JSONDecoder().decode(TeamState.self, from: data) else { return }
            // Stale answers for a person who is no longer open are dropped.
            if let id = s.userId, id != model?.activeId { return }
            state = s
            if myName.isEmpty || !s.myName.isEmpty { myName = s.myName }
            // The first invite turned the backup on: this person syncs now.
            if s.linked, let model, !model.activeIsLinked {
                try? model.refreshPeople()
                model.startSyncIfLinked()
            }
        case "team.toast":
            if let t = try? JSONDecoder().decode(TeamToastEvent.self, from: data) { flash(t.text) }
        case "team.account":
            model?.flow.refreshAccount()
        case "team.myname":
            if let n = try? JSONDecoder().decode(TeamNameEvent.self, from: data) { myName = n.name }
        case "team.deleted":
            guard let d = try? JSONDecoder().decode(TeamDeletedEvent.self, from: data) else { return }
            deleteBusy = false
            if d.ok { deleteSheet = nil } else { deleteSheet = d.message ?? "Could not reach the relay." }
        default: break
        }
    }

    func flash(_ text: String) {
        toast = text
        toastSeq += 1
        let seq = toastSeq
        Task { @MainActor [weak self] in
            try? await Task.sleep(for: .seconds(5))
            if self?.toastSeq == seq { self?.toast = nil }
        }
    }

    // MARK: calls into the core

    func refresh() {
        guard let model, let id = model.activeId,
              let json = try? model.registry?.rowJSON(id) else { return }
        let core = model.core, appId = model.appId
        core.enqueue {
            _ = try? core.call("PIPCORE.team", "refresh",
                               [PipRelay.baseURL, json, PipRelay.deviceLabel, appId])
        }
        core.enqueue { _ = try? core.call("PIPCORE.team", "followMyName", [appId]) }
    }

    /// One of the model's buttons, or a named action with its arguments.
    func act(_ action: String, _ args: JSONValue = .object([:])) {
        guard let model, let id = model.activeId,
              let json = try? model.registry?.rowJSON(id),
              let argsData = try? JSONEncoder().encode(args) else { return }
        let argsJSON = String(decoding: argsData, as: UTF8.self)
        let core = model.core, appId = model.appId
        core.enqueue {
            _ = try? core.call("PIPCORE.team", "act",
                               [PipRelay.baseURL, json, PipRelay.deviceLabel, appId, action, argsJSON])
        }
    }

    func act(_ button: TeamButton) { act(button.action, button.args) }

    func invite(email: String) { act("invite", .object(["email": .string(email)])) }

    func removeDevice(_ d: TeamDevice) { act("removeDevice", .object(["id": .string(d.id)])) }

    func deleteCloud() {
        deleteBusy = true
        act("deleteCloud")
    }

    func undeleteCloud() { act("undeleteCloud") }

    func deleteAccount() { act("deleteAccount") }

    func setMyName(_ name: String) {
        myName = name
        act("setMyName", .object(["name": .string(name)]))
    }

    /// devices-ui.js renderDevices: "· added Oct 14".
    static func addedText(_ ms: Double?) -> String {
        guard let ms else { return "" }
        let d = Date(timeIntervalSince1970: ms / 1000)
        return " · added " + d.formatted(.dateTime.month(.abbreviated).day())
    }
}

// MARK: - A toast at the bottom of any Settings screen

private struct TeamToastBar: ViewModifier {
    @ObservedObject var team: TeamFlow
    func body(content: Content) -> some View {
        content.safeAreaInset(edge: .bottom) {
            if let t = team.toast {
                Text(t)
                    .pipFont(16, .medium)
                    .foregroundStyle(Color.white)
                    .padding(.horizontal, 16).padding(.vertical, 12)
                    .background(PipStyle.ink, in: RoundedRectangle(cornerRadius: 12))
                    .padding(.bottom, 8)
                    .accessibilityIdentifier("team:toast")
                    .accessibilityLabel(t)
                    .transition(.opacity)
            }
        }
        .animation(.default, value: team.toast)
    }
}

extension View {
    func teamToast(_ team: TeamFlow) -> some View { modifier(TeamToastBar(team: team)) }
}
