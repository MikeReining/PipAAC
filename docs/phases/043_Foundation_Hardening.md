# 043 — Foundation hardening before iOS and new languages

**Status:** PROPOSAL 2026-10-04 — an external stack audit (verbatim in the
handoff message) reviewed the working checkout and returned twelve
findings. Each finding below was re-verified against the code before
landing here; the audit's file references are accurate.

**Built** (deployed, live-verified): **A** `7cbcbc7a`, **B** `a9da05cc`,
**C** `75490527`, **D** (transform freshness), **E** `f27a63d8`,
**F** (Node 24 + portable Chrome + wrangler audit), **G** `e8647ae7`
(locale boundary — the small German *runtime* proof is done;
the ~20-word German vocabulary itself is owed before catalog
translation is scoped), **H** (Unicode masking + privacy page),
**I** `7ec06c95`, **J** `c3cbb6f0` (seams built + typed; the
real-device prototype decision stays **OPEN** — iOS spike before any
iOS phase), **K** — refund/dispute **revokes** the grant (founder
ruling): flag + revoke land in one DO write, re-presented tokens get
`payment_revoked`, `entitled()` consults the relay flag.

**Confirmed on hardware:** E — real-iPad airplane-mode cold launch
speaks on first tap (founder 2026-10-04).

**Remaining:** J's device prototype and the ops-alerting verification
noted under I. Sync follow-up: the supporter-regrant resume gap —
`docs/operations/debugger/SUPPORTER_REGRANT_RESUME.md` (P2, traced, not
reproduced end-to-end). The 2026-10-04 card-rotation slice (durable
device journal + atomic guarded relay replacement + removal
obligations), the delivery-order repair (whole-log ordered re-replay on
a detected violation; probe `scripts/probes/sync_delivery_order.mjs`),
and the retention-destroy coverage (versioned snapshots + proof index)
are committed. Founder confirmed Wrangler authentication restored on
2026-10-05; the retention fix's production deployment still needs proof.
The 2026-10-05 source review reopened delivery-order correctness:
`docs/operations/debugger/SYNC_REPLAY_ANCHOR.md`. Narrow cursor/save/media
fixes and their regressions are in the working tree, untested and
undeployed; verification and commits are delegated by founder request.

**Verdict on the stack:** keep it. Plain JS, SQLite WASM, Workers +
Durable Objects + R2, and the meanings/labels/voices separation are all
sound. No framework migration, no database swap, no rewrite — the work
is reliability, honesty, and boundaries.

**Truth owner:** the behaviors themselves — an iPad that cold-boots
offline and speaks, two devices that converge after a kill mid-sync, a
restored board whose photos and recordings actually play. **Lie-prone
layer:** every finding below is a place where the code's own report
(save "succeeded," cursor "advanced," cache "filled," upload "sent")
can run ahead of the durable fact. Proofs assert against the durable
fact, not the code's narration of it.

## The readiness bar

The foundation is ready for expansion when a real iPad can:

1. cold-launch in airplane mode and speak on the first tap,
2. survive a killed process or failed write without losing the board,
3. reconnect after any absence and converge — no manual refresh,
4. restore a complete board — words, photos, recordings — onto an
   empty second device,

…all under release checks that run identically on a Mac and in CI.

## A — Reliable local saving, visible failures

**Finding.** `bootDb` keeps SQLite in memory and exports the whole DB
to IndexedDB on a debounce + `pagehide`. `getDbBytes` failing reads as
"no saved database" (`.catch(() => null)` → falls back to the fresh
seed), and `flush`'s only failure signal is `console.warn`
(`public/db.js:56-98`). IndexedDB-unavailable runs the board
entirely in-memory with no adult-visible signal. Three lies: silent data
loss presented as a fresh install, a board that looks usable but can't
persist, and no recoverable previous copy if an export is truncated.

**Work.**

- Distinguish the three boot states — *first install*, *loaded save*,
  *save exists but unreadable/corrupt* — with different handling for
  each. A corrupt save must not be overwritten by a fresh seed; keep it
  as a named recovery copy and show the adult a restore path (Settings →
  Backup & privacy already exists as the surface).
- Keep the **previous** export alongside the current one
  (`pip-users`: write `db_prev` before replacing `db`) so a bad write
  or interrupted flush is recoverable.
