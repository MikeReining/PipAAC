# Quarantine

Tests or behaviors temporarily excluded from the green wall. Every row needs an
owner, expiry, and proof path back to green.

| Item | Owner | Expiry | Proof to clear |
| --- | --- | --- | --- |

## Cleared

| Item | Cleared | Proof |
| --- | --- | --- |
| Ordered replay under later-push-first delivery (`src/board/sync_delivery_order.test.mjs`) | 2026-10-04 | `drainOps` re-replays the whole confirmed log in relay order when an unapplied op sits below an applied one; `adoptSnapshot` unflags ops above its coverage. Probe exits 0 for push-first/own-ack-first/snapshot-tail/ordered; test is a real assertion in the wall. |
