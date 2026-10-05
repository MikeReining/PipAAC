# Audit of delivered replay-anchor repair

Date: 2026-10-05. Reviewed current HEAD `e5cf9708`, preceding narrow-fix
commit `7cfbb40d`, and the developer's pasted completion report.

Verdict: **follow-up required before calling browser sync reliable**.
The anchor/derived-baseline split addresses the prior replay-over-result
problem in principle, but there are two urgent source-traced defects in
the implementation. No tests, browser checks, Git mutations or deployment
were performed by this reviewer. No runtime source was edited. Reported
test/deployment results are the delivering developer's evidence, not an
independent reproduction of browser convergence.

## P1 — browser database contract breaks every nonempty incoming batch

Truth owner: the database interface used by the shipped browser app.
Lie-prone layer: Node SQLite tests standing in for the WASM adapter.
Missing proof: push/fetch replay against the real browser database facade.

Call path: `public/board.js:152` → `bootDb` → `public/db.js:160`
`adapt(db, scheduleSave)` → board `initSync` at line 206 →
`sync.mjs:316` `ingest` → `ops.mjs:568` `logForeign.run`.

`public/db.js:23–34` implements `prepare().run()` by stepping/finalizing
the statement, calling `onWrite`, and returning **undefined**.
`public/shared/ops.mjs:568–573` assigns that return value to `ins`, then
reads `ins.changes` twice. The first dereference throws a TypeError for
any nonempty batch, including own echoes and already-covered history.
The ingest transaction rolls back; catch-up cannot complete.

The reported tests use `src/board/catalog.mjs:19–23`, which returns a
Node `DatabaseSync`. Node statements return a changes result, so these
tests do not exercise the shipped facade's return contract. Serving a
root page, fetching source, or counting anchor references cannot prove
incoming sync works.

Required repair: determine whether a row is new using the supported DB
interface inside the transaction (for example, query `op_id` existence
before inserting), or deliberately standardize and test the adapter's
result contract. Preserve the distinction between a newly logged foreign
op, a duplicate delivery, and an own pending op receiving its echo.
Do not merely use `ins?.changes`: that suppresses the crash but prevents
the foreign overlay/freshness logic from working in the browser.

Required proof: a regression with the actual facade's void-returning
`run`, then real SQLite WASM/browser execution through `bootDb` and
`initSync`. Verify push, fetched page, duplicate and own-echo cases;
assert actual persisted rows after reopen and rendered boards on two
disposable linked profiles. The original “and” in Sonja's Numbers board
must appear on the second profile without a manual refresh.

## P1 — normal upgrade creates the unsafe anchor the refusal test avoids

Truth owner: a trusted persisted pre-tail state, including catalog-owned
synced rows, plus preserved existing family data on upgrade.
Lie-prone layer: treating anchor-row existence as evidence of trust.
Missing proof: an old saved database going through real migration/import.

Call path: `bootDb` → `migrateSchema` → `importCatalog`
(`public/shared/import.mjs:201`) → `ensureBaseline`.
`public/shared/ops.mjs:500–503` uses `"{}"` whenever the old baseline's
`applied_seq` is nonzero or NULL and inserts this as row 2 with floor 0.
That is precisely the case for many existing synced databases.

Later, a lower unapplied op triggers the disorder check. The refusal at
`ops.mjs:607` only checks `!anchor`. Since boot inserted a row, it does
not refuse. `restoreSynced` at line 629 rebuilds over `{}`. That wipes
the profile and other catalog-owned synced rows. `setSetting`
(`groups.mjs:281`) UPDATEs the missing `prf_local` row, changing nothing;
the operation can still be flagged and coverage advanced. Restoring
catalog defaults on a later boot does not recover those confirmed edits.

`src/board/sync_order_review.test.mjs:121–145` deletes row 2 and calls
`drainOps` immediately. It never runs `ensureBaseline`/`importCatalog`
after deleting it, so it misses the production path that recreates the
placeholder. The six passing cases do not establish safe upgrades.

Required repair: do not fabricate a trusted empty anchor for a non-origin
legacy baseline. Preserve the distinction between unknown/missing and
verified origin/snapshot anchors, and handle placeholder anchors already
written by this release. Preserve live state, pending edits and existing
DB bytes while obtaining a verified snapshot plus complete tail, or
refuse visibly when no valid rebuild source exists. Do not clear saves,
reseed, reinstall, or declare history covered after a partial rebuild.

Required proof: an actual pre-anchor saved DB with a nonzero baseline and
a lower unapplied op → schema migration → import/ensureBaseline → sync
recovery → persisted reopen. Test both a bridging snapshot and no valid
snapshot/pruned history. Assert the profile/name/voice settings, groups,
placements, recordings, pending edits and coverage. Add a fixture with
the already-created `{}` placeholder, not just an absent row.

## Other follow-ups, separately scoped

- P2: supporter account regrant after interruption remains open in
  `docs/operations/debugger/SUPPORTER_REGRANT_RESUME.md`. The relay's
  rotation obligation does not durably refresh account-side bundles.
- Crypto epoch race from the previous review remains unaddressed:
  `sync.mjs:160–162`, `354–355`, and `565–567` select a key before awaits
  and read mutable `epoch` afterward to label blobs/snapshots/live frames.
  Add a delayed-key/encryption interleaving with UI rekey and assert the
  stored envelope opens under its declared epoch; bind key and epoch to
  the same sealing attempt if the race reproduces. This is source-traced,
  not reproduced by this audit.
- The `ownAckThenFetch` branch in `scripts/probes/sync_delivery_order.mjs`
  is another foreign-push branch; it does not create a local pending edit
  and call the actual `confirmOps`/submit acknowledgement path. Add that
  schedule before claiming own-ack proof.
- Hardware convergence and interruption remain unproven by these Node
  tests. Retention pagination/concurrent-write proof from the earlier
  handoff also remains outstanding; use disposable users only.

## Receiving developer handoff

1. Fix the two P1 issues in separate, narrow slices. Capture failing
   regressions first. Read AGENTS.md and the routed Debugger/Testing docs.
2. Use the protected runner for focused files:

   ```sh
   scripts/test.sh src/board/sync_order_review.test.mjs src/board/sync_watermark.test.mjs src/board/sync_seed_repair.test.mjs src/board/migrate.test.mjs
   scripts/test.sh src/board/sync_reliability.test.mjs src/board/sync_snapshot.test.mjs src/board/sync_delivery_order.test.mjs
   ```

   Add the DB-facade/WASM and true upgrade regressions to reachable focused
   proof. Do not count Node-only coverage as browser-adapter proof. No full
   wall without the founder's separate approval for that run.
3. Regenerate source-derived artifacts when required. Schema changes need
   catalog/starter regeneration; changed public source needs
   `node scripts/sw/sw_manifest.mjs`. Run `npm run check:fast`.
4. Browser-test the actual boot/sync path with `npm run dev:agent`; leave
   the founder's preview and slot-0 alone. Use plain `/` for persistence,
   not `?reseed`. Two linked disposable profiles must visibly converge
   in both directions, then after offline edits/reconnect and reload.
5. Review and commit only the deliberate slice paths; leave unrelated
   scratch/art files untouched. The review agent made no Git mutations.
6. Wrangler login is resolved. Deploy verified fixes, verify production
   `https://app.pipaac.org`, record the served version and SW build, and
   prove real incoming sync on disposable profiles. A root 200 or source
   string smoke is supplementary evidence, not the Works Test.
7. Correct canonical docs/proof claims and return commit IDs, actual test
   outcomes, browser observations and remaining hardware/account work.
