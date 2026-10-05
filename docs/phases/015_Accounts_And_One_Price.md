# Phase 015 — Accounts and one price

**Status:** Executing. Slices 0–4 done (rulings 2026-09-23; user rename
and many-users-on-one-device 2026-09-24; the QR card and supporter
accounts 2026-09-25). Next: slice 5 — supporters on a user (invite,
Allow, remove + key rotation).

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

**DONE 2026-09-24.** The sync unit is `user` on every surface a person
or the wire sees; the grid page stays a board.

- Wire: `POST /users` + `/users/:id/...` (`src/worker/index.js`,
  `relayClient` in `public/shared/sync_client.mjs`); wire JSON carries
  `user_id`. `BoardRelay` → `UserRelay` with a wrangler
  `renamed_classes` migration (`wrangler.jsonc` v3) — existing DO
  storage survives.
- Keys: `getUserKey`/`putUserKey`/`wrapUserKey`/`unwrapUserKey` in
  `sync_crypto.mjs`. A store holding `board_key`/`board_key_e<n>` reads
  the legacy name, copies it forward to `user_key*`, and drops the old
  name — a pre-rename linked device keeps syncing without re-pairing.
- Config: `pip_sync` written before the rename carries `boardId`;
  `loadCfg` maps it to `userId` on read (`public/shared/sync.mjs`).
  The lobby `grant.board_id` column renames to `user_id` via
  `ALTER TABLE … RENAME COLUMN` guarded for both fresh and persisted
  DOs; relay `meta.board_id` reads fall back for pre-rename DOs.
- Crypto constants unchanged: HKDF salt `pip-board-key`, recovery suffix
  `pip-recovery-v1`, QR prefix `pip:recover:`, R2 prefixes `b/`/`s/` —
  printed sheets and derived keys keep working.
- Copy: "Restore a user", "Allow … to edit this user?", "This user
  syncs now", deletion/backup hints — all user wording; board/grid
  uses (`board_group`, `board_layout`, view "board") untouched.

Works Test, measured: sync + recovery + entitlement unit tests 18/18;
all four heavy files green against real wrangler (`relay`, `pairing`,
`blob`, `recovery` — run serially; `test.sh --heavy` now passes
`--test-concurrency=1` and collects `src`, which its stale root list
had missed). A keystore-migration leg proves a pre-rename store opens
its ops. Copy scan: no user-facing string calls the sync unit a board.
License mints still verify — the HMAC input is the same UUID, renamed.

## Slice 2 — Many users on one device

Goal: one device holds many users. An SLP's laptop holds every client; a
parent's phone holds every child; a child's iPad opens to that child.
This is the core of accounts on the device side; slice 4 adds the
sign-in that brings the same list to a new device.

### Current state before this slice (**BUILT** at 2026-09-23, the gap)

- One local database: kvvfs in localStorage under the name `local`
  (`public/db.js:59`). kvvfs has only two names (`local`, `session`), so
  it cannot hold a second user at all.
- One profile row with the fixed id `prf_local`
  (`public/shared/groups.mjs:648`, `public/board.js:116`; 14 references across code and tests).
