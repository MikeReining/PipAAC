# Phases

Live product work only. Every phase doc lands in exactly one place:

| Question | Destination |
| --- | --- |
| Not executing (never decided or on hold) | [`docs/backlog/`](../backlog/README.md) |
| Discharged (built or dropped) | Deleted — git history is the archive |
| Executing | **here** — named in § Next or the live index below |

**This README is a queue, not an encyclopedia.** Status detail lives in each phase doc's banner. Sequence map: `docs/strategy/Roadmap.md`.

## Next

One critical path. Replace this table when the literal next slice changes — do not append.

| Priority | Next slice | Doc |
| --- | --- | --- |
| **P1** | 044 A0 — device tests on the base A16 iPad: shared JavaScript core in JavaScriptCore, crypto + passkey interop, tap to sound; founder admin list (§ 3) in parallel | `docs/phases/044_Native_iOS_App.md` |
| **P2** | 027 founder review — seed curation on `public/preview-blocks.html`, then the CHILDES starter table on the founder's machine (both listed at the end of 027); the phase retires after | `docs/phases/027_Occasion_Boards.md` |
| **P3** | User-testing readiness — `app.pipaac.org` is live (deployed 2026-10-01); remaining: the first-open people question | `docs/phases/019_User_Testing_Readiness.md` |
| **P4** | 010 slice 2 — the art (review page built; generation gated on founder, one image at a time) | `docs/phases/010_Extended_Picture_Library.md` |

## Live index

Executing phases only. Each row names the **next** slice.

