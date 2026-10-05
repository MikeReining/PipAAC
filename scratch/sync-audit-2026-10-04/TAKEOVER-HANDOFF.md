# Sync takeover — verification, commit and deployment handoff

Founder instruction, 2026-10-04: Codex must neither stage nor commit;
all remaining testing is handed to the other developer. No commit queue
request was created. No deployment was performed.

Scope completed in the working tree:

- Canonical sync docs updated against the actual entrypoints and current
  checkpoint, snapshot, retry, key-grant and local-storage contracts.
- Replace card stores a durable `rotation/<user>` journal before any
  credential change. A guarded relay request atomically commits the new
  proof, sealed historical-key bundle, epoch and device grants. Lost
  responses and external proof-index failures replay the same request.
- Local resume retires the old root idempotently, installs the new root
  and keys, saves the registry, rekeys the active client, then removes
  the journal. Recovery and outgoing flush resume it after interruption.
- Device and supporter removal atomically record a relay rotation
  obligation alongside the revocation. Root holders finish it later;
  retired roots and incomplete grants are rejected. Deferred errors are
  visible through the save-status owner.
- Updated op submits explicitly declare their actual sealing epoch.
  A stale epoch is refused before the relay logs any op, keeping the
  outbox available for retry. Legacy clients retain the old contract.

Truth owners: device keystore journal; relay proof/bundle/epoch and grants;
relay removal obligation; persisted SQLite outbox. Lie-prone layers:
sequential UI awaits, registry epoch and relay client's captured sealing
key. Works Test: interruption followed by resume yields one matching
card/relay epoch, with a fresh root opening both old and new data.

## Exact staging allowlist

Inspect the diff and stage only these paths. Use explicit `git add` paths;
never `git add .`, `git add -A`, or the whole `scratch/` directory.

```text
docs/operations/TechStack.md
docs/operations/code-maintainer/LINE_BUDGET.json
docs/operations/debugger/DEBUGLOG.md
docs/operations/debugger/QUARANTINE.md
docs/operations/debugger/REGRESSION_LAW_BACKLOG.md
docs/operations/debugger/SYNC_DELIVERY_ORDER.md
docs/phases/043_Foundation_Hardening.md
docs/phases/README.md
docs/product/Sync_And_Web_Editing.md
public/board.js
public/board/devices-ui.js
public/board/editor-find.js
public/board/recovery-ui.js
public/shared/rotation.mjs
public/shared/sync.mjs
public/shared/sync_client.mjs
public/shared/sync_crypto.mjs
public/sw-build.js
public/sw-manifest.json
scripts/probes/sync_delivery_order.mjs
src/board/editor_find.test.mjs
src/board/sync_delivery_order.test.mjs
src/board/sync_snapshot.test.mjs
src/worker/recovery.heavy.test.mjs
src/worker/relay.js
src/worker/rotation.mjs
src/worker/rotation.test.mjs
```

This handoff itself is scratch context and need not be committed. Existing
scratch files, `scratch/slices/`, the previous audit artifacts and both
untracked `scripts/art/*batch72*` files belong to other work; leave them
untouched. Check for concurrent Git work before staging. Do not remove
an index lock without proving its owning process has stopped.

## Proof already observed

- The first three new relay assertions failed on the prior implementation:
  no durable removal flag; new proof paired with old epoch; accepted stale
  sealing epoch. They passed after repair.
- Final rotation unit file: **7/7 passed**, including supporter cascade,
  transactional rollback on failed grant write, interrupted R2 index
  repair, eight interruption points, lost responses, proof conflict,
  incomplete grants and fresh-root decryption of both eras.
- Editor + snapshot + then-six rotation tests: **23/23 passed**. Earlier
  crypto, reliability and recovery-UI files passed. The snapshot fixture
  was updated to return the relay's required `current_epoch` field.
- Real local Cloudflare recovery: **2/2 passed**; the shared replacement
  flow rejected the old card and restored the entire backlog with the
  new one. The final removal-helper extraction came after that run and
  still needs the local-runtime verification below.
- All 14 fast gates passed earlier. A subsequent log edit failed the
  proof meta-gate; its explicit quarantined regression was added and the
  meta-gate then passed. **The final complete fast gate is still owed.**
