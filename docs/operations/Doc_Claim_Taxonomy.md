# Doc claim taxonomy

Agents read routed docs and act on them. A factual sentence about system behavior
must be tagged so readers can tell — mechanically, without judgment — whether it
is verified-true-now, a founder ruling that may be unbuilt, or merely proposed.

**Untagged prose that asserts how the system works is untrusted by default.** Treat
it as narrative until you trace the call path and tag it yourself, or find an
existing tag.

## Tags

| Tag | Meaning | Required proof |
| --- | --- | --- |
| **BUILT** | True against code **right now** | `path/to/file.mjs:line` or a git commit sha in history |
| **DECIDED** | Founder ruling; may be unbuilt | Date (`YYYY-MM-DD`); say explicitly if not built yet |
| **PROPOSED** | Idea or draft spec; nothing promised | None — label as proposed |
| **UNVERIFIED** | Could not confirm from code in this pass | Say so in those words; do not invent confidence |

Use inline: `**BUILT** (`path/to/file.mjs:42`)`, `**DECIDED 2026-08-04** (not built)`,
`**PROPOSED**`, `**UNVERIFIED**`.

## How to verify a BUILT claim

**Never assert system behavior from a grep count or a code comment.** Trace from an
entrypoint and cite the call path.

1. Name the entrypoint (route handler, CLI command, Worker fetch, cron).
2. Follow calls until the behavior is implemented — not where it is mentioned.
3. Cite the implementing line (`file:line`), not a comment or doc that describes it.
4. Grep counts of filenames (e.g. `*.md` in `docs/`) are not evidence of live
   site content format.

## Mechanical citation lint

`scripts/check_doc_citations.mjs` (wired into `npm run check`) fails when a cited
repo path does not exist, a cited line is out of range, or a cited commit sha is
not in git history. Stale citations are a lint failure, not a founder discovery.

Run: `node scripts/check_doc_citations.mjs`

## Related

- `AGENTS.md` § Doc claims (router pointer)
- `AGENTS.md` § Project Laws — *Prefer deterministic checks over recurring agent
  judgment*
- `docs/operations/design-briefs/S5_stop_claiming_unproven_state.md` — UI lie-prone
  layer example
