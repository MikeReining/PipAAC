# Founder Intake: Entity enrichment and model roles

**Intake date:** 2026-09-22.
Source: founder direction in session (LocalFlyers classification pattern
applied to AAC entities; model selection by founder).
Intake workflow: `docs/workflows/SSOT_Founder_Input_Workflow.md`.
Nothing in this file is the truth owner. Routed claims live in the docs named
below.

## Founder intent

1. Adding a custom word asks the adult for nothing a model can infer: name,
   photo, optional hint. No type picker, no pronoun picker, no manual word
   relationships.
2. Semantics come from models, not lookup tables: a multimodal LLM enriches
   each entity once at write time (passively, in the background); Jev ranks
   candidates at read time.
3. The enrichment model is **Muse Spark**, `meta/muse-spark-1.3-contributor`
   (Meta, multimodal), called through the OpenRouter API.
4. Enrichment is never a gate: deferred when offline, abstention valid, the
   entity works without it. It annotates — it does not rewrite the adult's
   facts.

## Product value

An adult adds Cooper with a name and a photo in seconds; the system learns
what Cooper *is* without being asked, and the predictive strip can offer him
in context — online through Jev, offline through the cached enrichment
record.

## Routed decisions

- **DECIDED 2026-09-22** (not built). Entity record and enrichment contract:
  `docs/product/Personal_Entities.md`.
- **DECIDED 2026-09-22** (not built). `entity_enrichment` device table,
  supersede rules, bans: `docs/product/Language_And_Voice_Schema.md` § 6.2b.
- **DECIDED 2026-09-22** (not built). Two-model division and the off-device
  privacy carve-out (enrichment is the sole exception; learner logs never
  leave): `docs/strategy/Dual_Engine_Predictive_Intelligence.md` § 5.1.
- **DECIDED 2026-09-22.** Who owns which judgment — code owns invariants,
  models own semantics, adults own unknowable facts:
  `docs/product/Design_Invariants.md` § 7.
