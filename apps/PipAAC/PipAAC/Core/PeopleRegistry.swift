//
//  PeopleRegistry.swift
//  PipAAC
//
//  The device's people (phase 044 D1; PF-5..7). Mirrors public/shared/
//  users.mjs: one registry row per person {id, name, photo, home, role,
//  needsSetup, lastOpened}, last-opened first; one SQLite file each.
//  On web the registry is IndexedDB `pip-users`; here it is one small
//  JSON file beside the Users/ folder. Which person is open right now
//  is NOT stored (web: a tab-level override) — a relaunch follows
//  `resolveActive`, exactly as a web reload does.
//
//  Not mirrored yet: `sync` ({userId, epoch, cursor}) — arrives with
//  Slice C.
//

import Foundation

public nonisolated struct PersonRecord: Codable, Sendable, Equatable, Identifiable {
    public var id: String
    public var name: String
    public var photo: String?
    public var home: Bool
    public var role: String?
    public var needsSetup: Bool
    /// Epoch milliseconds, like `Date.now()` in users.mjs.
    public var lastOpened: Double

    /// people-ui.js `nameOf`.
    public var displayName: String {
        let t = name.trimmingCharacters(in: .whitespacesAndNewlines)
        return t.isEmpty ? "Unnamed" : t
    }
}

public nonisolated enum PeopleError: Error, CustomStringConvertible {
    case seedMissing
    case unknown(String)
    case missingFile(String)
    public var description: String {
        switch self {
        case .seedMissing: return "fresh_db.sqlite missing from bundle"
        case .unknown(let id): return "no such person \(id)"
        case .missingFile(let n): return "\(n)'s file is missing — not replaced with a fresh one"
        }
    }
}

public nonisolated final class PeopleRegistry: @unchecked Sendable {
    private let lock = NSLock()
    private let base: URL
    private let seed: URL?
    private let now: @Sendable () -> Double

    /// `base` holds `people.json` and `Users/<id>.sqlite`. `seed` is the
    /// bundled fresh_db each new person is copied from.
    public init(base: URL, seed: URL?,
                now: @escaping @Sendable () -> Double = { (Date().timeIntervalSince1970 * 1000).rounded() }) {
        self.base = base
        self.seed = seed
        self.now = now
    }

    private var registryURL: URL { base.appendingPathComponent("people.json") }
    private var usersDir: URL { base.appendingPathComponent("Users", isDirectory: true) }
    public func fileURL(_ id: String) -> URL { usersDir.appendingPathComponent("\(id).sqlite") }

    // MARK: storage

    private struct Doc: Codable { var users: [PersonRecord] }

    private func load() throws -> [PersonRecord] {
        guard FileManager.default.fileExists(atPath: registryURL.path) else { return [] }
        return try JSONDecoder().decode(Doc.self, from: Data(contentsOf: registryURL)).users
    }

    private func save(_ rows: [PersonRecord]) throws {
        try FileManager.default.createDirectory(at: base, withIntermediateDirectories: true)
        let enc = JSONEncoder()
        enc.outputFormatting = [.sortedKeys]
        try enc.encode(Doc(users: rows)).write(to: registryURL, options: .atomic)
    }

    // MARK: users.mjs

    /// `listUsers` — last-opened first (stable for ties).
    public func list() throws -> [PersonRecord] {
        lock.lock(); defer { lock.unlock() }
        return Self.ordered(try load())
    }

    private static func ordered(_ rows: [PersonRecord]) -> [PersonRecord] {
        rows.enumerated().sorted {
            $0.element.lastOpened != $1.element.lastOpened
                ? $0.element.lastOpened > $1.element.lastOpened : $0.offset < $1.offset
        }.map(\.element)
    }

    /// `resolveActiveUser` — the home person; a lone person is always
    /// it; many people and no home means the launch list (nil).
    public static func resolveActive(_ rows: [PersonRecord]) -> PersonRecord? {
        if let h = rows.first(where: { $0.home }) { return h }
        return rows.count == 1 ? rows[0] : nil
    }

    /// `addUser`: seeds the person's file from fresh_db first (a failed
    /// seed adds no one), then writes the row. `home` clears every
    /// other home flag.
    @discardableResult
    public func add(name: String = "", home: Bool = false, needsSetup: Bool = false) throws -> PersonRecord {
        lock.lock(); defer { lock.unlock() }
        return try addLocked(name: name, home: home, needsSetup: needsSetup)
    }

    private func addLocked(name: String, home: Bool, needsSetup: Bool) throws -> PersonRecord {
        var rows = try load()
        let row = PersonRecord(id: UUID().uuidString.lowercased(),
                               name: name.trimmingCharacters(in: .whitespacesAndNewlines),
                               photo: nil, home: home, role: nil,
                               needsSetup: needsSetup, lastOpened: now())
        guard let seed else { throw PeopleError.seedMissing }
        try FileManager.default.createDirectory(at: usersDir, withIntermediateDirectories: true)
        let target = fileURL(row.id)
        try FileManager.default.copyItem(at: seed, to: target)
        if home { for i in rows.indices { rows[i].home = false } }
        rows.append(row)
        do { try save(rows) } catch {
            try? FileManager.default.removeItem(at: target)
            throw error
        }
        return row
    }

    /// An install from before the registry has its one database at
    /// Users/default.sqlite — it becomes the first (home) person, data
    /// intact. Otherwise a fresh install gets its first person, home
    /// (board.js: "first boot opens straight to its board").
    public func bootstrap() throws {
        lock.lock(); defer { lock.unlock() }
        guard try load().isEmpty else { return }
        let legacy = usersDir.appendingPathComponent("default.sqlite")
        if FileManager.default.fileExists(atPath: legacy.path) {
            let id = UUID().uuidString.lowercased()
            try FileManager.default.moveItem(at: legacy, to: fileURL(id))
            try save([PersonRecord(id: id, name: "", photo: nil, home: true, role: nil,
                                   needsSetup: false, lastOpened: now())])
            return
        }
        _ = try addLocked(name: "", home: true, needsSetup: true)
    }

    /// `removeUser` — the row, then the database file (and its
    /// journals and any previous copy). Local only.
    public func remove(_ id: String) throws {
        lock.lock(); defer { lock.unlock() }
        var rows = try load()
        guard rows.contains(where: { $0.id == id }) else { throw PeopleError.unknown(id) }
        rows.removeAll { $0.id == id }
        try save(rows)
        let f = fileURL(id)
        for suffix in ["", "-wal", "-shm", "-journal", ".prev"] {
            try? FileManager.default.removeItem(atPath: f.path + suffix)
        }
    }

    /// `setHome` — nil clears it ("Show the list").
    public func setHome(_ id: String?) throws {
        lock.lock(); defer { lock.unlock() }
        var rows = try load()
        for i in rows.indices { rows[i].home = rows[i].id == id }
        try save(rows)
    }

    public func touchOpened(_ id: String) throws {
        lock.lock(); defer { lock.unlock() }
        var rows = try load()
        guard let i = rows.firstIndex(where: { $0.id == id }) else { return }
        rows[i].lastOpened = max(now(), rows[i].lastOpened + 1)
        try save(rows)
    }

    /// The open path: the file must already exist. A missing file is an
    /// error to report — never a reason to seed a fresh catalog over a
    /// person (phase 044 § 6 B–C).
    public func openableFile(_ id: String) throws -> URL {
        let u = fileURL(id)
        guard FileManager.default.fileExists(atPath: u.path) else {
            let n = try list().first { $0.id == id }?.displayName ?? id
            throw PeopleError.missingFile(n)
        }
        return u
    }
}