| Phase | Next slice |
| --- | --- |
| [005 — Word Forms](../backlog/005_Word_Forms.md) | Held 2026-10-04 — waits on the founder's past-tense ruling |
| [007 — Occasions](../backlog/007_Occasions.md) | Held 2026-10-04 — optional experiment, never started |
| [008 — Partner Listening](../backlog/008_Partner_Listening.md) | Held 2026-09-24 (017 R20: no listening) |
| [009 — Word Library and customization](009_Word_Library_And_Customize.md) | Slice 10 — suggested words (blocked on 008 slice 3; 008 held 2026-09-24); slice 5 is post-launch |
| [010 — Extended picture library](010_Extended_Picture_Library.md) | Slice 1 done 2026-09-26 (4,000-entry JSON + 170-word everyday-gaps list, data only). Slice 2 — the art: review page built, generation waits on founder approval |
| [014 — Grid density and individual fit](014_Grid_Density_And_Fit.md) | Slices 1–5, 7, 9–11 built. Remaining: slice 6 message tiles (waits on 010's phrase list), slice 8 keyguard (later). Nothing unblocked — the phase idles until 010 slice 1 lands |
| [015 — Accounts and one price](015_Accounts_And_One_Price.md) | Slices 1–5 and 7 built (through supporter email warnings + account deletion). Slice 6 web leg built 2026-10-02 (Stripe checkout + webhook, license codes) — owed: live Stripe wiring/secrets, free-limit gates, iOS IAP (044 F) |
| [017 — Prediction you can prove](017_Prediction_Hardening.md) | Re-planned 2026-09-24 (R16–R19): real children are the scoreboard. Items 1–4 and 6 done; step-28 items 1–4 built (WPM quartiles, per-path timings, Jev-timing experiment, wrong-pick count — `predictionReport.speed`, whitelisted payload fields). Holdback **deferred — not authorized** (founder, 2026-09-24); step-28 item 6 (calibration) waits on real totals; steps 15 and 18 parked. Open: step 26 flywheel (decided, unbuilt) |
| [019 — User-testing readiness](019_User_Testing_Readiness.md) | Deployed 2026-10-01: `https://app.pipaac.org` (custom domain + Email Sending + prod secrets). Local board paints and speaks, including a board saved before the v2 map. The first-open question now lands the 009 slice-11 world pass |
| [022 — Whose and how many](022_Whose_And_How_Many.md) | Code done 2026-09-26 (1464e4c): whose/plurals/EOS ship, three never-show-a-mistake rulings landed (own-word plural spelling, same-length pooling, caregiver plural use). Remaining: shipped catalog.json waits on the Ara word-form clips (144 uncovered, `forms_audio.json`) |
| [023 — Transform buttons](023_Transform_Buttons.md) | Proof of concept proven 2026-09-25 (Groq qwen3.8-27b, temperature 0, short prompts). Top bar previewed (⏪ ▶ ⏩ ✨ ❓), not wired; § 5 lists what's open before building |
| [024 — Sentence TTS and audio cache](024_Sentence_TTS_And_Audio_Cache.md) | Slices 1–3 landed 2026-09-26: Worker endpoint (shared R2 cache, fair use, no ids upstream), client Tier-1 + ~300 ms clip fallback, transform buttons speak through it. Next: slice 4 clip re-mint — paid, founder-gated at ≤10/batch |
| [025 — Expressive voice](025_Expressive_Voice.md) | Slices 1–4 landed 2026-09-26: happy/sad/angry faces in the last strip slot (designer icons), Worker-side prosody, feeling-keyed caches, lit-face suggestion, Expressive voice setting. Next: § 8 listen — paid, founder-gated |
| [026 — Topic groups](026_Topic_Groups.md) | Slice 1 compiled with 027 A1 (live seed, capacity-checked; splits await founder review). Next: slice 2 topic door icons, slice 3 neutral noun frame |
| [027 — Occasion boards and independent editing](027_Occasion_Boards.md) | Built 2026-09-28 (A1–A4, Works Test 12/12 on an agent slot). Waiting on the founder: seed curation review and the CHILDES starter table |
| [028 — Tile voice library](028_Tile_Voice_Library.md) | **Core shipped 2026-09-29.** Slices 0–5 + slice-7 free half: mint core + ledger DO (`ae16407`), client playback + triggers (`547c5f7`), review page (`ac0678e`), flag + sweep (`c8134e3`), reconcile (`bcd3d60`), catalog seed + missing-object fix (`b412844`, `f140b39`). Deployed to prod with secrets. Next: Leo + extended seed — founder-gated on cost; slice 8 waits on 010 |
| [029 — Add a word](029_Add_A_Word.md) | Slices A–D built 2026-09-29 (sheet, card pictures/kind/voice, paste). Next: slice E stopwatch on a real tablet — after the founder saves the 030 cutoff and approves a live draw run |
| [030 — Picture Finder and drawing](030_Picture_Finder_And_Drawing.md) | Slices 1–7 built; open = founder calibration save, slice-4 live run (≤10, founder-approved), and Works Tests 11 and 13 |
| [031 — The editor, rebuilt](031_Board_Editor.md) | Slices A–G built 2026-09-29. Open: Works Test 1 (first-timer stopwatch) and a real-tablet pass of the narrow layout |
| [032 — Spotlight gets its own page](032_Spotlight_Page.md) | A–C built 2026-09-29, E (moves: ✨ / ❓ targets, Try it ✨, Progress counts) 2026-09-30 — founder review; D held until then |
| [035 — Marketing site](035_Marketing_Site.md) | Slice A skeleton built 2026-10-02 (`site/` — separate `pipaac-site` project). Next: designer/copywriter pass; first `deploy:site` |
| [044 — Native iOS app](044_Native_iOS_App.md) | Approved 2026-10-06, revised same day (shared JS core, iOS 26 + A16 iPad floor, iPad-only 1.0); implementation not started. Next: A0 device tests |

## Proposals awaiting review

| Proposal | Ask |
| --- | --- |
| [036 — Works offline](036_Offline_Support.md) | **Deployed 2026-10-03** — `sw.js` + generated precache (3,522 files, 70.0 MB) live; offline probe passes against the deployed origin. Open: real-iPad Works Test — the claim is already live on pipaac.org |
| [038 — Sentence bar settings](038_Sentence_Bar_Settings.md) | Built 2026-10-03: per-person choice of which sentence buttons show under Settings → Talking (`bar_controls`, synced); Play grows into freed space. Open: licensed-default question in § 7 |
| [040 — Trial and the Lifetime page](040_Trial_And_Upgrade_Page.md) | Built 2026-10-04: 7-day trial replaces 039's pool (`trial.mjs`, one `entitled()` gate); the Lifetime page tops Settings; Buy is a no-account code checkout that auto-redeems in-app; site audited to the § 3 table. Owed: founder sign-off on page/toast strings + a listen of `demo-sentence`, then `--ship` + deploy + Works Test |
| [042 — Help](042_Help.md) | **Deployed 2026-10-04**: Help page in Settings, one search by meaning over answers + Settings rows (37/39 probe), Write to us → hello@pipaac.org, site FAQ generated from the same answers with search. Open: founder read of "Is this normal?" + inbox check of the smoke message |
| [034 — Leave the panned document after the welcome](034_Welcome_Page.md) | Reviewed; ready to build: `location.replace` after Continue + one-shot tour flag |
| [043 — Foundation hardening](043_Foundation_Hardening.md) | Foundation slices built. Native architecture decided 2026-10-06; device proof continues in 044. Open: ops-alerting verification; sync delivery-order repair and versioned-backup cleanup. Resumable rotation is implemented in the working tree; testing, commit and deployment handed to the other developer (founder, 2026-10-04). |

The language and voice schema was accepted 2026-09-22 and moved to
`docs/product/Language_And_Voice_Schema.md` (amendments in its § 12).
