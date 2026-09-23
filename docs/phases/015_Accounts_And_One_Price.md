# Phase 015 — Accounts and one price

**Status:** Executing. Slice 0 (rulings) done 2026-09-23. Next: slice 1,
after 013 slice 2 and 014 slice 2 (founder: core infrastructure, right
after Spotlight and the grid work).

**Direction DECIDED 2026-09-23** (founder: "all approved, lock it in").
Intake: `docs/founder/2026-09-23_Accounts_And_Pricing.md`.

This phase touches credentials, privacy, billing and user-data retention
(`AGENTS.md` § High-Risk Stops). The founder ruled on accounts, the QR
card, the price, Stripe, and what deleting a supporter does (2026-09-23).
Any change to those stops the phase for a new founder call.

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

Goal: one device holds many users. An SLP's laptop holds every client; a
parent's phone holds every child; a child's iPad opens to that child.
This is the core of accounts on the device side; slice 4 adds the
sign-in that brings the same list to a new device.

### Current state (**BUILT**, the gap)

- One local database: kvvfs in localStorage under the name `local`
  (`public/db.js:59`). kvvfs has only two names (`local`, `session`), so
  it cannot hold a second user at all.
- One profile row with the fixed id `prf_local`
  (`public/shared/groups.mjs:648`, `public/board.js:116`; 14 references across code and tests).
- One sync config, the localStorage key `pip_sync`
  (`public/shared/sync.mjs:22`), and one set of keys (`board_key*`,
  `recovery_root`) in IndexedDB `pip-keys`
  (`public/shared/sync_crypto.mjs:120`).

**Measured 2026-09-23:** one user's database with today's catalog (680
senses) exports to 999,424 bytes; export and reload each take under 1 ms
(Node, `@sqlite.org/sqlite-wasm`). Ten users is about 10 MB, over the
~5 MB localStorage allows per site. Phase 010's 2,000-word library will
push even one user past kvvfs's envelope, so this move is needed anyway.

### Design (**PROPOSED**; confirmed or changed by this slice's proof)

1. **One database per user.** Every existing query keeps working
   unchanged, because each user's database looks exactly like today's
   single one (including `prf_local` inside it). History, prediction
   weights and suggestions live in that user's database, so nothing can
   cross users by construction.
2. **In memory, saved to IndexedDB.** The open user's database runs in
   memory on the main thread (sqlite stays synchronous, no worker
   rewrite). After each write, a debounced save (300 ms, starting value)
   exports it (`sqlite3_js_db_export`) to IndexedDB `pip-users`, one
   record per user; `pagehide` and `visibilitychange` flush at once.
   Opening a user reloads it with `sqlite3_deserialize`. The site asks
   for persistent storage (`navigator.storage.persist()`). IndexedDB
   works in Safari, Chrome and an iOS web view alike.
3. **A user registry** (IndexedDB `pip-users`, store `users`): user id
   (random, 128-bit, made at **Add user**, used later as the relay id),
   the display name, which user is this device's **home user**, last
   opened, and that user's sync state (epoch, relay cursor). It replaces
   `pip_sync`.
4. **Keys per user.** Key names become `user/<id>/key_e<n>` and
   `user/<id>/root`. The device key pair stays one per device.
5. **One user syncs live**: the open one. Others catch up from the relay
   (`GET /ops?after=N`) when opened. A child's iPad has one user, so it is
   always live.
6. **Two tabs, one writer.** A Web Lock per user (`navigator.locks`) makes
   one tab the writer; a second tab on the same user says "Open in another
   tab" instead of writing over it.
7. **Photos stay shared.** Blobs are already content-addressed
   (`blob:<sha256>` in OPFS), so two users with the same photo store it
   once. Deleting a user leaves blobs another user still references.
8. **Migration.** On first boot of the new version, today's kvvfs
   `local` database, `pip_sync` and `board_key*`/`recovery_root` become
   user #1, the home user. Then the kvvfs copy is cleared.

### Screens

- **Parent Corner → Users:** the list (name, photo, last opened),
  **Add user**, **Switch**, **Set as this device's user**, **Remove from
  this device** (the user keeps existing on the relay and on other
  devices; the device warns if it is the only copy and no QR card was
  saved).
- **Add user:** a name and an optional photo, then the user's first
  board opens. Free limits (20 own words) count per user.
- **The child's screen never shows a switcher.** The device opens to its
  home user; switching needs the Parent Corner lock. A laptop with no
  home user opens to the list.

