# Vocabulary Masking, Safety & Accidental Deletion Defense

**DECIDED 2026-09-22** (not built).
Intake: `docs/founder/2026-09-22_Customization_Pricing_VoiceCloning.md`.
Truth owners: `docs/product/Personal_Entities.md`, `docs/product/Motor_Grid_And_Art.md`, `docs/product/Core_Coordinate_Map.md`.

---

## Group removal is not global hiding

**DECIDED 2026-09-27; BUILT 2026-09-28 (027).** Remove from [group] removes only that
membership and its layout positions; it never masks or retires a word. An
active word with no group placements remains in the Library and keyboard
lookup. Global Hide/retire stays a separate word-card action. The group editor
must not use global masking as a substitute for removing a built-in placement.

## 1. The Principle: Parental Agency Meets Motor Invariance

AssistiveWare's Proloquo (2022) provoked widespread parent backlash by hardcoding words like "shut up" and adult terms, refusing to allow caregivers to hide or disable them under the dogmatic claim that *"no language should ever be restricted to children."*

Pip AAC rejects this paternalism:
* **The parent and clinician decide** what language is developmentally and socially appropriate for their learner at home and at school.
* **Motor automaticity must not be sacrificed:** When a word is masked or hidden, **surrounding cells never shift or collapse**. 

---

## 2. Vocabulary Masking (Cell Blanking)

**BUILT** (009 slice 9) — `sense_mask` (`docs/product/Language_And_Voice_Schema.md`
§ 14.4); ghost cells in `public/board.js` `renderGrid`/`itemCell`; funnel
exclusions in `public/shared/funnel.mjs` `stripScored`/`keyboardContinuations`;
the word card's Hide/Show (`wc-hide`). Works Test: `src/board/mask.test.mjs`
+ `scripts/probes/mask_probe.mjs`.

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
1. **The Ghost Cell Standard:** Masking a cell sets its visible status to `masked`. To the child the cell is indistinguishable from an unallocated slot — a blank placeholder: no label, no picture, no tap, no speech. **Edit mode is where the ghost lives:** the adult sees the muted tile ("this spot is taken"), taps it to open the word card, and drags it like any placed word — Hide/Show is one tap on the card.
2. **Zero Coordinate Shift:** The cell's spatial coordinate `(col, row)` remains allocated to that word. Other buttons never move into the empty space. Motor memory vectors for all surrounding words are 100% preserved.
3. **Strip & Search Exclusion:** A masked word is automatically excluded from the predictive strip, keyboard search suggestions, and the group Replace picker (`notInGroupItems`) — a hidden word is never offered for a new seat.
4. **Unmasking:** Caregivers can unmask words in seconds — the ghost's card in the editor (Show word), or from the Parent Corner — as the child matures or when clinical readiness dictates.

---

## 3. Accidental Deletion Defense & Parent Corner Gating

### 3.1 Gating: Native Biometrics (WebAuthn) + PIN
To prevent communicators (who frequently stim or rapidly tap the screen) from accidentally entering administrative settings:
1. **Native Biometrics:** Uses the browser's standard WebAuthn API (`navigator.credentials.get()`) to offer instantaneous **Face ID / Touch ID** verification on supported devices (iPad, iPhone, Mac, Android, Windows Hello).
   On the iOS app this is the platform's own Face ID / Touch ID (`docs/product/Platforms_iOS_And_Web.md` § 2); WebAuthn is the web path.
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
| Masked cell shows and emits nothing | The child's render of a masked cell equals an unallocated cell (blank, `aria-hidden`); a programmatic tap produces 0 audio and appends 0 words to the sentence bar. |
| The ghost is adult-facing | In the editor the masked cell renders muted, opens the word card on tap (Show word), and keeps its seat as a drop target like any placed word. |
| Accidental delete is restorable | Retire an entity, verify it is hidden from the grid, execute restore from trash, verify entity reappears in original category. |
