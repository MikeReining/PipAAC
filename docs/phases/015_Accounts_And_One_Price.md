# Phase 015 — Accounts and one price

**Status:** Executing. Slice 0 (rulings) done 2026-09-23. Next: slice 1.

**Direction DECIDED 2026-09-23** (founder: "all approved, lock it in").
Intake: `docs/founder/2026-09-23_Accounts_And_Pricing.md`.

This phase touches credentials, privacy, billing and user-data retention
(`AGENTS.md` § High-Risk Stops). The founder ruled on accounts, the QR
card and the price. Slices 6 and 7 carry their own blocking questions
(payment processor, account deletion); stop there for a ruling.

| Topic | Owner |
| --- | --- |
| Users, supporters, accounts, QR card, many users per device | `docs/product/Sync_And_Web_Editing.md` § 12 |
| Price, free vs Pip Lifetime, the 20-word limit, drawings | `docs/product/Pricing_And_Packaging.md` § 4 |
| Keys, pairing, op log, relay (unchanged) | `docs/product/Sync_And_Web_Editing.md` § 3–§ 7 |
| The synced tables | `docs/product/Language_And_Voice_Schema.md` |

Builds on phase 011 slices 1–8 (op log, merge, keys, relay, pairing,
blobs, web editor, recovery root). Takes over 011 slice 9 (free vs
Lifetime, retention).

## Vocabulary for code and docs

