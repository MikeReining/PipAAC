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
    private var gen = 0
    private var pending: [SpeechSlot] = []
    private var onDone: (() -> Void)?

    nonisolated struct SpeechSlot: Sendable {
        let type: String
        let key: String?
        let text: String?
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
        if slot.type == "clip", let key = slot.key, let u = PipAssets.clipURL(key) {
            do {
                let p = try AVAudioPlayer(contentsOf: u)
                p.delegate = self
                p.enableRate = true
                p.rate = rate
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
