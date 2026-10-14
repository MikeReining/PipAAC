//
//  AccountViews.swift
//  PipAAC
//
//  Settings -> Your account, Settings -> Backup & privacy, the recovery
//  card sheet and the restore sheet (phase 044 C5). Copy is
//  public/index.html and public/board/recovery-ui.js, word for word.
//

import Photos
import PhotosUI
import SwiftUI
import UIKit
import Vision
import VisionKit

/// settings-ui.js personWords: the name, or "this person" when there is none
/// (the web never says "Unnamed" in a sentence).
extension AppModel {
    func who(cap: Bool) -> String {
        let n = people.first(where: { $0.id == activeId })?.name.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        return n.isEmpty ? (cap ? "This person" : "this person") : n
    }
}

// MARK: - Your account

struct AccountView: View {
    @EnvironmentObject var model: AppModel
    @ObservedObject var flow: AccountFlow
    @State private var email = ""
    @State private var pasted = ""

    /// devices-ui.js renderAccount: the row hides on a person's own synced
    /// home device that is not a supporter's - the child's board never asks.
    private var hidden: Bool {
        guard flow.signedInEmail == nil,
              let me = model.people.first(where: { $0.id == model.activeId }) else { return false }
        return me.home && me.syncUserId != nil && me.role != "partner"
    }

    var body: some View {
        Form {
            Section {
                Text("About you, the adult. \(model.who(cap: true)) never needs an account.")
                    .foregroundStyle(PipStyle.muted)
            }
            if hidden {
                Section {
                    Text("This is \(model.who(cap: false))'s own device. Sign in on a supporter's device.")
                        .foregroundStyle(PipStyle.muted)
                        .accessibilityIdentifier("acct:hidden")
                }
            } else {
                Section("Sign in") {
                    if let e = flow.signedInEmail {
                        Text("Signed in as \(e) — this device's users are on the account.")
                            .accessibilityIdentifier("acct:state")
                    } else {
                        Text("Not signed in.").accessibilityIdentifier("acct:state")
                        TextField("you@example.com", text: $email)
                            .textContentType(.emailAddress)
                            .keyboardType(.emailAddress)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()
                            .accessibilityIdentifier("acct:email")
                        Button("Email me a sign-in link") { flow.sendLink(email: email) }
                            .accessibilityIdentifier("acct:send")
                        if !flow.linkStatus.isEmpty {
                            Text(flow.linkStatus).foregroundStyle(PipStyle.muted)
                                .accessibilityIdentifier("acct:linkStatus")
                        }
                        Text("Open the email on this iPad, press and hold the sign-in link, choose Copy, and paste it here.")
                            .font(.footnote).foregroundStyle(PipStyle.muted)
                        TextField("Paste the sign-in link", text: $pasted)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()
                            .accessibilityIdentifier("acct:paste")
                        Button("Sign in") { flow.signIn(pasted: pasted) }
                            .disabled(flow.signInBusy || pasted.trimmingCharacters(in: .whitespaces).isEmpty)
                            .accessibilityIdentifier("acct:signin")
                        if !flow.signInLine.isEmpty {
                            Text(flow.signInLine).foregroundStyle(PipStyle.muted)
                                .accessibilityIdentifier("acct:line")
                        }
                    }
                    Text("Sign in with an email link and your passkey to reach everyone you support from any device.")
                        .font(.footnote).foregroundStyle(PipStyle.muted)
                }
            }
        }
        .navigationTitle("Your account")
        .onAppear { flow.refreshAccount() }
    }
}

// MARK: - Backup & privacy (the recovery card half)

struct BackupView: View {
    @EnvironmentObject var model: AppModel
    @ObservedObject var flow: AccountFlow
    @State private var showCard = false
    @State private var showRestore = false

    var body: some View {
        Form {
            Section {
                Text("Keep \(model.who(cap: false))'s words safe, and choose what leaves this device.")
                    .foregroundStyle(PipStyle.muted)
            }
            Section("Recovery card") {
                Button("Make the recovery card") {
                    flow.showCard()
                    showCard = true
                }
                .accessibilityIdentifier("backup:card")
                Button("Restore from a card") {
                    flow.restoreStatus = ""
                    showRestore = true
                }
                .accessibilityIdentifier("backup:restore")
                Text("If this device is lost or reset, the card brings everything back. Print it and keep it somewhere safe. Without the card, a linked device, or a device backup, their words are gone for good.")
                    .font(.footnote).foregroundStyle(PipStyle.muted)
            }
        }
        .navigationTitle("Backup & privacy")
        .sheet(isPresented: $showCard) { CardSheet(flow: flow) }
        .sheet(isPresented: $showRestore) { RestoreSheet(flow: flow).environmentObject(model) }
    }
}

