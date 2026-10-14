//
//  LifetimeView.swift
//  PipAAC
//
//  The Pip Lifetime page (phase 044 F1; PU-3, PU-4, PU-5, PU-6, PU-10).
//  Copy and order are the web's (index.html data-sec="lifetime", rendered
//  by PIPCORE.purchase.model), with two App Store differences: the Buy
//  button is Apple's in-app purchase, behind the parent gate, and there is
//  no web checkout, "Copy unlock link" or schools link anywhere on it.
//

import SwiftUI

// MARK: - Doors (where the web sends people to the Lifetime page)

enum LifetimeDoor {
    /// The web's upgrade messages all say "Pip Lifetime" (free-word cap,
    /// sentence-button toast, second device). Those toasts get a
    /// "See Pip Lifetime" button.
    static func matches(_ text: String) -> Bool { text.contains("Pip Lifetime") }
}

extension AppModel {
    func makeLifetime() -> LifetimeModel {
        let m = LifetimeModel(
            store: UITestHooks.fakeStore ? FakeStoreClient() : StoreKitClient(),
            backend: lifetimeBackend)
        lifetimeBackend.app = self
        m.activePerson = { [weak self] in
            guard let self, let id = self.activeId else { return nil }
            return (id, self.people.first { $0.id == id }?.name ?? "")
        }
        m.knownPeople = { [weak self] in self?.people.map { $0.id.lowercased() } ?? [] }
        m.onLinked = { [weak self] in
            // The purchase created the relay user: this person syncs now.
            try? self?.refreshPeople()
            self?.startSyncIfLinked()
        }
        m.onToast = { [weak self] in self?.showToast($0) }
        return m
    }

    /// Close whatever sheet is up, then open the Lifetime page (SwiftUI
    /// cannot stack a second sheet on a presenting one).
    func openLifetime() {
        showSettings = false
        showLibrary = false
        addRequest = nil
        placeRequest = nil
        otherGroups = nil
        card = nil
        offerSheet = nil
        Task { @MainActor in
            try? await Task.sleep(for: .milliseconds(500))
            showLifetime = true
        }
    }

    /// "Hear the difference", free side: the real word clips.
    func hearFree() {
        let appId = self.appId, core = self.core
        Task { @MainActor [weak self] in
            let slots: [SpeechSlotModel]? = try? await Task.detached {
                try core.sync { try AppModel.decodeRaw(core.call("PIPCORE.purchase", "hearFree", [appId])) as [SpeechSlotModel] }
            }.value
            guard let self, let slots, !slots.isEmpty else { return }
            speaker.playSentence(slots.map { .init(type: $0.type, key: $0.key, text: $0.text) })
        }
    }

    /// Lifetime side: the shipped natural-sentence clip.
    func hearLifetime() {
        speaker.play(slot: .init(type: "clip", key: "audio/onramp/demo-sentence.mp3", text: nil))
    }
}

// MARK: - The page

struct LifetimeView: View {
    @EnvironmentObject var model: AppModel
    @ObservedObject var life: LifetimeModel
    @State private var code = ""

