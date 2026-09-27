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
| **P1** | User-testing readiness — local board paints and speaks; next is a shareable URL (deploy, stop/ask) and the first-open people question | `docs/phases/019_User_Testing_Readiness.md` |
| **P2** | 010 slice 2 — the art (review page built; generation gated on founder, one image at a time). Slice 1 word list landed: `data/extended_lexicon.json` + `everyday_gaps.en.json` | `docs/phases/010_Extended_Picture_Library.md` |

## Live index

Executing phases only. Each row names the **next** slice.

| Phase | Next slice |
| --- | --- |
| [005 — Word Forms](005_Word_Forms.md) | Present tense moved to 021 (2026-09-25); the rest waits on the past-tense conversation |
| [007 — Occasions](007_Occasions.md) | Slice 1 — the breakfast experiment (no app code; can run any time) |
| [008 — Partner Listening](../backlog/008_Partner_Listening.md) | Held 2026-09-24 (017 R20: no listening) |
| [009 — Word Library and customization](009_Word_Library_And_Customize.md) | Slice 10 — suggested words (blocked on 008 slice 3; 008 held 2026-09-24); slice 5 is post-launch |
| [010 — Extended picture library](010_Extended_Picture_Library.md) | Slice 1 done 2026-09-26 (4,000-entry JSON + 170-word everyday-gaps list, data only). Slice 2 — the art: review page built, generation waits on founder approval |
| [011 — Sync and web editing](011_Sync_And_Web_Editing.md) | Code-complete. Slice 9 moved to 015 slices 6–7; its relay legs (device cap, restore-move, retention sweep, dev license) are built there |
| [014 — Grid density and individual fit](014_Grid_Density_And_Fit.md) | Slices 1–5, 7, 9–11 built. Remaining: slice 6 message tiles (waits on 010's phrase list), slice 8 keyguard (later). Nothing unblocked — the phase idles until 010 slice 1 lands |
| [015 — Accounts and one price](015_Accounts_And_One_Price.md) | Slices 1–5 and 7 built (through supporter email warnings + account deletion). Slice 6 payments **deferred** (founder, 2026-09-23) — the phase stays live until billing lands or is discharged |
| [017 — Prediction you can prove](017_Prediction_Hardening.md) | Re-planned 2026-09-24 (R16–R19): real children are the scoreboard. Items 1–4 and 6 done; step-28 items 1–4 built (WPM quartiles, per-path timings, Jev-timing experiment, wrong-pick count — `predictionReport.speed`, whitelisted payload fields). Holdback **deferred — not authorized** (founder, 2026-09-24); step-28 item 6 (calibration) waits on real totals; steps 15 and 18 parked. Open: step 26 flywheel (decided, unbuilt) |
| [018 — Core board v2 and groups](018_Core_Board_V2_And_Groups.md) | All six decided slices done — v2 `grid60` + Purple, `grid90`/`grid15` re-laid, setup's people seated, groups re-ordered + doors + glow + banded layout, kind-colored personal words, home-board edit (📊 counts + placement sheet). Open items only |
| [019 — User-testing readiness](019_User_Testing_Readiness.md) | Local board paints and speaks, including a board saved before the v2 map. Next: deploy (stop/ask), then the first-open people question |
| [020 — Prediction data fix](020_Prediction_Data_Fix.md) | Done 2026-09-25 (`b57f600`); follow-up in 020B |
| [020B — Converter fixes](020B_Converter_Fixes.md) | Done 2026-09-25 (`6314581`); baby-talk spellings follow in 021 step 0 |
| [022 — Whose and how many](022_Whose_And_How_Many.md) | Code done 2026-09-26 (1464e4c): whose/plurals/EOS ship, three never-show-a-mistake rulings landed (own-word plural spelling, same-length pooling, caregiver plural use). Remaining: shipped catalog.json waits on the Ara word-form clips (144 uncovered, `forms_audio.json`) |
| [023 — Transform buttons](023_Transform_Buttons.md) | Proof of concept proven 2026-09-25 (Groq qwen3.8-27b, temperature 0, short prompts). Top bar previewed (⏪ ▶ ⏩ ✨ ❓), not wired; § 5 lists what's open before building |
| [024 — Sentence TTS and audio cache](024_Sentence_TTS_And_Audio_Cache.md) | Slices 1–3 landed 2026-09-26: Worker endpoint (shared R2 cache, fair use, no ids upstream), client Tier-1 + ~300 ms clip fallback, transform buttons speak through it. Next: slice 4 clip re-mint — paid, founder-gated at ≤10/batch |
| [025 — Expressive voice](025_Expressive_Voice.md) | Slices 1–4 landed 2026-09-26: happy/sad/angry faces in the last strip slot (designer icons), Worker-side prosody, feeling-keyed caches, lit-face suggestion, Expressive voice setting. Next: § 8 listen — paid, founder-gated |
| [026 — Topic groups](026_Topic_Groups.md) | Decided 2026-09-26; mapping proposed in `data/group_seed.topics.json`, waits on the founder's mark-up (`public/preview-groups.html`). Then slice 1 — builder (`word#slot`, `layouts`, reachability on every layout) |

The language and voice schema was accepted 2026-09-22 and moved to
`docs/product/Language_And_Voice_Schema.md` (amendments in its § 12).
