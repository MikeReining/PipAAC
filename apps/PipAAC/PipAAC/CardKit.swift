//
//  CardKit.swift
//  PipAAC
//
//  The recovery card as pixels (phase 044 C5; SY-9, SY-10): the QR for the
//  card link, the card image (QR plus the 12 words, for a device without a
//  camera - the web's cardPngBlob), reading a QR back out of an image, and
//  the injectable scan source the UI tests use. Pure Swift on CoreImage /
//  Vision; the card TEXT comes from the core (PIPCORE.recovery).
//

import CoreImage
import CoreImage.CIFilterBuiltins
import SwiftUI
import UIKit
import Vision

public enum CardKit {
    /// The QR for `text` at `module` pixels per module with a quiet zone of 4.
    public static func qr(_ text: String, module: CGFloat = 8) -> UIImage? {
        let f = CIFilter.qrCodeGenerator()
        f.message = Data(text.utf8)
        f.correctionLevel = "M"
        guard let out = f.outputImage else { return nil }
        let scaled = out.transformed(by: CGAffineTransform(scaleX: module, y: module))
        let quiet = module * 4
        let canvas = CGRect(x: -quiet, y: -quiet,
                            width: scaled.extent.width + 2 * quiet, height: scaled.extent.height + 2 * quiet)
        let white = CIImage(color: .white).cropped(to: canvas)
        let composed = scaled.composited(over: white)
        guard let cg = CIContext().createCGImage(composed, from: canvas) else { return nil }
        return UIImage(cgImage: cg)
    }

    /// The Pip card link in an image, or nil. Vision first (best on photos of
    /// a printed card); CIDetector when Vision cannot run (the simulator has
    /// no inference context for it) or finds nothing.
    public static func cardText(in image: CGImage) -> String? {
        let req = VNDetectBarcodesRequest()
        req.symbologies = [.qr]
        if (try? VNImageRequestHandler(cgImage: image, options: [:]).perform([req])) != nil {
            for o in req.results ?? [] {
                if let s = o.payloadStringValue, s.contains("#restore=") { return s }
            }
        }
        let det = CIDetector(ofType: CIDetectorTypeQRCode, context: nil,
                             options: [CIDetectorAccuracy: CIDetectorAccuracyHigh])
        for f in det?.features(in: CIImage(cgImage: image)) ?? [] {
            if let q = f as? CIQRCodeFeature, let s = q.messageString, s.contains("#restore=") { return s }
        }
        return nil
    }

    public static func cardText(inImageData data: Data) -> String? {
        guard let ui = UIImage(data: data), let cg = ui.cgImage else { return nil }
        return cardText(in: cg)
    }

    /// The card as one image: QR over a "Pip QR card" title and the 12 words
    /// in three columns (public/board/recovery-ui.js cardPngBlob, 640 x 864).
    @MainActor
    public static func cardImage(payload: String, words: [String]) -> UIImage? {
        let r = ImageRenderer(content: CardImageView(payload: payload, words: words))
        r.scale = 1
        return r.uiImage
    }
}

/// 640 x 864 points, 1x: the web's canvas.
struct CardImageView: View {
    let payload: String
    let words: [String]

    var body: some View {
        ZStack(alignment: .top) {
            Color(red: 1, green: 0.992, blue: 0.957) // #fffdf4
            VStack(spacing: 0) {
                if let qr = CardKit.qr(payload) {
                    Image(uiImage: qr).interpolation(.none).resizable()
                        .frame(width: 560, height: 560).padding(.top, 24)
                }
                Text("Pip QR card")
                    .pipFont(26, .semibold)
                    .foregroundStyle(Color(red: 0.129, green: 0.192, blue: 0.247)) // #21313f
                    .padding(.top, 20)
                LazyVGrid(columns: Array(repeating: GridItem(.fixed(190), alignment: .leading), count: 3),
                          alignment: .leading, spacing: 8) {
                    ForEach(Array(words.enumerated()), id: \.offset) { i, w in
                        Text("\(i + 1) \(w)")
                            .pipFont(24, design: .monospaced)
                            .foregroundStyle(Color(red: 0.129, green: 0.192, blue: 0.247))
                    }
                }
                .padding(.leading, 70).padding(.top, 14)
                Spacer(minLength: 0)
            }
        }
        .frame(width: 640, height: 864)
    }
}

/// Where "Scan the card" gets its picture. A device reads the camera; the
/// UI tests pass `-PipScanImage <png>` so the whole restore path runs
/// without one (the simulator has no camera).
enum ScanSource {
    static var injectedImagePath: String? { UserDefaults.standard.string(forKey: "PipScanImage") }
    static var injected: String? {
        guard let p = injectedImagePath, let d = FileManager.default.contents(atPath: p) else { return nil }
        return CardKit.cardText(inImageData: d)
    }
}
