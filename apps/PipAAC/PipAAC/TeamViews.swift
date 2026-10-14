//
//  TeamViews.swift
//  PipAAC
//
//  The F2 screens: the Team list and device list (Settings -> Team &
//  devices), Delete from Pip (Backup & privacy), Your name and Delete your
//  account (Your account). Copy is public/index.html and
//  public/board/devices-ui.js, word for word. Everything shown is
//  PIPCORE.team's model (TeamFlow.swift); every tap is a named action sent
//  back - nothing is decided here. Reaching these screens already passed
//  the Settings PIN (B3).
//

import SwiftUI

// MARK: - Team (devices-ui.js renderSupporters)

struct TeamListSections: View {
    @ObservedObject var team: TeamFlow
    @State private var email = ""
    @State private var confirm: TeamButton?

    var body: some View {
        Group { content }
            .confirmationDialog(
                "Remove \(removeLabel)? They keep what they already saw — nothing new reaches them.",
                isPresented: Binding(get: { confirm != nil }, set: { if !$0 { confirm = nil } }),
                titleVisibility: .visible) {
                Button("Remove", role: .destructive) {
                    if let b = confirm { team.act(b) }
                    confirm = nil
                }
                .accessibilityIdentifier("team:removeConfirm")
                Button("Cancel", role: .cancel) { confirm = nil }
            }
    }

    @ViewBuilder private var content: some View {
        if let s = team.state {
            if let note = s.teamNote {
                Section("You're on the team") {
                    Text(note).foregroundStyle(PipStyle.muted)
                        .accessibilityIdentifier("team:note")
                }
            }
            if s.linked {
                Section("Team") {
                    if s.regrantPending {
                        Text("Finishing the new key for your team. Pip completes this the next time you are signed in and online.")
                            .font(.footnote).foregroundStyle(PipStyle.muted)
                            .accessibilityIdentifier("team:regrant")
                    }
                    if s.rows.isEmpty {
                        Text(s.emptyTeam).foregroundStyle(PipStyle.muted)
                            .accessibilityIdentifier("team:empty")
                    }
                    ForEach(s.rows) { row in
                        VStack(alignment: .leading, spacing: 8) {
                            Text(row.label)
                                .accessibilityIdentifier("team:row:\(row.key)")
                            if !row.buttons.isEmpty {
                                HStack(spacing: 12) {
                                    ForEach(row.buttons) { b in
                                        Button(b.title) { tap(b) }
                                            .buttonStyle(.bordered)
                                            .tint(b.action == "removeSupporter" ? .red : PipStyle.ink)
                                            .accessibilityLabel("\(b.title) \(row.label)")
                                            .accessibilityIdentifier("team:\(row.key):\(b.action)")
                                    }
                                }
                            }
                        }
                    }
                    if s.canInvite {
                        TextField("teacher@school.org", text: $email)
                            .textContentType(.emailAddress)
                            .keyboardType(.emailAddress)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()
                            .accessibilityIdentifier("team:inviteEmail")
                        Button("Invite") {
                            team.invite(email: email)
                            email = ""
                        }
                        .accessibilityIdentifier("team:invite")
                    }
                    Text("People you invite join the team: they edit everything, on their own phone or laptop. Make owner lets them manage people and devices too. Remove locks them out.")
                        .font(.footnote).foregroundStyle(PipStyle.muted)
                }
            }
        }
    }

    /// Remove asks first (removeSupporterFlow's confirm); the rest act at once.
    private func tap(_ b: TeamButton) {
        if b.action == "removeSupporter" {
            confirm = b
        } else {
            team.act(b)
        }
    }

    private var removeLabel: String {
        if case .object(let o) = confirm?.args, case .string(let e)? = o["email"] { return e }
        return "this supporter"
    }
}

// MARK: - Devices (devices-ui.js renderDevices)

struct DeviceListRows: View {
    @ObservedObject var team: TeamFlow
    @State private var removing: TeamDevice?

    var body: some View {
        Group { content }
            .confirmationDialog(
                "Remove \(removing?.title.replacingOccurrences(of: " (this one)", with: "") ?? "this device")? It keeps what it already saw.",
                isPresented: Binding(get: { removing != nil }, set: { if !$0 { removing = nil } }),
                titleVisibility: .visible) {
                Button("Remove", role: .destructive) {
                    if let d = removing { team.removeDevice(d) }
                    removing = nil
                }
                .accessibilityIdentifier("dev:removeConfirm")
                Button("Cancel", role: .cancel) { removing = nil }
            }
    }

