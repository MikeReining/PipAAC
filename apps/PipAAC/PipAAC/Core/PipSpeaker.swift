//
//  PipSpeaker.swift
//  PipAAC
//
//  Tile/sentence playback (decision: .playback session — speaks with
//  the silent switch on, stops other audio, recovers on route change).
//  Clip slots play bundled recordings; anything else is the 400 ms
//  silent slot — tiles never fall back to device TTS.
//

import AVFoundation
import Foundation

final class PipSpeaker: NSObject, AVAudioPlayerDelegate {
    /// learner_profile.speech_rate — every clip's playbackRate.
    var rate: Float = 1.0

    private var player: AVAudioPlayer?

    /// Test simulators play every clip at volume 0 (same timing, same
    /// trace) so a run never sounds on the developer's Mac. Set per
    /// simulator by scripts/ios/test_sim.sh: `defaults write -g PipMuted`.
    private static let muted = UserDefaults.standard.bool(forKey: "PipMuted")
    private var gen = 0
    private var pending: [SpeechSlot] = []
    private var onDone: (() -> Void)?

    nonisolated struct SpeechSlot: Sendable {
        let type: String
        let key: String?
        let text: String?
    }

    /// The key of the last clip handed to the player (catalog path or
    /// `blob:<sha>`) — the UI test's instrument for "which clip played".
    private(set) var lastPlayed: String? { didSet { if let k = lastPlayed { onPlay?(k) } } }
    var onPlay: ((String) -> Void)?

    /// Why a family recording did not sound (PP-10): honest, never silent.
    enum Unavailable { case cannotPlay, notHereYet }
    var onUnavailable: ((String, Unavailable) -> Void)?

    /// Containers AVAudioPlayer cannot open: a desktop Chrome/Firefox take
    /// is webm/opus or ogg (mediatype.mjs sniffType says audio/webm / ogg).
    static func playable(_ d: Data) -> Bool {
        let b = [UInt8](d.prefix(4))
        if b == [0x1a, 0x45, 0xdf, 0xa3] { return false }   // EBML: webm/mkv
        if b == Array("OggS".utf8) { return false }          // ogg (opus/vorbis)
        return true
    }

    /// AVAudioPlayer cannot guess a type from extensionless bytes: sniff
    /// the container like mediatype.mjs sniffType (ftyp → m4a, RIFF → wav).
    private static func audioHint(_ d: Data) -> String? {
        let b = [UInt8](d.prefix(12))
        guard b.count >= 12 else { return nil }
        let s = String(decoding: b, as: UTF8.self)
        if Array(b[4..<8]) == Array("ftyp".utf8) { return AVFileType.m4a.rawValue }
        if s.hasPrefix("RIFF") { return AVFileType.wav.rawValue }
        if s.hasPrefix("ID3") || (b[0] == 0xff && (b[1] & 0xe0) == 0xe0) { return AVFileType.mp3.rawValue }
        return nil
    }

    func configure() {
        do {
            let session = AVAudioSession.sharedInstance()
            try session.setCategory(.playback, mode: .default)
            try session.setActive(true)
        } catch {
            NSLog("PipSpeaker: audio session failed: \(error)")
        }
    }

    /// A tap's word — takes the audio from whatever was playing.
    func play(slot: SpeechSlot?) {
        guard let slot else { return }
        cancel()
        playSlot(slot)
    }

    /// The bar's word-by-word speak (offline path; the minted sentence
    /// voice lands with networking).
    func playSentence(_ clips: [SpeechSlot], done: (() -> Void)? = nil) {
        cancel()
        pending = clips
        onDone = done
        next()
    }

    func stop() { cancel() }

    private func cancel() {
        gen += 1
        pending = []
        onDone = nil
        player?.stop()
        player = nil
    }

    private func next() {
        let g = gen
        guard !pending.isEmpty else { onDone?(); onDone = nil; return }
        let slot = pending.removeFirst()
        playSlot(slot, generation: g)
    }

    private func playSlot(_ slot: SpeechSlot, generation: Int? = nil) {
        // The family's own recording: a `blob:<sha>` key in the blob store.
        if slot.type == "clip", let key = slot.key, key.hasPrefix("blob:") {
            if let data = PipBlobs.data(forKey: key) {
                if Self.playable(data),
                   let p = try? AVAudioPlayer(data: data, fileTypeHint: Self.audioHint(data)) {
                    p.delegate = self
                    p.enableRate = true
                    p.rate = rate
                    if Self.muted { p.volume = 0 }
                    player = p
                    if let u = PipBlobs.url(forKey: key) { PipAudioTrace.record(u) }
                    p.play()
                    lastPlayed = key
                    return
                }
                // Bytes are here but this iPad cannot decode them (a Chrome
                // webm/opus take). Say so; never silence, never device TTS.
                NSLog("PipSpeaker: recording can't play \(key)")
                onUnavailable?(key, .cannotPlay)
            } else {
                // Not downloaded yet (or still arriving): say that, honestly.
                NSLog("PipSpeaker: recording not here yet \(key)")
                onUnavailable?(key, .notHereYet)
            }
        }
        // "file": an absolute path (a Hear-it preview of a voice that is
        // not downloaded yet) - never a tile slot.
        let resolved: URL? = {
            guard let key = slot.key else { return nil }
            if slot.type == "clip" { return PipAssets.clipURL(key) }
            if slot.type == "file" { return URL(fileURLWithPath: key) }
            return nil
        }()
        if let u = resolved, let key = slot.key {
            PipAudioTrace.record(u)
            if slot.type == "clip" { lastPlayed = key }
            do {
                let p = try AVAudioPlayer(contentsOf: u)
                p.delegate = self
                p.enableRate = true
                p.rate = rate
                if Self.muted { p.volume = 0 }
                player = p
                p.play()
                return
            } catch {
                NSLog("PipSpeaker: clip failed \(key): \(error)")
            }
        }
        // silence / tileclip (offline) / tts (never on tiles): the held
        // 400 ms silent slot, then the next word.
        let g = generation ?? gen
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.4) { [weak self] in
            guard let self, self.gen == g else { return }
            if generation != nil { self.next() }
        }
    }

    func audioPlayerDidFinishPlaying(_ p: AVAudioPlayer, successfully _: Bool) {
        next()
    }

    func audioPlayerDecodeErrorDidOccur(_ p: AVAudioPlayer, error: Error?) {
        next()
    }
}
