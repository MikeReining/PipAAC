//
//  BoardLayoutUITests.swift
//  PipAACUITests
//
//  Bigger symbols on dense boards (web base.css, 2026-10-16): in landscape
//  the prediction strip stands down the right side — the top bar keeps the
//  full width, the grid takes every row under it — and in portrait it stays
//  the row under the top bar. Frames come from the accessibility tree; the
//  screenshots (grid60 and grid90, both orientations) are for the eye.
//

import XCTest

@MainActor
final class BoardLayoutUITests: XCTestCase {

    override func setUpWithError() throws { continueAfterFailure = false }

    override func tearDown() { XCUIDevice.shared.orientation = .portrait }

    private let shots = URL(fileURLWithPath: "/tmp/pipaac-shots-tiles", isDirectory: true)

    private func shot(_ app: XCUIApplication, _ name: String) {
        let s = XCUIScreen.main.screenshot()
        try? FileManager.default.createDirectory(at: shots, withIntermediateDirectories: true)
        try? s.pngRepresentation.write(to: shots.appendingPathComponent("\(name).png"))
        let a = XCTAttachment(screenshot: s)
        a.name = name
        a.lifetime = .keepAlways
        add(a)
    }

    private func tiles(_ app: XCUIApplication) -> [XCUIElement] {
        app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH 'tile:'")).allElementsBoundByIndex
    }

    /// Rotate and wait until the window has turned.
    private func turn(_ app: XCUIApplication, _ o: UIDeviceOrientation) {
        XCUIDevice.shared.orientation = o
        let wide = o.isLandscape
        let deadline = Date().addingTimeInterval(10)
        while Date() < deadline {
            let f = app.windows.firstMatch.frame
            if (f.width > f.height) == wide { break }
            RunLoop.current.run(until: Date().addingTimeInterval(0.2))
        }
        // Settle: the rotation animates, and for a moment both strips exist.
        let groups = app.buttons.matching(identifier: "anchor:groups")
        let settle = Date().addingTimeInterval(10)
        while groups.count != 1, Date() < settle {
            RunLoop.current.run(until: Date().addingTimeInterval(0.2))
        }
        RunLoop.current.run(until: Date().addingTimeInterval(2))
        XCTAssertEqual(groups.count, 1, "one Groups anchor after the turn")
    }

    /// The strip's place, and the tile sizes for the report.
    private func check(_ app: XCUIApplication, landscape: Bool, _ name: String) {
        let groups = app.buttons["anchor:groups"]
        let keyboard = app.buttons["anchor:keyboard"]
        let bar = app.descendants(matching: .any)["sentenceBar"]
        XCTAssertTrue(groups.waitForExistence(timeout: 10))
        let all = tiles(app)
        XCTAssertFalse(all.isEmpty, "no tiles on the board")
        let gridMaxX = all.map(\.frame.maxX).max() ?? 0
        let gridMinY = all.map(\.frame.minY).min() ?? 0
        if landscape {
            XCTAssertGreaterThan(groups.frame.minX, gridMaxX, "\(name): the anchors stand right of the grid")
            XCTAssertGreaterThan(groups.frame.minY, bar.frame.maxY, "\(name): the column sits under the top bar")
            XCTAssertGreaterThan(keyboard.frame.minY, groups.frame.maxY, "\(name): Keyboard is the bottom row")
            XCTAssertLessThan(abs(groups.frame.minX - keyboard.frame.minX), 1)
            XCTAssertGreaterThan(app.buttons["Say it in the future"].frame.maxX, groups.frame.minX,
                                 "\(name): the top bar keeps the full width, over the column")
            // Strip cards stand upright: taller than wide, the column's width.
            for card in app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH 'strip:'")).allElementsBoundByIndex {
                XCTAssertGreaterThan(card.frame.minX, gridMaxX, "\(name): a strip card left the column")
                XCTAssertLessThan(abs(card.frame.width - groups.frame.width), 1)
            }
        } else {
            XCTAssertLessThan(groups.frame.maxY, gridMinY, "\(name): the strip is the row above the grid")
            XCTAssertGreaterThan(groups.frame.minY, bar.frame.minY, "\(name): under the top bar")
        }
        let f = all[0].frame
        let a = XCTAttachment(string: "\(name): tile \(Int(f.width))×\(Int(f.height)) pt, \(all.count) tiles")
        a.lifetime = .keepAlways
        add(a)
        print("BOARDLAYOUT \(name) tile \(f.width)x\(f.height) count \(all.count) groups \(groups.frame) window \(app.windows.firstMatch.frame)")
        shot(app, name)
    }

    func testStripStandsDownTheSideInLandscape() throws {
        let app = XCUIApplication()
        app.launchArguments = ["-pipUITestReset"]
        app.launch()
        XCTAssertTrue(app.buttons["tile:sns_0013"].waitForExistence(timeout: 30), "board never appeared")

        turn(app, .landscapeLeft)
        check(app, landscape: true, "grid60-landscape")
        turn(app, .portrait)
        check(app, landscape: false, "grid60-portrait")

        // 90 buttons per screen (Settings -> Board).
        app.buttons["settingsGear"].tap()
        XCTAssertTrue(app.buttons["settingsDone"].waitForExistence(timeout: 10))
        app.buttons["settingsSection:board"].tap()
        let cells = app.segmentedControls["board:cells"]
        XCTAssertTrue(cells.waitForExistence(timeout: 10))
        cells.buttons["90"].tap()
        app.buttons["settingsDone"].tap()
        let deadline = Date().addingTimeInterval(10)
        while tiles(app).count < 70, Date() < deadline {
            RunLoop.current.run(until: Date().addingTimeInterval(0.3))
        }
        XCTAssertGreaterThan(tiles(app).count, 70, "the board never became grid90")

        check(app, landscape: false, "grid90-portrait")
        turn(app, .landscapeRight)
        check(app, landscape: true, "grid90-landscape")
    }
}
