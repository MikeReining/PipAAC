# Pip AAC — Agent Workflow

Applies to agents, humans, and CI. This file is the router. Put durable policy
in routed docs; add links here, not long prose.

## Default Loop

```text
Read route -> name slice + truth owner + proof -> edit narrowly -> focused proof
-> deslop -> code audit -> log durable lessons -> commit when saving
-> deploy + verify the live surface (always deploy — see Project Laws)
```

No silent WIP: if work stops mid-slice, leave a short status note naming scope,
files touched, proof state, and next action.
→ `docs/operations/Execution-Playbook.md` § Progress Note Format

## First Routing

| Task type | Read first |
| --- | --- |
| New feature, product idea, rough spec | `docs/workflows/SSOT_Founder_Input_Workflow.md` + `docs/workflows/SSOT_Feature_Workflow.md` + `docs/product/Design_Invariants.md` |
| Sprint or phase execution | `docs/phases/README.md` (§ Next + live index) + `docs/operations/Execution-Playbook.md` |
| Bug report or broken workflow | `docs/operations/Debugger.md` |
| Running tests, proof selection, the full wall | `docs/operations/Testing.md` |
| Code cleanup, maintainability, file hygiene | `docs/operations/code-maintainer/SKILL.md` |
| Pre-closeout architecture review | `docs/operations/Code_Audit.md` |
| Hunk-level cleanup after product work | `docs/operations/Deslop.md` |
| ✨ ❓ ⏪ ▶ ⏩ — what the sentence buttons do, gating, demos, copy about them | `docs/product/Sentence_Bar.md` (read before reasoning; never infer outputs) |
| Product vocabulary and durable truths | `docs/product/SSOT.md` |
| Visual design: tokens, tiles, brand marks | `docs/product/Design_System.md` |
| Clipart, tile symbols, framing lenses | `docs/operations/art-generator/SKILL.md` |
| Catalog voice clips, Grok TTS minting | `docs/operations/Grok_Voice_Synthesis_Best_Practices.md` |
| ElevenLabs tile gap-fill, R2 publish | `docs/operations/ElevenLabs_Tile_Minting.md` |
| Default + extra tile voice full-library coverage (plan) | `docs/operations/Catalog_Tile_Voice_Coverage_Plan.md` |
| Tile voice library, on-demand mint of typed words, review page | `docs/phases/028_Tile_Voice_Library.md` |
| Marketing site (pipaac.org), designer/copywriter handoff | `site/README.md` + `docs/phases/035_Marketing_Site.md` |
| Add a word: sheet, new-word card, picture/voice states | `docs/phases/029_Add_A_Word.md` |
| Picture reuse by meaning, drawing once, allowance, calibration | `docs/phases/030_Picture_Finder_And_Drawing.md` |
| Spotlight page, try-it demo, suggested lists | `docs/phases/032_Spotlight_Page.md` |
| Help page, FAQ answers, Help search, Write to us (in-app + site FAQ) | `docs/phases/042_Help.md` |
| Audit hardening: saves, sync recovery, media backup, privacy, iOS readiness | `docs/phases/043_Foundation_Hardening.md` |
| Voice emotion tags, prosody formulas (Eleven sentences § 7; Grok legacy § 2) | `docs/operations/Grok_Voice_Emotional_Prosody.md` |
| Vision, roadmap, monetization | `docs/strategy/Vision.md` + `docs/strategy/Roadmap.md` |
| Stack, commands, local setup | `docs/operations/TechStack.md` |
| Repo conventions | `docs/operations/Contributing.md` |
| Commits, Codex handoff queue, Cursor git automation | `docs/operations/Execution-Playbook.md` § Commits & Codex Commit Handoff |
| Repo layout | `docs/FOLDER_MAP.md` |
| Working rules | `docs/WORKING_RULES.md` |
| Local preview / wrangler / localhost | `docs/operations/TechStack.md` § Local preview |

## Docs

Code is the truth for how the system works. Docs hold intent, decisions, and
the to-do list. Git history is the archive: delete done docs, don't move them.

**Never assert system behavior from a grep count or a code comment. Trace from an
entrypoint and cite the call path.**

## Codex Commit Handoff

Hookless agents (Codex CLI) must not `git add` or `git commit` directly at slice
close. Interactive IDE agents (Cursor, Antigravity) commit directly — see
`docs/operations/Execution-Playbook.md` § Commits & Codex Commit Handoff.

## Project Laws

