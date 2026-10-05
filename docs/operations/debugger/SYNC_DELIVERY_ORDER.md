# Outstanding sync delivery-order defect

Status: reproduced 2026-10-04 after the replay-watermark fixes; not repaired
by the card-rotation slice. P1 / T3, sync developer, resolve before wider
distribution. This report is linked from the canonical sync owner and phase 043.

Symptom: one device keeps an older word name while another keeps the newer
name after both receive the same relay log.

Truth owner: relay sequence order applied to the persisted confirmed board.
Lie-prone layer: per-op `applied` flags and an advancing `sync_baseline`
prevent duplicates but do not establish a global replay order.

Entrypoint/call path: `startSync` → socket `onmessage` → queued
`ingest(msg.ops)` → `drainOps`; later `recover` fetches earlier operations
and calls `ingest(..., {fetched:true})` → `drainOps`. In `ops.mjs`, the first
drain folds the later operation into the baseline and flags it. The next
drain restores that baseline, applies the earlier unflagged operation,
and skips the later flagged operation. Fetch cursor discipline alone
cannot undo that reversed application order. Own-submit acknowledgments
can also put confirmed operations ahead of fetched foreign history.

Reproduction (memory-only, no production/user data):

```sh
node scripts/probes/sync_delivery_order.mjs
```

Current output: `laterPushThenFetch:"Older"`, `orderedFetch:"Newer"`,
relay rename sequences `[3,4]`, then an assertion failure (exit 1).
The probe calls the real write owners and rebase implementation.
`src/board/sync_delivery_order.test.mjs` carries its assertion as an
explicit failing TODO under `QUARANTINE.md` (sync developer; expiry
2026-10-07); it is not a passing convergence claim. It does
not claim to reproduce a real browser/WebSocket timing schedule.

Repair boundary: confirmed state must be folded in the relay's intended
order independently of delivery schedule. Choose a durable fetch-verified
checkpoint and safe ordered suffix replay, or defer live pushes until
ordered catch-up proves their predecessor coverage. Both require handling
own acknowledgments ahead of fetched history and pending optimistic edits;
merely suppressing WebSocket cursor movement or making renames idempotent
does not fix this. Relay sequences are sparse: never wait for every integer.

Required proof: ordered vs later-push-first vs own-ack-first delivery must
produce identical synced tables, including renames/recording retirement,
swaps and placement conflicts. Cover page boundaries, sparse sequences,
snapshot adoption, pending edits and restart. Promote this probe's assertion
into a wall-reachable regression. Name how already-diverged baselines are
repaired rather than silently claiming the new path heals them.

Separate retention concern found while checking the docs: relay `destroy`
still deletes legacy `s/<user>` only, not immutable `s/<user>/<seq>` backups
or `ri/` proof-index entries. Trace/test deletion across that new namespace
before altering the existing retention contract. This was code-traced,
not reproduced against live retention; it needs its own privacy/retention slice.