| Use | Never use |
| --- | --- |
| user, supporter, user key, QR card | board (for the sync unit), board key, recovery sheet, 24 words |
| sign in, account (a supporter's) | login for the child, account for the child |
| boards, groups (pages inside a user) | |
| Pip Lifetime, \$49 once per user | subscription, per-seat, per-supporter license |

## Build order

```text
1 one word: user ─▶ 2 many users per device ─▶ 3 QR card
                                   │
                                   ▼
                      4 supporter accounts ─▶ 5 supporters on a user
                                                       │
                                                       ▼
                                  6 Pip Lifetime + free limits ─▶ 7 retention + email
```

Slices 1–3 need no server identity and ship value alone. Slice 4 is the
account. Slice 6 is billing.

---

## Slice 0 — Founder rulings (done 2026-09-23)

Recorded in `docs/founder/2026-09-23_Accounts_And_Pricing.md` § Rulings
and routed to `docs/product/Sync_And_Web_Editing.md` § 12 and
`docs/product/Pricing_And_Packaging.md` § 4.

## Slice 1 — One word: user

Goal: the sync unit is called a user everywhere a person or the wire sees
it. Behavior unchanged. Cheap now, expensive with real users.

Scope:
- Product copy in `public/index.html` and `public/board.js`: "Restore a
  board", "Allow … to edit this board?", "This board syncs now",
  "Link this board first" and the linked-devices hint become user
  wording.
- Wire and identifiers: relay routes `/boards/...` → `/users/...`
  (`src/worker/relay.js`), `boardId` → `userId`, `board_key*` →
  `user_key*` in `public/shared/sync*.mjs` with a one-time keystore
  migration of existing dev keys.
- `board_group`, `board_layout` and "board" meaning the child's grid page
  stay: those are boards in the founder's sense.

Truth owner: `docs/product/Sync_And_Web_Editing.md` § 12.1.

Works Test: the full existing sync suite (`src/board/sync_*.test.mjs`,
`src/board/recovery.test.mjs`, `src/worker/*.heavy.test.mjs`) passes
unchanged in assertions. A copy scan finds no user-facing string that
uses "board" for the sync unit, and a device linked before the rename
still syncs after it.

## Slice 2 — Many users on one device

Goal: one device holds many users; the Parent Corner switches between
them; the child's device opens to its own user.

Current state (**BUILT**, the gap): one `pip_sync` config
(`public/shared/sync.mjs:22`), one profile row `prf_local`
(`public/shared/groups.mjs:648`, `public/board.js:116`), one kvvfs
database in localStorage (`public/db.js:59`) holding the ~650 KB catalog.

Decision inside the slice (engineering, not founder): per-user
databases vs one database with the catalog shared and user tables scoped
by user id. A 10-user SLP laptop must fit the browser's storage; kvvfs's
localStorage envelope likely does not, so this probably moves the
database to OPFS in a worker. Record the choice in § 12.4 with its
measurement.

Scope: user list and **Add user** in the Parent Corner; switcher behind
the Parent Corner lock; sync config, keys and baseline per user; the
child's screen never shows a switcher.

Works Test: on one browser, create users A and B. Add Cooper to A and
Luna to B, speak a sentence on each, reload. Switching shows only that
user's words; A's sentence history never appears under B. Link A to a
second client and B to a third: each receives only its own user's ops.
Measure storage with 10 users of 200 own words each and record it.

## Slice 3 — The QR card

Goal: scan a QR card to restore; print it, save it as an image, email it.
The 24 words leave the UI.

Current state (**BUILT**): the sheet is a `pip:recover:<id>:<24 words>`
QR plus a word grid (`showRecoverySheet` in `public/board.js`); restore
is paste-only (`restoreFlow`); the root encodes via BIP-0039 words
(`public/shared/recovery.mjs`).

Scope:
- Card: QR + a short text code for devices without a camera; **Print**,
  **Save image**, **Share** (the system share sheet covers email).
- Restore: camera scan on devices that have one; paste the short code,
  or pick a photo of the card, elsewhere.
- **Replace card:** a new recovery root; the old card's proof stops
  working at the relay; remaining devices get the new root's keys.
  (Old epochs stay readable to devices that hold them.)
- Free users: restore moves the user (enforced in slice 6; this slice
  shows the honest message).

Works Test: build a user, sync, destroy every client. On a fresh client,
feed the saved card image to the scanner: synced tables byte-identical,
history empty, the notice on screen. Replace the card: the old card's
restore gets 403; the new one restores.

## Slice 4 — Supporter accounts

Goal: a supporter signs in with email and a passkey; on a new device,
every user they support appears with its keys.

Scope:
- Relay: account records (email, passkey credentials, account public
  key, sealed account private key, list of user ids), email sign-in
  links through Cloudflare Email Service, passkey registration and
  sign-in in a Worker.
- Client: sign-in screen for supporters only; the passkey's PRF output
  derives the key that unseals the account private key on the device.
- User keys wrap to account public keys (as they wrap to devices in
  `wrapBoardKey`, `public/shared/sync_crypto.mjs`).
- No PRF: sign-in shows users and purchases; keys come from an Allow on
  another device or a QR card.
- The child's device never shows a sign-in.

Works Test (Chrome virtual authenticator with PRF, real `wrangler dev`):
supporter signs in on browser A, adds user Maya with Cooper and a photo.
Fresh browser B signs in with the same passkey: Maya appears, Cooper
speaks, the photo renders. Every captured relay payload is scanned: no
name, photo bytes, user key or account private key in the clear. A
virtual authenticator without PRF signs in and sees Maya locked until an
Allow from A.

## Slice 5 — Supporters on a user

Goal: share a user with another supporter and remove them later.

Scope: invite by sharing the QR card or an email invite that ends in
**Allow** on a device that has the user; a supporters list per user;
**Remove** rotates the user key and re-wraps to remaining accounts and
devices.

Works Test: parent account P invites SLP account S. S sees Maya and
edits; P's device receives the edit. P removes S: S's next read and write
get 403 and ops after removal are sealed under a key S never received.

## Slice 6 — Pip Lifetime and the free limits

Goal: `docs/product/Pricing_And_Packaging.md` § 4 enforced, honestly.

**Blocking questions (billing, a high-risk stop):** the web payment
processor (Stripe proposed); the iOS in-app purchase type App Review
accepts for a permanent per-user unlock (UNVERIFIED); whether the SLP
demo user (free, full features, cannot be moved or shared) ships here.

Scope:
- Relay: a license record per user, written only by a verified purchase
  or code redemption; a server-signed license statement the device
  verifies offline.
- Free limits: 20 live own words (counter from the first add), one live
  device (relay refuses a second link; restore moves the user), 5
  drawings; web editor opens for Lifetime users only.
- License codes: generate, redeem on one user; 50% off 20+ for schools.
- Speaking never waits on any of it.

Works Test:
1. A free user's 21st own word is refused with the offer; the 20 keep
   speaking offline with the relay down.
2. A free user linking a second device is refused **by the relay**, not
   only the UI. Restoring from the card on a new device moves the user;
   the old device still speaks and stops receiving.
3. Buying on the web for Maya (test mode): Maya's iPad, offline at
   purchase time, unlocks on next connect; every supporter of Maya gets
   the web editor; her sibling Luna stays free.
4. A forged license statement is rejected on the device.

## Slice 7 — Retention and email

Goal: 011 slice 9's retention rules, with email as the warning channel.

**Blocking question (retention):** what deleting a supporter account does
to users only that account supports.

Works Test (from 011 slice 9, reworded):
1. A user whose purchase never existed keeps its snapshot and blobs; the
   job deletes none of them.
2. The job deletes only a user requested for deletion (after the 30-day
   undo) or with no device seen for 3 years. A fixture user last seen 2
   years 11 months ago survives.
3. In the final 6 months, supporters get an email and a returning device
   sees the warning.

## Out of scope

School single sign-on and rostering (Clever, ClassLink). The Medicaid
device partner. Syncing history (ruled out 2026-09-22). The iOS app shell
(`docs/product/Platforms_iOS_And_Web.md`); slice 6's iOS purchase lands
with it.
