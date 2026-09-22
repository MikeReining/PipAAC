# Founder Brief: The "Airtable Jump" for AAC

**DECIDED 2026-09-21** (founder input intake).
Source: Founder prompt & Closing The Gap (2015) Crescendo analysis.
Intake workflow: `docs/workflows/SSOT_Founder_Input_Workflow.md`.

---

## 1. Context & Prompt

- Reference article: [4 things every AAC system needs (AssistiveWare)](https://www.assistiveware.com/learn-aac/4-things-every-robust-aac-has)
- Historical artifact: *Proloquo2Go 4.0 Goes Deeper into the Core of Communication with Crescendo* (Closing The Gap, June/July 2015, by Jennifer Marden, David Niemeijer, Anne Verhulp).
- Founder thesis:
  > *"How do we create something better not just cheaper but better without completely just copying and ripping them off. This feels like it's going to be a mixture between like numbers versus Excel or maybe a better example would be Going from Excel to Airtable, you know, like the next jump. Do you see it? Can you picture it? And can you help me get there?"*
  > *"this is the comparison I wanted. Excel going to Airtable was the analogy"*

---

## 2. Founder Input Workflow Summary

- **Founder intent:**
  Create an AAC platform that is fundamentally *better*—not merely a cheaper clone of legacy apps like Proloquo2Go, TouchChat, or LAMP. Execute the paradigm shift analogous to moving from Excel to Airtable: moving from rigid 2D button matrices and folder hierarchies to a relational, multi-view language graph. Ground the product firmly in speech-language pathology science, motor planning research, and clinical best practices.

- **Product value:**
  - Preserves motor automaticity while breaking free of 23 brittle static grid sizes.
  - Eliminates the crushing "customization tax" (hours spent manually adding buttons/folders) that drives 30–50% AAC abandonment.
  - Decouples the underlying language and personal world graph from the surface presentation, allowing multiple views (Motor Grid, Situational River, Visual Scene Displays, and Caregiver Remote Modeling).
  - Delivers universal, cross-platform access via modern local-first web architecture, removing the $250–$300 iOS walled-garden barrier.

- **Trusted workflow slice:**
  Phase 1: Founder Brief $\rightarrow$ Core Vision doc (`docs/strategy/Vision.md`), SSOT update (`docs/product/SSOT.md`), and foundational architecture schema.

- **Current state:**
  Repo has a validated development harness with CI gates (`src/worker/index.js:12-14`). Product specification was open pending this brief.

- **Truth owner:**
  - Strategy & Vision: `docs/strategy/Vision.md`
  - Durable product facts: `docs/product/SSOT.md`
  - Engineering invariants: `docs/product/Design_Invariants.md`

- **Proof scenario:**
  Verification that `docs/strategy/Vision.md` comprehensively details the scientific, clinical, and architectural model, passes citation lint (`scripts/check_doc_citations.mjs`), and is reflected in `docs/product/SSOT.md`.

- **Blocking questions:**
  None. The core thesis and clinical requirements are well-defined.

- **Next slice:**
  Update `docs/strategy/Vision.md` and `docs/product/SSOT.md`.
