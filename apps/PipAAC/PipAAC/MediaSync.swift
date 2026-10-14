//
//  MediaSync.swift
//  PipAAC
//
//  Photos and recordings travelling between devices (phase 044 C4; SY-6,
//  PP-9, PP-10). The queue and the pulls are the web's sync loop in the
//  core (sync.mjs media queue + scripts/ios/app_mediasync.mjs); Swift owns
//  the files (PipHostCrypto blob.save: hash-checked, atomic, Application
//  Support) and says what state they are in:
//
//   - a tile whose picture has not arrived draws name + colour (the web's
//     fallback) and the picture appears when "media.ready" lands;
//   - a recording that has not arrived, or that this iPad cannot decode
//     (a desktop Chrome webm/opus take), says so in a toast - it is never
//     silent and never falls back to device speech;
//   - Team & devices shows what is still being sent or fetched.
//

import Foundation

/// app_mediasync.mjs mediaStatus(), as the core emits it ("media.state").
nonisolated struct MediaState: Decodable, Equatable, Sendable {
    var pending = 0       // waiting for the network or the other device's upload
    var missing = 0       // the relay answered 404: it does not hold the bytes
    var uploading = 0     // this device still owes the relay a photo or recording
    var uploadError: String?

    /// Plain words (editor-find.js editorStatus for the upload side). nil =
    /// nothing to say.
    var line: String? {
        if uploadError != nil && uploading == 0 { return "Couldn't save a photo or recording" }
        if pending > 0 { return "Getting a photo or recording…" }
        if uploading > 0 { return "Sending a photo or recording…" }
        if missing > 0 { return "A photo or recording hasn't arrived yet" }
        return nil
    }
}

extension AppModel {
    /// Wire the speaker's honest "can't sound" answers to a toast.
    func wireMediaStates() {
        speaker.onUnavailable = { [weak self] _, why in
            Task { @MainActor in
                switch why {
                case .cannotPlay: self?.showToast("Can't play this recording here.")
                case .notHereYet: self?.showToast("This recording hasn't arrived yet.")
                }
            }
        }
    }

    // MARK: UI-test hook (launch argument -pipUITestMediaHook)

    /// There is no camera or microphone in the simulator E2E: the harness
    /// drops `<data dir>/media-request.json` -
    ///   { "id": "1", "kind": "photo" | "voice", "wordKind": "entity" | "sense",
    ///     "wordId": "...", "file": "/abs/path" }
    /// - and this stores the file in the blob store and records it through
    /// the SAME card writers E3's UI uses (PIPCORE.media.cardSetPhoto /
    /// voiceSave), which also queue the upload. The answer is written to
    /// media-result-<id>.json. Compiled in, but inert without the argument.
    func startMediaTestHook() {
        guard ProcessInfo.processInfo.arguments.contains("-pipUITestMediaHook"),
              let base = try? PipAssets.dataBase() else { return }
        let req = base.appendingPathComponent("media-request.json")
        Task { @MainActor [weak self] in
            while let self {
                try? await Task.sleep(for: .milliseconds(400))
                guard !self.appId.isEmpty,
                      let d = try? Data(contentsOf: req),
                      let o = try? JSONSerialization.jsonObject(with: d) as? [String: String],
                      let id = o["id"], let kind = o["kind"], let wordId = o["wordId"],
                      let file = o["file"], let bytes = try? Data(contentsOf: URL(fileURLWithPath: file))
                else { continue }
                try? FileManager.default.removeItem(at: req)
                let wordKind = o["wordKind"] ?? "entity"
                var out: [String: String] = ["id": id]
                if let key = try? PipBlobs.save(bytes) {
                    out["key"] = key
                    editCall(kind == "photo" ? "cardSetPhoto" : "voiceSave",
                             [["kind": wordKind, "id": wordId, "key": key]], object: "PIPCORE.media")
                } else {
                    out["error"] = "save failed"
                }
                let res = base.appendingPathComponent("media-result-\(id).json")
                try? JSONSerialization.data(withJSONObject: out).write(to: res)
            }
        }
    }
}