- Save-failure → `syncHealth`-style surface, not a console warn: reuse
  the honest-status pattern from 031 § 8 (`syncHealth()` in
  `public/shared/sync.mjs`) so "not saving" is visible.
- In-memory fallback (no IndexedDB) states it plainly at boot.

**Proof.** Edits survive an abrupt kill mid-flush (dev harness can
SIGKILL the browser); a poisoned save restores the previous copy and
tells the adult; the in-memory mode is visibly labeled. Upgrade test:
a database exported by an older build boots on current.

## B — One sync recovery flow

**Built.** One recovery flow owns boot, socket reconnect, online and
visibility: paged fetch → decrypt → replay → DB persist → cursor advance
→ flush → media reconciliation. `sync_op.applied` and
`sync_baseline.applied_seq` live in the database; registry coverage never
moves ahead of a failed save. Snapshot restore covers pruned/empty tails,
preserves pending edits and refuses newer formats. Submits serialize and
use 200-op batches; sequence gaps alone are not pruning evidence.
The current contract and call paths belong to
`docs/product/Sync_And_Web_Editing.md` §§ 3–6 and 9.

**Proof.** `src/board/sync_watermark.test.mjs`,
`src/board/sync_snapshot.test.mjs`, `src/board/sync_reliability.test.mjs`,
`src/worker/relay.heavy.test.mjs`. Rotation interruption adds
`src/worker/rotation.test.mjs` and the real local-runtime replacement in
`src/worker/recovery.heavy.test.mjs`. Real iPad process-kill/reconnect
remains hardware proof; synthetic interruptions are not that claim.

## C — Photos and recordings inside the backup promise

**Built.** `syncUploadBlob` stores a sha obligation at `blobq/<user>` in
the device keystore. Recovery reconciles all referenced `blob:` media,
including media created before linking, and drains from local OPFS bytes
or heals a missing local copy from the relay. Queue read/modify/write
serializes within the sync handle. Transient failures retain the
obligation; only ten proven misses (no local copy and relay 404) may drop
an unrecoverable entry. `syncHealth` and the editor status surface failed
or unfinished media separately from operation acknowledgments.

**Proof.** `src/board/sync_reliability.test.mjs` exercises concurrent queue
appends, retry and proven-loss distinctions. A real empty-device restore
with rendered photos and audible recordings, including pre-link and
offline additions, remains a device-level check.

## D — Transforms can't overwrite newer words

**Finding.** `transformAndSpeak` (`speech.js:306-336`) captures the bar,
`fetch`es `/api/v1/transform` with no deadline and no abort, then
`applyTransform`s whatever comes back — regardless of what the bar
holds now. `clear` (board.js:559) and tile taps keep working while
`txBusy` blocks Play, so a slow Groq response can resurrect a cleared
sentence or clobber newly typed words.

**Work.**

- Sentence revision: stamp the request with a monotonically increasing
  `barRev` (bump on every bar mutation); on response, apply only if
  `barRev` is unchanged — otherwise speak nothing/ignore, the newer
  bar owns the bar.
- Bounded wait: `AbortController` + deadline (the sentence-voice path
  already races a deadline — `voice_sentence.mjs:104` — same shape).
  Timeout/abort → existing speak-as-built fallback, never a hang that
  pins `txBusy`.
- `txBusy` clears in `finally` and is re-checked, not trusted, after
  awaits.

**Proof.** A fault-injected delay (stub the Worker route or
`VOICE_SYNTH`-style seam) while clearing, editing, and pressing Play:
verify the words actually spoken, not the transform's intent.

## E — Voice packs swap atomically

**Finding.** `fillVoice` (`sw.js:119-143`) opens the new versioned
cache, deletes the voice's old caches, *then* downloads — with
per-file failures silently skipped. An interrupted fill leaves a
partial new pack and no old one: clips that worked offline stop
working.

**Work.**

- Fill first, delete last: populate `${AUDIO_PREFIX}${voice}-${hash}`
  completely (resume-aware — `cache.match` skip already exists), write
  a completion marker (a sentinel cache entry or the file count), and
  only then prune stale versions. `activate`/`fillVoice` re-enter
  safely after interruption.
- Failed fetches record, not skip-silently: the voice's readiness
  state is queryable (`complete | partial | absent`) — Settings shows
  adults whether the selected voice is ready offline.
