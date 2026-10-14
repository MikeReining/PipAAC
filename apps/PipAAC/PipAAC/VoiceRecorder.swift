//
//  VoiceRecorder.swift
//  PipAAC
//
//  The word card's Voice row (word-card-voice.js; inventory PP-7, LW-19):
//  the board voice and the family's own recording side by side - tap one
//  to hear it and it becomes the voice the child hears - and the dashed
//  "Record your voice" tile at the end. After Stop the recording plays
//  back once by itself, so a take that cannot play is found the moment
//  it is made, not on the child's board.
//
//  The microphone is open ONLY between an explicit Record press and
//  Stop (founder rule: no listening). Capture is injectable: the app's
//  source is AVAudioRecorder to AAC (.m4a - the same MP4/AAC container
//  Safari's MediaRecorder writes, which the web plays); UI tests feed a
//  file through the same save path with `-pipUITestVoiceFile <path>`.
//

import AVFoundation
import Combine
import SwiftUI

// MARK: - Capture sources

nonisolated enum VoiceCaptureError: Error {
    case denied
    case failed
}

/// Where the bytes of a take come from.
protocol VoiceCaptureSource: AnyObject {
    func start() async throws
    /// Ends the take and returns the finished file's bytes.
    func stop() async throws -> Data
}

/// The device microphone, only while a take is running.
final class MicCapture: VoiceCaptureSource {
    private var recorder: AVAudioRecorder?
    private let url = FileManager.default.temporaryDirectory
        .appendingPathComponent("pip-take-\(UUID().uuidString).m4a")

    func start() async throws {
        guard await AVAudioApplication.requestRecordPermission() else { throw VoiceCaptureError.denied }
        let session = AVAudioSession.sharedInstance()
        try session.setCategory(.playAndRecord, mode: .default, options: [.defaultToSpeaker])
        try session.setActive(true)
        let r = try AVAudioRecorder(url: url, settings: [
            AVFormatIDKey: kAudioFormatMPEG4AAC,
            AVSampleRateKey: 44100,
            AVNumberOfChannelsKey: 1,
            AVEncoderBitRateKey: 64000,
        ])
        guard r.record() else { throw VoiceCaptureError.failed }
        recorder = r
    }

    func stop() async throws -> Data {
        recorder?.stop()
        recorder = nil
        defer {
            try? FileManager.default.removeItem(at: url)
            // Back to speak-only: the mic is closed.
            try? AVAudioSession.sharedInstance().setCategory(.playback, mode: .default)
            try? AVAudioSession.sharedInstance().setActive(true)
        }
        return try Data(contentsOf: url)
    }
}

/// UI tests: a take that is a file the test wrote.
final class FileCapture: VoiceCaptureSource {
    private let url: URL
    init(path: String) { url = URL(fileURLWithPath: path) }
    func start() async throws {}
    func stop() async throws -> Data { try Data(contentsOf: url) }
}

// MARK: - Recorder state

@MainActor
final class VoiceRecorder: ObservableObject {
    @Published private(set) var recording = false
    @Published private(set) var seconds = 0
    @Published var hint: String?

    private let source: VoiceCaptureSource
    private var ticker: Task<Void, Never>?
    private var onTake: ((Data) -> Void)?

    init(source: VoiceCaptureSource? = nil) {
        if let source {
            self.source = source
        } else if let i = ProcessInfo.processInfo.arguments.firstIndex(of: "-pipUITestVoiceFile"),
                  i + 1 < ProcessInfo.processInfo.arguments.count {
            self.source = FileCapture(path: ProcessInfo.processInfo.arguments[i + 1])
        } else {
            self.source = MicCapture()
        }
    }

    /// Record, then Stop. `onTake` gets the finished bytes.
    func toggle(onTake: @escaping (Data) -> Void) {
        if recording { finish(); return }
        hint = nil
        self.onTake = onTake
        Task { @MainActor in
            do {
                try await source.start()
                recording = true
                seconds = 0
                let began = Date()
                ticker = Task { @MainActor [weak self] in
                    while !Task.isCancelled {
                        try? await Task.sleep(for: .milliseconds(500))
                        self?.seconds = Int(Date().timeIntervalSince(began))
                    }
                }
            } catch VoiceCaptureError.denied {
                hint = "No microphone \u{2014} Pip is not allowed to use it. Turn it on in the iPad's Settings."
            } catch {
                hint = "Couldn't start recording. Try again."
            }
        }
    }

