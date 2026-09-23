# Founder Intake: iPhone support

**Intake date:** 2026-09-22.
Source: founder brainstorm on how the `grid60` core board translates to the
iPhone, then a competitor and research pass.
Intake workflow: `docs/workflows/SSOT_Founder_Input_Workflow.md`.

**Status: PROPOSED.** The founder agreed with every recommendation below as
**preliminary** direction on 2026-09-22. None of it is final or built.
Nothing in this file is a truth owner. When a ruling is made, route it to
the owning doc (§ 7).

## Founder intent

1. Support users with special needs who have an iPhone.
2. Don't make a user relearn where the words are. Sentences read left to right
   on the iPad; a phone layout that reads top to bottom is not intuitive.
3. On the phone, focus on getting started with a few key words, then
   keyboards, occasions, and very good predictions based on time, place and
   what the user usually says.
4. Landscape could show the exact layout the user already knows. Portrait
   could show only the most useful items.
5. Study the competition and follow a proven standard where one exists. Find
   what sets us apart.

## 1. What the competition does

| App | iPhone approach |
| --- | --- |
| LAMP Words for Life | Same 84-button grid as the iPad, same positions. The maker says buttons are "about the size of a push pin." iPad recommended for beginners, keyguard users, head tracking and low vision. iPhone recommended for fluent users, partners modeling, backup, and teens and young adults. |
| Speak for Yourself | Same 120-button grid on the iPhone since 2016. The maker's argument: buttons are still twice the size of keyboard keys. |
| TD Snap Core First | Grid sizes from 1×1 to 8×10. Custom topics carry across sizes. |
| Proloquo2Go | 23 grid sizes, 9 to 144 buttons. Fewer buttons means more navigation to reach the same words. |
| Proloquo | One fixed grid: 48 symbol buttons plus 12 text-only buttons. AssistiveWare found "no clear correlation between grid size and the average number of daily words spoken." |
| Spoken | Built around prediction, for teens and adults who can read. Uses location (restaurant, hospital) and learns how the user talks. No core board. About 300k users. |
| TouchChat | Tilt the phone and the message fills the screen in large text, for silent or noisy places. |
| Proloquo Coach | Companion app on the parent's phone that teaches modeling. It does not mirror the child's board. |

### What the evidence says

1. **The proven standard is the same grid on a smaller screen.** The
   motor-planning leaders (LAMP, Speak for Yourself) keep every position
   the same on the phone. No one asks a user to relearn locations.
2. **60 cells is not a lot for a phone.** LAMP fits 84 buttons and Speak for
   Yourself fits 120 in the same space. `grid60` has fewer cells, so its
   tiles are bigger than theirs.
3. **The accepted division of labor:** beginners and users with motor
   impairments learn on the iPad. The phone serves fluent users, backup,
   modeling, and teens and adults who want something discreet.
4. **Two warnings about prediction.**
   - Suggestions that rearrange the grid hurt, "like keys on a keyboard
     moving around" (Zastudil et al., ASSETS '24).
   - Saving keystrokes does not reliably raise communication rate, because
     choosing among suggestions adds thinking.

   Prediction pays off for users who can read. For beginners it has to add
   to the fixed board, never replace it.

## 2. First principle: tile size follows the hands

The size a person can reliably hit depends on their hands, not on the
device. **UNVERIFIED** estimates for an iPhone 16 (393×852 pt), after the
sentence bar, the strip, and the safe areas. Measure on a real device
before any ruling.

| Layout on the phone | Tile size | Verdict |
| --- | --- | --- |
| `grid60`, portrait (10 across) | ~36 pt | Too small. Below Apple's 44 pt minimum. |
| `grid60`, landscape, full chrome | ~78×47 pt | Fits. Bigger than LAMP and Speak for Yourself on the same phone. |
| `grid60` on an 11-inch iPad, landscape | ~100 pt | Reference (`docs/product/Core_Coordinate_Map.md` § 1). |

Rotating `grid60` so it fits in portrait (sectors as horizontal bands) was
considered and **rejected**. It makes the user learn a second set of
positions and turns left-to-right sentence building into top-to-bottom.

## 3. Recommendation

### 3.1 Landscape: the exact `grid60`

**PROPOSED.** The phone in landscape shows the same `grid60` as the iPad:
same cells, same slots, same left-to-right sentence building, so there is
nothing to relearn. This follows the industry standard.

The phone work is fitting everything into the short screen height: the
sentence bar, the predictive strip, and hiding extra controls. The strip
still never collapses and never moves the grid
(`docs/product/Motor_Grid_And_Art.md` § 2).

### 3.2 Portrait: pocket mode, not a second grid

**PROPOSED.** Portrait is a different tool, not a smaller board:

- The sentence bar, a larger predictive strip, and a keyboard or saved
  phrases and occasions.
- **The regulator column pinned to the right edge, in the same top-to-bottom
  order as on the iPad:** yes · no · stop · help · hurt · please
  (`docs/product/Core_Grid_Membership.md` § 3). The most urgent words keep
  the same position in every orientation.
- Rotating to landscape brings back the full board.

Pocket mode is where prediction leads. It serves the users who pick a phone
anyway: literate teens and adults. It does not compete with the motor plan.

### 3.3 Be honest about who the phone is for

**PROPOSED.** For a beginner with motor impairments, the iPad is the main
device and the phone is a companion. LAMP says this openly, and it builds
trust with SLPs. Pip should say it in onboarding and marketing.

## 4. Where Pip can win

