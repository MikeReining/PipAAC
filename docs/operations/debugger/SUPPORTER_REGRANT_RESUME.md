# Supporter-regrant resume gap — closed 2026-10-06

Status: CLOSED — durable `regrant/<user>` journal in `rotation.mjs`
(`regrantJournalName`, written after every committed relay rotation) +
`resumeSupporterRegrant` drained on every owner recover and inside the
remove flow via `setSyncAccountOps` (`devices-ui.js`). Regression tests
in `src/board/sync_reliability.test.mjs` cover commit→drain,
interrupt→resume, and signed-out retention. Remaining coverage gap:
the obligation is device-local — a rotation completed on a device that
never holds an account session leaves the drain to any session-bearing
owner boot; a fresh supporter sign-in mid-gap still fails loudly
(`no wrapped key`), healed by the drain.

Original finding (code-traced 2026-10-04 during the card-rotation
takeover; P2 / T2):

Symptom: a supporter who signs in fresh after a device/supporter removal
whose regrant loop was interrupted can land on a stale key epoch — their
sign-in works, their grants unwrap, but every inbound op sealed at the
new epoch fails and their own submits are refused `bad_epoch`.

Truth owner: the account-service grant bundle (`buildUserGrant` wraps all
held epochs per supporter) vs the relay's `key_epoch`. The relay is ahead
whenever a rotation commits but the UI's regrant loop did not finish.

Entrypoint/call path: `devices-ui.js` remove-supporter flow —
`removeSupporter` → `revokeInvite` → relay rotation obligation (durable
since the rotation slice — `completeRemovalRotation` finishes it on any
root holder's next sync) → **the regrant loop is not durable**: it runs
`listInvites` + `grantInvite` per remaining supporter inside the same
onclick. A tab kill, navigation, or sign-in loss after the relay commit
strands supporter bundles at the pre-rotation epoch. Nothing re-runs the
loop — it is not journaled like `rotation/<user>` and no other owner
side-effect retries it.

What the stranded supporter sees: join tokens still work; the device
registers at the relay's current epoch but unwraps grants only up to the
bundle's epoch. `keyFor(current_epoch)` throws `no wrapped key` →
`ingestError` (honest save status since F11) and submits declare a stale
epoch → `bad_epoch` 409 → bounded retries exhaust. The failure is now
VISIBLE, not silent — but it does not self-heal: only an owner regrant
rewrites the bundle, and only another removal/rotation triggers one.

Repair boundary: record a durable regrant obligation next to the
rotation obligation (e.g. a `regrant` journal entry the family owner's
next session drains, or a supporter-side "my bundle is behind" detect
that requests a fresh invite). The account service is a separate
boundary — the obligation must survive the device that set it. A
supporter-side mitigation exists already: a fresh invite/grant from the
owner heals the device; make that path the explicit recovery story until
the obligation is durable.

Also confirm in the same slice: the fresh account sign-in path
(`importAccountUsers` + `claimInvite`) after a deferred rotation —
supporters' `pendingJoin` and stale-epoch detection must stay honest.

Proof to close: a supporter sign-in whose bundle predates a committed
rotation unwraps the current epoch (or is named-and-healed by an explicit
owner action); an interrupted regrant followed by owner resume rewrites
every remaining supporter's bundle; the stranded-supporter scenario
produces a visible error state with a documented recovery, not a wedge.
