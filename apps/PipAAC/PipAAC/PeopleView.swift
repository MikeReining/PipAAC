//
//  PeopleView.swift
//  PipAAC
//
//  People on this device (phase 044 D1; PF-5..7): the "Who's talking?"
//  launch list and Settings > People (switch, add, remove, "When Pip
//  opens"). Words are people-ui.js / devices-ui.js verbatim. Truth is
//  the registry (PeopleRegistry) - views render, never re-derive.
//  Settings already asks for the PIN on every open, so remove sits
//  behind it; the launch list is the web's list: pick only.
//

import SwiftUI

private struct Avatar: View {
    let person: PersonRecord
    var body: some View { PersonAvatar(person: person) }
}

/// Many people on a device where nobody opens first (people-ui.js
/// `pickPerson`). Last opened first - the registry already sorts so.
struct WhosTalkingView: View {
    @EnvironmentObject var model: AppModel

    var body: some View {
        VStack(spacing: 24) {
            Text("Who's talking?")
                .pipFont(34, .bold)
                .foregroundStyle(PipStyle.ink)
            ScrollView {
                VStack(spacing: 12) {
                    ForEach(model.people) { p in
                        Button { model.openPerson(p.id) } label: {
                            HStack(spacing: 14) {
                                Avatar(person: p)
                                Text(p.displayName)
                                    .pipFont(24, .semibold)
                                    .foregroundStyle(PipStyle.ink)
                                Spacer()
                            }
                            .padding(14)
                            .background(Color.white)
                            .clipShape(RoundedRectangle(cornerRadius: 16))
                            .overlay(RoundedRectangle(cornerRadius: 16)
                                .stroke(PipStyle.ink.opacity(0.3), lineWidth: 1.5))
                        }
                        .accessibilityLabel(p.displayName)
                        .accessibilityIdentifier("launchPerson")
                    }
                }
                .frame(maxWidth: 520)
                .padding(.horizontal, 20)
            }
            if let e = model.peopleError {
                Text(e).font(.caption).foregroundStyle(PipStyle.muted)
            }
        }
        .padding(.top, 80)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(PipStyle.cream.ignoresSafeArea())
    }
}

/// Settings > People.
struct PeopleView: View {
    @EnvironmentObject var model: AppModel
    @State private var adding = false
    @State private var newName = ""
    @State private var removing: PersonRecord?

    var body: some View {
        Form {
            PersonPhotoSection()
            Section {
                ForEach(model.people) { p in
                    HStack(spacing: 12) {
                        Avatar(person: p)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(p.displayName).font(.headline)
                            let sub = [p.id == model.activeId ? "Open now" : nil,
                                       p.home ? "Opens first" : nil]
                                .compactMap { $0 }.joined(separator: " · ")
                            if !sub.isEmpty {
                                Text(sub).font(.caption).foregroundStyle(PipStyle.muted)
                            }
                        }
                        Spacer()
                        if p.id != model.activeId {
                            Button("Switch") { model.openPerson(p.id) }
                                .buttonStyle(.bordered)
                                .accessibilityLabel("Switch to \(p.displayName)")
                            Button("Remove") { removing = p }
                                .buttonStyle(.bordered)
                                .accessibilityLabel("Remove \(p.displayName)")
                        }
                    }
                    .accessibilityElement(children: .contain)
                }
                Button("Add a person") { newName = ""; adding = true }
                    .accessibilityIdentifier("people:add")
            } header: {
                Text("People on this device")
            } footer: {
                Text("Each person keeps their own words, groups, and sync. Switching opens that person; the others keep everything they had.")
            }

            if model.people.count >= 2 {
                Section {
                    Picker("When Pip opens on this device", selection: Binding(
                        get: { model.people.first(where: { $0.home })?.id ?? "" },
                        set: { model.setHomePerson($0.isEmpty ? nil : $0) })) {
                        ForEach(model.people) { p in Text(p.displayName).tag(p.id) }
                        Text("Show the list").tag("")
                    }
                    .pickerStyle(.menu)
                    .accessibilityIdentifier("people:opens")
                } header: {
                    Text("When Pip opens on this device")
                } footer: {
                    Text("A child's own device opens straight to their board. On a shared or therapy device, \"Show the list\" asks who's talking each time Pip starts.")
                }
            }
            if let e = model.peopleError {
                Section { Text(e).foregroundStyle(PipStyle.muted) }
            }
        }
        .navigationTitle("People")
        .alert("Name this person", isPresented: $adding) {
            TextField("Name", text: $newName)
                .accessibilityIdentifier("people:name")
            Button("Cancel", role: .cancel) {}   // Cancel adds no one
            Button("Add") { model.addPerson(name: newName) }
                .accessibilityIdentifier("people:addConfirm")
        }
        .alert(removeTitle, isPresented: Binding(
            get: { removing != nil }, set: { if !$0 { removing = nil } })) {
            Button("Cancel", role: .cancel) {}
            Button("Remove", role: .destructive) {
                if let p = removing { model.removePerson(p.id) }
            }
            .accessibilityIdentifier("people:removeConfirm")
        } message: {
            // devices-ui.js: nothing is linked on this device yet, so the
            // "not linked anywhere" copy is the true one.
            Text("It is not linked anywhere — its words will be gone unless a QR card exists.")
        }
    }

    private var removeTitle: String {
        "Remove \(removing.map { $0.name.isEmpty ? "this person" : $0.name } ?? "this person") from this device?"
    }
}