- Keep the last *complete* pack until its replacement is complete.

**Proof.** Real-iPad pass (extends 036 § 5): cold launch in airplane
mode → first-tap audio; background/foreground mid-fill; kill the app
mid-update → old pack still serves; audio-route change (speaker →
headphones). Downloaded bytes do not count — audible speech does.

## F — Release checks run on the machines that run them

**Finding.** `.nvmrc` pins Node 20 but tests and catalog scripts import
`node:sqlite` (absent before 22.5, unflagged at 23.4); `engines` says
`>=20 <27` while wrangler ^4.45 wants newer. `speed_probe.mjs:58`
spawns Chrome from a hardcoded `/Applications/…` path — so `npm run
check` (which runs the speed gate) cannot pass on the ubuntu-latest CI
in `check.yml`. The green wall is unrunnable in CI.

**Work.**

- Standardize on Node 24 LTS: `.nvmrc`, `engines`, README/TechStack,
  CI matrix — one version.
- Portable browser resolution in the probe: `CHROME_PATH` env →
  `which chrome|chromium|google-chrome` → known paths; CI installs a
  pinned browser explicitly.
- `npm audit` reported 1 high + 2 moderate in the wrangler dev chain —
  bump wrangler, re-audit, record the result. (Not evidence the
  production Worker is vulnerable; it's a devDep chain.)
- Extend the release gate to cover this phase's proofs: A (abrupt-kill
  save), B (two-device convergence), D (stale transform), E (offline
  speech) as scripted checks where scriptable.

**Proof.** `npm run check` passes on macOS dev and in CI from clean
clones.

## G — The language boundary, before German

**Finding (reproduced).** `labelsFor` (`forms.mjs:265-268`) reads every
`approved` label regardless of language, keyed by sense — adding the
German lemma "Saft" made an *English* profile's lookup return "Saft."
`loadLanguage` (`db.js:134-144`) hardcodes `*.en.json`. There is no
locale key anywhere in labels/forms/prediction.

**Work.**

- Language package as one object: `{ labels, forms, suggest_answers,
  form_answers, transform prompts, voices, search/keyboard }` — per
  `docs/product/Language_And_Voice_Schema.md`. Locale rides the sense/
  label rows, not filenames scattered through loaders.
- `labelsFor` filters by the person's speaking language; cache key
  becomes `{db, lang}`.
- Two language settings stay separate: **supporter UI language** vs
  **the person's speaking language** — the audit's defect exists
  precisely because nothing distinguishes them.
- German lands as a *small* end-to-end vocabulary, not a catalog
  translation.

**Proof.** ~20 German words through the full path — display → forms →
speech → offline → sync — while an English profile on the same device
is untouched. Only after this proof does catalog translation get
scoped.

## H — Privacy copy matches processing

**Finding.** `site/public/slps.html:79` says "The child's sentences
never leave their device." But sentence TTS posts text to
`/api/v1/voice/speak` → ElevenLabs (`voice_sentence.mjs:104`,
`voice.js:114`), and transforms post masked text → Groq. Also
reproduced: `maskNames` uses `\b`, which is ASCII-only — "Ömer" at a
word boundary with a space never matches (`name_shield.mjs:23`), so
non-English names go upstream unmasked. And every site footer links
`/privacy`, which has no `privacy.html` — it 404s.

**Work.**

- Unicode-aware masking: replace `\b` with explicit `(?<![\p{L}\p{N}])…`
  lookaround boundaries (or index-of + boundary check); add a unit test
  with accented/non-Latin names. **Do this before any non-English
  launch — masking is the privacy mechanism, not a nicety.**
- Qualify the claim: sentences are *stored* on the device; grammar help
  and cloud voices process masked/plain text server-side — say which,
  where it's claimed (site, in-app, store listing).
- Ship `site/public/privacy.html`: local history vs encrypted sync vs
  cloud processing, in the FAQ's voice. Apple requires an accessible
  policy URL for submission anyway.

**Proof.** Every privacy sentence on the site traces to a checked-in
mechanism; `/privacy` 200s; masking tests cover `Ömer`, `José`,
multiword names.

## I — Enforceable limits and server recovery

**Finding.** `usageCheck`/`usageRecord` (`voice.js:80-106`) do separate
R2 read → modify → put per request: concurrent requests pass the same
check and clobber each other's increments; `get` failures read as empty
counters (fail-open on the budget).