    @ViewBuilder private var content: some View {
        if let s = team.state, s.linked {
            if let e = s.error {
                Text(e).foregroundStyle(PipStyle.muted).accessibilityIdentifier("dev:error")
            }
            ForEach(s.devices) { d in
                HStack {
                    Text(d.title + TeamFlow.addedText(d.addedAt))
                        .accessibilityIdentifier("dev:row:\(d.id)")
                    Spacer()
                    if d.removable {
                        Button("Remove") { removing = d }
                            .buttonStyle(.bordered)
                            .tint(.red)
                            .accessibilityLabel("Remove \(d.title)")
                            .accessibilityIdentifier("dev:remove:\(d.id)")
                    }
                }
            }
            if !s.plan.isEmpty {
                Text(s.plan).font(.footnote).foregroundStyle(PipStyle.muted)
                    .accessibilityIdentifier("dev:plan")
            }
        }
    }
}

// MARK: - Delete from Pip (devices-ui.js dev-delete / dev-undelete)

struct DeleteFromPipSection: View {
    @ObservedObject var team: TeamFlow

    var body: some View {
        if let s = team.state, s.linked, s.showDelete {
            Section("Delete") {
                if s.deleteState.scheduled {
                    Text(s.deleteState.text).bold()
                        .accessibilityIdentifier("backup:deleteState")
                } else if let w = s.deleteState.warning {
                    Text(w).accessibilityIdentifier("backup:deleteWarning")
                }
                if s.deleteState.scheduled {
                    Button("Undo deletion") { team.undeleteCloud() }
                        .accessibilityIdentifier("backup:undelete")
                } else {
                    Button("Delete from Pip…", role: .destructive) { team.deleteSheet = "" }
                        .accessibilityIdentifier("backup:delete")
                }
                Text("Removed from sync after 30 days. Undo any time before then. This device keeps its copy.")
                    .font(.footnote).foregroundStyle(PipStyle.muted)
            }
        }
    }
}

/// The "Delete this user?" sheet.
struct DeleteSheet: View {
    @ObservedObject var team: TeamFlow
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            VStack(spacing: 18) {
                Text("The user and its backups will be deleted from the relay in 30 days. Any linked device can undo it before then. This device keeps its local copy.")
                    .foregroundStyle(PipStyle.muted)
                    .accessibilityIdentifier("del:body")
                if let m = team.deleteSheet, !m.isEmpty {
                    Text(m).foregroundStyle(.red).accessibilityIdentifier("del:line")
                }
                Button(role: .destructive) {
                    team.deleteCloud()
                } label: {
                    Text("Delete").frame(maxWidth: .infinity, minHeight: 44)
                }
                .buttonStyle(.borderedProminent)
                .tint(.red)
                .disabled(team.deleteBusy)
                .accessibilityIdentifier("del:confirm")
                Spacer()
            }
            .padding(24)
            .navigationTitle("Delete this user?")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Close") { team.deleteSheet = nil; dismiss() }
                        .accessibilityIdentifier("del:close")
                }
            }
        }
        .presentationDetents([.medium])
    }
}

// MARK: - Your name + Delete your account (team-name-ui.js, devices-ui.js acct-delete)

struct AccountExtrasSections: View {
    @ObservedObject var team: TeamFlow
    @ObservedObject var flow: AccountFlow
    @State private var name = ""
    @State private var confirmDelete = false

    var body: some View {
        Group {
            Section("Your name") {
                TextField("Mom, Dad, Ms. Rivera…", text: $name)
                    .textInputAutocapitalization(.words)
                    .onSubmit { team.setMyName(String(name.trimmingCharacters(in: .whitespaces).prefix(80))) }
                    .accessibilityIdentifier("acct:name")
                    .onAppear { name = team.myName }
                    .onChange(of: team.myName) { _, v in if v != name { name = v } }
                Button("Save my name") {
                    team.setMyName(String(name.trimmingCharacters(in: .whitespaces).prefix(80)))
                }
                .accessibilityIdentifier("acct:nameSave")
                Text("The rest of this person's team sees this instead of your email.")
                    .font(.footnote).foregroundStyle(PipStyle.muted)
            }
            if let email = flow.signedInEmail {
            Section {
                Button("Delete your account…", role: .destructive) { confirmDelete = true }
                    .accessibilityIdentifier("acct:delete")
            }
            .confirmationDialog(
                "Delete the account \(email)? Its sign-in and its supporter access end. The users you support keep everything — words, groups, devices, license, QR cards.",
                isPresented: $confirmDelete, titleVisibility: .visible) {
                Button("Delete account", role: .destructive) { team.deleteAccount() }
                    .accessibilityIdentifier("acct:deleteConfirm")
                Button("Cancel", role: .cancel) {}
            }
            }
        }
    }
}
