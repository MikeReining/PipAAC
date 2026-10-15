//
//  Spotlight.swift
//  PipAAC
//
//  Phase 044 D5: the attention layer on the board - Spotlight glow and
//  dim from another device, a word a helper just tapped, the helper's
//  tip. The core owns every rule (scripts/ios/app_spotlight.mjs over the
//  web's shared/spotlight.mjs); Swift draws the one render model it
//  returns (`PIPCORE.spot.state`) with the web's look (base.css, the
//  "Attention layer" block) - never re-deriving which word lights.
//
//  Live modeling is an attention event, not a board edit: nothing here
//  writes a board table. The laws hold: a dimmed word still taps and
//  speaks, nothing moves, nothing unmasks.
//

import SwiftUI

// MARK: - Render model (PIPCORE.spot.state)

nonisolated struct SpotMark: Decodable, Sendable, Equatable {
    var glow = false
    var pulse = false
    var modeled = false
    var dimmed = false
    var count = 0
}

nonisolated struct SpotControl: Decodable, Sendable, Equatable {
    var glow = false
    var modeled = false
    var count = 0
}

nonisolated struct SpotModel: Decodable, Sendable, Equatable {
    var on = false
    var steady = false
    var name: String?
    /// "🔦 Name · End" while the glow runs on this device (#spot-chip).
    var chip: String?
    /// --dim-o: the dimmed words' opacity (synced setting, default 0.45).
    var dim = 0.45
    var marks: [String: SpotMark] = [:]
    /// The Groups button glows when a target needs the route walk.
    var groups = false
    var controls: [String: SpotControl] = [:]
    /// A supporter's device with a real session: taps model.
    var modeling = false
    var line: String?
    var count = ""

    func mark(_ kind: String?, _ id: String?) -> SpotMark? {
        guard let kind, let id else { return nil }
        return marks["\(kind):\(id)"]
    }
}

nonisolated private struct SpeakEvent: Decodable, Sendable {
    let speech: SpeechSlotModel?
}

// MARK: - AppModel hooks

extension AppModel {
    /// The word keys on screen (board or open group page), as the web's
    /// grid / group page pass them to layerMark.
    private var visibleSpotKeys: [String] {
        var cells: [CellModel] = []
        switch surface {
        case .group: cells = groupPage?.cells ?? []
        case .board: cells = board?.cells ?? []
        default: break
        }
        return cells.compactMap { c in
            guard c.type == "word", let id = c.id else { return nil }
            return "\(c.kind ?? "sense"):\(id)"
        }
    }

    /// Re-read the layer's render model for the cells now on screen.
    func refreshSpot() {
        guard !appId.isEmpty else { return }
        let appId = self.appId
        let keys = (try? JSONEncoder().encode(visibleSpotKeys)).flatMap { String(data: $0, encoding: .utf8) } ?? "[]"
        Task { @MainActor [weak self] in
            guard let self else { return }
            do {
                let st: SpotModel = try await coreValue("PIPCORE.spot", "state", [keys])
                if appId == self.appId, st != self.spot { self.spot = st }
            } catch { NSLog("spot.state failed: \(error)") }
        }
    }

    /// An open person: the synced session row lights again after a
    /// restart (or ends, if midnight passed); the slow expiry tick starts.
    func bindSpot(role: String?, name: String) {
        let appId = self.appId, core = self.core
        let role = role ?? ""
        core.enqueue {
            _ = try? core.call("PIPCORE.spot", "bind", [appId, role, name])
        }
    }

    func handleSpotEvent(_ name: String, _ json: String) {
        switch name {
        case "spot.changed": refreshSpot()
        case "spot.speak":
            // The family turned on "Speak": the modeled word is said once.
            if let ev = try? JSONDecoder().decode(SpeakEvent.self, from: Data(json.utf8)),
               let s = ev.speech {
                speaker.play(slot: .init(type: s.type, key: s.key, text: s.text))
            }
        default: break
        }
    }

    /// A supporter's tap while a spotlight runs: it lights the word on the
    /// child's board and tells the adult what to say. Never speaks here.
    func modelTap(kind: String, id: String, text: String) {
        let core = self.core
        core.enqueue {
            _ = try? core.call("PIPCORE.spot", "modelTap", [kind, id, text])
        }
    }

    func modelControl(_ mode: String) {
        let core = self.core
        core.enqueue { _ = try? core.call("PIPCORE.spot", "controlPress", [mode]) }
    }

    /// The chip's End (board.js #spot-chip).
    func endSpot() {
        let core = self.core
        core.enqueue { _ = try? core.call("PIPCORE.spot", "end", []) }
    }
}

// MARK: - Look (base.css "Attention layer")

enum SpotStyle {
    /// --glow: #e8a200
    static let glow = Color(red: 232 / 255, green: 162 / 255, blue: 0)
    /// ink text on the glow badge / white text on the supporter's line
    static let inkText = Color(red: 0.102, green: 0.102, blue: 0.102)
}

/// The mark pass: ring + halo for glow, dim for non-targets, the 1 s
/// breathing ring for a modeled word, the supporter's count badge.
/// Steady glow: 4 pt ring, halo 18 px / .55. Pulse (setting): ring 4 pt,
/// halo breathes 10..24 px over 2 s. Modeled: 6 pt ring, halo 28..10 px
/// over 1 s, always fully opaque. Reduced motion holds the steady state.
struct SpotMarkStyle: ViewModifier {
    let mark: SpotMark?
    var dim: Double = 0.45
    var radius: CGFloat = 10
    @State private var phase = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    private var m: SpotMark { mark ?? SpotMark() }
    private var animKey: String { "\(m.glow)\(m.pulse)\(m.modeled)" }