- One sync config, the localStorage key `pip_sync`
  (`public/shared/sync.mjs:22`), and one set of keys (`user_key*`,
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
   `local` database, `pip_sync` and `user_key*`/`recovery_root` become
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

**DONE 2026-09-24.** One device holds many users; each has its own
database, keys, and sync state.

- Registry: `public/shared/users.mjs` — IndexedDB `pip-users` (store
  `kv`): `user/<id>` rows (id, name, photo, home flag, lastOpened, sync
  `{userId, epoch, cursor}`) + `db/<id>` serialized databases. The id is
  minted at Add user and becomes the relay id.
- Per-user DB: `public/db.js` — in-memory SQLite loaded via
  `sqlite3_deserialize`, exported to `db/<id>` on a 300 ms write
  debounce with `pagehide`/`visibilitychange` flushes; `bootDb` returns
  a `flush` handle. kvvfs is gone.
- Scoped keys: `user/<id>/key_e<n>` + `user/<id>/root`
  (`sync_crypto.mjs`). The flat-name fallback is gone — `getUserKey`
  reads only the scoped name, so user B can never land on user A's key.
- Sync state lives on the registry row (`sync.mjs`); the relay cursor
  advances as ops arrive, so catch-up fetches only new ops.
- Boot: `public/board.js` — migrate → resolve (session override → home
  → single → "Who is playing?" picker) → Web Lock `pip-user-<id>`
  (`ifAvailable`; a second tab is told, not allowed) → `bootDb`.
- Parent Corner → Users on this device: Switch, Name, Opens first
  (home), Remove-from-device (with the only-copy warning), Add a user.
- Link/restore join the registry: `linkThisDevice` and `restoreFlow`
  add a row keyed by the relay id, store the scoped key/root, then
  reload into it. The pairing grant now carries the granter's epoch.
- Worker: `POST /users` accepts a client-chosen UUID
  (`src/worker/index.js`); `bootstrap` refuses an already-initialized
  user with 409 (`src/worker/relay.js`) — a caller cannot graft a
  device onto someone else's user.
- Migration: `migrateLegacy` carries kvvfs `local` bytes, `pip_sync`
  (incl. pre-rename `boardId`), flat `user_key*`/`board_key*`/`recovery_root`
  into user #1 (home), then clears the legacy stores.

Works Test, measured: registry + migration units 7/7
(`src/board/users.test.mjs`); scoped-key isolation + eager migration
5/5 (`sync_crypto.test.mjs`); bootstrap-refusal leg in
`entitlement.test.mjs`; all four heavy files green with scoped keys
and client-chosen ids. Live probe `scripts/probes/users_probe.mjs`:
home user boots, Add user opens a clean second database, a write in A
survives the round trip through B and B's write never appears in A, a
second tab on the same user is refused by the Web Lock, and a real
kvvfs + `pip_sync` install migrates into the home user with its rows
intact and the legacy stores cleared. Waived: Works Test leg 2's
two-client-per-user pairing (each user's relay id and key scope make
cross-talk impossible by construction; pairing itself is heavy-proven)
and leg 5's iPad switch timing (no device).

## Slice 3 — The QR card

Goal: scan a QR card to restore; print it, save it as an image, email it.
The 24 words leave the UI.

Current state (**BUILT**): the card is a `pip:recover:<id>:<b64u32>` QR
plus a 43-character code (`showCard` in `public/board.js`); restore is
camera scan, photo pick, or pasted code (`restoreFlow`,
`recoverFromText`); pre-card 24-word payloads still parse
(`public/shared/recovery.mjs`).

**DONE 2026-09-25** — card replaces the sheet end to end:

- Card payload carries the root itself as 43 base64url characters —
  `cardPayload`/`recoverFromText` (`public/shared/recovery.mjs`);
  `pip:recover:<id>:<24 words>` and bare `id + 24 words` still restore.
- Card UI (`public/board.js` `showCard`, `public/index.html` `#recform`):
  QR + grouped code, **Print**, **Save image** (PNG via `cardPngBlob`),
  **Share** (`navigator.share` with clipboard fallback — covers email),
  **Replace card…**. The 24 words left the UI.
- Restore UI (`restoreFlow`, `scanBitmap`): **Scan the card** via
  `getUserMedia` + `BarcodeDetector` where present, **Choose a photo**
  for card-less cameras, paste fallback everywhere; the dialog warns
  that a free-user restore unlinks the other devices.
- Replace card (`replaceCard` → signed `POST /users/:id/recovery`):
  new root, new proof — the old card's restore is 403 at once; the
  replacer seals every epoch key it holds into a **recovery bundle**
  (`sealEpochBundle`, keyed by `HKDF(newRoot, "recovery-bundle")`) the
  relay stores blind; a restore unpacks it (`openEpochBundle`) so the
  whole backlog stays readable. Retired roots persist
  (`user/<id>/roots`) so repeated replacement covers every era; old
  epochs stay readable where a device holds their keys.
- Free-user move stays honest: the relay returns `moved` on restore;
  the restored device shows "the other devices were unlinked" on first
  boot (`pip_restore_moved` → toast).
- Proof: `src/board/recovery.test.mjs` (card round-trips, grouping,
  legacy words, rejects); `src/worker/recovery.heavy.test.mjs` (real
  relay — card restore byte-identical + history empty + wrong proof
  403; replace — old proof 403, new card restores the full backlog at
  epoch 2); `scripts/probes/qrcard_probe.mjs` live two-profile run —
  card UI (QR + code, no words, all actions), destroyed client → fresh
  profile restores via pasted code with synced rows back, history
  empty, move notice on screen; Replace mints a new code at epoch 2,
  old proof 403, new proof restores.
- Waiver: camera scanning and photo picking are feature-gated on
  `BarcodeDetector` (absent in headless Chrome) — unproven live; the
  pasted code runs the identical `recoverFromText` a scan decodes to.

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

**DONE 2026-09-25.** Built:

- `src/worker/accounts.js` — `SupporterAccounts` DO: a `dir` object
  (email→account, link tokens, challenges, sessions, dev mailbox) and
  `acct:<id>` objects (credentials, `acct_pub`, `sealed_priv`, PRF salt
  at account level, wrapped user keys + sealed profiles).
- `src/worker/index.js` — `/accounts/link|claim|dev/mailbox` +
  `/accounts/:id/{state,credentials,challenge,register,credential,assert,users}`.
  Register and credential-add require the challenge a **claimed email
  link** minted (self-minted nonces get `link_required` 403); register
  is insert-only so `acct_pub`/`sealed_priv` can never be overwritten;
  `users` is session-gated; assert verifies the WebAuthn signature
  server-side (`src/worker/webauthn.mjs` — challenge, origin, RP id,
  user presence, ES256 DER→P1363). Email sending via lazy
  `cloudflare:email` import with the dev mailbox as the local path.
- `wrangler.jsonc` — `ACCOUNTS` binding + `v4` migration.
- `src/worker/relay.js` + `public/shared/sync_client.mjs` — **join
  tokens**: keys alone don't pull ops — a fresh device must also
  register on the user's relay. A linked device mints up to 8
  single-use bearer tokens (`POST /join_tokens`, signed; relay stores
  only SHA-256 + 30-day expiry); the account bundle carries them;
  `POST /users/:id/devices` with `join_token` redeems one
  non-destructively (like a Lifetime restore — never removes anyone)
  and the free-user one-device cap still applies.
- `public/shared/sync_crypto.mjs` — `genAccountKeys`,
  `sealAccountPriv`/`openAccountPriv` (HKDF over the passkey PRF output
  → AES-GCM KEK); user keys wrap to `acct_pub` with the existing ECDH
  grant — the relay never sees a private key or name in the clear.
- `public/shared/account.mjs` — client: link request/claim, passkey
  create/get with the PRF extension, register, sign-in (get →
  email-authorized credential-add when the passkey isn't on this
  authenticator → assert), share-back of synced users, import
  (unlocked with PRF, locked without).
- `public/board.js` + `public/index.html` — Parent Corner "Supporter
  account" row (hidden on the child's own synced-home device — the
  child never sees a sign-in), `?signin=` landing flow, locked-user
  "needs an Allow or QR card" in the user list.

