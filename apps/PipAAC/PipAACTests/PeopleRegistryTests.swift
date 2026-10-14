//
//  PeopleRegistryTests.swift
//  PipAACTests
//
//  D1: the registry rules are public/shared/users.mjs's - ordering
//  (last opened first), which person opens (home; a lone person; else
//  the list), home is single, removal deletes the row and the file.
//

import Testing
import Foundation
import PipAAC

private final class Clock: @unchecked Sendable {
    var t = 1_000.0
    func tick() -> Double { t += 10; return t }
}

private func make() throws -> (PeopleRegistry, URL) {
    let base = FileManager.default.temporaryDirectory
        .appendingPathComponent("pip-reg-\(UUID().uuidString)", isDirectory: true)
    try FileManager.default.createDirectory(at: base, withIntermediateDirectories: true)
    let seed = base.appendingPathComponent("seed.sqlite")
    try Data("seed".utf8).write(to: seed)
    let clock = Clock()
    return (PeopleRegistry(base: base.appendingPathComponent("app"), seed: seed,
                           now: { clock.tick() }), base)
}

struct PeopleRegistryTests {
    @Test func freshInstallHasOneHomePerson() throws {
        let (r, _) = try make()
        try r.bootstrap()
        let rows = try r.list()
        #expect(rows.count == 1)
        #expect(rows[0].home && rows[0].needsSetup && rows[0].name == "")
        #expect(PeopleRegistry.resolveActive(rows)?.id == rows[0].id)
        #expect(FileManager.default.fileExists(atPath: r.fileURL(rows[0].id).path))
        try r.bootstrap()                       // idempotent
        #expect(try r.list().count == 1)
    }

    @Test func resolveActiveRule() throws {
        let (r, _) = try make()
        try r.bootstrap()
        let a = try r.list()[0]
        let b = try r.add(name: " Sam ")
        #expect(b.name == "Sam" && !b.home)
        #expect(PeopleRegistry.resolveActive(try r.list())?.id == a.id)   // home wins
        try r.setHome(nil)
        #expect(PeopleRegistry.resolveActive(try r.list()) == nil)        // list
        try r.setHome(b.id)
        #expect(PeopleRegistry.resolveActive(try r.list())?.id == b.id)
        try r.remove(b.id)
        #expect(PeopleRegistry.resolveActive(try r.list())?.id == a.id)   // lone person
        try r.setHome(nil)
        #expect(PeopleRegistry.resolveActive(try r.list())?.id == a.id)
    }

    @Test func lastOpenedFirstAndHomeIsSingle() throws {
        let (r, _) = try make()
        let a = try r.add(name: "A", home: true)
        let b = try r.add(name: "B")
        #expect(try r.list().map(\.name) == ["B", "A"])
        try r.touchOpened(a.id)
        #expect(try r.list().map(\.name) == ["A", "B"])
        let c = try r.add(name: "C", home: true)
        #expect(try r.list().filter(\.home).map(\.id) == [c.id])
        _ = b
    }

    @Test func removeDeletesRowAndFiles() throws {
        let (r, _) = try make()
        let a = try r.add(name: "A", home: true)
        let b = try r.add(name: "B")
        let f = r.fileURL(b.id)
        try Data("x".utf8).write(to: URL(fileURLWithPath: f.path + "-wal"))
        try r.remove(b.id)
        #expect(!FileManager.default.fileExists(atPath: f.path))
        #expect(!FileManager.default.fileExists(atPath: f.path + "-wal"))
        #expect(try r.list().map(\.id) == [a.id])
        #expect(FileManager.default.fileExists(atPath: r.fileURL(a.id).path))
    }

    @Test func missingFileIsAnErrorNeverAReseed() throws {
        let (r, _) = try make()
        let a = try r.add(name: "A", home: true)
        try FileManager.default.removeItem(at: r.fileURL(a.id))
        #expect(throws: PeopleError.self) { try r.openableFile(a.id) }
        #expect(!FileManager.default.fileExists(atPath: r.fileURL(a.id).path))
    }

    @Test func legacyDefaultDatabaseBecomesTheFirstPerson() throws {
        let (r, base) = try make()
        let users = base.appendingPathComponent("app/Users", isDirectory: true)
        try FileManager.default.createDirectory(at: users, withIntermediateDirectories: true)
        try Data("her words".utf8).write(to: users.appendingPathComponent("default.sqlite"))
        try r.bootstrap()
        let rows = try r.list()
        #expect(rows.count == 1 && rows[0].home)
        #expect(try String(contentsOf: r.fileURL(rows[0].id), encoding: .utf8) == "her words")
    }

    @Test func syncPatchPersistsWholeAndAddLinkedSeeds() throws {
        let (r, _) = try make()
        try r.bootstrap()
        let a = try r.list()[0]
        #expect(a.syncUserId == nil)
        // sync.mjs writes the whole object back, including keys Swift does not read.
        try r.patch(a.id, ["sync": ["userId": "u-1", "epoch": 2, "cursor": 17, "snap": ["x": 1]]])
        let back = try r.list()[0]
        #expect(back.syncUserId == "u-1")
        #expect(back.sync?["cursor"] == .number(17))
        #expect(back.sync?["snap"] == .object(["x": .number(1)]))
        try r.patch(a.id, ["sync": ["userId": "u-1", "epoch": 2, "cursor": 18, "pendingJoin": true]])
        #expect(try r.list()[0].syncUserId == nil)      // pendingJoin: local-only
        #expect(throws: PeopleError.self) { try r.patch("nope", ["name": "x"]) }
        // Joining a linked person: the relay id is the registry id, file seeded.
        let j = try r.addLinked(id: "rel-1", sync: ["userId": .string("rel-1"), "epoch": .number(1), "cursor": .number(0)],
                                role: "board", home: true)
        #expect(j.home && j.syncUserId == "rel-1")
        #expect(FileManager.default.fileExists(atPath: r.fileURL("rel-1").path))
        #expect(try r.list().filter(\.home).count == 1)
        #expect(try r.rowJSON("rel-1").contains("\"userId\":\"rel-1\""))
    }
}