### Works Test

1. **Isolation.** On one browser, add users A and B. Add Cooper to A and
   Luna to B; speak a sentence on each; reload. Switching shows only that
   user's words, and A's history rows never appear in B's database.
2. **Sync per user.** Link A to a second client and B to a third, each
   through the real pairing flow: each client receives only its own
   user's ops, and a sealed op for A never opens under B's key.
3. **Durability.** Edit A, kill the tab 1 s later (after the debounce),
   reopen: the edit is there. Two tabs on A: the second cannot write.
4. **Migration.** A browser holding a pre-015 kvvfs database with Cooper,
   a linked relay, and a recovery root boots the new version: Cooper
   speaks, sync continues without re-pairing, the old recovery card still
   restores.
5. **Scale, measured.** 10 users of 200 own words each: record total
   IndexedDB bytes and the time to switch users on a real iPad in § 12.4
   (target: switch under 1 s).

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

**Partially BUILT 2026-09-23** (relay legs, dev-license path): the
one-live-device cap is enforced by `BoardRelay` (`403 upgrade_required`
on a second `POST /devices`), restore on a free board replaces the
device set, and `POST /entitlement` activates a board-bound HMAC license
(`src/worker/license.mjs` + `scripts/entitlement/mint.mjs`,
`PIP_LICENSE_SECRET` dev var — founder ruling: payments are their own
slice, dev flag for now). Still owed by this slice: user-scoped license
records (needs slice 4), Stripe/Apple confirmations, the 20-word and
5-drawing counters, the web-editor gate, license codes, and the
server-signed offline license statement.

Goal: `docs/product/Pricing_And_Packaging.md` § 4 enforced, honestly.

**Payments DECIDED 2026-09-23:**
- **Web:** Stripe Checkout (cards, Apple Pay, Google Pay); a Stripe
  webhook confirms the payment to the relay.
- **iOS app:** Apple's native in-app purchase only. No link out to the
  web checkout (founder: "just use Apple's native payments"). App Store
  Server Notifications confirm the payment to the relay.
- Either confirmation writes the same license record on the user. From
  then on the user is like any other: the QR card restores it, with its
  license, on any device (iPad, Android, a browser).
- **UNVERIFIED** (research before code, not a founder question): which
  in-app purchase type App Review accepts for a permanent unlock of one
  user among many; whether the App Store Small Business Program (15%
  instead of 30%) applies to us.

**PROPOSED:** a free demo user per SLP account for evaluations (full
features, cannot be moved to another device or shared).

Scope:
- Relay: a license record per user, written only by a verified Stripe
  or Apple purchase or a code redemption; a server-signed license
  statement the device verifies offline. The license belongs to the
  user, not to the supporter who paid.
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

**Partially BUILT 2026-09-23** (everything but email): the BoardRelay
stamps `last_seen` on every signed request; a daily DO alarm runs
`retentionSweep(now)` — destruction only on `delete_at` expiry (30-day
undo via `DELETE`/`undelete`) or 3 idle years; a fixture at 2y11m
survives and is flagged; a returning device sees `idle_delete_at` on
`GET /devices/self` plus a boot toast and a Parent Corner warning; ops
covered by `snapshot_seq` prune after 30 days. Still owed: supporter
email (needs slice 4) and the user-level vocabulary once slice 1 lands.
Proof: `src/worker/entitlement.test.mjs`,
`scripts/probes/entitlement_probe.mjs`.

Goal: 011 slice 9's retention rules, with email as the warning channel.

**DECIDED 2026-09-23:** a supporter is only a supporter. Deleting a
supporter account removes that account's access and nothing else: the
user, its words, its license, its QR card and its devices are untouched.

Works Test (from 011 slice 9, reworded):
1. A user whose purchase never existed keeps its snapshot and blobs; the
   job deletes none of them.
2. The job deletes only a user requested for deletion (after the 30-day
   undo) or with no device seen for 3 years. A fixture user last seen 2
   years 11 months ago survives.
3. In the final 6 months, supporters get an email and a returning device
   sees the warning.
4. An SLP deletes their account: the client's iPad keeps syncing with
   the family's devices, the family's supporters still see the user, the
   license holds, and the QR card still restores.

## Out of scope

School single sign-on and rostering (Clever, ClassLink). The Medicaid
device partner. Syncing history (ruled out 2026-09-22). The iOS app shell
(`docs/product/Platforms_iOS_And_Web.md`); slice 6's iOS purchase lands
with it.