- **Always deploy. A fix that is not deployed does not count.** Any change
  to a deployed surface (the worker, `public/`, `site/`) — a feature, a fix,
  a copy edit, a one-line import — ends with the deploy and a smoke check of
  production, in the same turn, without being asked. Deploy the app before the
  site when the site links to new app behavior. "Fixed in the working tree" /
  "committed" / "to go live, run X" is a failed handoff. Founder ruling
  2026-10-03: an open design or copy review does not hold a deploy — ship,
  then report what the founder should check. The only things that stop a
  deploy: a missing secret, a destructive step, a paid batch run (batch art /
  bulk voice), or new or replaced shipped voice audio awaiting the founder's
  listen (the audio law below still stands) — name the gate, never a
  checklist. A failing gate (`npm run check`,
  or a browser boot of the changed page) blocks the deploy: fix it first.
  → `docs/operations/Execution-Playbook.md` § Closeout & Human Stops
- Founder/user input is intent, not final authority.
- UI and API responses may render truth; they must not invent durable product truth.
- Prompt prose may request work; it must not be the only owner of semantics.
- Generated output is derived. Change the source, then regenerate.
- Every feature slice needs one owner-visible Works Test or an explicit proof
  waiver.
- **Measure the actual thing, not the system's report of it.** A test that
  asserts what the code says it did is the code grading its own homework — green
  test theater. Assert against an instrument the code cannot influence, or state
  plainly that the claim is unproven.
- Every non-trivial bug fix names the truth owner, lie-prone layer, and missing
  proof before editing.
- Maintenance preserves behavior unless the task is explicitly a bug fix.
- Do not mix broad cleanup into a feature or bug fix.
- Prefer deterministic checks over recurring agent judgment.
- **Trust the agent** on well-packeted work. Fix lying sources and plumbing; do
  not infantilize capable editors with guardrail religion.
- Before proposing platform surfaces (APIs, linters, JSON rules), run
  `docs/product/Design_Invariants.md` and prefer routed docs + live CLI topics
  first.
- **Never run batch art generation without explicit founder approval.** Work in
  **slices of up to ten**: agree the word list and picture plan, then generate
  those ten Muse rolls, then founder review (`docs/operations/art-generator/SKILL.md`
  §6). On 2026-09-24 an agent ran `scripts/art/extended_batch.mjs` unasked
  (~1,950 images, ~3,400 Jev calls) and exhausted the OpenRouter daily budget.
  "Generate the words" means the list.
- **Never replace shipped catalog audio, or bulk-mint (>10 clips), without
  explicit founder approval.** Mint locally, ten clips at most, and wait for a
  listen (`docs/operations/ElevenLabs_Tile_Minting.md`). **Exception (phase
  028, founder 2026-09-29):** the on-demand tile mint path creates new clips
  automatically for authenticated supporters' typed text, within its
  per-license and global budget caps, into the `tile/` namespace only; it never
  edits or replaces an existing clip (replacement is a founder action in the
  review tool). **Default tile voice stays ElevenLabs/human — Grok is
  sentences + optional future extra voices, never a silent swap** (024 §2,
  `Grok_Voice_Synthesis_Best_Practices.md`). Tiles never fall back to device
  TTS.
- Agents preview with `npm run dev:agent`. `npm run dev` is the founder browse
  copy — do not kill it or reuse `.wrangler/slot-0`.
- **When asking the founder to look at a change, always give
  `http://localhost:21087/?reseed`.** Seed installs are once-ever, so a
  running profile never re-seeds — `?reseed` reinstalls built-in group
  seeds at boot and shows the shipped catalog. Plain `/` is for testing
  that family edits stick.
- **Interactive IDE agents commit directly** with `git add <paths>` and
  `git commit`. Hookless agents enqueue per the handoff queue.

## Running Tests

```text
scripts/test.sh <paths>    iterate — lock, wedge detector, process-group reaping
node --test <files>        auto-routed into the above, transparently
npm run check:fast         cheap gates, reports ALL failures
npm run check              closeout wall — all gates, every failure in one pass
scripts/test.sh --heavy    heavy test set; CI may run on every push
```

Binding rules: `docs/operations/Testing.md`.

New shells need the guard: `bash scripts/install-test-guard.sh` (idempotent),
then verify with `bash scripts/check-test-guard-liveness.sh` in a **new** shell.

## High-Risk Stops

Ask before proceeding when the change could affect privacy, credentials,
publishing/destructive actions, billing, regulated health/legal/financial
claims, or user data retention.