Proof: `src/worker/webauthn.test.mjs` (verify + each failure mode),
`src/board/sync_crypto.test.mjs` account test (PRF seal/open +
wrapped-key round-trip), `src/worker/accounts.heavy.test.mjs` (wrangler
dev end-to-end: link → claim → register → wrapped user key →
simulated-authenticator assert → unseal → open a real op; forged
signature 403, self-minted-challenge register/credential 403,
re-register 409, link-authorized credential-add preserves account
identity, link replay 403, no key bytes in payloads),
`src/worker/relay.heavy.test.mjs` join-token leg (mint → redeem →
pulls work; bogus and replayed tokens 403; free-user cap applies).

**Works Test green** (`scripts/probes/account_probe.mjs`, two Chrome
profiles + CDP virtual authenticators): A creates Maya + Cooper with a
photo, links, Lifetime, signs in by email link → passkey registers →
share-back. B (same authenticator, app state wiped — the synced
passkey): Maya lands named, with keys; her device registers via a join
token and pulls ops — Cooper's cell speaks and his photo renders as a
blob URL. C (authenticator without PRF): Maya lands locked — the user
list shows "needs an Allow or QR card" and no Switch. The child's own
device (home + synced user, not signed in) hides the account row; a
partner device shows it. Every captured POST body on both browsers was
scanned: no name, photo bytes, or key material in the clear.

