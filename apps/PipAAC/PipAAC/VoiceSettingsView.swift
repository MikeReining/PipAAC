//
//  VoiceSettingsView.swift
//  PipAAC
//
//  Settings -> Talking -> Voice (voice-ui.js mountVoice; phase 044 D3).
//  The words, the voices and their order come from the core
//  (PIPCORE.voicepick, over shared/voices.mjs). Choosing a voice that is
//  not on this iPad downloads its pack (VoicePacks) with honest progress;
//  the synced setting is written only after every file verified, so a
//  failed or cancelled download leaves the working voice speaking.
//

import Combine
import Network
import SwiftUI

nonisolated struct VoiceChoice: Decodable, Sendable, Identifiable {
    let id: String
    let name: String
    let note: String
    let isDefault: Bool
}
nonisolated struct VoiceComing: Decodable, Sendable { let name: String; let note: String }
nonisolated struct VoicePickModel: Decodable, Sendable {
    let current: String
    let currentName: String
    let choices: [VoiceChoice]
    let coming: [VoiceComing]
}
nonisolated struct VoiceSampleSlot: Decodable, Sendable { let type: String; let key: String? }

@MainActor
final class VoiceSettings: ObservableObject {
    struct Download: Equatable { var done: Int; var total: Int }

    @Published private(set) var pick: VoicePickModel?
    @Published private(set) var downloads: [String: Download] = [:]
    @Published private(set) var message: String?
    @Published private(set) var online = true
    @Published private(set) var updates: Set<String> = []
    @Published private(set) var ready: Set<String> = []

    private let model: AppModel
    private let packs: VoicePacks
    private var tasks: [String: Task<Void, Never>] = [:]
    private let monitor = NWPathMonitor()

    init(model: AppModel, packs: VoicePacks = .shared) {
        self.model = model
        self.packs = packs
        monitor.pathUpdateHandler = { [weak self] path in
            let ok = path.status == .satisfied
            Task { @MainActor in self?.online = ok }
        }
        monitor.start(queue: DispatchQueue(label: "pip.voice.net"))
    }

    deinit { monitor.cancel() }

    func load() {
        Task {
            do {
                let m: VoicePickModel = try await model.coreValue("PIPCORE.voicepick", "voiceModel", [])
                pick = m
                packs.refresh()
                ready = Set(m.choices.filter { $0.isDefault || packs.isReady($0.id) }.map(\.id))
            } catch { NSLog("VoiceSettings.load failed: \(error)") }
            await checkUpdates()
        }
    }

    /// A downloaded pack whose list changed on the server: offered, never
    /// swapped silently.
    private func checkUpdates() async {
        guard online, let m = try? await packs.fetchManifest() else { return }
        updates = Set(ready.filter { id in
            guard let e = m[id], let have = packs.installedHash(id) else { return false }
            return have != e.hash
        })
    }

    func choose(_ id: String) {
        guard let pick, id != pick.current, tasks[id] == nil else { return }
        let name = pick.choices.first { $0.id == id }?.name ?? id
        if ready.contains(id), !updates.contains(id) {
            Task { await activate(id) }
            return
        }
        guard online else { message = "Changing voices needs Wi-Fi."; return }
        message = nil
        downloads[id] = Download(done: 0, total: 0)
        tasks[id] = Task { [weak self] in
            guard let self else { return }
            do {
                let manifest = try await packs.fetchManifest()
                guard let entry = manifest[id] else { throw VoicePackError.unknownVoice(id) }
                downloads[id] = Download(done: 0, total: entry.files.count)
                try await packs.install(voice: id, entry: entry) { done, total in
                    Task { @MainActor [weak self] in
                        self?.downloads[id] = Download(done: done, total: total)
                    }
                }
                downloads[id] = nil; tasks[id] = nil
                updates.remove(id)
                ready.insert(id)
                await activate(id)
            } catch {
                downloads[id] = nil; tasks[id] = nil
                if !(error is CancellationError) {
                    NSLog("VoiceSettings: download of \(id) failed: \(error)")
                    message = "Couldn't finish \(name)'s voice — try again when you're online."
                }
            }
        }
    }

    func cancel(_ id: String) { tasks[id]?.cancel() }

    private func activate(_ id: String) async {
        do {
            try await model.setSettingAwait("preferred_voice_id", id)
            let m: VoicePickModel = try await model.coreValue("PIPCORE.voicepick", "voiceModel", [])
            pick = m
        } catch { message = "Couldn't switch voices. The old voice still works." }
    }

