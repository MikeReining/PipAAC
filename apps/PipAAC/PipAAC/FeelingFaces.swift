//
//  FeelingFaces.swift
//  PipAAC
//
//  The expressive-voice faces (phase 044 D4; BS-24, SN-10). strip.js
//  faceCard: three faces own the Smart bar's last slot from the first
//  word; a tap speaks the bar in that feeling (speech.js speakFeeling).
//  Settings -> Talking -> "Try the faces" speaks the sample sentence in a
//  feeling (settings-sync.js). Every rule - which face is lit, the
//  entitlement gate, the request - lives in the core (PIPCORE.app
//  appStrip.faces, PIPCORE.say.speakFeeling / sampleFeeling); Swift draws
//  the faces and plays what comes back through PipSpeaker.
//

import SwiftUI

nonisolated struct FacesModel: Decodable, Sendable {
    let lit: String?
    let feelings: [String]
}

private nonisolated struct SayOK: Decodable, Sendable { var ok: Bool? }

extension AppModel {
    /// strip.js facesOn, the parts the core can't see: online, not in Edit
    /// mode, not the first-run demo (the core already checked the setting,
    /// an empty bar and mid-word typing).
    var facesShown: Bool {
        strip?.faces != nil && tourCard == nil && !editing && !spot.modeling
            && (host?.isOnline ?? true)
    }

    /// A face tap: dark until the core answers (the audio is on its way).
    func sayFeeling(_ feeling: String) {
        guard tourCard == nil, speakingFace == nil else { return }
        speakingFace = feeling
        let appId = self.appId, core = self.core
        Task { @MainActor [weak self] in
            do {
                let st: PaintedState = try await Task.detached { try core.sync { try AppModel.decodeRaw(core.call("PIPCORE.faces", "speak", [appId, feeling])) } }.value
                self?.apply(st)
            } catch {
                NSLog("AppModel.speakFeeling failed: \(error)")
                self?.speakingFace = nil
            }
        }
    }

    /// Settings -> Talking -> Try the faces.
    func tryFeeling(_ feeling: String) {
        guard tryingFace == nil else { return }
        tryingFace = feeling
        let appId = self.appId, core = self.core
        Task { @MainActor [weak self] in
            do {
                let r: SayOK = try await Task.detached { try core.sync { try AppModel.decodeRaw(core.call("PIPCORE.faces", "sample", [appId, feeling])) } }.value
                if r.ok != true { self?.tryingFace = nil }
            } catch {
                NSLog("AppModel.sampleFeeling failed: \(error)")
                self?.tryingFace = nil
            }
        }
    }
}

/// One face button (icon from the shared icon set; lit = the selected art).
struct FaceButton: View {
    let feeling: String
    var lit = false
    var dark = false
    var size: CGFloat = 44
    var label: String
    var idPrefix = "face"
    var action: () -> Void

    var body: some View {
        Button(action: action) {
            let on = lit || dark
            if let ui = PipAssets.image("icons/\(on ? "selected/" : "")voice-\(feeling).svg") {
                Image(uiImage: ui).resizable().scaledToFit().frame(width: size, height: size)
            } else {
                Text(feeling.prefix(1).uppercased()).frame(width: size, height: size)
            }
        }
        .buttonStyle(.plain)
        .opacity(dark ? 0.55 : 1)
        .accessibilityLabel(label)
        .accessibilityIdentifier("\(idPrefix):\(feeling)")
    }
}

/// The strip's last slot: the three faces.
struct FaceCard: View {
    let faces: FacesModel
    /// The landscape side column stacks the three faces.
    var upright = false
    @EnvironmentObject var model: AppModel

    var body: some View {
        let stack = upright ? AnyLayout(VStackLayout(spacing: 2)) : AnyLayout(HStackLayout(spacing: 2))
        stack {
            ForEach(faces.feelings, id: \.self) { f in
                FaceButton(feeling: f, lit: faces.lit == f, dark: model.speakingFace == f,
                           label: "Say it \(f)") { model.sayFeeling(f) }
                    .frame(maxWidth: .infinity, maxHeight: upright ? .infinity : nil)
            }
        }
        .padding(upright ? .vertical : .horizontal, 4)
        .frame(maxWidth: upright ? .infinity : nil, maxHeight: .infinity)
        .background(Color.white)
        .clipShape(RoundedRectangle(cornerRadius: 10))
        .overlay(RoundedRectangle(cornerRadius: 10).stroke(PipStyle.muted.opacity(0.4), lineWidth: 2))
    }
}

/// Settings -> Talking: the faces on the sample sentence. Off or offline
/// dims and disables them (settings-sync.js syncTryFaces).
struct TryFacesView: View {
    @EnvironmentObject var model: AppModel
    let expressive: Bool
    let person: String

    var body: some View {
        let online = model.host?.isOnline ?? true
        let active = expressive && online
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 6) {
                ForEach(["I", "want", "an", "apple"], id: \.self) { w in
                    Text(w).font(.system(size: 15, weight: .semibold))
                        .padding(.horizontal, 10).padding(.vertical, 5)
                        .background(PipStyle.muted.opacity(0.12))
                        .clipShape(RoundedRectangle(cornerRadius: 8))
                }
            }
            .accessibilityElement(children: .ignore)       // slice G: label, not hidden (audit)
            .accessibilityLabel("Example sentence: I want an apple")
            HStack(spacing: 16) {
                ForEach(["happy", "sad", "angry"], id: \.self) { f in
                    FaceButton(feeling: f, dark: model.tryingFace == f, size: 48,
                               label: "Hear it \(f)", idPrefix: "tryface") { model.tryFeeling(f) }
                        .disabled(!active)
                }
            }
            .opacity(active ? 1 : 0.4)
            Text(!expressive ? "Off — the Smart bar shows word suggestions instead."
                 : !online ? "Needs internet to hear."
                 : "Tap a face to hear it. In the Smart bar, faces let \(person) say a sentence happy, sad, or angry.")
                .font(.footnote).foregroundStyle(PipStyle.muted)
                .accessibilityIdentifier("tryFaces:note")
        }
        .padding(.vertical, 4)
    }
}
