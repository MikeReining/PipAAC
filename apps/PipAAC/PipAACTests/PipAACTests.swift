//
//  PipAACTests.swift
//  PipAACTests
//
//  Created by Michael Reining on 2026-10-06.
//

import Testing
import UIKit
import PipAAC

/// The tile label strip and the landscape side column follow the web's
/// numbers (shared/tile_label.mjs, base.css --side-w), worked by hand here.
@MainActor
struct TileMetricsTests {

    @Test func labelSizeComesFromTheTile() {
        // Web-measured iPad 10th gen tiles, inner size (inside the web's 3 pt
        // border). Landscape grid90 98×76 → 11 / 18.
        #expect(TileMetrics.labelSize(CGSize(width: 92, height: 70)) == 11)   // 11.2, floor 11
        #expect(TileMetrics.stripHeight(11) == 18)                            // ceil(17.6)
        // Landscape grid60 98×117 → 18 / 29.
        #expect(TileMetrics.labelSize(CGSize(width: 92, height: 111)) == 18)  // min(17.8, 18.4)
        #expect(TileMetrics.stripHeight(18) == 29)                            // ceil(28.8)
        // Portrait grid60 75×163: tall and width-bound, the label grows into
        // the height: min((157 - 69) / 1.6, 69 × 0.26) = 17.9 → 18.
        #expect(TileMetrics.labelSize(CGSize(width: 69, height: 157)) == 18)
        // Portrait grid90 75×107: min((101 - 69) / 1.6, 17.9) = 17.9 → 18.
        #expect(TileMetrics.labelSize(CGSize(width: 69, height: 101)) == 18)
        // Big tiles cap at 28; tiny previews drop below the floor (22 % of 30).
        #expect(TileMetrics.labelSize(CGSize(width: 300, height: 300)) == 28)
        #expect(TileMetrics.labelSize(CGSize(width: 40, height: 30)) == 7)
    }

    @Test func onlyALabelThatDoesNotFitShrinks() {
        #expect(TileMetrics.fittedSize("go", px: 18, width: 100, height: 29) == 18)
        // A word too wide for one line shrinks until it fits on one line,
        // measured here with a separate UIFont call.
        let s = TileMetrics.fittedSize("refrigerator", px: 18, width: 60, height: 29)
        #expect(s < 18 && s >= 8)
        let w = ("refrigerator" as NSString)
            .size(withAttributes: [.font: UIFont.systemFont(ofSize: s, weight: .semibold)]).width
        #expect(w <= 60)
        // Two words wrap only at a size where two lines fit the strip.
        let t = TileMetrics.fittedSize("thank you", px: 18, width: 50, height: 29)
        let line = UIFont.systemFont(ofSize: t, weight: .semibold).lineHeight
        #expect(t < 18)
        #expect(line * 2 <= 29 || ("thank you" as NSString)
            .size(withAttributes: [.font: UIFont.systemFont(ofSize: t, weight: .semibold)]).width <= 50)
    }

    @Test func sideColumnWidthClamps() {
        #expect(TileMetrics.sideWidth(1180) == 124)   // iPad 10th gen landscape
        #expect(TileMetrics.sideWidth(800) == 96)
        #expect(TileMetrics.sideWidth(2000) == 150)
    }
}
