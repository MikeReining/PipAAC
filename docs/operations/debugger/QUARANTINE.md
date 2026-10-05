# Quarantine

Tests or behaviors temporarily excluded from the green wall. Every row needs an
owner, expiry, and proof path back to green.

| Item | Owner | Expiry | Proof to clear |
| --- | --- | --- | --- |
| Stable replay anchor, snapshot coverage and failed-repair rollback (`src/board/sync_order_review.test.mjs`, four TODO cases; source-traced, not run by review agent) | Sync developer taking the founder handoff | 2026-10-08 | Run the scenarios, repair replay ownership and upgrade handling per `SYNC_REPLAY_ANCHOR.md`, remove TODOs and prove persisted rows/slots/flags. |

## Cleared

| Item | Cleared | Proof |
| --- | --- | --- |
| Rename-only later-push-first delivery (`src/board/sync_delivery_order.test.mjs`) | 2026-10-04 | Delivered probe covers push-first/own-ack-first/snapshot-tail renames and pending edits. Broader convergence reopened 2026-10-05 above; this proof does not cover non-idempotent swaps or retained snapshot history. |