- Latest generated SW build: `r1-9b3f93d48ca0`, 919 files, 19.1 MB.
  Manifest line budget deliberately rose by five lines for the one new
  public module. Regenerate from source if anything changes.
- No full wall was run. `docs/operations/Testing.md` requires explicit
  founder approval for each full-wall run; a commit/deploy handoff is
  not that approval.

## Remaining verification — other developer runs it

Use the protected runner sequentially; a test-lock failure is a stop,
not a reason to repeatedly launch more tests.

```sh
bash scripts/check-test-guard-liveness.sh
scripts/test.sh src/worker/rotation.test.mjs src/board/editor_find.test.mjs src/board/sync_snapshot.test.mjs src/board/sync_crypto.test.mjs src/board/sync_reliability.test.mjs src/board/recovery_ui.test.mjs src/board/sync_watermark.test.mjs src/board/sync_delivery_order.test.mjs
scripts/test.sh src/worker/recovery.heavy.test.mjs src/worker/relay.heavy.test.mjs
npm run check:fast
git diff --check
```

The delivery-order test is an **explicit failing TODO**, with an owner and
expiry **2026-10-07** in QUARANTINE.md. It is not proof that convergence
passes. Run its direct diagnostic too:

```sh
node scripts/probes/sync_delivery_order.mjs
```

Expected current result: `Older` vs `Newer`, sequences `[3,4]`, exit 1.
Keep that failure visible; do not make the assertion weaker, delete it,
or mark the entire sync audit resolved. Repair it as the next separate
slice using `docs/operations/debugger/SYNC_DELIVERY_ORDER.md`.

Browser boot is unverified: Codex's browser approval system denied
`http://localhost:21092/`, stating the user declined permission. The
founder then handed all remaining testing to this developer. Do not
treat that denial as an application boot failure or circumvent it in
the blocked Codex browser session; use your own authorized testing flow.

An agent preview was started at 21092 before the final public-file edits;
its asset watcher hit a platform limit. Restart only that agent copy or
start a fresh `npm run dev:agent`; do not kill/reuse the founder's server
or `.wrangler/slot-0`. Verify the final app boots without console/module
errors; check Team & devices removal, Replace card, a reload after a
staged interruption, and the save-status warning. Existing cards still
print offline with an explicit unverified-current-card notice; a pending
replacement must finish before a card is displayed.

Founder visual-review URL: `http://localhost:21087/?reseed`.
Use plain `/` for actual edit-persistence/sync tests; reseeding must not
erase the edits you are trying to verify. Real iPad kill/relaunch and
camera/photo restore remain hardware proof, not a claim covered by the
synthetic interruption test.

## Commit and release

After inspecting the diff, completing the scoped proofs and authorized
browser boot, commit only the allowlist. Suggested title:

`Make recovery-card rotation resumable and refresh sync contracts`

This slice changes deployed worker/public code: deploy it in the same
handoff with `npx wrangler deploy`, then verify production root and health,
SW build and served rotation modules. Use synthetic users for live sync
checks; do not alter a family's devices/cards. Record the actual deployment
version and proof results. Remove/update the working-tree deployment
banner in the canonical sync doc only after deployment succeeds.

## Open findings — keep separate from this commit

1. **Confirmed P1 convergence defect.** A later pushed rename folded
   before an earlier fetched rename produces a different persisted name
   from ordered delivery. Per-op flags dedupe but do not establish
   global relay order; own-ack-first delivery also needs proof. Packet,
   red probe, explicit TODO and expiry are checked into this slice.
2. **Code-traced retention gap.** `destroy()` still deletes legacy
   `s/<user>` only, not immutable `s/<user>/<seq>` snapshots or the
   current proof-index entry. This needs deletion/retention proof and a
   separate repair; no live retention deletion was attempted here.
3. **Account-service follow-up.** Device grants resume, but remaining
   supporter-account regrant/revoke calls after a UI interruption are
   still a separate service boundary. Do not describe this slice as
   transactional recovery across every supporter account. Confirm the
   fresh account sign-in path after a deferred rotation before closing it.

The rotation boundary's code audit was CLEAN after focused proof. The
overall sync system is **not** declared fully reliable while these
findings and hardware proof remain open.
