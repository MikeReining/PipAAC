//
//  InviteLanding.swift
//  PipAAC
//
//  The invitee's side of a supporter invite (phase 044 slice IL). The
//  emailed link `https://app.pipaac.org/?invite=<token>` opens the app
//  (IncomingLinks.swift) and lands here: a sheet titled "Supporter invite"
//  whose one line walks the web's steps - open the invite, sign in with a
//  passkey, wait for the family to Allow, bring the user over.
//
//  The protocol is the web's, in the core: PIPCORE.invite
//  (scripts/ios/app_invite.mjs) wraps devices-ui.js inviteLanding over the
//  same account.mjs calls. This file only asks for the Settings PIN first
//  when one is set (like the sign-in link), turns the core's "invite.landing"
//  events into the sheet's line, and refreshes the people list when the
//  user arrives. Copy is the web's, word for word.
//

import Combine
import Foundation
import SwiftUI

private nonisolated struct InviteEvent: Decodable {
    var stage: String?
    var text: String?
}

@MainActor
final class InviteFlow: ObservableObject {
    weak var model: AppModel?

    /// The sheet's one line (the web's `say`).
    @Published var line = ""
    /// True from the tap until the landing ends (done or failed).
    @Published var busy = false
    @Published var finished = false

    func start(link: String) {
        line = "Opening the invite…"
        busy = true
        finished = false
        let core = model?.core
        core?.enqueue { _ = try? core?.call("PIPCORE.invite", "accept", [PipRelay.baseURL, link]) }
    }

    /// The sheet closed: the wait for the family's Allow ends (the web's closePair).
    func cancel() {
        busy = false
        let core = model?.core
        core?.enqueue { _ = try? core?.call("PIPCORE.invite", "cancel", []) }
    }

    func handle(_ json: String) {
        guard let ev = try? JSONDecoder().decode(InviteEvent.self, from: Data(json.utf8)) else { return }
        switch ev.stage {
        case "say":
            line = ev.text ?? ""
        case "done":
            line = ev.text ?? ""
            busy = false
            finished = true
            model?.flow.refreshAccount()
            try? model?.refreshPeople()
        default:
            line = ev.text ?? "Invite failed."
            busy = false
            finished = true
        }
    }
}

/// Presents the landing when a universal invite link arrives: PIN first when
/// one is set, then the sheet (BoardView does the same for the sign-in link).
struct InvitePresenter: ViewModifier {
    @ObservedObject var model: AppModel
    @State private var pinGate = false
    @State private var landing = false

    /// A cold-launch link waits for the core (the registry is what the
    /// landing writes into).
    private var ready: Bool { model.activeId != nil || model.surface == .picker }

    func body(content: Content) -> some View {
        content
            .onChange(of: "\(model.incomingInvite ?? "")|\(ready)", initial: true) { _, _ in
                guard model.incomingInvite != nil, ready, !pinGate, !landing else { return }
                if PipPin.isSet { pinGate = true } else { begin() }
            }
            .sheet(isPresented: $pinGate) {
                PinSheet(change: false) { ok in
                    if ok {
                        // let the PIN sheet finish dismissing before the next one rises
                        Task { @MainActor in
                            try? await Task.sleep(for: .milliseconds(450))
                            begin()
                        }
                    } else {
                        model.incomingInvite = nil
                    }
                }
                .presentationDetents([.medium])
            }
            .sheet(isPresented: $landing, onDismiss: { model.invite.cancel() }) {
                InviteLandingSheet(flow: model.invite)
            }
    }

    private func begin() {
        guard let link = model.incomingInvite else { return }
        model.incomingInvite = nil
        model.invite.start(link: link)
        landing = true
    }
}

struct InviteLandingSheet: View {
    @ObservedObject var flow: InviteFlow
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            VStack(spacing: 20) {
                Text(flow.line)
                    .font(.system(size: 20, weight: .medium))
                    .foregroundStyle(PipStyle.ink)
                    .multilineTextAlignment(.center)
                    .frame(maxWidth: 480)
                    .accessibilityIdentifier("invite:line")
                if flow.busy {
                    ProgressView()
                        .accessibilityLabel("Working")
                }
                Spacer()
            }
            .padding(.horizontal, 32)
            .padding(.top, 48)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(PipStyle.cream)
            .navigationTitle("Supporter invite")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button(flow.finished ? "Done" : "Close") { dismiss() }
                        .accessibilityLabel(flow.finished ? "Done" : "Close")
                        .accessibilityIdentifier("invite:close")
                }
            }
        }
        .interactiveDismissDisabled(flow.busy)
    }
}
