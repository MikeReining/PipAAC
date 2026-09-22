# SSOT Feature Workflow

Use before planning **any** PipAAC feature, workflow, generated output, schema, API,
prompt, auth, publishing path, or UI state that carries product meaning.

**If user-facing copy, docs, and code disagree, the product is lying.** This workflow exists
to make that impossible.

---

## Product Unit

PipAAC ships trusted workflow slices.

A slice is valuable only when it includes:

- a user-visible claim;
- one truth owner;
- one Works Test or explicit proof waiver;
- generated artifacts updated from the source, if any;
- deletion targets for duplicate truth;
- **copy/code alignment** when the slice touches user-facing instructions.

Example shape:

```text
source input -> authored state -> preview/export/publish result
```

---

## Non-Negotiable Rule

Every semantic rule starts in an owning source of truth.

No durable product, permission, publishing, generated-content, billing, privacy,
or readiness rule may begin life only in:

- UI code;
- prompt prose;
- docs;
- generated artifacts;
- local fixture data;
- runtime heuristics.

**Copy is not exempt.** Onboarding prompts, `AGENTS.md`, and CLI help are product surfaces.
They must trace to a code owner and a CI gate when user-facing.

---

## Copy SSOT (user-facing instructions)

User-facing instructions have **one code owner** and **deterministic drift gates** when
the surface is automated.

| Surface | Truth owner | CI gate |
| --- | --- | --- |
| Agent router | `AGENTS.md` | `lint:doc-citations` + human review |
| Product vocabulary | `docs/product/SSOT.md` | human review + `scripts/health/doc_drift_scan.mjs` |
| Repo conventions | `docs/operations/Contributing.md` | human review |
| Phase / slice scope | owning `docs/phases/*.md` | `lint:phase-freshness` |

### Copy rules

1. **Instructions must work on first try** — if a command is in user-facing copy, it must
   resolve on a typical developer machine.
2. **docs follow code, not the reverse** — update the truth owner first, then docs that
   describe it. Phase docs may record history; they are not user-facing copy owners.
3. **New automated surfaces join the guard list** — when a surface gets a drift scanner,
   register it in `scripts/health/` and wire a gate.

---

## Deterministic Guardrail Rule

Recurring correctness questions should become deterministic checks: schema, type, parser,
lint, fixture, replay, test, script, or CI gate.

Use agents for judgment-heavy work. Do not leave repeatable checks to model judgment once
the rule is known.

### Minimum gates by slice type

| Slice touches | Required before merge |
| --- | --- |
| User-facing copy / onboarding | Truth-owner unit test + surface guard when automated |
| `AGENTS.md` routing | `lint:doc-citations` + `doc_drift_scan.mjs` on routed docs |
| Phase “Complete” | Exit gates include CI commands — **not prose alone** |
| Harness / scripts | `npm test` + `npm run check:fast` during iteration; `npm run check` at closeout |

---

## Planning Order

0. Read `docs/product/Design_Invariants.md` before proposing new platform surfaces.
1. Read `docs/WORKING_RULES.md` and `docs/product/SSOT.md`.
2. Translate founder/user input into a Feature Packet.
3. Identify the trusted workflow slice.
4. Name the truth owner.
5. Name affected data contracts, APIs, routes, prompts, UI surfaces, and generated outputs.
6. **Name copy owners** if users or agents will read instructions.
7. Define the user-visible claim.
8. Define the Works Test: setup, gesture, owner path, output, assertion.
9. Name supporting checks and CI gates.
10. Name deletion targets for duplicate truth.
11. Name proof waiver only when proof cannot be built yet.

If the rule cannot be assigned to an owner, stop and fix the design.

---

## Feature Packet

```text
WorkbookBench Feature Packet

Status: Draft | Blocked | Ready for Implementation

Founder Intent
- Raw request:
- Product value:
- Trusted workflow slice:
- Non-goals:

Current State
- Existing truth owners:
- Existing data/API paths:
- Existing generated outputs:
- Existing UI surfaces:
- Existing tests/proof:

SSOT
- Truth owner:
- Copy owner (if any):
- Lie-prone layers:
- Rejected red flags:
- New/changed semantic rules:
- Duplicate truth to delete:

Implementation
- Data/API impact:
- UI impact:
- Prompt/AI impact:
- Auth/privacy/publishing impact:
- Generated artifact impact:
- CI gates to add or extend:

Proof
- Works Test:
- User gesture:
- Fixture/scenario:
- Exact command:
- Copy guard / drift scan command:
- Missing proof / waiver:

Done When
- User-visible claim:
- Proof:
- CI gates green:
- docs/logs:
- No stale copy in truth owner or routed docs:
```

---

## Ship Checklist (every slice)

Before marking a slice done or a phase “Complete”:

```text
[ ] Truth owner merged
[ ] Works Test command passes locally
[ ] Copy owner updated (if user/agent reads instructions)
[ ] npm test includes new/updated tests
[ ] npm run check:fast clean during iteration
[ ] npm run check green at closeout
[ ] SSOT.md row updated if product fact changed
[ ] Duplicate/stale instructions deleted — not left “for later”
[ ] Phase doc status matches code reality
```

**A phase is not Complete if its deliverable list includes copy/code changes that are
still only in the phase doc.**

---

## Inference Bans

For cross-layer features, add one row per layer junction.

| Junction | Owner | Possible bad inference | Ban | Negative test |
| --- | --- | --- | --- | --- |

The ban should be specific enough to become a test or lint rule.

---

## Stale Doc Prevention

1. **Routed docs only** — `AGENTS.md` routing table points to owners; do not duplicate long
   policy in phase archives.
2. **`doc_drift_scan.mjs`** — fails on missing repo paths and `npm run` scripts cited in docs.
3. **Truth owner tests** — extend the pattern for new copy owners.
4. **Archive honestly** — move superseded phase prose to `docs/archive/`; link only via
   `docs/archive/phases/README.md`.

When dogfood finds lying copy: fix the **truth owner and CI gate first**, then update routed
docs. Never “document the workaround” without deleting the lie.

---

## Related

- Founder input routing: `docs/workflows/SSOT_Founder_Input_Workflow.md`
- Product vocabulary: `docs/product/SSOT.md`
- Design invariants: `docs/product/Design_Invariants.md`
- Execution: `docs/operations/Execution-Playbook.md`