    init(life: LifetimeModel) { self.life = life }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                if let p = life.page {
                    if p.owned { owned(p) } else { hero(p) }
                    if let issue = life.issueLine ?? p.issue {
                        Text(issue).foregroundStyle(.red).accessibilityIdentifier("life:issue")
                    }
                    if !p.owned { codeCard(p); hearCard }
                    featuresCard(p)
                    if !p.owned { freeCard(p) }
                } else {
                    ProgressView().frame(maxWidth: .infinity).padding(40)
                }
            }
            .padding(20)
            .frame(maxWidth: 720)
            .frame(maxWidth: .infinity)
        }
        .background(PipStyle.cream.ignoresSafeArea())
        .navigationTitle("Pip Lifetime")
        .navigationBarTitleDisplayMode(.inline)
        .task { await life.refresh() }
        .parentGate(
            isPresented: Binding(
                get: { life.gate != nil },
                set: { shown in
                    // Passing runs `gatePassed` right after the sheet closes;
                    // only a Cancel leaves a gate behind to clear.
                    if !shown, life.gate != nil {
                        Task { @MainActor in
                            try? await Task.sleep(for: .milliseconds(400))
                            life.gate = nil
                        }
                    }
                }),
            reason: life.gate == .restore
                ? "Checking for a past purchase is for grown-ups."
                : "Buying Pip Lifetime is for grown-ups.") {
            life.gatePassed()
        }
    }

    private func card<C: View>(@ViewBuilder _ content: () -> C) -> some View {
        VStack(alignment: .leading, spacing: 10, content: content)
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color.white)
            .clipShape(RoundedRectangle(cornerRadius: 14))
            .overlay(RoundedRectangle(cornerRadius: 14).stroke(PipStyle.muted.opacity(0.3), lineWidth: 1.5))
    }

    private func owned(_ p: LifetimePage) -> some View {
        card {
            Label(p.ownedTitle, systemImage: "checkmark.circle.fill")
                .font(.title2.weight(.bold))
                .foregroundStyle(PipStyle.ink)
                .accessibilityIdentifier("life:owned")
            Text(p.ownedSub).foregroundStyle(PipStyle.muted)
        }
    }

    private func hero(_ p: LifetimePage) -> some View {
        card {
            if let line = p.trialLine {
                Text(line)
                    .font(.system(size: 15, weight: .semibold))
                    .padding(.horizontal, 12).padding(.vertical, 6)
                    .background(PipStyle.fill("Yellow"))
                    .clipShape(Capsule())
                    .accessibilityIdentifier("life:trial")
            }
            Text(p.title).font(.largeTitle.weight(.bold)).foregroundStyle(PipStyle.ink)
            HStack(alignment: .firstTextBaseline, spacing: 6) {
                Text(p.price).font(.system(size: 34, weight: .heavy))
                Text(p.priceNote).foregroundStyle(PipStyle.muted)
                Text(p.priceFine).font(.footnote).foregroundStyle(PipStyle.muted)
            }
            Text(p.lede).foregroundStyle(PipStyle.ink)
            Button {
                life.requestBuy()
            } label: {
                Text(life.price.map { "Get Pip Lifetime · \($0)" } ?? "Get Pip Lifetime")
                    .font(.system(size: 18, weight: .bold))
                    .frame(maxWidth: .infinity, minHeight: 52)
            }
            .buttonStyle(.borderedProminent)
            .tint(PipStyle.ink)
            .disabled(life.busy)
            .accessibilityIdentifier("life:buy")
            Text(p.buyFine).font(.footnote).foregroundStyle(PipStyle.muted)
            if let m = life.message {
                Text(m).font(.callout).foregroundStyle(PipStyle.ink)
                    .accessibilityIdentifier("life:message")
            }
            Button("Restore purchase") { life.requestRestore() }
                .disabled(life.busy)
                .accessibilityIdentifier("life:restore")
        }
    }

    private func codeCard(_ p: LifetimePage) -> some View {
        card {
            Text(p.codeLabel).font(.headline)
            HStack {
                TextField("PIP-… code", text: $code)
                    .textFieldStyle(.roundedBorder)
                    .textInputAutocapitalization(.characters)
                    .autocorrectionDisabled()
                    .accessibilityLabel("Code")
                    .accessibilityIdentifier("life:code")
                Button("Use code") {
                    let c = code
                    Task { await life.useCode(c); if life.licensed { code = "" } }
                }
                .buttonStyle(.bordered)
                .disabled(life.busy || code.trimmingCharacters(in: .whitespaces).isEmpty)
                .accessibilityIdentifier("life:use-code")
            }
            if let m = life.codeMessage {
                Text(m).font(.callout).accessibilityIdentifier("life:code-message")
            }
            Text(p.codeHint).font(.footnote).foregroundStyle(PipStyle.muted)
        }
    }

    private var hearCard: some View {
        card {
            Text("Hear the difference").font(.headline)
            Text("The same sentence, both ways. Real recordings.")
                .font(.footnote).foregroundStyle(PipStyle.muted)
            HStack(spacing: 12) {
                Button { model.hearFree() } label: {
                    VStack(spacing: 2) { Text("Free").bold(); Text("One word at a time").font(.footnote) }
                        .frame(maxWidth: .infinity, minHeight: 52)
                }
                .buttonStyle(.bordered)
                .accessibilityLabel("Hear Free: one word at a time")
                .accessibilityIdentifier("life:hear-free")
                Button { model.hearLifetime() } label: {
                    VStack(spacing: 2) { Text("Lifetime").bold(); Text("A natural sentence").font(.footnote) }
                        .frame(maxWidth: .infinity, minHeight: 52)
                }
                .buttonStyle(.borderedProminent)
                .tint(PipStyle.ink)
                .accessibilityLabel("Hear Lifetime: a natural sentence")
                .accessibilityIdentifier("life:hear-life")
            }
        }
    }

    private func featuresCard(_ p: LifetimePage) -> some View {
        card {
            Text(p.featuresLabel).font(.headline)
            ForEach(p.features, id: \.title) { f in
                VStack(alignment: .leading, spacing: 2) {
                    Text(f.title).font(.system(size: 17, weight: .semibold))
                    Text(f.detail).font(.callout).foregroundStyle(PipStyle.muted)
                }
                .accessibilityElement(children: .combine)
            }
        }
    }

    private func freeCard(_ p: LifetimePage) -> some View {
        card {
            Text(p.freeLabel).font(.headline)
            ForEach(p.free, id: \.self) { Label($0, systemImage: "checkmark") }
        }
    }
}

/// Settings > Pip Lifetime (the web's sidebar item).
struct LifetimeRow: View {
    @EnvironmentObject var model: AppModel
    @ObservedObject var life: LifetimeModel

    var body: some View {
        NavigationLink {
            LifetimeView(life: life)
        } label: {
            HStack {
                Text("Pip Lifetime")
                Spacer()
                Text(life.licensed ? "On" : "Get it")
                    .foregroundStyle(PipStyle.muted)
            }
        }
        .accessibilityIdentifier("settings:lifetime")
    }
}

/// The page as a sheet (the doors).
struct LifetimeSheet: View {
    @EnvironmentObject var model: AppModel
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            LifetimeView(life: model.lifetime)
                .toolbar {
                    ToolbarItem(placement: .topBarTrailing) {
                        Button("Close") { dismiss() }.accessibilityIdentifier("life:close")
                    }
                }
        }
        .environmentObject(model)
    }
}