    /// Stop the take (a card closing mid-take ends it the same way).
    func finish() {
        guard recording else { return }
        recording = false
        ticker?.cancel()
        ticker = nil
        let handler = onTake
        onTake = nil
        Task { @MainActor in
            do {
                let data = try await source.stop()
                if !data.isEmpty { handler?(data) }
            } catch {
                hint = "Couldn't save that take. Try again."
            }
        }
    }
}

// MARK: - The row

struct CardVoiceRow: View {
    @EnvironmentObject var model: AppModel
    @StateObject private var recorder = VoiceRecorder()
    let card: WordCardModel

    var body: some View {
        if let v = card.media?.voice {
            VStack(alignment: .leading, spacing: 8) {
                Text("Voice")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(PipStyle.muted)
                FlowRow {
                    pill("\u{25B6}", v.name, selected: !v.mineOn, id: "wc-voicebase") {
                        model.chooseVoice(card, mine: false)
                    }
                    if v.hasRecording {
                        pill("\u{25B6}", "Your voice", selected: v.mineOn, id: "wc-voicemine") {
                            model.chooseVoice(card, mine: true)
                        }
                    }
                    recordButton(again: v.hasRecording)
                }
                if let h = recorder.hint {
                    Text(h)
                        .font(.system(size: 14))
                        .foregroundStyle(PipStyle.muted)
                        .accessibilityIdentifier("wc-rechint")
                }
                if ProcessInfo.processInfo.arguments.contains("-pipUITestProbe") {
                    // UI-test instrument: the last clip the speaker played.
                    Text(model.lastClip ?? "none")
                        .font(.system(size: 1))
                        .accessibilityIdentifier("wc-lastclip")
                        .accessibilityLabel(model.lastClip ?? "none")
                }
            }
            .frame(maxWidth: 520, alignment: .leading)
            .onDisappear { recorder.finish() }
        }
    }

    private func pill(_ dot: String, _ title: String, selected: Bool, id: String,
                      action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 6) {
                Text(dot).font(.system(size: 12))
                Text(title)
            }
            .font(.system(size: 16, weight: .semibold))
            .foregroundStyle(PipStyle.ink)
            .padding(.horizontal, 14).padding(.vertical, 10)
            .background(selected ? PipStyle.fill(nil) : Color.white)
            .clipShape(Capsule())
            .overlay(Capsule().stroke(selected ? PipStyle.ink : PipStyle.muted.opacity(0.4),
                                      lineWidth: selected ? 2.5 : 1.5))
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Hear \(title)")
        .accessibilityAddTraits(selected ? .isSelected : [])
        .accessibilityIdentifier(id)
    }

    private func recordButton(again: Bool) -> some View {
        Button {
            recorder.toggle { data in model.saveRecording(card, bytes: data) }
        } label: {
            Group {
                if recorder.recording {
                    HStack(spacing: 6) {
                        Circle().fill(Color.red).frame(width: 10, height: 10)
                        Text("Stop \u{00B7} 0:\(String(format: "%02d", recorder.seconds))")
                    }
                } else {
                    Text(again ? "\u{1F399} Again" : "\u{1F399} Record your voice")
                }
            }
            .font(.system(size: 16, weight: .semibold))
            .foregroundStyle(recorder.recording ? Color.red : PipStyle.ink)
            .padding(.horizontal, 14).padding(.vertical, 10)
            .overlay(Capsule().strokeBorder(style: StrokeStyle(lineWidth: 1.5,
                                                               dash: recorder.recording ? [] : [5, 3]))
                .foregroundStyle(recorder.recording ? Color.red : PipStyle.muted))
        }
        .buttonStyle(.plain)
        .accessibilityLabel(recorder.recording ? "Stop recording" : (again ? "Record again" : "Record your voice"))
        .accessibilityIdentifier("wc-record")
    }
}
