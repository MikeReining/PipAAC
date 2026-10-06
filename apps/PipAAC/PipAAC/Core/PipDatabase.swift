//
//  PipDatabase.swift
//  PipAAC
//
//  One connection to the vendored SQLite. The owning PipCore serial queue
//  is the only caller — the handle is deliberately unsynchronized.
//  The JS side sees the web adapter's shape (public/db.js adapt()):
//  exec, run -> { changes }, all -> { columns, rows }.
//

import Foundation

/// Surfaces across the JS bridge as { "__err": description }.
struct PipDbError: Error, CustomStringConvertible {
    let description: String
}

/// Lives and dies on the PipCore queue; nonisolated because a
/// MainActor-bound database would defeat the serial executor.
nonisolated final class PipDatabase {
    /// SQLITE_TRANSIENT is a cast macro — invisible to Swift, so we say
    /// "copy the bytes now" explicitly.
    private static let transient = unsafeBitCast(-1, to: sqlite3_destructor_type.self)
    private var handle: OpaquePointer?
    let path: String

    init(path: String) throws {
        self.path = path
        var h: OpaquePointer?
        let rc = sqlite3_open_v2(
            path, &h, SQLITE_OPEN_READWRITE | SQLITE_OPEN_CREATE | SQLITE_OPEN_FULLMUTEX, nil)
        guard rc == SQLITE_OK, let h else {
            let msg = h.flatMap { sqlite3_errmsg($0) }.map { String(cString: $0) }
                ?? "sqlite3_open_v2 rc=\(rc)"
            if let h { sqlite3_close(h) }
            throw PipDbError(description: "open \(path): \(msg)")
        }
        handle = h
        sqlite3_busy_timeout(h, 5_000)
        // Same connection pragma the web adapter sets (public/db.js:172).
        try exec("PRAGMA foreign_keys = ON")
    }

    deinit {
        if let h = handle { sqlite3_close(h) }
    }

    func close() {
        if let h = handle { sqlite3_close(h); handle = nil }
    }

    private func requireHandle() throws -> OpaquePointer {
        guard let h = handle else { throw PipDbError(description: "db closed: \(path)") }
        return h
    }

    func exec(_ sql: String) throws {
        let h = try requireHandle()
        var err: UnsafeMutablePointer<CChar>?
        let rc = sqlite3_exec(h, sql, nil, nil, &err)
        if rc != SQLITE_OK {
            let msg = err.map { String(cString: $0) } ?? "rc=\(rc)"
            sqlite3_free(err)
            throw PipDbError(description: "exec: \(msg)")
        }
    }

    /// Value bridging, JS -> sqlite: NSNull -> NULL, Bool -> 0/1 (the
    /// fixture exporter's node host does the same), integral NSNumber ->
    /// INTEGER, other NSNumber -> REAL, String -> TEXT, and a
    /// {"__pipBytes": [UInt8]} dict -> BLOB.
    private func bind(_ stmt: OpaquePointer, _ params: [Any?]) throws {
        for (i, raw) in params.enumerated() {
            let idx = Int32(i + 1)
            let rc: Int32
            switch raw {
            case .none, is NSNull:
                rc = sqlite3_bind_null(stmt, idx)
            case let n as NSNumber where CFGetTypeID(n) == CFBooleanGetTypeID():
                rc = sqlite3_bind_int64(stmt, idx, n.boolValue ? 1 : 0)
            case let n as NSNumber:
                let d = n.doubleValue
                if d.rounded() == d && abs(d) < 9_007_199_254_740_992 {
                    rc = sqlite3_bind_int64(stmt, idx, n.int64Value)
                } else {
                    rc = sqlite3_bind_double(stmt, idx, d)
                }
            case let s as String:
                rc = sqlite3_bind_text(stmt, idx, s, -1, Self.transient)
            case let dict as [String: Any]:
                guard let nums = dict["__pipBytes"] as? [NSNumber] else {
                    throw PipDbError(description: "bind: unhandled dict param")
                }
                var bytes = nums.map { $0.uint8Value }
                rc = bytes.withUnsafeBytes {
                    sqlite3_bind_blob(stmt, idx, $0.baseAddress, Int32(bytes.count), Self.transient)
                }
            default:
                throw PipDbError(description: "bind: unhandled param \(type(of: raw!))")
            }
            if rc != SQLITE_OK {
                throw PipDbError(description: "bind \(idx): rc=\(rc)")
            }
        }
    }

    private func prepare(_ sql: String, _ params: [Any?]) throws -> OpaquePointer {
        let h = try requireHandle()
        var stmt: OpaquePointer?
        let rc = sqlite3_prepare_v2(h, sql, -1, &stmt, nil)
        guard rc == SQLITE_OK, let stmt else {
            throw PipDbError(description: "prepare: \(String(cString: sqlite3_errmsg(h)))")
        }
        do {
            try bind(stmt, params)
        } catch {
            sqlite3_finalize(stmt)
            throw error
        }
        return stmt
    }

    /// SQLITE_BLOB crosses as { "__pipBytes": [UInt8] } — JSC has no atob,
    /// and canon() on the JS side sorts it identically to node's bytes.
    private func column(_ stmt: OpaquePointer, _ i: Int32) -> Any {
        switch sqlite3_column_type(stmt, i) {
        case SQLITE_INTEGER: return NSNumber(value: sqlite3_column_int64(stmt, i))
        case SQLITE_FLOAT: return NSNumber(value: sqlite3_column_double(stmt, i))
        case SQLITE_TEXT: return String(cString: sqlite3_column_text(stmt, i))
        case SQLITE_BLOB:
            let n = Int(sqlite3_column_bytes(stmt, i))
            let p = sqlite3_column_blob(stmt, i)
            let bytes = p.map { [UInt8](UnsafeBufferPointer(start: $0.assumingMemoryBound(to: UInt8.self), count: n)) } ?? []
            return ["__pipBytes": bytes.map { NSNumber(value: $0) }]
        default: return NSNull()
        }
    }

    /// prepare + step to DONE; returns sqlite3_changes like the web
    /// adapter's run() -> { changes }.
    func run(_ sql: String, params: [Any?] = []) throws -> Int {
        let stmt = try prepare(sql, params)
        defer { sqlite3_finalize(stmt) }
        let rc = sqlite3_step(stmt)
        guard rc == SQLITE_DONE || rc == SQLITE_ROW else {
            throw PipDbError(description: "step: \(String(cString: sqlite3_errmsg(handle!)))")
        }
        return Int(sqlite3_changes(handle))
    }

    /// prepare + step to DONE; returns { columns, rows } in column order.
    func all(_ sql: String, params: [Any?] = []) throws -> (columns: [String], rows: [[Any]]) {
        let stmt = try prepare(sql, params)
        defer { sqlite3_finalize(stmt) }
        let n = Int(sqlite3_column_count(stmt))
        let columns = (0..<n).map { String(cString: sqlite3_column_name(stmt, Int32($0))) }
        var rows: [[Any]] = []
        while true {
            let rc = sqlite3_step(stmt)
            if rc == SQLITE_DONE { break }
            guard rc == SQLITE_ROW else {
                throw PipDbError(description: "step: \(String(cString: sqlite3_errmsg(handle!)))")
            }
            rows.append((0..<n).map { column(stmt, Int32($0)) })
        }
        return (columns, rows)
    }
}