// MARK: - The card

struct CardSheet: View {
    @ObservedObject var flow: AccountFlow
    @Environment(\.dismiss) private var dismiss
    @State private var confirmReplace = false
    @State private var note: String?

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 16) {
                    switch flow.card {
                    case .idle, .working:
                        ProgressView("Making the card…")
                    case .message(let m):
                        Text(m).foregroundStyle(PipStyle.muted).accessibilityIdentifier("rec:message")
                    case .card(let payload, let words, let offline):
                        cardBody(payload, words, offline)
                    }
                    if let n = flow.replaceNote {
                        Text(n).foregroundStyle(PipStyle.muted).accessibilityIdentifier("rec:replaceNote")
                    }
                    if let note { Text(note).foregroundStyle(PipStyle.muted) }
                }
                .padding(24)
            }
            .navigationTitle("Recovery card")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Close") { dismiss() }.accessibilityIdentifier("rec:close")
                }
            }
            .confirmationDialog("Replace this card? Every link and print so far stops working.",
                                isPresented: $confirmReplace, titleVisibility: .visible) {
                Button("Replace card", role: .destructive) { flow.replaceCard() }
                    .accessibilityIdentifier("rec:replaceConfirm")
                Button("Cancel", role: .cancel) {}
            }
        }
    }

    @ViewBuilder
    private func cardBody(_ payload: String, _ words: [String], _ offline: Bool) -> some View {
        if let qr = CardKit.qr(payload, module: 6) {
            Image(uiImage: qr).interpolation(.none).resizable().scaledToFit()
                .frame(maxWidth: 360)
                .accessibilityLabel("QR code for the recovery card")
                .accessibilityIdentifier("rec:qr")
        }
        LazyVGrid(columns: Array(repeating: GridItem(.flexible(), alignment: .leading), count: 3), spacing: 8) {
            ForEach(Array(words.enumerated()), id: \.offset) { i, w in
                Text("\(i + 1)  \(w)")
                    .font(.system(size: 20, design: .monospaced))
                    .accessibilityIdentifier("rec:word:\(i + 1)")
                    .accessibilityLabel("Word \(i + 1), \(w)")
            }
        }
        .frame(maxWidth: 520)
        HStack(spacing: 12) {
            ShareLink(item: "Open this link on the device you want Pip on:\n\n\(payload)\n",
                      subject: Text("Pip recovery link")) { Text("Email") }
                .buttonStyle(.bordered)
                .accessibilityIdentifier("rec:email")
            Button("Copy link") {
                UIPasteboard.general.string = payload
                note = "Link copied"
            }
            .buttonStyle(.bordered).accessibilityIdentifier("rec:copy")
            Button("Save image") { save(payload, words) }
                .buttonStyle(.bordered).accessibilityIdentifier("rec:save")
            Button("Print") { printCard(payload, words) }
                .buttonStyle(.bordered).accessibilityIdentifier("rec:print")
        }
        Button("Replace card…") { confirmReplace = true }
            .accessibilityIdentifier("rec:replace")
        Text("Anyone with this link can open your user."
             + (offline ? " Connect to check whether another device replaced this card." : ""))
            .font(.footnote).foregroundStyle(PipStyle.muted)
            .accessibilityIdentifier("rec:warn")
    }

    /// Photos, add-only: Pip never reads the library.
    private func save(_ payload: String, _ words: [String]) {
        guard let img = CardKit.cardImage(payload: payload, words: words) else {
            note = "Could not make the image."
            return
        }
        PHPhotoLibrary.requestAuthorization(for: .addOnly) { status in
            guard status == .authorized || status == .limited else {
                Task { @MainActor in note = "Allow Pip to add to Photos in Settings, or use Print." }
                return
            }
            PHPhotoLibrary.shared().performChanges({
                PHAssetChangeRequest.creationRequestForAsset(from: img)
            }) { ok, _ in
                Task { @MainActor in note = ok ? "Saved to Photos." : "Could not save the image." }
            }
        }
    }

    private func printCard(_ payload: String, _ words: [String]) {
        guard let img = CardKit.cardImage(payload: payload, words: words) else { return }
        let info = UIPrintInfo(dictionary: nil)
        info.outputType = .photo
        info.jobName = "Pip recovery card"
        let pc = UIPrintInteractionController.shared
        pc.printInfo = info
        pc.printingItem = img
        pc.present(animated: true)
    }
}

// MARK: - Restore

struct RestoreSheet: View {
    @EnvironmentObject var model: AppModel
    @ObservedObject var flow: AccountFlow
    @Environment(\.dismiss) private var dismiss
    @State private var pasted = ""
    @State private var scanning = false
    @State private var pick: PhotosPickerItem?