**Work.**

- Atomic reservations through the existing Durable Object pattern (the
  028 mint ledger is the model): one DO op = check + increment, so
  concurrency can't split them.
- Read failure = conservative answer (deny or count against), never
  "empty."
- Request-size/batch limits, paginated `fetchOps` catch-up, bounded
  provider calls (timeout + retry cap) on `synthesize`.
- Ops alerting on error codes + build ids — failed saves, sync, speech —
  never sentence content. Verify the production dashboard actually
  surfaces these; the audit didn't inspect it.

**Proof.** Parallel-burst test against a dev DO shows the count
reserved once per request and the cap enforced exactly.

## J — Named seams before the iOS shell

**Finding.** Good shared JS exists (`shared/*.mjs`), but storage,
browser APIs, DOM state, licensing, and speech orchestration are
coupled through `board.js`/`speech.js`. Porting those flows to Swift
copies the bugs, not just the features.

**Work.**

- Narrow interfaces first — storage, audio playback, secure keys,
  media blobs, network lifecycle — as modules the browser code
  *already* calls, so iOS swaps implementations, not flows.
- `checkJs`-level typing at those boundaries only (JSDoc + `tsc
  --noEmit` in `check:fast`) — the seams get types; the app stays JS.
- Then a small real-device prototype decides **web shell + native
  capabilities vs native UI** — judged on speech latency, durability,
  accessibility, maintenance. Decide on measurement, not preference.

**Proof.** The seam modules are exercised by the web app (no parallel
iOS fork of logic); the prototype scores against the readiness bar
above.

## K — One entitlement owner for purchases

**Finding.** `handleStripeWebhook` (`stripe.js:256-282`) acts only on
`checkout.session.completed` — everything else gets a 200/ignored.
`checkout.session.async_payment_succeeded` (delayed-payment methods),
`charge.refunded`, and disputes are unhandled: a bank-debit buyer may
never get the grant; a refund never revokes one.

**Work.**

- Handle `async_payment_succeeded` (grant), `payment_failed` (surface
  to buyer), refunds/disputes — **founder ruling 2026-10-04: revoke**.
  The `payment_issue` write drops the grant atomically, a re-presented
  token answers `payment_revoked`, and `entitled()` checks the relay
  flag so a revoked license stops unlocking cloud speech.
- iOS IAP + restore-purchase resolve into the **same** `entitled()`
  model as web codes — one owner (`src/worker/` entitlement path), not
  two entitlement truths.
- Review Apple storefront rules before carrying the web checkout flow
  into the app — regional/product exceptions apply.

**Proof.** Webhook fixture tests per event type; a restore-purchase
flow on the prototype lands an entitlement the existing `entitled()`
gate accepts.

## L — Docs say what ships

**Finding.** Routed docs describe superseded implementations (OPFS vs
the actual IndexedDB export, earlier providers, CI behavior that
doesn't match `check.yml`).

**Work.** As slices A–K land, fold corrections into the owning routed
docs — save/sync/language/entitlement decisions get one home each.
Delete contradicted prose; git history is the archive. No parallel
"architecture overview" doc — fix the routed ones.

## Explicitly out of scope

- Framework/database/provider migrations — the audit found none
  justified and none are proposed.
- Bulk German catalog translation (gated on G's proof).
- Any batch art/voice generation — existing founder-gated laws stand.
- iOS UI work beyond J's prototype.
- Device-TTS fallback — the 036 ruling stands (silence over a wrong
  voice).

## Slice order

| Order | Slice | Gate |
| --- | --- | --- |
| 1 | F — reproducible checks | everything else measures through it |
| 2 | A — reliable saves | data loss is the worst lie |
| 3 | B — sync recovery | family trust |
| 4 | C — media in backup | completes "backed up" |
| 5 | D — transform freshness | cheap, self-contained |
| 6 | E — atomic voice packs | ships with 036's iPad test |
| 7 | H — privacy (masking + copy + policy) | before any non-English launch |
| 8 | I — atomic limits | before wider distribution |
| 9 | G — language boundary, small German proof | before German catalog work |
| 10 | J — seams + iOS prototype | before substantial iOS |
| 11 | K — entitlement owner | before App Store submission |
| 12 | L — doc consolidation | continuous, folded into each slice |
