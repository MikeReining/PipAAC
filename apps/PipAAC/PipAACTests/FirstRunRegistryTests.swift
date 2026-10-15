//
//  FirstRunRegistryTests.swift
//  PipAACTests
//
//  E7: when first run shows is the registry row's `needsSetup`
//  (board.js: only the first boot's home person is created with it).
//  A restore, a join, a sign-in or a Settings add never is, and the
//  welcome's two device-side facts (`audience`, `tourDone`) survive a
//  reload of people.json.
//

import Testing
import Foundation
import PipAAC

private func make() throws -> PeopleRegistry {
    let base = FileManager.default.temporaryDirectory
        .appendingPathComponent("pip-fr-\(UUID().uuidString)", isDirectory: true)
    try FileManager.default.createDirectory(at: base, withIntermediateDirectories: true)
    let seed = base.appendingPathComponent("seed.sqlite")
    try Data("seed".utf8).write(to: seed)
    return PeopleRegistry(base: base.appendingPathComponent("app"), seed: seed)
}

struct FirstRunRegistryTests {
    @Test func onlyTheFirstBootNeedsSetup() throws {
        let r = try make()
        try r.bootstrap()
        let first = try r.list()[0]
        #expect(first.needsSetup)

        let added = try r.add(name: "Sam")                       // Settings > People > Add
        #expect(!added.needsSetup)
        let joined = try r.addLinked(id: "u-joined",             // Join with a code
                                     sync: ["userId": .string("u-joined")], role: "board", home: true)
        #expect(!joined.needsSetup)
        let imported = try r.addImported(id: "u-acct", name: "Maya", photo: nil,
                                         sync: nil, role: nil)   // account sign-in
        #expect(!imported.needsSetup)
        // The restore path (AccountFlow.finishRestore) is addLinked too.
        let restored = try r.addLinked(id: "u-card", sync: ["userId": .string("u-card")],
                                       role: nil, home: false)
        #expect(!restored.needsSetup)
    }

    @Test func leavingTheWelcomeClearsItForGood() throws {
        let r = try make()
        try r.bootstrap()
        let id = try r.list()[0].id
        try r.patch(id, ["name": "Maya", "audience": "adult", "needsSetup": false])
        try r.patch(id, ["tourDone": true])
        let row = try r.list()[0]
        #expect(!row.needsSetup)
        #expect(row.name == "Maya" && row.audience == "adult" && row.tourDone == true)
        try r.bootstrap()                      // a relaunch never re-arms it
        #expect(try r.list()[0].needsSetup == false)
    }
}
