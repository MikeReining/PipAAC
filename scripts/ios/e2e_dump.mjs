/**
 * Sorted dump of every synced table (ops.mjs SYNCED_TABLES) — the E2E
 * compare unit (044 C3). Reads a SQLite FILE the dumper does not own,
 * so the app under test cannot influence what it is measured by.
 *
 *   node scripts/ios/e2e_dump.mjs <db.sqlite> <out.txt>
 * Lines: `<table>\t<canonical row json>`, sorted. Prints the line count.
 */
import { copyFileSync, existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { SYNCED_TABLES } from "../../public/shared/ops.mjs";
import { canon } from "./harness.mjs";

export function dumpLines(db) {
  const lines = [];
  for (const t of SYNCED_TABLES) {
    for (const row of db.prepare(`SELECT * FROM ${t}`).all()) {
      lines.push(`${t}\t${canon(row)}`);
    }
  }
  return lines.sort();
}

/** Dump a database file via a private copy (+ journal) so a running app is undisturbed. */
export function dumpFile(path) {
  const dir = mkdtempSync(join(tmpdir(), "pip-dump-"));
  const copy = join(dir, "db.sqlite");
  copyFileSync(path, copy);
  for (const sfx of ["-wal", "-shm", "-journal"]) {
    if (existsSync(path + sfx)) copyFileSync(path + sfx, copy + sfx);
  }
  const db = new DatabaseSync(copy, { readOnly: false });
  try { return dumpLines(db); } finally { db.close(); }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [src, out] = process.argv.slice(2);
  const lines = dumpFile(src);
  writeFileSync(out, lines.join("\n") + "\n");
  console.log(`${out}: ${lines.length} lines`);
}