Real bugs the probe caught: locked imports wrote `sync: null` so the
lock label could never render (import now sets `sync.userId` from grant
epochs); account sign-in never registered the device on the user's
relay so nothing could pull (join tokens); the DO dropped
`join_tokens` on the floor; `/dir/claim` returned no email so first
registration failed; and "Opens first" left the sign-in row visible
until the next corner render.

## Slice 5 — Supporters on a user

Goal: share a user with another supporter and remove them later.

Scope: invite by sharing the QR card or an email invite that ends in
**Allow** on a device that has the user; a supporters list per user;
**Remove** rotates the user key and re-wraps to remaining accounts and
devices.

Works Test: parent account P invites SLP account S. S sees Maya and
edits; P's device receives the edit. P removes S: S's next read and write
get 403 and ops after removal are sealed under a key S never received.

**DONE 2026-09-23.** Built:

- `src/worker/relay.js` — a `supporter` table per user plus
  `via_acct`/`for_acct` tagging: join tokens mint with a supporter
  account tag and devices that redeem them are tagged back. Signed
  routes `GET/POST /users/:id/supporters` and `DELETE
  /users/:id/supporters/:acct` — removal cascades: the supporter row,
  every device that joined through that account, and every unredeemed
  token minted for it die together. `GET /devices` returns `via_acct`.
