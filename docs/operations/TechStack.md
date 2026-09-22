# Tech Stack

Status: harness bootstrap slice 1 complete (2026-09-21). Worker ships a health
stub until product routes land. Founder brief → live phase doc is next
(`docs/phases/README.md` § Next).

## Product direction

**PROPOSED.** PipAAC — see `docs/strategy/Vision.md`. No executing product phase
yet; stack choices for media, curriculum, or APIs follow the founder brief.

**DECIDED 2026-09-22** (not built). An iOS App Store app plus the web app in
this repo, sharing one SQLite schema; the iOS build approach is open
(`docs/product/Platforms_iOS_And_Web.md`). Sync relay on Cloudflare Workers,
Durable Objects and R2 is PROPOSED (`docs/product/Sync_And_Web_Editing.md`).

## Current

- Package manager: npm with `package-lock.json`
- Node: see `.nvmrc` (>=20)
- Harness runtime stub: Cloudflare Workers (`wrangler.jsonc`, `src/worker/index.js`)
- Test runner: `scripts/test.sh` + `node --test`
- Closeout gates: `npm run check` / `npm run check:fast`
- Commit handoff queue: `scripts/commit_handoff_queue.py` + `.wmd/commit-queue.jsonl`
- CI: `.github/workflows/check.yml`

## Local setup

```bash
npm ci
bash scripts/install-test-guard.sh   # once per machine; new shell after install
bash scripts/install_commit_queue_watcher.sh   # optional; for Codex handoff watcher
bash scripts/install_dev_slot0.sh    # optional; keeps the founder browse copy alive
```

Verify test guard in a **new** shell:

```bash
bash scripts/check-test-guard-liveness.sh
```

CI prepends `scripts/bin` to `PATH` so the guard-liveness gate can pass without
shell profile changes.

## Commands

| Command | Purpose |
| --- | --- |
| `npm test` | Full unit suite via protected runner |
| `npm run check:fast` | Cheap gates during iteration |
| `npm run check` | Closeout wall |
| `npm run dev` | Founder browse copy at `http://localhost:8787` |
| `npm run dev:agent` | Agent copy on the first free port 8788–8798 |
| `npm run dev:status` | Which local copies are listening |
| `bash scripts/install_dev_slot0.sh` | macOS LaunchAgent so the browse copy comes back if something kills it |
| `scripts/test.sh <paths>` | Targeted proof while iterating |
| `python3 scripts/commit_handoff_queue.py request ...` | Codex commit handoff |

## Local preview

**DECIDED 2026-08-28.** One founder browse copy, always at `http://localhost:8787`.
Agents and other processes start their own copy with `npm run dev:agent`.

- Each copy has its own persist dir and inspector port. **BUILT** (`scripts/dev.mjs:51`)
- `npm run dev` on a live browse copy prints the URL and exits; it does not kill the founder tab. **BUILT** (`scripts/dev.mjs:231-232`)
- Wrangler secrets live in `.dev.vars` (see `.dev.vars.example`).

Once per Mac: `bash scripts/install_dev_slot0.sh` so a SIGTERM on the browse copy comes back.

## Auth / secrets

`.dev.vars` is gitignored. Copy `.dev.vars.example` when Worker secrets are needed.
