# Pricing, Packaging, and Ethical Monetization

**DECIDED 2026-09-22** (not built).
Intake: `docs/founder/2026-09-22_Customization_Pricing_VoiceCloning.md`.
Fact map: `docs/product/SSOT.md`.
Roadmap: `docs/strategy/Roadmap.md`.

---

## 1. The Core Law: A Voice is Not Rented

**DECIDED 2026-09-22** (not built).
A person's voice is a fundamental human right, not a monthly subscription service. 

Pip AAC establishes a permanent architectural and business invariant:
**Core offline communication functionality will never be locked behind a recurring monthly or annual subscription.**

### Why the Subscription Model Fails in AAC
1. **Ableist Exploitation:** Charging a recurring monthly fee for a non-verbal child or adult to speak forces families into an agonizing dilemma during financial hardship: pay the subscription or silence the child.
2. **The Institutional & Medicaid Lockout:** State assistive technology programs, school districts, and Medicaid/insurance providers fund AAC under Durable Medical Equipment (DME) or one-time educational software grants. By switching to a recurring \$10–\$15/month subscription, AssistiveWare (Proloquo 2022) made their software legally ineligible for state-funded reimbursements, cutting off low-income families.

---

## 2. Packaging Tiers

```text
+-------------------------------------------------------------------------------+
| 1. CORE TIER (Free Forever, Local-First)                                       |
|    - 100% functional AAC communication (offline-always)                       |
|    - Full 677-word core & primary fringe library                              |
|    - Unlimited personal entity additions (Cooper proof)                       |
|    - Device text-to-speech (OS synthesized voices)                            |
|    - Full spatial-vector motor grid & predictive strip                        |
|    - Local storage (SQLite WASM / OPFS)                                       |
+-------------------------------------------------------------------------------+
                                       |
                                       v
+-------------------------------------------------------------------------------+
| 2. PIP LIFETIME (One-Time Family / Individual License)                        |
|    - Flat, single-purchase license (zero recurring fees)                       |
|    - Medicaid, insurance, and state assistive-technology grant eligible       |
|    - Encrypted multi-device Cloudflare edge sync & automated backup            |
|    - Caregiver Co-Pilot real-time modeling surface                            |
|    - Unlimited desktop/browser remote vocabulary editing                      |
+-------------------------------------------------------------------------------+
                                       |
                                       v
+-------------------------------------------------------------------------------+
| 3. CLOUD AI & VOICE PASSTHROUGH (Optional Usage-Based Add-on)                 |
|    - Transparent passthrough for real third-party API compute costs           |
|    - ElevenLabs instant voice cloning (e.g. Mom's voice / SLP voice)          |
|    - Vision-multimodal entity auto-enrichment (Muse Spark via OpenRouter)     |
|    - Purchased as one-off credit packs — never a gate on speaking offline     |
+-------------------------------------------------------------------------------+
```

---

## 3. Invariants & Bans

| Invariant | Enforcement |
| --- | --- |
| Core board speaks offline with zero payment | Works Test: fresh install speaks all 677 catalog words and personal entities without an account or network. |
| No time-bomb expiration | The app never disables speech or locks vocabulary after a 30-day trial period. |
| Zero loss upon cloud disconnection | If cloud sync or credits expire, the local database remains 100% intact, readable, and speakable. |