- `src/worker/accounts.js` + `src/worker/index.js` — the invite
  lifecycle on the `dir` object: `pending_claim → pending_allow
  (invitee signed in) → granted | declined | revoked`. Create
  (`POST /accounts/:id/invites`, session-gated, emails `?invite=`),
  bearer open (mints a normal sign-in link token for the invited
  email), claim (binds the invitee's account + public key), status
  (grant payload only to the invitee, only when granted), grant
  (also regrant — upserts the wrapped-keys row into the invitee's
  account user table), decline, revoke (drops the user row from the
  invitee's account). Invitee can't grant; strangers get 403.
- `public/shared/account.mjs` — invite calls +
  `registerAccount` now returns the minted private key so a first
  sign-in on a fresh account can unwrap grants.
- `public/shared/sync.mjs` — two fixes the probe caught: a synced
  user with no stored key and no recovery root no longer starts sync
  (it would mint a fresh key and seal ops nobody could read); and
  `rekey`/`syncRekey` re-seal the running client under a rotated
  epoch — before this, post-removal ops kept sealing under the old
  key until an incoming higher-epoch op arrived (same hole existed on
  device removal; both flows now call it).
- `public/board/devices-ui.js` + `public/index.html` — the
  "Supporters of this user" row: invite by email, pending requests
  with **Allow** (registers the account on the user's relay, wraps
  every held epoch key to its public key, mints tagged join tokens,
  grants), granted rows with **Remove** (relay cascade → invite
  revoke → epoch rotation re-wrapped to remaining devices, then
  regrant to remaining supporter accounts), invited rows with Cancel.
  `?invite=` landing runs open → sign-in → claim → polls for Allow →
  imports the grant like an account user. Tagged devices show
  "supporter device" in the device list.

Proof: `src/worker/accounts.heavy.test.mjs` invite leg (create → open
→ claim → pending_allow with pub bound → invitee can't grant → grant
lands in the bundle → unwraps to the real key → revoke empties the
account → declined invites can't open); `src/worker/relay.heavy.test.mjs`
supporter leg (tagged join, S edits reach A, remove → read **and**
write 403 + dead leftover token, epoch-2 ops don't open under the old
key, untagged devices survive).

**Works Test green** (`scripts/probes/supporters_probe.mjs`, two Chrome
profiles + virtual authenticators): P signs in, invites the SLP by
email; S's link runs the real passkey sign-in, claims, and waits at
"waiting for the family to Allow"; P's corner shows the request, Allow
grants; S imports Maya unlocked (`sRegistered: ok` — a real relay read
before removal, so the later 403s mean something), adds Zebra, and P's
database receives it. P removes S: read and write from S's real device
both get 403, the supporters list empties, the user re-keys to epoch 2,
and the post-removal op opens under e2 but stays sealed under the e1
key S still holds. Payload scan on both browsers: no names or op
content in the clear.

The QR-card leg of "invite by QR card or email" is the existing card
restore (slice 3) — it lands a device directly; the email invite is the
account-level share this slice adds.

## Slice 6 — Pip Lifetime and the free limits

**DEFERRED 2026-09-23** (founder): payments integration waits — "not
launching, nobody's using it right now." The dev-license path stays the
entitlement mechanism until Stripe/Apple land. Owed when resumed:
Stripe Checkout + webhook, iOS consumable IAP + App Store Server
Notifications, license codes, server-signed offline license statement,
and the 20-word / 5-drawing / web-editor / free-supporter gates below.

**Partially BUILT 2026-09-23** (relay legs, dev-license path; the cap
predates the one-supporter ruling and is owed a change, see Scope): the
one-live-device cap is enforced by `UserRelay` (`403 upgrade_required`
on a second `POST /devices`), restore on a free board replaces the
device set, and `POST /entitlement` activates a board-bound HMAC license
(`src/worker/license.mjs` + `scripts/entitlement/mint.mjs`,
`PIP_LICENSE_SECRET` dev var — founder ruling: payments are their own
slice, dev flag for now).

**Web leg BUILT 2026-10-02** (`src/worker/stripe.js`, relay + accounts
legs, `src/worker/stripe.test.mjs` 6/6):
`POST /api/v1/checkout` opens a Stripe Checkout Session for
`STRIPE_PRICE_ID`, session-gated to a supporter of that user
(`client_reference_id` carries the user id); `POST
/api/v1/stripe/webhook` verifies `Stripe-Signature` (HMAC + 5-min
tolerance) and `checkout.session.completed`/`paid` grants lifetime via
the relay's new `POST internal/entitlement` (same `x-pip-internal` guard
as the read; provenance `license_source`/`license_ref`/`licensed_at` in
meta). License codes live in the accounts dir (`license_code`, hashes
only): founder mints batches at `POST /admin/v1/license-codes` (Bearer
`PIP_ADMIN_TOKEN`), anyone redeems `POST /api/v1/license/redeem` —
single-use, and a failed relay grant releases the code. Stripe objects
created 2026-10-02 via the CLI (account `acct_1U43csFPjZdfZdLb`):
**test** — product `prod_VMyB0DtwzyZEpr`, price
`price_1UMEFLFPjZdfZdLbfgjVyIZ3` ($49 one-time), endpoint
`we_1UMEFMFPjZdfZdLbqak24cbK`; **live** — product `prod_VMyB0MIsPImKmw`,
price `price_1UMEFXFPjZdfZdLbQpjLQBId`, endpoint `we_1UMEFYFPjZdfZdLb1r6KEpbO`
on `app.pipaac.org/api/v1/stripe/webhook` for
`checkout.session.completed`. `.dev.vars` carries the test key + test
price; local webhook proof runs `stripe listen --forward-to
localhost:21087/api/v1/stripe/webhook` and pastes its session `whsec_`
into `STRIPE_WEBHOOK_SECRET`. Prod secrets pushed 2026-10-02 —
`STRIPE_SECRET_KEY` is a durable `sk_live` (verified against live mode).
**Deployed 2026-10-02** (`wrangler deploy`, version 0a618cd0): all three
routes verified live — checkout `bad_request`, webhook `bad_signature`,
redeem `bad_code`. Checkout sessions enable `allow_promotion_codes`;
a `no_payment_required` completion (100%-off coupon) grants the same as
`paid`. Test coupons: `PIPTEST` promo code (100% off, once) exists in
test and live mode — `promo_1UMEbfFPjZdfZdLbeiPx45kN` /
`promo_1UMEbfFPjZdfZdLbWMDAVQqg`, coupons `6cO2A04j` / `gyyitngZ`.
More coupons: `stripe coupons create [--live] -d percent_off=N
-d duration=once` then `stripe promotion_codes create -d
"promotion[type]=coupon" -d "promotion[coupon]=<id>" -d code=<CODE>`.

Client wiring BUILT 2026-11-02: the Progress upsell button calls
`checkout()` when a supporter account is signed in (else falls back to
the license row — the purchase runs through the account, § 4.5);
`?purchased=` strips and polls `GET /users/:id/entitlement` — a new
device-signed relay read that hands a lifetime user its `pip-life-*`
copy after a worker-side grant (webhook or code), so voice calls can
present it; `renderDevices` picks the same copy up opportunistically;
the license field accepts `PIP-` codes (bearer `/api/v1/license/redeem`)
alongside pasted keys. Proof: `entitlement.test.mjs` GET leg +
`stripe.test.mjs` checkout legs.

**Self-serve code checkout BUILT 2026-10-03** (founder: "let anybody buy
bulk licenses at 50% off … 10 or more"): `POST /api/v1/checkout/codes`
takes a count 10–200 — the schools page's plain form POSTs it and gets
a 303 to Stripe (JSON callers get `{url}`) — priced inline at $24.50 a
code (`price_data`, no new Stripe price). The webhook's
`metadata.kind=license_codes` branch mints the batch in the accounts
dir (`code_order`, idempotent on the Stripe session id; codes sealed
AES-GCM — `license_code` still stores hashes only) and emails them when
`EMAIL` is bound. `GET /api/v1/license/order?session=` feeds
`app.pipaac.org/codes.html`, which polls and renders the codes. Codes
redeem through the existing bearer path. Amends § 4.5: 50% off **10**
or more. **Deployed 2026-10-03** — worker `bccf2c5a` on app.pipaac.org
(live `cs_live_` session verified), site `eb6efe6d` on pipaac.org.

Still owed by this slice: Stripe/Apple **confirmation wiring tested
live** (test-mode purchase end-to-end), iOS consumable IAP (lands with
the iOS shell — Out of scope), the 20-word and 5-drawing counters, the
web-editor gate, the own-device + one-supporter cap replacing the
one-device cap, and the server-signed offline license statement.

**043 K amendment (built):** the webhook handled only
`checkout.session.completed` — a bank-debit buyer whose session settles
later never got the grant. The handler now also covers
`checkout.session.async_payment_succeeded` (grants, keyed on the PI
metadata `client_reference_id` carried through Checkout),
`checkout.session.async_payment_failed`, `charge.refunded`, and
`charge.dispute.created` (each records a `payment_issue` flag on the
user, surfaced on `devices/self` and `GET /entitlement`, shown once in
the devices sheet — conservative: no silent revoke). Both Stripe
endpoints (live `we_1UMEFYFPjZdfZdLb1r6KEpbO`, test `we_1UMEFMFPjZdfZdLbqak24cbK`)
subscribe to all five event types. **OPEN — founder call:** whether a
refund/dispute should also revoke the lifetime grant (flag-only today).

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
- **Apple product type (researched 2026-09-23):** a **consumable**, not a
  non-consumable. An Apple ID can buy a non-consumable only once, so a
  second user's license could never be bought. Consumables do not
  restore through Apple, so the relay validates the signed transaction
  (App Store Server API), binds it to one user, and is the record. The
  App Review notes explain that each credit permanently unlocks one user
  in our account system, restored by sign-in or the QR card. Model
  Apple's cut at 30%.
- **Bought elsewhere, used on iOS:** a license bought on the web works in
  the iOS app because the same unlock is also sold in the app (App Review
  Guideline 3.1.3(b), multiplatform). School codes bought by purchase
  order fall under 3.1.3(c) (enterprise).

**DECIDED 2026-09-23:** a free demo user per supporter account for
evaluations (full features, cannot be moved to another device or
shared). **Paid, design next:** progress stats (founder, 2026-09-23).

Scope:
- Relay: a license record per user, written only by a verified Stripe
  or Apple purchase or a code redemption; a server-signed license
  statement the device verifies offline. The license belongs to the
  user, not to the supporter who paid.
- Free limits: 20 live own words (counter from the first add); **the
  user's own device + one supporter** (DECIDED 2026-09-23). Each device
  registers with a role: `own` (not signed in as a supporter) or
  `supporter:<account>`. The relay allows one `own` device (a QR restore
  replaces it) and devices of one supporter account; a second supporter
  gets `upgrade_required` with **Replace**; a supporter unseen for 60
  days frees the spot. Replaces the built one-device cap. The web editor
  opens for the free supporter and for every supporter of a Lifetime
  user. 5 drawings.
- License codes: generate, redeem on one user; 50% off 20+ for schools.
- Speaking never waits on any of it.

Works Test:
1. A free user's 21st own word is refused with the offer; the 20 keep
   speaking offline with the relay down.
2. **The SLP story.** SLP account S builds free user Maya on a laptop and
   emails the QR card. The parent scans it on an iPad that is not signed
   in: the iPad becomes Maya's own device and S stays her supporter. S
   edits on the laptop and on a phone (same account): both allowed, and
   the iPad receives. Parent account P tries to join: refused **by the
   relay** with the offer and **Replace S**. Restoring the card on a new
   iPad replaces the old iPad; S is untouched.
3. Buying on the web for Maya (test mode): Maya's iPad, offline at
   purchase time, unlocks on next connect; P joins; every supporter of
   Maya gets the web editor; her sibling Luna stays free.
4. A forged license statement is rejected on the device.

## Slice 7 — Retention and email

**DONE 2026-09-25.** The 2026-09-23 build covered everything but email
(UserRelay `last_seen`, the daily `retentionSweep`, `idle_delete_at`
on `devices/self` plus boot toast and Parent Corner warning, snapshot
op pruning). This leg added:

- `src/worker/relay.js` — `warnSupporters` mails every supporter of a
  user inside the 6-month window, once per idle streak
  (`warned_for_seen` makes the daily alarm idempotent; a returning
  device resets it). Sends via the `EMAIL` binding (raw-MIME fallback
  for tests), records `warn_outbox` for dev/probe visibility. Also
  `POST internal/remove_supporter` — the account-deletion cascade,
  guarded by `x-pip-internal` = `PIP_INTERNAL_SECRET`
  (`PIP_LICENSE_SECRET` fallback).
- `src/worker/index.js` + `accounts.js` — `DELETE /accounts/:id`
  (session-gated): enumerates the account's `acct_user` rows, cascades
  each user relay (supporter row, tagged devices, pending tokens),
  then `/acct/destroy` clears the account's own rows and
  `/dir/acct/deleted` scrubs map/session/mailbox and revokes its
  pending invites. Cascade failure aborts the delete (502) — a dead
  account never keeps live access.
- `public/shared/account.mjs` + `devices-ui.js` + `index.html` —
  `deleteAccount` and a "Delete account…" control under the signed-in
  state, with a confirm that says exactly what survives.

Works Test: `src/worker/entitlement.test.mjs` — two supporters emailed
once per streak, no daily re-mail, a new streak re-warns.
`src/worker/accounts.heavy.test.mjs` — the full delete on the live
worker: wrong session 403, S's device 403s after, supporter row and
tokens gone, account state empty, P still syncs, license holds, the QR
card restores a fresh device. `check:fast` green.

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
