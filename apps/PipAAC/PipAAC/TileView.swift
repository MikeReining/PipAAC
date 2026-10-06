//
//  TileView.swift
//  PipAAC
//
//  The tile primitives (Design_System § Tiles, § Strip): a word tile is
//  a role-tinted label strip over art on white; a strip card is the
//  same tile sideways — art square at left, label on the role fill.
//  Colors are the web's --rb/--rf role pairs, verbatim.
//

import SwiftUI

enum PipStyle {
    static func border(_ role: String?) -> Color {
        switch role {
        case "Yellow": return Color(red: 0.690, green: 0.498, blue: 0.000)
        case "Green":  return Color(red: 0.180, green: 0.545, blue: 0.227)
        case "Blue":   return Color(red: 0.184, green: 0.435, blue: 0.816)
        case "Pink":   return Color(red: 0.816, green: 0.263, blue: 0.549)
        case "Purple": return Color(red: 0.435, green: 0.333, blue: 0.690)
        case "Red":    return Color(red: 0.776, green: 0.157, blue: 0.157)
        default:       return Color(red: 0.541, green: 0.522, blue: 0.471) // r-None
        }
    }
    static func fill(_ role: String?) -> Color {
        switch role {
        case "Yellow": return Color(red: 0.992, green: 0.941, blue: 0.784)
        case "Green":  return Color(red: 0.863, green: 0.941, blue: 0.867)
        case "Blue":   return Color(red: 0.863, green: 0.925, blue: 0.992)
        case "Pink":   return Color(red: 0.984, green: 0.875, blue: 0.933)
        case "Purple": return Color(red: 0.922, green: 0.898, blue: 0.969)
        case "Red":    return Color(red: 0.984, green: 0.863, blue: 0.863)
        default:       return Color(red: 0.949, green: 0.937, blue: 0.902)
        }
    }
    static let cream = Color(red: 0.965, green: 0.957, blue: 0.937)
    static let ink = Color(red: 0.165, green: 0.141, blue: 0.114)
    static let inkText = Color(red: 0.102, green: 0.102, blue: 0.102)
    static let muted = Color(red: 0.357, green: 0.325, blue: 0.282)
}

/// grid.js wordTile: label strip on top (role fill), art on white.
struct WordTile: View {
    let label: String
    let role: String?
    let art: String?

    var body: some View {
        VStack(spacing: 0) {
            Text(label)
                .font(.system(size: 17, weight: .semibold))
                .foregroundStyle(PipStyle.inkText)
                .multilineTextAlignment(.center)
                .lineLimit(2)
                .minimumScaleFactor(0.55)
                .padding(.horizontal, 4)
                .frame(maxWidth: .infinity)
                .frame(height: 34)
                .background(PipStyle.fill(role))
            ZStack {
                Color.white
                if let ui = PipAssets.image(art) {
                    Image(uiImage: ui)
                        .resizable()
                        .scaledToFit()
                        .padding(4)
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
        .background(Color.white)
        .clipShape(RoundedRectangle(cornerRadius: 10))
        .overlay(RoundedRectangle(cornerRadius: 10)
            .stroke(PipStyle.border(role), lineWidth: 2))
    }
}

/// strip.js predCard: art square left, label on the role fill right.
struct StripCard: View {
    let label: String
    let role: String?
    let art: String?

    var body: some View {
        HStack(spacing: 0) {
            ZStack {
                Color.white
                if let ui = PipAssets.image(art) {
                    Image(uiImage: ui)
                        .resizable()
                        .scaledToFit()
                        .padding(3)
                } else {
                    Text(label.prefix(1).uppercased())
                        .font(.system(size: 24, weight: .bold))
                        .foregroundStyle(PipStyle.muted)
                }
            }
            .frame(width: 56)
            Text(label)
                .font(.system(size: 17, weight: .semibold))
                .foregroundStyle(PipStyle.inkText)
                .multilineTextAlignment(.center)
                .lineLimit(2)
                .minimumScaleFactor(0.6)
                .padding(.horizontal, 4)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .background(PipStyle.fill(role))
        }
        .background(Color.white)
        .clipShape(RoundedRectangle(cornerRadius: 10))
        .overlay(RoundedRectangle(cornerRadius: 10)
            .stroke(PipStyle.border(role), lineWidth: 2))
    }
}

/// A bar chip (board.js renderBar): art over the word, white card —
/// no role color in the sentence bar.
struct BarChip: View {
    let display: String
    let art: String?

    var body: some View {
        VStack(spacing: 0) {
            if let ui = PipAssets.image(art) {
                Image(uiImage: ui)
                    .resizable()
                    .scaledToFit()
                    .frame(height: 34)
                    .padding(.top, 4)
            }
            Text(display)
                .font(.system(size: 15, weight: .medium))
                .foregroundStyle(PipStyle.inkText)
                .lineLimit(1)
                .padding(.horizontal, 8)
                .padding(.vertical, 4)
        }
        .background(Color.white)
        .clipShape(RoundedRectangle(cornerRadius: 8))
        .overlay(RoundedRectangle(cornerRadius: 8)
            .stroke(Color(red: 0.85, green: 0.83, blue: 0.79), lineWidth: 1.5))
    }
}

/// Empty and ghost slots: the coordinate map never collapses.
struct EmptyCell: View {
    var body: some View {
        RoundedRectangle(cornerRadius: 10)
            .strokeBorder(style: StrokeStyle(lineWidth: 1.5, dash: [5, 4]))
            .foregroundStyle(Color(red: 0.80, green: 0.78, blue: 0.74))
    }
}
