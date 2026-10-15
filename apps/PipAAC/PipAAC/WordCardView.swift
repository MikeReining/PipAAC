//
//  WordCardView.swift
//  PipAAC
//
//  The word card (word-card.js, 029 § 4 / 031 § 6): the tile as the
//  child sees it — tap it to hear it — then what an adult can change.
//  E1 rows: the name (personal words), Also in (✕ leaves one group),
//  and the quiet foot: Hide / Show this word, Remove. Pictures, voice,
//  colour and Swap arrive with their own slices. Rules live in the core
//  (card model flags decide what shows); this view only draws them.
//

import SwiftUI

struct WordCardView: View {
    @EnvironmentObject var model: AppModel
    @Environment(\.dismiss) private var dismiss
    let card: WordCardModel
    @State private var name = ""
    @FocusState private var nameFocused: Bool

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 20) {
                    if let added = card.justAdded {
                        Text("✓ Added to \(added.groupName)")
                            .pipFont(16, .semibold)
                            .foregroundStyle(PipStyle.ink)
                            .accessibilityIdentifier("wc-added")
                    }
                    Button { model.speakCard(card) } label: {
                        WordTile(label: card.label, role: card.role, art: card.art ?? card.photoKey)
                            .frame(width: 150, height: 170)
                            .opacity(card.hidden ? 0.45 : 1)
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Hear \(card.label)")
                    .accessibilityIdentifier("wc-tile")

                    CardSwapButton(card: card)

                    Text(card.hint)
                        .pipFont(15)
                        .foregroundStyle(PipStyle.muted)
                        .accessibilityIdentifier("wc-hint")

                    if card.canRename {
                        TextField("Name", text: $name)
                            .textFieldStyle(.roundedBorder)
                            .pipFont(22, .semibold)
                            .multilineTextAlignment(.center)
                            .submitLabel(.done)
                            .focused($nameFocused)
                            .onSubmit { commitName() }
                            .frame(maxWidth: 320)
                            .accessibilityLabel("Name")
                            .accessibilityIdentifier("wc-name")
                    }

                    CardPictureRow(card: card)
                    CardVoiceRow(card: card)
                    CardColourRow(card: card)

                    alsoIn

                    VStack(spacing: 4) {
                        if card.canHide {
                            quiet(card.hidden ? "Show this word" : "Hide this word",
                                  id: "wc-hide") { model.toggleHidden(card) }
                        }
                        if card.canFlag == true {
                            quiet("Sounds wrong", id: "wc-flag") { model.flagCard(card) }
                        }
                        if card.canRemove {
                            quiet("Remove", id: "wc-remove") { model.removeWord(card) }
                        }
                    }
                    .padding(.top, 8)
                }
                .padding(24)
                .frame(maxWidth: .infinity)
            }
            .background(PipStyle.cream.ignoresSafeArea())
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") { commitName(); dismiss() }
                        .accessibilityIdentifier("wc-done")
                }
            }
            .overlay(alignment: .bottom) { EditToastOverlay() }
            .animation(.easeInOut(duration: 0.2), value: model.editToast?.text)
        }
        .onAppear { name = card.label }
        .onChange(of: card.label) { _, v in name = v }
        .onChange(of: nameFocused) { _, focused in if !focused { commitName() } }
    }

    private func commitName() {
        guard card.canRename else { return }
        let collapsed = name.split(whereSeparator: \.isWhitespace).joined(separator: " ")
        if collapsed.isEmpty || collapsed == card.label { name = card.label; return }
        model.renameCard(card, to: collapsed)
    }

    /// "Also in": the groups holding this word on this board size, each
    /// with a ✕ (027 B9 — this placement only).
    @ViewBuilder private var alsoIn: some View {
        do {
            VStack(alignment: .leading, spacing: 8) {
                Text("Also in")
                    .pipFont(14, .semibold)
                    .foregroundStyle(PipStyle.muted)
                FlowRow {
                    if card.onMainBoard { chip("Main board") }
                    ForEach(card.groups, id: \.id) { g in
                        HStack(spacing: 6) {
                            Text(g.name)
                            Button {
                                model.leaveGroup(kind: card.kind, id: card.id,
                                                 groupId: g.id, label: card.label,
                                                 fromCard: true)
                            } label: {
                                Image(systemName: "xmark.circle.fill")
                                    .foregroundStyle(PipStyle.muted)
                            }
                            .buttonStyle(.plain)
                            .accessibilityLabel("Remove from \(g.name)")
                            .accessibilityIdentifier("wc-leave:\(g.id)")
                        }
                        .pipFont(15, .medium)
                        .padding(.horizontal, 12).padding(.vertical, 8)
                        .background(Color.white)
                        .clipShape(Capsule())
                        .overlay(Capsule().stroke(PipStyle.muted.opacity(0.4), lineWidth: 1.5))
                    }
                    Button {
                        model.openOtherGroups(kind: card.kind, id: card.id, label: card.label)
                    } label: {
                        Text("+ Group")
                            .pipFont(15, .semibold)
                            .foregroundStyle(PipStyle.ink)
                            .padding(.horizontal, 12).padding(.vertical, 8)
                            .overlay(Capsule().strokeBorder(style: StrokeStyle(lineWidth: 1.5, dash: [5, 3]))
                                .foregroundStyle(PipStyle.muted))
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Add \(card.label) to other groups")
                    .accessibilityIdentifier("wc-addgroup")
                }
            }
            .frame(maxWidth: 520, alignment: .leading)
        }
    }

    private func chip(_ text: String) -> some View {
        Text(text)
            .pipFont(15, .medium)
            .foregroundStyle(PipStyle.inkText)
            .padding(.horizontal, 12).padding(.vertical, 8)
            .background(PipStyle.fill(nil))
            .clipShape(Capsule())
    }

    private func quiet(_ title: String, id: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(title)
                .pipFont(17, .medium)
                .foregroundStyle(PipStyle.muted)
                .frame(minWidth: 200, minHeight: 44)
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier(id)
    }
}

/// Chips wrap onto new lines.
struct FlowRow: Layout {
    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        arrange(proposal.width ?? 400, subviews).size
    }
    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        for (i, f) in arrange(bounds.width, subviews).frames.enumerated() {
            subviews[i].place(at: CGPoint(x: bounds.minX + f.minX, y: bounds.minY + f.minY),
                              proposal: .unspecified)
        }
    }
    private func arrange(_ width: CGFloat, _ subviews: Subviews) -> (size: CGSize, frames: [CGRect]) {
        var x: CGFloat = 0, y: CGFloat = 0, rowH: CGFloat = 0, maxX: CGFloat = 0
        var frames: [CGRect] = []
        for s in subviews {
            let sz = s.sizeThatFits(.unspecified)
            if x > 0, x + sz.width > width { x = 0; y += rowH + 8; rowH = 0 }
            frames.append(CGRect(origin: CGPoint(x: x, y: y), size: sz))
            x += sz.width + 8; rowH = max(rowH, sz.height); maxX = max(maxX, x)
        }
        return (CGSize(width: maxX, height: y + rowH), frames)
    }
}