    func body(content: Content) -> some View {
        let ring: CGFloat = m.modeled ? 6 : 4
        let moving = (m.modeled || m.pulse) && !reduceMotion
        // CSS blur px -> SwiftUI radius is about half; alpha as in the keyframes.
        let halo: CGFloat = m.modeled ? (moving && !phase ? 14 : (moving ? 5 : 9))
            : (m.pulse ? (moving && !phase ? 5 : (moving ? 12 : 9)) : 9)
        let alpha: Double = m.modeled ? (moving && !phase ? 0.85 : (moving ? 0.4 : 0.6))
            : (m.pulse ? (moving && !phase ? 0.35 : (moving ? 0.7 : 0.55)) : 0.55)
        content
            .background {
                if m.glow {
                    RoundedRectangle(cornerRadius: radius + ring)
                        .fill(SpotStyle.glow)
                        .padding(-ring)
                }
            }
            .overlay(alignment: .bottomTrailing) {
                if m.count > 0 {
                    Text("\(m.count)")
                        .font(.system(size: 15, weight: .heavy))
                        .foregroundStyle(SpotStyle.inkText)
                        .padding(.horizontal, 6).padding(.vertical, 1)
                        .frame(minWidth: 26)
                        .background(Capsule().fill(SpotStyle.glow))
                        .padding(4)
                        .accessibilityHidden(true)
                }
            }
            .shadow(color: m.glow ? SpotStyle.glow.opacity(alpha) : .clear, radius: m.glow ? halo : 0)
            .opacity(m.dimmed && !m.modeled ? dim : 1)
            .zIndex(m.modeled ? 2 : (m.glow ? 1 : 0))
            .animation(moving
                       ? .easeInOut(duration: m.modeled ? 0.5 : 1.0).repeatForever(autoreverses: true)
                       : .easeInOut(duration: 0.2),
                       value: phase)
            .onChange(of: animKey, initial: true) {
                phase = false
                if (m.modeled || m.pulse) && !reduceMotion {
                    DispatchQueue.main.async { phase = true }
                }
            }
    }
}

extension View {
    func spotMark(_ mark: SpotMark?, dim: Double, radius: CGFloat = 10) -> some View {
        modifier(SpotMarkStyle(mark: mark, dim: dim, radius: radius))
    }
}

extension SpotMark {
    /// What VoiceOver (and the UI tests) read: the state, not the colour.
    var a11y: String? {
        if modeled { return "modeled" }
        if glow { return "glowing" }
        if dimmed { return "dimmed" }
        return nil
    }
}

// MARK: - The chip and the supporter's line

/// #spot-chip: "🔦 Name · End" - one tap ends the session.
struct SpotChip: View {
    @EnvironmentObject var model: AppModel
    var body: some View {
        if let chip = model.spot.chip {
            Button { model.endSpot() } label: {
                Text(chip)
                    .font(.system(size: 16, weight: .bold))
                    .foregroundStyle(SpotStyle.inkText)
                    .lineLimit(1)
                    .padding(.horizontal, 12)
                    .frame(height: 40)
                    .background(PipStyle.cream)
                    .clipShape(Capsule())
                    .overlay(Capsule().stroke(SpotStyle.glow, lineWidth: 2))
            }
            .buttonStyle(.plain)
            .fixedSize(horizontal: true, vertical: false)
            .layoutPriority(2)
            .accessibilityLabel(chip)
            .accessibilityIdentifier("spot:chip")
        }
    }
}

/// #modelbar: the supporter's line where the suggestions were - what their
/// taps do, then the word's tip after each tap, and how many times the
/// child pressed this session. Nothing to press is ever under it.
struct ModelBar: View {
    let spot: SpotModel
    var body: some View {
        HStack(spacing: 14) {
            TipText(text: spot.line ?? "")
                .accessibilityLabel(PipSpoken.words(spot.line ?? ""))
                .font(.system(size: 15))
                .foregroundStyle(Color.white)
                .lineLimit(3)
                .frame(maxWidth: .infinity, alignment: .leading)
                .accessibilityIdentifier("model:line")
            if !spot.count.isEmpty {
                Text(spot.count)
                    .font(.system(size: 15, weight: .bold))
                    .foregroundStyle(SpotStyle.glow)
                    .accessibilityIdentifier("model:count")
            }
        }
        .padding(.horizontal, 14).padding(.vertical, 8)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
        .background(SpotStyle.inkText)
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .accessibilityElement(children: .combine)
    }
}

/// inline-icons.js withIcons: ✨ and ❓ in a sentence show the sentence
/// button's own icon (the one the adult presses), not an emoji.
struct TipText: View {
    let text: String
    var body: some View {
        var out = Text("")
        var buf = ""
        func flush() { if !buf.isEmpty { out = out + Text(buf); buf = "" } }
        for ch in text {
            switch ch {
            case "✨": flush(); out = out + Text(Image(systemName: "wand.and.stars"))
            case "❓": flush(); out = out + Text(Image(systemName: "questionmark"))
            default: buf.append(ch)
            }
        }
        flush()
        return out
    }
}
