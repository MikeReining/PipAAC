//
//  ParentGate.swift
//  PipAAC
//
//  A small adult check before anything that leaves the app (phase 044
//  § 2: "Parent gate before purchases and outside links"; Apple's
//  guidance for apps used by children). The web has no gate. A short
//  spelled-out number to type: a young child who cannot read it cannot
//  pass, and an adult takes a few seconds. Reusable: wrap any outside
//  link or purchase in `.parentGate(isPresented:) { ... }`.
//

import SwiftUI

struct ParentGate: View {
    var reason: String
    var onPass: () -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var digits: [Int] = ParentGate.fresh()
    @State private var input = ""
    @State private var wrong = false
    @FocusState private var focused: Bool

    private static let words = ["zero", "one", "two", "three", "four",
                                "five", "six", "seven", "eight", "nine"]
    static func fresh() -> [Int] { (0..<3).map { _ in Int.random(in: 1...9) } }

    var prompt: String {
        "Type these digits: " + digits.map { Self.words[$0] }.joined(separator: ", ")
    }

    var body: some View {
        NavigationStack {
            VStack(spacing: 18) {
                Text("For grown-ups").font(.title2.weight(.semibold))
                Text(reason)
                    .font(.callout)
                    .foregroundStyle(PipStyle.muted)
                    .multilineTextAlignment(.center)
                Text(prompt)
                    .font(.title3)
                    .accessibilityIdentifier("gate:prompt")
                TextField("3 digits", text: $input)
                    .textFieldStyle(.roundedBorder)
                    .keyboardType(.numberPad)
                    .multilineTextAlignment(.center)
                    .pipFont(28, .medium, design: .monospaced)
                    .frame(maxWidth: 220)
                    .focused($focused)
                    .onChange(of: input) { _, v in
                        let d = String(v.filter(\.isNumber).prefix(3))
                        if d != v { input = d }
                        if !d.isEmpty { wrong = false }
                        if d.count == 3 { submit(d) }
                    }
                    .accessibilityIdentifier("gate:input")
                if wrong {
                    Text("Not quite. Try again.").foregroundStyle(.red)
                        .accessibilityIdentifier("gate:wrong")
                }
                Spacer()
            }
            .padding(28)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Cancel") { dismiss() }
                        .accessibilityIdentifier("gate:cancel")
                }
            }
        }
        .onAppear { focused = true }
    }

    private func submit(_ d: String) {
        if d == digits.map(String.init).joined() {
            dismiss()
            onPass()
        } else {
            wrong = true
            input = ""
            digits = Self.fresh()
        }
    }
}

extension View {
    /// Present the gate; `onPass` runs only after the right answer.
    func parentGate(isPresented: Binding<Bool>, reason: String,
                    onPass: @escaping () -> Void) -> some View {
        sheet(isPresented: isPresented) {
            ParentGate(reason: reason, onPass: onPass)
                .presentationDetents([.medium])
        }
    }
}
