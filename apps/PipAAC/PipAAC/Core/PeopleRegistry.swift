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
//  `sync` ({userId, epoch, cursor, pendingJoin?, snap?}) is the row's
//  link state; sync.mjs writes it back whole through `patch`.
//

import Foundation

/// A JSON value kept verbatim - the row's `sync` object belongs to
/// sync.mjs (it adds keys like `snap`), so the registry stores it
/// whole instead of narrowing it to the fields Swift reads.
public nonisolated enum JSONValue: Codable, Sendable, Equatable {
    case null, bool(Bool), number(Double), string(String)
    case array([JSONValue]), object([String: JSONValue])

    public init(from decoder: Decoder) throws {
        let c = try decoder.singleValueContainer()
        if c.decodeNil() { self = .null }
        else if let v = try? c.decode(Bool.self) { self = .bool(v) }
        else if let v = try? c.decode(Double.self) { self = .number(v) }
        else if let v = try? c.decode(String.self) { self = .string(v) }
        else if let v = try? c.decode([JSONValue].self) { self = .array(v) }
        else { self = .object(try c.decode([String: JSONValue].self)) }
    }
    public func encode(to encoder: Encoder) throws {
        var c = encoder.singleValueContainer()
        switch self {
        case .null: try c.encodeNil()
        case .bool(let v): try c.encode(v)
        case .number(let v): try c.encode(v)
        case .string(let v): try c.encode(v)
        case .array(let v): try c.encode(v)
        case .object(let v): try c.encode(v)
        }
    }
    /// From a Foundation graph (JSONSerialization output).
    public static func from(_ any: Any?) -> JSONValue {
        switch any {
        case nil, is NSNull: return .null
        case let n as NSNumber:
            if CFGetTypeID(n) == CFBooleanGetTypeID() { return .bool(n.boolValue) }
            return .number(n.doubleValue)
        case let s as String: return .string(s)
        case let a as [Any]: return .array(a.map { from($0) })
        case let d as [String: Any]: return .object(d.mapValues { from($0) })
        default: return .null
        }
    }
}

public nonisolated struct PersonRecord: Codable, Sendable, Equatable, Identifiable {
    public var id: String
    public var name: String
    public var photo: String?
    public var home: Bool
    public var role: String?
    public var needsSetup: Bool
    /// users.mjs `sync` - nil until the person is linked.
    public var sync: [String: JSONValue]? = nil
    /// person_name.mjs: the registry name is newer than the synced one.
    public var nameDirty: Bool? = nil
    /// Epoch milliseconds, like `Date.now()` in users.mjs.
    public var lastOpened: Double

    /// Linked and joined (sync.mjs initSync starts only for these).
    public var syncUserId: String? {
        guard case .string(let u)? = sync?["userId"] else { return nil }
        if case .bool(true)? = sync?["pendingJoin"] { return nil }
        return u
    }

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
        return try insertLocked(row, rows: &rows)
    }

    private func insertLocked(_ row: PersonRecord, rows: inout [PersonRecord]) throws -> PersonRecord {
        let home = row.home
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

    /// `saveUser(patch)` from the core: merges the keys sync.mjs / the
    /// name follower write (sync, name, photo, nameDirty, role,
    /// needsSetup) into the row and rewrites people.json atomically
    /// (temp file + rename) under the lock. Throws if the row is gone.
    public func patch(_ id: String, _ patch: [String: Any]) throws {
        lock.lock(); defer { lock.unlock() }
        var rows = try load()
        guard let i = rows.firstIndex(where: { $0.id == id }) else { throw PeopleError.unknown(id) }
        for (k, v) in patch {
            switch k {
            case "sync":
                if case .object(let o) = JSONValue.from(v) { rows[i].sync = o } else { rows[i].sync = nil }
            case "name": rows[i].name = (v as? String) ?? rows[i].name
            case "photo": rows[i].photo = v as? String
            case "nameDirty": rows[i].nameDirty = v as? Bool
            case "role": rows[i].role = v as? String
            case "needsSetup": rows[i].needsSetup = (v as? Bool) ?? rows[i].needsSetup
            default: break
            }
        }
        try save(rows)
    }

    /// users.mjs `addUser` with an id (joining a linked person): a
    /// known id refreshes its sync state and role; a new one gets a
    /// file seeded from fresh_db (sync then fills it from cursor 0).
    @discardableResult
    public func addLinked(id: String, sync: [String: JSONValue], role: String?, home: Bool) throws -> PersonRecord {
        lock.lock(); defer { lock.unlock() }
        var rows = try load()
        if let i = rows.firstIndex(where: { $0.id == id }) {
            rows[i].sync = sync
            if let role { rows[i].role = role }
            rows[i].lastOpened = now()
            if home { for j in rows.indices { rows[j].home = j == i } }
            try save(rows)
            return rows[i]
        }
        let row = PersonRecord(id: id, name: "", photo: nil, home: home, role: role,
                               needsSetup: false, sync: sync, lastOpened: now())
        return try insertLocked(row, rows: &rows)
    }

    /// The row as the core's `me` (users.mjs shape).
    public func rowJSON(_ id: String) throws -> String {
        lock.lock(); defer { lock.unlock() }
        guard let r = try load().first(where: { $0.id == id }) else { throw PeopleError.unknown(id) }
        return String(decoding: try JSONEncoder().encode(r), as: UTF8.self)
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
