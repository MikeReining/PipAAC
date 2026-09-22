# Working Rules

## Positioning

PipAAC is its own product. This repo carries the same **dev harness**
as LocalFlyers / Dossy / WorkbookBench (execution playbook, agents, code maintainer,
invariants, gates) so work does not start from scratch.

## Product Boundary

Put durable product truth in `docs/product/`. Put process in `docs/operations/`.
Put live execution scope in `docs/phases/`. `AGENTS.md` routes; it does not
duplicate policy.

## Universal Invariant Boundary

A production validator or acceptance rule is valid only if it generalizes across
the product's source contracts. It must not depend on fixture-specific taste or
one-off examples.

Allowed invariant shapes:

- addressed source and allowed-file boundaries;
- valid schemas, media refs, and links;
- renderer/schema/security constraints;
- source-contract preservation;
- explicit user or project instructions.

Not allowed as invariants:

- one-off golden strings from a single fixture;
- model taste masquerading as product law;
- "looks right" checks without a named owner doc.

Full policy: `docs/product/Design_Invariants.md`.

## Doc archive boundary

`docs/archive/` holds closed phases and retired plans. Live execution only in
`docs/phases/`. Do not leave tombstones in the live index.

## Claim hygiene

Tag durable claims per `docs/operations/Doc_Claim_Taxonomy.md`. Untagged
assertions about how the system works are untrusted by default.