    /// board.js sampleVoice: "I want an apple" in the voice being
    /// previewed. A voice not yet on the iPad streams just those clips.
    func hear(_ id: String) {
        Task {
            do {
                let slots: [VoiceSampleSlot] = try await model.coreValue(
                    "PIPCORE.voicepick", "voiceSample", [id])
                var out: [PipSpeaker.SpeechSlot] = []
                for s in slots {
                    guard s.type == "clip", let key = s.key else { continue }
                    if PipAssets.clipURL(key) != nil {
                        out.append(.init(type: "clip", key: key, text: nil))
                    } else {
                        let u = try await packs.sampleFile(voice: id, key: key)
                        out.append(.init(type: "file", key: u.path, text: nil))
                    }
                }
                model.speaker.playSentence(out)
            } catch {
                message = "Needs Wi-Fi to hear this voice."
            }
        }
    }
}

/// The Talking-section row: the current voice; the picker has Hear it
/// and Use this voice (one row keeps the rest of Settings where it was).
struct VoiceRow: View {
    @ObservedObject var voice: VoiceSettings

    var body: some View {
        NavigationLink {
            VoicePickerView(voice: voice)
        } label: {
            HStack {
                Text("Voice")
                Spacer()
                Text(voice.pick?.currentName ?? "")
                    .foregroundStyle(PipStyle.muted)
                    .accessibilityIdentifier("voice:current")
            }
        }
        .accessibilityIdentifier("voice:change")
    }
}

struct VoicePickerView: View {
    @ObservedObject var voice: VoiceSettings

    var body: some View {
        Form {
            if let p = voice.pick {
                Section {
                    ForEach(p.choices) { v in card(v, current: p.current) }
                    if !voice.online {
                        Text("Changing voices needs Wi-Fi.").foregroundStyle(PipStyle.muted)
                    }
                    if let m = voice.message {
                        Text(m).foregroundStyle(PipStyle.muted)
                            .accessibilityIdentifier("voice:message")
                    }
                }
                if !p.coming.isEmpty {
                    Section("Coming soon") {
                        ForEach(p.coming, id: \.name) { v in
                            VStack(alignment: .leading) {
                                Text(v.name).bold()
                                Text(v.note).foregroundStyle(PipStyle.muted)
                            }
                            .accessibilityElement(children: .combine)
                        }
                    }
                }
            }
        }
        .navigationTitle("Voice")
        .onAppear { voice.load() }
    }

    @ViewBuilder private func card(_ v: VoiceChoice, current: String) -> some View {
        let on = v.id == current
        let dl = voice.downloads[v.id]
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                VStack(alignment: .leading) {
                    Text(v.name).bold()
                    Text(v.note).foregroundStyle(PipStyle.muted)
                }
                Spacer()
                Button("▶ Hear it") { voice.hear(v.id) }
                    .buttonStyle(.bordered)
                    .accessibilityLabel("Hear \(v.name)")
                    .accessibilityIdentifier("voice:hear:\(v.id)")
                if on {
                    Text("In use").font(.callout.weight(.semibold))
                        .accessibilityIdentifier("voice:inuse:\(v.id)")
                } else if dl != nil {
                    Button("Cancel") { voice.cancel(v.id) }
                        .buttonStyle(.bordered)
                        .accessibilityIdentifier("voice:cancel:\(v.id)")
                } else if voice.ready.contains(v.id) && !voice.updates.contains(v.id) {
                    Button("Use this voice") { voice.choose(v.id) }
                        .buttonStyle(.borderedProminent)
                        .accessibilityIdentifier("voice:use:\(v.id)")
                } else {
                    Button(voice.online
                           ? (voice.updates.contains(v.id) ? "Update this voice" : "Use this voice")
                           : "Needs Wi-Fi") { voice.choose(v.id) }
                        .buttonStyle(.borderedProminent)
                        .disabled(!voice.online)
                        .accessibilityIdentifier("voice:use:\(v.id)")
                }
            }
            if let dl {
                ProgressView(value: Double(dl.done), total: Double(max(dl.total, 1)))
                    .accessibilityIdentifier("voice:progress:\(v.id)")
                    .accessibilityLabel("Downloading \(v.name)")
                    .accessibilityValue("\(dl.done) of \(dl.total)")
                Text(dl.total == 0 ? "Getting \(v.name)'s voice…"
                     : "Downloading \(v.name)'s voice, \(dl.done) of \(dl.total)")
                    .font(.footnote).foregroundStyle(PipStyle.muted)
            } else if voice.ready.contains(v.id) {
                Text("Works offline").font(.footnote).foregroundStyle(PipStyle.muted)
                    .accessibilityIdentifier("voice:offline:\(v.id)")
            }
        }
    }
}
