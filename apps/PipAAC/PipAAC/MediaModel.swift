//
//  MediaModel.swift
//  PipAAC
//
//  AppModel's family-media verbs (044 E3; PP-4, PP-7, PP-8, LW-19). Bytes
//  go into the blob store (PipBlobs - the web's content-addressed format)
//  and only the key crosses into the core, which records the override
//  through the same shared writers the web calls (PIPCORE.media,
//  scripts/ios/app_media.mjs). Views never touch the store directly.
//

import Foundation

nonisolated struct PersonPhotoAnswer: Decodable, Sendable {
    var photo: String?
}

extension AppModel {
    private var media: String { "PIPCORE.media" }

    // MARK: picture (PP-4)

    /// A picked or taken photo for this word: stored upright, <= 1600 px,
    /// then recorded as the word's picture.
    func setCardPhoto(_ c: WordCardModel, imageData: Data) {
        guard let jpeg = PipPhoto.jpeg(from: imageData), let key = try? PipBlobs.save(jpeg) else {
            showEditToast(.init(text: "Couldn't use that photo. Try another."))
            return
        }
        editCall("cardSetPhoto", [["kind": c.kind, "id": c.id, "key": key]], object: media)
    }

    func useOurPicture(_ c: WordCardModel) {
        editCall("cardUseOurPicture", [["id": c.id]], object: media)
    }

    // MARK: voice (PP-7, LW-19)

    /// A finished take: kept as the word's voice, then played back once.
    func saveRecording(_ c: WordCardModel, bytes: Data) {
        guard let key = try? PipBlobs.save(bytes) else {
            showEditToast(.init(text: "Couldn't save that take. Try again."))
            return
        }
        editCall("voiceSave", [["kind": c.kind, "id": c.id, "key": key]], object: media) { [weak self] in
            guard let self, let now = self.card, now.id == c.id else { return }
            self.speakCard(now)
        }
    }

    /// The board voice or "Your voice": it becomes the voice, and plays.
    func chooseVoice(_ c: WordCardModel, mine: Bool) {
        editCall("voiceChoose", [["kind": c.kind, "id": c.id, "mine": mine]], object: media) { [weak self] in
            guard let self, let now = self.card, now.id == c.id else { return }
            self.speakCard(now)
        }
    }

    // MARK: person photo (PP-8)

    /// Settings > This person: the synced profile photo (core) and the
    /// registry row (device) move together. nil removes the photo.
    func setPersonPhoto(imageData: Data?) {
        let key: String?
        if let imageData {
            guard let jpeg = PipPhoto.jpeg(from: imageData), let k = try? PipBlobs.save(jpeg) else {
                peopleError = "Couldn't use that photo. Try another."
                return
            }
            key = k
        } else {
            key = nil
        }
        let appId = self.appId, core = self.core
        let keyArg: Any = key ?? NSNull()
        Task { @MainActor [weak self] in
            guard let self, let id = activeId else { return }
            do {
                let a: PersonPhotoAnswer = try await Self.editCore(
                    core, "personPhotoSet", [appId, ["key": keyArg]], object: media)
                try registry?.setPhoto(id, a.photo)
                try refreshPeople()
            } catch { peopleError = "\(error)" }
        }
    }
}
