# Delivered sync work review — 2026-10-05

Repository: `/Users/mike/dev/PipAAC`. Reviewed HEAD `3336166e` and the
delivered `6a2c5f17` / `b5643bfc` changes. Git inspection was read-only.
Founder forbids this agent from commits and testing; all tests, browser
verification, commits and deployment are delegated to the receiving developer.
Wrangler login is now fixed (founder confirmed this turn).

## Verdict

**Follow-up required.** The guarded card replacement has a durable device
journal, atomic SQL proof/bundle/epoch publication and idempotent index repair;
removal records an obligation before client interruption. Retention cleanup
now includes versioned snapshots and the current proof mapping. These are
useful improvements, but this review did not independently rerun their proofs
or inspect production. The ordered replay repair remains incorrect for
non-idempotent operations; its rename probe establishes a narrower claim.

## Findings

1. **P1 — replay anchor is wrong; still open.** `public/shared/ops.mjs`
   `drainOps` lines 526–543 clears every confirmed flag when a lower op
   arrives, then restores the advancing baseline, which already contains
   those operations. Replaying a previous swap over its result undoes it.
   The same path also clears flags outside the replay transaction.
   `adoptSnapshot` only flags history currently known to the local log;
   later covered history can replay, resurrecting deleted content.
   `watermarkOf` can lower an adopted seq 500 to 0 on an empty drain.
   Four unrun quarantined scenarios: `src/board/sync_order_review.test.mjs`.
   Required architecture and migration boundary:
   `docs/operations/debugger/SYNC_REPLAY_ANCHOR.md`.

2. **P1 — catch-up can skip a page; working-tree fix, unverified.**
   `sync.mjs`: socket push → `ingest` → `drainOps` can fold seq 250 into
   the baseline before a paged fetch returns 1–200. Previously fetched
   ingest advanced `cfg.cursor` to the higher applied watermark (250),
   so the next request omitted unseen edits 201–210. It now caps coverage
   at the fetched page's maximum sequence, after a successful DB save.

3. **P2 — failed save could repeatedly refetch a full page; working-tree
   fix, unverified.** `recover` continued whenever it received 200 rows;
   a persist=false result returned without advancing the cursor, so the
   loop repeatedly fetched/replayed the same page. It now throws a named
   save failure and has an explicit no-progress stop. The next normal
   reconnect/online/visibility recovery can retry; this slice does not
   claim a new automatic persistence-error recovery timer.

4. **P2 — transient media retries had zero delay; working-tree fix,
   unverified.** `queueBlob` → `drainBlobs` retained a transient miss with
   `fails=0`, then scheduled `30000 * fails`, continuously retrying while
   offline. It now persists `retries` independently, capped at 10 for
   30-second-to-5-minute pacing. Only confirmed missing bytes count toward
   the existing loss cap. Successful later entries no longer clear an
   earlier error in the same drain. Reconciliation now uses the same
   queue lock as appends/drains; previously its unlocked read/write could
   overwrite a concurrent queue mutation.

5. **P2 — supporter regrant after interruption remains open.**
   Existing packet: `docs/operations/debugger/SUPPORTER_REGRANT_RESUME.md`.
   Relay rotation completion does not durably refresh account-side grant
   bundles; a fresh supporter sign-in can hold stale keys. This needs a
   durable cross-service obligation, rather than another inline UI retry.

## Further proof gaps / candidates, not newly reproduced defects

- Retention test's R2 fake returns one non-truncated page. Add >1-page
  cleanup and injected deletion failure/retry coverage; assert actual
  stored keys. Review writes arriving while `destroy` awaits R2: no
  explicit deletion barrier prevents new uploads during enumeration.
  Use disposable users only. Orphaned hash-keyed proof mappings remain
  an acknowledged cleanup limitation, not proof that restore succeeds.
- Crypto await interleaving needs a focused test: `uploadBlob`,
  `maybeSnapshot`, and `sendLive` select a key via `keyFor(epoch)`, then
  read mutable `epoch` again after awaits to label the envelope. A UI
  rekey in between could label an old-key ciphertext as the newer epoch.
  Capture/test the sealing epoch together with the key; do not claim this
  reproduced in production. Explicit op-submit epoch guards do not prove
  these other paths.
- Synthetic journal interruption tests do not prove real iPad process
  termination, IndexedDB durability or audible restored recordings.

## Exact working-tree scope to review and commit

