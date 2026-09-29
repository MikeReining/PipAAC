# Debugger Log

| Date | Tier | Summary | Truth owner | Resolution |
| --- | --- | --- | --- | --- |
| 2026-09-24 | T2 | Predict strip offers words that don't continue the sentence (`want` after `go do play want`): the open sentence trains `history_count` on every tap, and `hist` falls through to a word's lifetime share when that word never followed the context | `history_count` + `hist` in `public/shared/funnel.mjs` | History is written only when a sentence closes spoken. `hist` is Witten-Bell interpolation. `src/board/strip_history.test.mjs` |
| 2026-09-24 | T2 | Board stays blank: boot throws before `renderGrid` because a persisted DB is missing columns the shipped schema added (`spotlit`, `share_research`) | `public/shared/migrate.mjs` | Catalog regenerated from `schema.sql`. Migration now parses `CREATE TABLE` past semicolons in comments, and drops triggers that name a table being rebuilt so `ALTER RENAME` can finish. `src/board/migrate.test.mjs` |
| 2026-09-24 | T2 | `stats.test.mjs` red on clean HEAD: `logSelection` gained a `history_count` write (017 step 10) while the test's table whitelist only enumerated the read surface | `public/shared/funnel.mjs` (`logSelection`) | Added `history_count` to the fixture tables. Fixture whitelists must cover every table the exercised code path *writes*, not only what the module under test reads |
| 2026-09-22 | T2 | Browser DB never persisted: `OpfsDb` can't install on the main thread (worker-only `Atomics.wait`/`createSyncAccessHandle`), so the board silently ran `:memory:` and every entity/arrangement was lost on reload | `public/db.js` storage backend | Switched to `JsStorageDb("local")` (kvvfs → localStorage), the only vendored main-thread VFS; `persistent` now gated on `localStorage instanceof Storage` because kvvfs fabricates in-memory storage when blocked. Commit c2c2fd2 |

## 2026-09-22 opfs-main-thread

Tier: T2
Truth owner: `public/db.js` — which sqlite-wasm VFS backs the on-device DB
Lie-prone layer: the `sqlite3.oo1.OpfsDb && self.crossOriginIsolated` guard — the first half was always undefined, so the "persistent" branch never ran; the console.warn fallback was the only honest signal and nobody watched it
Proof: node --test src/board/groups.test.mjs; live CDP probe on dev:agent — `OpfsDb`/`sqlite3.opfs` undefined, OPFS root empty, a `JsStorageDb` row and caregiver edits surviving reload (commit c2c2fd2)
Pattern candidate: a capability check that only runs when the feature is missing is self-sealing — assert the positive path ("a row survives reload"), not the constructor's existence

## 2026-09-24 blank-board-stale-schema

Tier: T2
Truth owner: `src/board/schema.sql`, shipped to the browser as `catalog.schemaSql`
Lie-prone layer: `migrateSchema` treated the first semicolon as the end of `CREATE TABLE`, so a comment in `learner_profile` hid every later column; `ALTER TABLE … RENAME` then failed while a trigger still named the dropped table
Proof: node --test src/board/migrate.test.mjs
Pattern candidate: a DDL scanner that stops at `;` cannot see columns written after a comment semicolon — assert the column exists on a database created from the previous statement

## 2026-09-24 stale-fixture-write-surface

Tier: T2
Truth owner: `public/shared/funnel.mjs` — `logSelection` writes `history_count` since 017 step 10
Lie-prone layer: `statsOnlyDb`'s comment promised "ONLY the tables the module may read" — true for `stats.mjs`, but the same fixture feeds `logSelection`, whose write surface grew without the fixture noticing
Proof: node --test src/board/stats.test.mjs — failed on clean HEAD (`no such table: history_count`); green after adding the table
Pattern candidate: a minimal-table fixture must enumerate what the exercised code writes, not just what the module under test reads — a writer that gains a table breaks every fixture that whitelists only the reader's surface

## 2026-09-24 predict-strip-repeats-the-sentence

Tier: T2
Truth owner: `history_count`, written from a spoken sentence; the `hist` feature in `public/shared/funnel.mjs`
Lie-prone layer: `logSelection` wrote `history_count` on every tap (so the open sentence counted itself, and Clear/backspace never undid it), and the per-word backoff dropped to the lifetime share whenever that one word had not followed the context
Proof: node --test src/board/strip_history.test.mjs — fresh `go do play want` offers none of those words; after spoken `want` continuations, `juice`/`more`/`cookie` lead and `hist(juice) > hist(want)`; a cleared sentence leaves `history_count` unchanged
Pattern candidate: a running count trained on the open bar will echo the bar back — assert the strip against a sentence that is logged but not spoken

## Template

```text
## YYYY-MM-DD <fingerprint>

Tier: T1|T2|T3
Truth owner:
Lie-prone layer:
Proof: npm test
Pattern candidate: (optional)
```
## 2026-09-29 do-sql-exec-variadic-not-arrays

Tier: T2
Truth owner: `src/worker/tile_ledger.mjs` — every `sql.exec` call against the Durable Object's SQLite
Lie-prone layer: call sites passed params as one array (`sql.exec(q, [a, b])`); the real DO's `sql.exec` is variadic, so `node:sqlite` read the array as named parameters and threw `Unknown named parameter '0'` — only at the first real `wrangler dev` run, not in review
Proof: node --test src/worker/tile.heavy.test.mjs — failed on the DO path before the fix, green after converting all call sites to `sql.exec(q, a, b)`
Pattern candidate: code written for a DO storage API must be exercised against the real `wrangler dev` binding at least once — a light-test shim that accepts array params hides the contract mismatch

## 2026-09-29 ready-row-missing-r2-object-loops-forever

Tier: T1
Truth owner: `src/worker/tile.js` `serveClip` — the ready→R2→hit path
Lie-prone layer: "R2 object gone — fall through and re-mint it" looked safe, but `claimMint` refuses `ready` rows, so the rerun recursed until the request died (live: 62 s → 503 on a seeded clip whose object was absent from local R2)
Proof: node --test src/worker/tile.test.mjs — seeded row + missing object now demotes via `missingObject` and re-mints once (`x-tile-cache: mint`)
Pattern candidate: a "fall through and retry" path must verify the retry gate can actually open — if the state the gate checks is the same state that triggered the fall-through, the loop is infinite; demote first

## 2026-09-29 heavy-test-inherits-dev-vars

Tier: T3
Truth owner: `src/worker/tile.heavy.test.mjs` — spawns its own `wrangler dev`
Lie-prone layer: the spawned wrangler read the developer's `.dev.vars`, so a later `TILE_LIVE=1` turned the "stub mint" assertion into a real vendor call
Proof: node --test src/worker/tile.heavy.test.mjs — green with `--env-file` pointed at a minimal vars file the test writes itself
Pattern candidate: a test that launches a real server must control the server's env file, not inherit the developer's — `.dev.vars` drifts as features ship