    var body: some View {
        NavigationStack {
            VStack(alignment: .leading, spacing: 14) {
                if model.activeIsLinked {
                    Text("This device is already linked to a user.")
                        .foregroundStyle(PipStyle.muted)
                        .accessibilityIdentifier("restore:linked")
                    Spacer()
                } else {
                    HStack(spacing: 12) {
                        Button("Scan the card") { scan() }
                            .buttonStyle(.borderedProminent).tint(PipStyle.ink)
                            .accessibilityIdentifier("restore:scan")
                        PhotosPicker(selection: $pick, matching: .images) { Text("Choose a photo") }
                            .buttonStyle(.bordered)
                            .accessibilityIdentifier("restore:photo")
                    }
                    Text("No camera? Paste the link or the 12 words. On a free user, restoring moves the user here — the other devices are unlinked.")
                        .font(.footnote).foregroundStyle(PipStyle.muted)
                    TextEditor(text: $pasted)
                        .frame(height: 110)
                        .overlay(RoundedRectangle(cornerRadius: 8).stroke(PipStyle.ink.opacity(0.35)))
                        .overlay(alignment: .topLeading) {
                            if pasted.isEmpty {
                                Text("recovery link, or the 12 words")
                                    .foregroundStyle(PipStyle.muted).padding(8).allowsHitTesting(false)
                            }
                        }
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .accessibilityLabel("Recovery link or the 12 words")
                        .accessibilityIdentifier("rec:paste")
                    Text(flow.restoreStatus).foregroundStyle(PipStyle.muted)
                        .accessibilityIdentifier("rec:status")
                    Button("Restore") { flow.restore(text: pasted) }
                        .buttonStyle(.borderedProminent).tint(PipStyle.ink)
                        .disabled(flow.restoreBusy || pasted.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                        .accessibilityIdentifier("rec:restore")
                    Spacer()
                }
            }
            .padding(24)
            .navigationTitle("Restore a user")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Close") { dismiss() }.accessibilityIdentifier("restore:close")
                }
            }
            .fullScreenCover(isPresented: $scanning) {
                ZStack(alignment: .topTrailing) {
                    CameraScanView { text in
                        scanning = false
                        if let text { flow.restoreFromScan(text) }
                    }
                    .ignoresSafeArea()
                    Button("Cancel") { scanning = false }
                        .buttonStyle(.borderedProminent).tint(PipStyle.ink)
                        .padding(24)
                        .accessibilityIdentifier("restore:scanCancel")
                }
            }
            .onChange(of: pick) { _, item in
                guard let item else { return }
                flow.restoreStatus = "Reading the photo…"
                Task {
                    let data = try? await item.loadTransferable(type: Data.self)
                    flow.restoreFromScan(data.flatMap { CardKit.cardText(inImageData: $0) })
                    pick = nil
                }
            }
            .onChange(of: model.people) { _, _ in
                if flow.restoreStatus == "Restored." { dismiss() }
            }
        }
    }

    /// Camera first; the UI tests inject an image instead (-PipScanImage).
    private func scan() {
        if ScanSource.injectedImagePath != nil {
            flow.restoreStatus = "Point the camera at the card…"
            flow.restoreFromScan(ScanSource.injected)
            return
        }
        guard DataScannerViewController.isSupported, DataScannerViewController.isAvailable else {
            flow.restoreStatus = "Could not open the camera — pick a photo of the card or paste its code."
            return
        }
        flow.restoreStatus = "Point the camera at the card…"
        scanning = true
    }
}

/// VisionKit's live QR reader; reports the first Pip card it sees.
struct CameraScanView: UIViewControllerRepresentable {
    var done: (String?) -> Void

    func makeUIViewController(context: Context) -> DataScannerViewController {
        let vc = DataScannerViewController(
            recognizedDataTypes: [.barcode(symbologies: [.qr])],
            qualityLevel: .balanced, isHighlightingEnabled: true)
        vc.delegate = context.coordinator
        try? vc.startScanning()
        return vc
    }

    func updateUIViewController(_ vc: DataScannerViewController, context: Context) {}
    func makeCoordinator() -> Coordinator { Coordinator(done: done) }

    final class Coordinator: NSObject, DataScannerViewControllerDelegate {
        let done: (String?) -> Void
        private var finished = false
        init(done: @escaping (String?) -> Void) { self.done = done }
        func dataScanner(_ dataScanner: DataScannerViewController, didAdd addedItems: [RecognizedItem],
                         allItems: [RecognizedItem]) {
            guard !finished else { return }
            for case .barcode(let b) in addedItems {
                if let s = b.payloadStringValue, s.contains("#restore=") {
                    finished = true
                    dataScanner.stopScanning()
                    done(s)
                    return
                }
            }
        }
    }
}