1. **Real sync between devices.** LAMP makes users save vocabulary files
   under different names on each device, because they don't sync. The
   phone should be another paired device under the sync design
   (`docs/product/Sync_And_Web_Editing.md`): one board on the iPad and the
   iPhone, with the same words, groups, people and voices.
2. **The parent's phone lights up the child's iPad.** Parents are taught to
   model on the same system the child uses. A parent taps `want` on their
   phone and that same cell lights up on the child's iPad. The child sees
   modeling from across the room, on their own layout. No competitor seen
   does this. Sync today is designed for edits, not live events, so this
   needs a real-time channel. That is a new network and privacy surface.
3. **Speak urgent words without unlocking.** `hurt`, `help` and `stop` from
   a Lock Screen widget, the Action button, or Back Tap, in the user's own
   voice. Apple's Live Speech does something close, but with a generic
   voice and no core words.
4. **Predictions based on time, place and habit, done safely.** Suggestions
   come from what this user actually said in similar situations. They only
   ever appear in the strip. Picking a suggestion that is not on the board
   shows where the word lives, the way the Groups "Show me where" path
   already does (`docs/product/Motor_Grid_And_Art.md` § 1). Spoken predicts
   but has no board; the board apps barely predict. Pip does both.
   - Time and habit already live on the device: **BUILT** time-of-day
     signal (`public/shared/funnel.mjs:80`), with the rulings in
     `docs/founder/2026-09-22_Prediction_Blend_Privacy_Listening.md`.
     Occasions are phase 007.
   - **Location is new.** It is a privacy decision (§ 6).
5. **Phone basics.** Tilt to show the message in large text, a volume
   boost, and quick switching to a Bluetooth speaker.

## 5. Risks and unknowns

- **Tile size in landscape** is an estimate (§ 2). If the height budget
  forces tiles under ~44 pt tall, landscape needs a narrower strip or
  sentence bar, not fewer cells.
- **Keyguards.** LAMP lists keyguards as unavailable on the iPhone. Users
  who need one stay on the iPad.
- **Speaker volume.** Phone speakers are quieter than an iPad's. Speak for
  Yourself named this as a reason it first skipped the iPhone.
- **Home-indicator swipes** near the bottom edge. Guided Access is the usual
  answer. Test it with pocket mode.
- **iOS build path** is still open (`docs/product/Platforms_iOS_And_Web.md`
  § 3). This proposal does not depend on the answer.

## 6. Blocking questions

1. **Location for predictions** (`AGENTS.md` § High-Risk Stops: privacy).
   Proposed default: on-device only, off until turned on, set by the parent
   in the Parent Corner. Needs a founder ruling before any build.
2. **Portrait has no full core grid.** Is that acceptable at launch, with
   the regulator column as the only core cells in portrait?
3. **Live modeling from the parent's phone** needs a real-time channel
   between devices. Is that in scope, and on what privacy terms?
4. **Launch scope.** Is the phone a companion only at launch (backup,
   modeling, fluent users), or also a main device?

## 7. Where rulings would route

| Topic | Owning doc |
| --- | --- |
| Phone layouts, orientation, tile sizes | `docs/product/Motor_Grid_And_Art.md` + `docs/product/Core_Coordinate_Map.md` |
| iPhone as a platform | `docs/product/Platforms_iOS_And_Web.md` |
| Phone as a paired device, live modeling | `docs/product/Sync_And_Web_Editing.md` |
| Location signal in prediction | `docs/phases/006_Prediction_Engine.md` |
| Occasions in pocket mode | `docs/phases/007_Occasions.md` |

## Next slice

A measurement spike, not a feature: render `grid60` in landscape on a real
iPhone (smallest and largest current models) with the sentence bar and
strip. Measure tile size in points and hit accuracy. Works Test: a user or
adult taps each of the 60 cells in turn, and we count misses on the device,
not from the app's own tap log.

## Sources

- [LAMP Words for Life on iPhone (PRC-Saltillo)](https://prc-saltillo.com/blog/LAMPWFL-iPhone)
- ["Tiny" Speak for Yourself on iPhones](https://speakforyourself.org/tiny-speak-coming-soon-iphones/)
- [Pocket Sized AAC (OMazing Kids)](https://omazingkidsllc.com/2021/03/22/pocket-sized-aac/)
- [Dear Future AAC App Developers (OMazing Kids)](https://omazingkidsllc.com/2022/10/16/dear-future-aac-app-developers-thinking-about-developing-a-new-aac-app-here-are-my-thoughts/)
- [Why does Proloquo have a fixed grid size? (AssistiveWare)](https://www.assistiveware.com/blog/why-does-proloquo-have-a-fixed-grid-size)
- [Proloquo2Go (AssistiveWare)](https://www.assistiveware.com/products/proloquo2go)
- [Proloquo and Proloquo Coach (AssistiveWare)](https://www.assistiveware.com/products/proloquo)
- [TD Snap Core First (Tobii Dynavox)](https://us.tobiidynavox.com/pages/td-snap-core-first)
- [TouchChat HD (App Store)](https://apps.apple.com/us/app/touchchat-hd-aac/id398860728)
- [Spoken AAC](https://spokenaac.com/)
- [Predictive Anchoring, Zastudil et al., ASSETS '24](https://arxiv.org/pdf/2408.11140)
- [Word prediction and communication rate in AAC](https://www.researchgate.net/publication/228915903_Word_prediction_and_communication_rate_in_AAC)
- [Designing a Context Aware AAC Solution (ACM)](https://dl.acm.org/doi/10.1145/3234695.3240990)
- [Aided Language Stimulation (AssistiveWare)](https://www.assistiveware.com/learn-aac/aided-language-stimulation)
