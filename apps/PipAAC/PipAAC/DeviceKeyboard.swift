//
//  DeviceKeyboard.swift
//  PipAAC
//
//  Phase 044 E9 (KB-7): "Device keyboard" mode. The board's keyboard
//  surface keeps only the yes/no answer keys and one field; the iPad's own
//  keyboard types into it (keyboard-ui.js buildKbDevice). Everything the
//  field means - a word-ender (space . , ! ? ¿ ¡) commits the word through
//  the same path the Pip keys use, the rest stays as the word in progress -
//  is the core's `appKbDevice` (kbDeviceInput). The field only forwards
//  what was typed and shows what the core says it keeps.
//

import SwiftUI

struct DeviceKeyboardField: View {
    @EnvironmentObject var model: AppModel
    @State private var text = ""
    @State private var inflight = 0
    @FocusState private var focused: Bool

    var body: some View {
        TextField("", text: $text)
            .font(.system(size: 26, weight: .medium))
            .foregroundStyle(PipStyle.ink)
            .textInputAutocapitalization(.sentences)
            .autocorrectionDisabled(false)
            .submitLabel(.go)
            .focused($focused)
            .padding(.horizontal, 16)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(Color.white)
            .clipShape(RoundedRectangle(cornerRadius: 10))
            .overlay(RoundedRectangle(cornerRadius: 10).stroke(PipStyle.ink.opacity(0.5), lineWidth: 2))
            .accessibilityLabel("Type here")
            .accessibilityIdentifier("kb:device")
            // keyboard-ui.js keydown: Enter speaks the sentence and empties the field.
            .onSubmit {
                model.kbPress("Enter")
                text = ""
                focused = true
            }
            .onChange(of: text) { _, v in
                inflight += 1
                model.kbDevice(v) { rest in
                    inflight -= 1
                    // The reply is for the text it was sent for; a newer
                    // keystroke owns the field.
                    if text == v, rest != v { text = rest }
                }
            }
            // The core's buffer is the truth: Clear, Backspace or a tapped
            // completion empty it from outside the field (the web follows
            // the same way - keyboard-ui.js setKbText).
            .onChange(of: model.typing) { _, t in
                if inflight == 0, text != (t ?? "") { text = t ?? "" }
            }
            .task {
                try? await Task.sleep(for: .milliseconds(350))
                focused = true
            }
    }
}
