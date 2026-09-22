# Vocabulary Masking, Safety & Accidental Deletion Defense

**DECIDED 2026-09-22** (not built).
Intake: `docs/founder/2026-09-22_Customization_Pricing_VoiceCloning.md`.
Truth owners: `docs/product/Personal_Entities.md`, `docs/product/Motor_Grid_And_Art.md`, `docs/product/Core_Coordinate_Map.md`.

---

## 1. The Principle: Parental Agency Meets Motor Invariance

AssistiveWare's Proloquo (2022) provoked widespread parent backlash by hardcoding words like "shut up" and adult terms, refusing to allow caregivers to hide or disable them under the dogmatic claim that *"no language should ever be restricted to children."*

Pip AAC rejects this paternalism:
* **The parent and clinician decide** what language is developmentally and socially appropriate for their learner at home and at school.
* **Motor automaticity must not be sacrificed:** When a word is masked or hidden, **surrounding cells never shift or collapse**. 

---

## 2. Vocabulary Masking (Cell Blanking)

**DECIDED 2026-09-22** (not built).

```text
+------------------------------------+       +------------------------------------+
|  [ I ]   [ want ]   [ eat ]   [ go ] |       |  [ I ]   [ want ]   [ eat ]   [ go ] |
|  [ you]  [ help ]   [ stop]   [more] | ----> |  [ you]  [ help ]   [     ]   [more] |
|  [ play] [ like ]   [ no  ]   [yes ] |       |  [ play] [ like ]   [ no  ]   [yes ] |
+------------------------------------+       +------------------------------------+
       Standard Unmasked Grid                       Word "stop" Masked (Cell Blanked)
                                                    Surrounding coordinates stay locked!
```

### The Masking Rules
1. **The Ghost Cell Standard:** Masking a cell sets its visible status to `masked`. The cell renders as a quiet, unobtrusive blank background tile. It cannot be tapped or vocalized.
2. **Zero Coordinate Shift:** The cell's spatial coordinate `(col, row)` remains allocated to that word. Other buttons never move into the empty space. Motor memory vectors for all surrounding words are 100% preserved.
3. **Strip & Search Exclusion:** A masked word is automatically excluded from the predictive strip and keyboard search suggestions.
4. **Unmasking:** Caregivers can unmask words in seconds from the Parent Corner as the child matures or when clinical readiness dictates.

---

## 3. Accidental Deletion Defense & Parent Corner Gating

### 3.1 Gating: Native Biometrics (WebAuthn) + PIN
To prevent communicators (who frequently stim or rapidly tap the screen) from accidentally entering administrative settings:
1. **Native Biometrics:** Uses the browser's standard WebAuthn API (`navigator.credentials.get()`) to offer instantaneous **Face ID / Touch ID** verification on supported devices (iPad, iPhone, Mac, Android, Windows Hello).
2. **Fallback PIN:** A user-selected 4-digit PIN stored securely in the local SQLite database.
3. **Zero Visual Clutter on Board:** The Parent Corner trigger is a discreet, subtle gear icon anchored in the top corner requiring a deliberate 2-second long-press before challenging for biometrics/PIN.

### 3.2 Non-Destructive Storage: "Retire, Never Delete"
In accordance with [`docs/product/Language_And_Voice_Schema.md:24`](file:///Users/mike/dev/PipAAC/docs/product/Language_And_Voice_Schema.md#L24):
* **No hard deletes:** When a parent or child removes a custom entity (e.g. a pet or classmate), the row's `status` column in SQLite is set to `'retired'`, recording `retired_at` timestamp.
* **The Trash / Restore Bin:** The Parent Corner contains a "Recently Deleted / Retired" view where any removed word or entity can be restored in one tap with all historical photos, hints, and voice associations intact.
* **Undo Toast:** Any edit or removal immediately shows a 10-second persistent "Undo" toast at the bottom of the screen.

---

## 4. Invariants & Bans

| Invariant | Test Proof |
| --- | --- |
| Masking does not alter coordinate map | Snapshot coordinates before masking a core cell; verify all remaining cell coordinates are byte-for-byte identical. |
| Masked cell emits no speech | Programmatic tap event on a masked cell produces 0 audio and appends 0 words to the sentence bar. |
| Accidental delete is restorable | Retire an entity, verify it is hidden from the grid, execute restore from trash, verify entity reappears in original category. |