- `public/shared/sync.mjs`
- `src/board/sync_reliability.test.mjs`
- `src/board/sync_order_review.test.mjs` (new; four explicit TODOs)
- `docs/operations/debugger/SYNC_REPLAY_ANCHOR.md` (new)
- `docs/operations/debugger/QUARANTINE.md`
- `docs/operations/debugger/DEBUGLOG.md`
- `docs/product/Sync_And_Web_Editing.md`
- `docs/phases/043_Foundation_Hardening.md`
- `public/sw-manifest.json`
- `public/sw-build.js`

No Git mutations or commit queue requests were made. Leave the old
`scratch/` notes, `scratch/slices/`, and the untracked batch72 art scripts
alone. This handoff file is an untracked operational artifact, not an
instruction to commit all of scratch. Inspect Git status before staging;
commit only the reviewed paths and any files deliberately added by your
next repair slice.

## Proof state and next action

No tests, syntax checks, gates, browser interactions or deployment were
run by this review agent. Source/diff inspection and manifest generation
only. Generated SW build: `r1-6d6dd347fcf3`; regenerate if public source
changes again. `sync.mjs` stays at its 580-line budget; reliability test
stays below the 500-line ratchet. These counts are hygiene, not proof.

Deslop: FIXED for touched hunks. Code audit: INCONCLUSIVE for narrow runtime
fixes until proof; REFACTOR REQUIRED for the replay owner. No new production
semantic module was added; existing sync/ops/DB/status owners stay in place.

Receiving developer:

1. Read AGENTS.md and the routed testing/debugging docs. Install/verify the
   test guard in a new shell as documented. Do not run the full wall unless
   the founder separately approves that run.
2. Run focused proof, from the repo root:

   ```sh
   scripts/test.sh src/board/sync_reliability.test.mjs
   scripts/test.sh src/board/sync_order_review.test.mjs src/board/sync_watermark.test.mjs src/board/sync_delivery_order.test.mjs src/board/sync_snapshot.test.mjs
   scripts/test.sh src/worker/rotation.test.mjs src/worker/entitlement.test.mjs
   ```

   The new review file has explicit TODO markers: their failures are
   quarantined and do NOT prove a passing replay contract. Inspect the
   individual results. Remove TODOs to capture ordinary failing regressions,
   implement the replay repair, then keep TODOs removed once genuinely green.
   Do not weaken slot/row/flag assertions to match broken behavior. Fix test
   fixture/timer issues if any arise; these tests have not been run here.

3. Repair replay ownership in its own slice with a stable replay anchor,
   covered-history exclusion, atomic flag changes and safe old-database
   handling. Add persisted-byte reopen and pruned-history upgrade proof.
   The small runtime fixes can be verified and shipped separately while this
   remains explicitly open; do not present a rename-only proof as completion.
4. After changes, regenerate with `node scripts/sw/sw_manifest.mjs` and run
   `npm run check:fast`. If a gate fails, fix it before deployment. Use the
   existing real-runtime `src/worker/recovery.heavy.test.mjs` and
   `src/worker/relay.heavy.test.mjs` when the replay/rotation/snapshot boundary
   changes; run serially through the protected runner, not the full wall.
5. Start an agent preview via `npm run dev:agent`; use the printed port.
   Never kill/reuse the founder's `npm run dev` or `.wrangler/slot-0`.
   Browser-test boot and two disposable linked profiles: add “and” to
   Numbers on one, render it on the other without manual refresh; then
   reverse direction, offline-edit/reconnect, reload both, exercise swaps
   under delayed delivery, and restore a photo + recording to an empty
   profile. Observe cells, media and persisted state, not only status text.
   Use plain `/` for persistence/convergence; `?reseed` overwrites seed
   edits and invalidates that proof. A founder visual preview, if requested,
   is `http://localhost:21087/?reseed` under the repo's review convention.
6. Review and commit only explicit slice paths. Update the TODO/quarantine,
   DEBUGLOG and phase status based on actual results. No broad cleanup.
7. Wrangler authentication is resolved: deploy verified deployed-surface
   changes using `npx wrangler deploy`, then smoke production
   `https://app.pipaac.org`, boot the changed surface, verify the served
   `/shared/sync.mjs` and SW build, and repeat disposable two-profile sync.
   Confirm retention commit `3336166e` is included in the deployed worker;
   do not run destructive retention checks on real family data. If a gate
   or missing credential still blocks deployment, report the exact failure.
8. Return commit IDs, production version/SW build, commands and actual
   outcomes, and clearly distinguish remaining TODOs and hardware proof.

No claim of full sync correctness is warranted until the replay follow-up
and cross-device proof are complete.
