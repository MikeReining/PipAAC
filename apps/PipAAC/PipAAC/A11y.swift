//
//  A11y.swift
//  PipAAC
//
//  Slice G accessibility helpers.
//
//  pipFont: a fixed-point font that follows Dynamic Type. Plain
//  `.font(.system(size:))` ignores the reader's text size; this scales
//  the same point size along the curve of the nearest text style, so
//  Settings, Help, the welcome and the sheets grow with larger text.
//  It is for TEXT SCREENS only. The board grid and its tiles keep their
//  fixed geometry on purpose (044 § 2 / Platforms_iOS_And_Web § 5:
//  "Larger system text grows text inside a tile; it never moves a
//  word"), so TileView/BoardView keep `.system(size:)` and shrink-to-fit.
//

import SwiftUI

private struct PipScaledFont: ViewModifier {
    @ScaledMetric private var size: CGFloat
    private let weight: Font.Weight
    private let design: Font.Design

    init(size: CGFloat, weight: Font.Weight, design: Font.Design) {
        let style: Font.TextStyle =
            size >= 30 ? .largeTitle : size >= 24 ? .title : size >= 20 ? .title3
            : size >= 17 ? .body : size >= 15 ? .callout : size >= 13 ? .footnote : .caption
        _size = ScaledMetric(wrappedValue: size, relativeTo: style)
        self.weight = weight
        self.design = design
    }

    func body(content: Content) -> some View {
        content.font(.system(size: size, weight: weight, design: design))
    }
}

extension View {
    func pipFont(_ size: CGFloat, _ weight: Font.Weight = .regular,
                 design: Font.Design = .default) -> some View {
        modifier(PipScaledFont(size: size, weight: weight, design: design))
    }

    /// Animate only when the reader has not asked for Reduce Motion.
    func pipAnimation<V: Equatable>(_ a: Animation?, value: V) -> some View {
        modifier(PipMotion(animation: a, value: value))
    }
}

private struct PipMotion<V: Equatable>: ViewModifier {
    @Environment(\.accessibilityReduceMotion) private var reduce
    let animation: Animation?
    let value: V
    func body(content: Content) -> some View {
        content.animation(reduce ? nil : animation, value: value)
    }
}

/// What VoiceOver says for the sentence-button glyphs drawn inline in
/// tour / tip text: the buttons' own labels (index.html aria-labels).
enum PipSpoken {
    static func words(_ text: String) -> String {
        var out = ""
        for ch in text {
            switch ch {
            case "\u{2728}": out += "Fix it"
            case "\u{2753}", "\u{2754}": out += "Ask it as a question"
            case "\u{23EA}": out += "Say it in the past"
            case "\u{25B6}": out += "Play"
            case "\u{23E9}": out += "Say it in the future"
            default: out.append(ch)
            }
        }
        return out
    }
}

/// The board, out of the accessibility tree while a full-screen first-run
/// step is up (the tour keeps the board live on purpose).
struct BoardGate: View {
    @ObservedObject var flow: FirstRunFlow
    @EnvironmentObject var model: AppModel
    var body: some View {
        let covered = flow.phase == .welcome || flow.phase == .look || flow.phase == .world
        BoardView()
            .environmentObject(model)
            .accessibilityHidden(covered)
            .allowsHitTesting(!covered)
    }
}
