# Replay follow-up after the delivery-order repair

Status: P1 / T3, code-traced 2026-10-05; regression scenarios authored,
not executed. Owner: sync developer receiving the founder's review handoff.
Four explicit TODO cases in `src/board/sync_order_review.test.mjs` are
quarantined until 2026-10-08. No passing proof or deployed fix is claimed.

Truth owner: the synced SQLite rows after applying the relay's ordered
history once, plus snapshot coverage inside the persisted database.
Lie-prone layer: the advancing baseline, per-op flags and their watermark.
Missing proof: delivery-order permutations of non-idempotent operations,
retained snapshot history, and rollback during order repair.

## Confirmed swap can run twice

Entrypoint: `sync.mjs` socket `onmessage` or `recover` → `ingest` →
`drainOps`. Commit `6a2c5f17` clears every confirmed op's applied flag
when a newly received lower sequence precedes an applied one. It then
calls `restoreSynced(baseTables)` using the advancing baseline that
ALREADY contains the cleared operations, and runs those operations again.

Scenario: create groups A/B at slots 80/81; confirm their swap; receive
later setting op N+2 before N+1; fetch both. The ordered replica keeps A
at 81. The repair path swaps the already-swapped groups back to A at 80.
Renames may finish at the same final text after two replays, which is why
the delivered rename probe cannot close this issue. Placement conflict
resolution and rename/recording interactions need permutation proof too.

## Snapshot coverage is not retained correctly

`adoptSnapshot` flags only rows already in the log at adoption time.
`drainOps` later inserts an unknown historical row below the snapshot's
watermark with applied=0 and replays it. A historical create already
covered by a snapshot that also covered its deletion can resurrect the
deleted group. Order repair additionally clears rows covered by an
adopted snapshot, so a full local history replays over adopted state.

`watermarkOf` ignores the adopted snapshot's own coverage and derives its
answer solely from the local log. Adopt seq 500 then drain an empty
confirmed log: the baseline's watermark becomes 0. These are distinct
from legitimate out-of-order tail rows: a snapshot coverage floor needs
its own durable owner; a higher pushed watermark is not such a floor.

## Clearing flags is outside the rollback transaction

The new bulk unflag runs before `restoreSynced` and before the replay
transaction. A failing earlier op rolls back replay but leaves previously
applied flags cleared under the unchanged baseline. Existing atomic
tests exercise new flags, not this already-applied repair path.

## Required repair boundary

Keep a stable replay anchor and its coverage separately from derived
post-replay state and fetched coverage. Rebuild the retained ordered tail
over that anchor; never replay a prefix over a baseline containing it.
Ignore newly delivered history already covered by the adopted anchor.
Commit flags and derived baseline with replay, preserving the anchor's
watermark floor even when the tail is empty. Pending edits must survive.

Define an upgrade path for existing databases whose only baseline already
contains out-of-order tail state. An original pre-tail anchor cannot be
invented from that state. Use a verified relay snapshot plus complete
tail, or a real stored pre-replay checkpoint; refuse missing history
visibly rather than fabricating an empty baseline and losing edits.
Do not reset family data, reseed edits, or make swap operations no-ops.

Proof to close: remove all four TODO markers, run these tests plus the
existing watermark/delivery-order/snapshot tests, expand permutations to
placements and recordings, and reopen persisted database bytes after
repair. Add an upgrade case with missing/pruned history. A green rename
probe alone is insufficient. Real iPad/desktop convergence remains a
separate owner-visible check.
