# 035 — pipaac.org: the proposal

**PROPOSED 2026-10-02** (lead designer + copywriter). Nothing built from
this yet. Founder decisions are in § 10. Phase doc: `035_Marketing_Site.md`.

Truth owners don't change: price and free tier are owned by
`docs/product/Pricing_And_Packaging.md` § 4, brand by
`docs/product/Design_System.md`, and words by `docs/product/SSOT.md`. Every
claim below is checked against code or a phase banner. Claims that aren't
true yet are listed in § 2 and don't appear in any copy.

---

## 0. The idea in one paragraph

Every AAC company sells **software**. Pip sells **tonight**. Tonight is when
a parent leaves the SLP's office, opens Pip on the iPad they already own,
and hears their child say *Grandma* at dinner, free. With everyone else,
that night comes after a $250–$300 purchase, a subscription, or a
months-long funding wait. The site has one job: get a parent or SLP to
**hear Pip speak on the page** and then tap **Start free**. Every section
either builds the case for that tap or answers the fear that stops it.

**The wow is that the page is the product.** The headline is made of real
Pip word tiles that speak when tapped. Two screens down sits a working
mini-board. No other AAC site lets a visitor build a sentence and hear it,
angry voice included, before they've decided anything. We need to check
that claim (§ 2) before we print it, but we don't need to print it: the
visitor will feel it.

---

## 1. What makes Pip better (the copy's raw material)

Ranked by how hard a competitor would find it to copy. Every row is
**BUILT** unless marked.

| # | Truth | Why a competitor can't just match it | Source |
| --- | --- | --- | --- |
| 1 | **Free forever, with every built-in word.** $49 once per user unlocks the whole team. Never a subscription. Every supporter and every SLP is free. | Matching it costs them their revenue model. The moat is the business, not a feature. | Pricing § 4 |
| 2 | **No child waits.** The SLP builds the board in session one and emails a QR card, and the family has it that night. | Needs free + web editor + QR transfer together. | SLP_Channel § 3; 011, 015 |
| 3 | **Runs on the iPad you already own**, in the browser, with no download, no account, and no dedicated device. | Their business is built on App Store purchases and dedicated hardware. | app.pipaac.org live 2026-10-01 |
| 4 | **Say it with feeling.** Any sentence can be spoken happy, sad, or angry. | New voice pipeline. | 025 |
| 5 | **A natural voice on every word**, never a robot fallback for a tile. | Shared audio library plus mint-on-demand for typed words. | 028 |
| 6 | **Model from your phone.** You tap a word on your phone and it glows on your child's iPad. You don't have to take the device away. | Needs live multi-device sync. | Attention layer, 032 |
| 7 | **Spotlight.** Choose this week's words; they glow and the rest dim, and nothing is ever disabled. | Same sync spine. | 032 |
| 8 | **The board never moves on its own.** Suggestions live in the Smart bar. The grid stays put, and you decide when to grow it (15 → 30 → 60 → 90) without starting over. | Clean-room grid design. | 014, 018 |
| 9 | **Your family on the board in seconds**: a name, a photo, done. No photo? Picture Finder or *Draw it for me* draws it in Pip's style. | Pipeline + art system. | 029, 030 |
| 10 | **Family knows best.** Any word can go in any cell. Your recordings, photos, and names beat our defaults everywhere, predictions included. | Philosophical opposite of "one layout for everyone". | memory: positioning |
| 11 | **Edit on your laptop; the iPad has it.** Free backup. If the iPad breaks, scan the QR card and everything comes back. | Sync + accounts. | 011, 015 |
| 12 | **Progress you can show.** A free weekly win card; the full dashboard and a PDF report come with Lifetime. | Built from the child's own taps. | 016 (discharged) |
| 13 | **Pip never listens.** No microphone except when an adult chooses to record a word. No ads. The marketing site has no trackers. | Posture, not code. | SSOT R20 |

**The emotional core:** *a voice is not rented* (Pricing § 1).
**The professional core:** *no child waits for a voice* (SLP_Channel § 2).
**The family core:** *you know your child best* (positioning).

---

## 2. Claims gate: what the site may NOT say yet

These are the things I would most like to write. Each one is either untrue
today or unsourced. The site ships without them, and each gets a named
owner who can unlock it.

| Tempting claim | Status | Unlock |
| --- | --- | --- |
| "Works offline" | **Not true from a cold start.** No service worker exists (`grep serviceWorker public/` returns nothing). Tile clips cache; the app shell doesn't. | Ship an app-shell service worker plus an airplane-mode Works Test, then the claim goes in. Big one: offline is in the brand promise. |
| "On the App Store" / "Download" | iOS app not built (`Platforms_iOS_And_Web.md` § 3). | Say "opens in Safari on iPad → Add to Home Screen." |
| "Android, Chromebook, Fire tablet" | Web should run there; **no device pass on record.** | One real-device pass each, then list them. Until then say "iPad, and any modern browser." |
| "Real human voice" | Tile voices are ElevenLabs synthesis, not recordings. | Say "natural voice". Never "recorded by a person." |
| "The first AAC with emotional voice" | Unsourced. Acapela has sold expressive voice variants for years. | Say what Pip does, not that it's first. |
| "30–50% of AAC devices are abandoned" | Vision cites a range without a specific study behind each number. | Find the exact paper and figure, or drop it. |
| "Mom's voice / voice cloning" | Not built (`Voice_Cloning_And_Synthesis.md`). | — |
| Visual scenes, literacy bridge, label-only adult mode, other languages | Not built. | — |
| "Funded by Medicaid / insurance" | Not today (Pricing § 4.5). | FAQ says so honestly. |
| Testimonials, family stories, "loved by SLPs" | **There are no users yet** (memory, 2026-10-02). | Founding Families program (§ 8, Phase 5). Never fabricate, composite, or stage. |
| "AAC won't stop your child talking" | True to the research, but a **health claim** (High-Risk Stop). | Founder approval plus cited papers (Millar, Light & Schlosser 2006; Schlosser & Wendt 2008). Drafted in the FAQ, gated. |
| Competitor prices and features | Sourced from founder research **2026-09-23**; platform cells unverified. | Re-verify every cell with a dated screenshot archive before publishing (§ 6). |

---

## 3. Who we are talking to

| Visitor | Arrives from | Their 3 a.m. question | Page | Their yes |
| --- | --- | --- | --- | --- |
| **Parent** of a non-speaking or minimally-speaking child (autism, apraxia, Down syndrome, CP …) | SLP recommendation, Facebook parent groups, a Google search for "free AAC app" or "Proloquo2Go too expensive" | *Can my child do this, can I afford it, and will I break it?* | Home | **Start free** |
| **SLP** (the #1 channel, SLP_Channel) | Peer, conference, a family who brought Pip in | *Will this make me look good to the family, and save me evenings?* | /slps | **Set up your first client free** |
| **Teacher / school / district** | SLP, procurement | *Can we buy 30, and does it handle the privacy rules?* | /schools | **Request license codes** |
| **Teen or adult communicator**, or their family | Search | *Is this a toy?* | Home → FAQ (adults line) | **Start free** |

Design rule from this table: **mobile-first, written for a tired parent on a
phone at night.** Short paragraphs, big tap targets, sound only on tap, and
nothing that makes them sign up to look.

Vocabulary on the site follows SSOT § Words: *board*, *group*, never "page"
for a group. In marketing, "your child" is natural for parents. Adults get
their own line, and copy never says "patients".

---

## 4. Sitemap

```text
pipaac.org
├─ /                     Home — the long-form sales page (families first)     ← START HERE
├─ /slps                 For SLPs — "No child waits for a voice"
├─ /pricing              Free vs Pip Lifetime, schools, the promises
├─ /compare              "Pip vs …" hub (honest table + how to choose)
│   ├─ /compare/proloquo2go
│   ├─ /compare/proloquo
│   ├─ /compare/touchchat
│   ├─ /compare/lamp-words-for-life
│   ├─ /compare/td-snap
│   ├─ /compare/coughdrop
│   └─ /compare/free-aac-apps     (Cboard and other free options)
├─ /faq                  The full FAQ (home carries the top 8)
├─ /about                Why Pip exists, our promises, who we are
├─ /schools              License codes, 50% off 20+, purchase orders, privacy
├─ /start                Handoff: "Open Pip" + Add to Home Screen + Guided Access
├─ /privacy              Plain-English privacy (founder + legal)          [founder]
├─ /learn                Later: modeling guide, core words, printable boards with QR
└─ /press                Later: kit (marks, poses, facts, screenshots)
```

Navigation: **How it works · For SLPs · Pricing · Compare · FAQ** with
**[Start free]** in the header. Footer: About, Schools, Privacy, Press,
contact address, and the *no trackers* line.

Folder-native: each page is `site/public/<name>.html` (or
`<name>/index.html` for clean URLs), per `site/README.md`.

---

## 5. Design vision

### 5.1 The look: "the board, at the size of a billboard"

- **Canvas:** Cream `#f6f4ef` with Ink `#2a241d` type. Sections alternate
  cream, white, and one **ink section** (the price receipt) for contrast.
- **The bird gets to fly here.** Pip Amber and Ember are marketing-only
  colors (Design_System), so the site is where they live. The bird appears
  in the six poses at section turns: *welcome* in the hero, *looking up* at
  the demo, *listening* at privacy, *resting* at the FAQ, *hopping* at the
  final CTA.
- **The grammar band:** a thin six-color stripe in the real Fitzgerald
  hexes (yellow, green, blue, pink, purple, red) as the section divider.
  It's the brand signature and it's honest, because those are the colors
  on the child's board.
- **Real tiles as the illustration system.** No stock photos of kids
  holding iPads (every competitor has them, and we have no consented
  families yet). The product's own tiles, at 2–3× scale, are the imagery.
- **Type:** Andika throughout, Bold for display and Regular for body. Add
  `andika-regular.woff2`, SIL OFL, self-hosted. It's the face the child
  reads on the board, so the site reads in the child's own type. Self-hosting
  also means no Google Fonts request (privacy posture). Display size is
  clamp(2.5rem, 7vw, 5.5rem), and body is 1.125rem/1.6 at 60–68ch.

### 5.2 Motion and sound, by the product's own laws

The attention-layer laws apply to the site: **gentle, no flashing, no
autoplay sound, nothing moves that you didn't touch.**
`prefers-reduced-motion` turns every transition into a cut. Sound plays
only on a tap, with a visible 🔊 cue on tappable tiles.

### 5.3 The five signature moments

1. **The tile headline.** The H1 is real word tiles in a sentence bar:
   `[No] [child] [waits] [for a] [voice]`. Each one speaks when tapped.
   Screen readers get a plain `<h1>` with the tiles marked
   `aria-hidden` and a separate "Hear it" button.
2. **Try Pip right here.** A 3×5 mini-board (the Core 15 starter words,
   real art, real clips) with the sentence bar, Speak, and the three
   feeling faces. A visitor can build "no — stop!", tap 😠, and hear it
   angry (Core 15: I · want · more · yes · stop / you · like · all done ·
   no · help / what · go · ? · not · hurt). Then: *"That's Pip. The whole thing is free. [Open the full
   board →]"*
3. **The receipt.** An ink section styled as a till receipt: *"What it
   costs for a child to say 'more'"*, with sourced competitor prices, then
   **Pip: $0.00**. Below it: *"Want the whole team? $49. Once."*
4. **Tonight.** A horizontal timeline: *3:30 pm SLP session → 3:55 QR card
   emailed → 6:40 pm iPad scans it → 7:10 pm "Grandma" at dinner.* Labeled
   **"An example evening"**. It's a scenario, not a testimonial.
5. **Phone to iPad.** A looping, reduced-motion-safe illustration: a
   parent's phone taps *eat*, and *eat* glows on the iPad across the table.
   Caption: *"Model from your phone. Never take the iPad away."*

### 5.4 Engineering bar

- Static HTML plus one stylesheet. The only JS is the demo (~6 KB, vanilla).
  No framework and no build step (`site/README.md`).
- **First load under 150 KB** including fonts. Demo clips (~15 short MP3s,
  copied into `site/public/audio/`) load on the first tap, not before.
- **WCAG 2.2 AA minimum**, AAA contrast on body text, full keyboard path
  through the demo, and visible focus in the product's cream-and-ink double
  ring.
- **Zero third-party requests and zero cookies.** The footer says so. For a
  child-adjacent brand, that's a conversion asset as well as a compliance
  fact.
- Structured data: `SoftwareApplication` (offers $0 and $49), `FAQPage`,
  and `Organization`. OG image: the tile headline on cream.

---

## 6. Competitive frame

**Posture: generous, specific, sourced.** SLPs respect these products, and
many own them. Trashing incumbents loses the channel. The line is: *they
built the field; we built for the family's budget and the family's
evening.* Every compare page opens with **"If it's working for your
child, keep it."** That honesty is what makes the rest believable.

Pip's honest weaknesses get printed too: no App Store app yet, no Medicaid
route, no board import, a younger vocabulary than 20-year-old systems, and
no published research on Pip itself. Naming them first earns the right to
claim the strengths.

### 6.1 The comparison table (/compare and each compare page)

Prices are from founder research **2026-09-23**
(`docs/founder/2026-09-23_Accounts_And_Pricing.md` § Research). Every
**[verify]** cell needs a dated source and a screenshot in
`docs/strategy/competitive/` before publishing.

| | **Pip** | Proloquo2Go | Proloquo | TouchChat w/ WordPower | LAMP WFL | TD Snap | CoughDrop |
| --- | --- | --- | --- | --- | --- | --- | --- |
| To start speaking | **Free** | $249.99 | $9.99/mo or $99.99/yr | $299.99 | $299.99 | Subscription after trial | $295 or $9/mo |
| Subscription required | **Never** | No | Yes | No | No | Yes [verify] | Option |
| Extra adults editing | **Free, every supporter** | [verify] | [verify] | [verify] | [verify] | [verify] | $45 to edit |
| SLPs pay | **No** | No (pro license) | [verify] | No (after training) | [verify] | [verify] | [verify] |
| Runs on | **iPad + any browser** | iOS / Mac [verify] | iOS [verify] | iOS [verify] | iOS [verify] | iPad, Windows [verify] | Web, iOS, Android [verify] |
| Model from your phone | **Yes** | [verify] | [verify] | [verify] | [verify] | [verify] | [verify] |
| Say it happy / sad / angry | **Yes** | [verify] | [verify] | [verify] | [verify] | [verify] | [verify] |

Rule: a row whose competitor cells can't all be verified is cut, not
guessed. Comparative advertising must be true and current. Each compare
page carries "Prices checked on [date]. Tell us if something changed:
[address]."

### 6.2 "Five families for one" — the line that does the math

$249.99 ÷ $49 ≈ 5.1. **"For the price of one Proloquo2Go license, five
families get Pip Lifetime."** It's only true while both prices hold, so it
gets the same dated source.

---

## 7. The copy

Voice: warm, plain, specific, short sentences, no jargon above the fold.
Hope without promises about outcomes: we promise **access**, never
"your child will talk." Numbers come from the pricing doc.

### 7.1 Home page — long form

**`<title>`** Pip AAC — the free AAC app. Every word speaks. $49 once, never a subscription.
**Meta:** Pip is a complete AAC app that runs on the iPad you already own. Every word speaks, free. The SLP sets it up in session; your child has it tonight.

---

**[HERO]** *(pose: welcome)*

Eyebrow: **AAC for every voice**

H1 (tiles): **No child waits for a voice.**

Sub: Pip is a complete AAC app, and every word speaks for free. Open it
tonight on the iPad you already have: no download, no account, no $300
app. When the whole family and your SLP want in, it's **$49 once**. Never
a subscription.

**[Start free →]** *Opens right in your browser*
Secondary: **Hear Pip first ↓**

Trust row: *Free forever · $49 once, never monthly · Supporters & SLPs free · No ads, no trackers*

---

**[TRY IT]** *(pose: looking up)*

### Tap a word. Hear your child's new voice.

*(Mini-board. Under it:)* Try **I** → **want** → **more**, then tap 😊.
Now **no** → **stop**, and tap 😠. Same board, and now they mean it.

> That's Pip. Not a demo version or a trial. The real board has 677 words,
> and every one of them is free. **[Open the full board →]**

---

**[THE PROBLEM]**

### You were told your child needs a voice. Then you were handed a bill.

Here's how it usually goes. The SLP says your child would benefit from
AAC. You go home and look it up. The best-known apps cost **$250 to $300**,
or they want a monthly subscription. Some families wait months for an
evaluation, a funding request, and a device.

All that time, your child still has things to say.

And when the app finally arrives, the setup often lands on you, at night,
with a manual. The device can only be in one place. If you want to show
your child how to use it, you have to take it out of their hands.

**None of that is your child's fault. And none of it is necessary.**

---

**[THE TURN]**

### Pip starts free tonight. It stays yours forever.

Pip is a full AAC app (core words, groups, a keyboard, next-word
suggestions, a natural voice) that runs in the browser on the iPad you
already own. Every built-in word speaks, free, forever. No trial that runs
out. No word that gets locked later.

**A voice is not rented.** We will never charge a subscription for your
child to speak.

---

**[TONIGHT — the SLP story]**

### From the therapy room to the dinner table in one evening.

1. **In session.** Your SLP builds your child's board on a laptop: starter
   words, your family's photos, the things your child loves.
2. **On the way home.** They email you a QR card.
3. **After dinner.** You scan it on your child's iPad. Everything's there.
4. **That week.** Your SLP keeps adding words from the office. Your iPad
   gets them the same day.

*An example evening:* 3:30 session · 3:55 card emailed · 6:40 scanned · 7:10 *"Grandma."*

**[Start free →]**  ·  Are you an SLP? **[See how it works for you →]**

---

**[FEATURES — benefit-first, six cards]**

### Built for the way families actually talk.

**🗣 Say it like you mean it.**
Any sentence, spoken happy, sad, or angry. A furious *"go away"* shouldn't
sound polite. *"I love you"* shouldn't sound like a weather report.

**📱 Model from your phone. Never take the iPad away.**
Children learn to talk by hearing talk all around them. With Pip you tap a
word on your phone and it glows on your child's iPad across the table. You
show them how without leaning over their shoulder.

**✨ Spotlight this week's words.**
Pick the words you're working on. They glow and everything else dims, but
nothing is ever turned off. Your child can still say anything.

**👵 Grandma's on the board in ten seconds.**
A name, a photo, done. No photo? Pip finds a picture that fits, or draws
one in the same friendly style as the rest of the board.

**🧭 The buttons never move on their own.**
Pip's suggestions live in one strip at the top. The board underneath stays
exactly where your child's hands learned it. When they're ready for more
words, you grow the board without starting over.

**💻 Edit from your laptop. The iPad already has it.**
Everyone who helps, including parents, grandparents, the SLP, and the
teacher, can add words from their own device. If the iPad breaks, scan the
QR card on a new one and everything comes back. Backup is free.

---

**[YOU KNOW YOUR CHILD]**

### Great defaults. Your rules.

Some AAC apps decide the layout for you and lock it. Pip starts with a
board designed from open research on the words young communicators use
most. After that, **you and your SLP decide.** Put any word in any spot.
Record your own voice for a word. Your photos, your names, and your
recordings override ours everywhere, suggestions included.

*Nobody knows your child better than the people who love them.*

---

**[THE RECEIPT — ink section]**

### What it costs for a child to say "more."

```
Proloquo2Go ..................... $249.99
TouchChat with WordPower ........ $299.99
LAMP Words for Life ............. $299.99
Proloquo ................ $99.99 every year
──────────────────────────────────────────
Pip ............................... $0.00
```
*Prices checked [date]. [Sources →]*

**Free, forever:** every built-in word · 20 words of your own · your
child's device plus one helper · all voices, suggestions, and groups ·
backup and QR restore · the weekly win card · 5 drawings.

**Pip Lifetime — $49 once, per child:** unlimited words of your own ·
**every** helper: both parents, grandparents, SLP, teachers · the full
progress dashboard and report · 300 drawings.

Supporters and SLPs never pay. Schools: 50% off 20 or more.
**[Start free →]**

> Free isn't a trial. Nothing you add is ever taken away, even if you
> never pay.

---

**[PRIVACY]** *(pose: listening)*

### Pip never listens.

No microphone, ever, unless you choose to record a word. The things your
child says stay on their device. To suggest the next word, Pip can ask
our ranking service about the words in the current sentence. It never
sends names, photos, or who your child is, and you can turn it off with
one switch. No ads. No selling data. This website doesn't even have a
tracker.

*(Copy must match `Dual_Engine_Predictive_Intelligence.md` § 3.2 and
`Stats_And_Progress.md` § 6 word for word in meaning; founder + privacy
review before launch.)*

---

**[THE SCIENCE — light touch]**

### Built on what the research says helps.

- **Presume competence.** Every word is there from day one. No tests to
  pass first.
- **Core words.** A few hundred words do most of the work in everyday
  talk, so they're always on the board.
- **Modeling.** Children learn AAC the way they learn speech, by seeing it
  used. That's why Pip lets you model from your phone.
- **More than requests.** Your child can protest, joke, comment, ask, and
  say how they feel, not just ask for snacks.

*(Citations on /about#research. Framed as practices Pip supports, not as
laws or outcome claims.)*

---

**[FAQ — top 8 on home; full list § 7.5]**

---

**[FINAL CTA]** *(pose: hopping)*

### Your child has something to say tonight.

Every word is free. It opens in your browser. It takes about a minute to
start.

**[Start free →]**

*Free forever · $49 once for the whole team · Never a subscription*

---

### 7.2 /slps

**H1:** Start AAC in the first session. The family has it tonight.
**Sub:** Pip is free for you, free for every family to try, and $49 once
when they want the whole team. You'll never wait on a funding request to
see a child communicate.

Sections:
1. **Your evenings back.** Build the board on your laptop during the
   session: starter words, bulk paste, the family's photos. One sign-in for
   your whole caseload.
2. **The QR card.** Email it. The family scans it. You stay on the team,
   and keep editing from the office.
3. **Practice that happens at home.** Send this week's Spotlight words.
   The parent models from their phone and the iPad lights the way.
4. **Progress you can bring to the IEP meeting.** Every number comes from
   the child's own taps. Full dashboard and PDF report with Lifetime.
5. **A free demo user** on your account for evaluations.
6. **What we'll never do:** pay referral fees, lock a family out, or
   delete a child's words over payment.

CTA: **[Set up your first client free →]**

### 7.3 /about — structure (founder story required)

> **I can't write this section without you.** The most persuasive About
> page in this market is a true story about why one person built this.
> I'll draft it from a 20-minute interview. Questions are in § 10, Q4.

1. **Why Pip exists** — [FOUNDER STORY, in founder's words]
2. **Our promises**, which are the product laws in plain English:
   - *A voice is not rented.* Never a subscription to speak.
   - *Nothing is taken away.* A word your child has keeps speaking, paid
     or not.
   - *Family knows best.* Great defaults; your call.
   - *We never act on a guess.* Pip adds and suggests. It never hides or
     clears your child's words because it thinks they're done.
   - *Pip never listens.*
   - *Everything is ours.* Our pictures, our voices, our layout. We don't
     copy anyone's board.
3. **Research we build on** — the bibliography from `Vision.md` § 6,
   honestly framed.
4. **Contact** — an address (Q8).

### 7.4 /compare/proloquo2go — template (applies to every compare page)

**H1:** Pip vs Proloquo2Go: an honest comparison
**Lede:** Proloquo2Go helped put AAC on the iPad, and AssistiveWare has
done a great deal for the field. **If it's working for your child, keep
it.** If cost, setup, or getting the whole family involved is in the way,
here's how Pip differs.

1. **The short version** (3 bullets): price ($249.99 vs free / $49 once),
   where it runs, and the family team (every supporter free).
2. **The table** (§ 6.1, two columns).
3. **Where Proloquo2Go is ahead**, stated plainly: years of clinical use,
   a native iOS app, a larger vocabulary set, and published training.
4. **Where Pip is different**: try free tonight, model from a phone,
   feelings, the board never moves on its own, every supporter free.
5. **Switching honestly:** Pip doesn't copy anyone's layout, so word
   positions are different and there's no import. Many families **run
   both** while they decide. Pip is free, so trying it costs nothing.
6. CTA: **[Try Pip free alongside →]**

Each competitor page swaps sections 3–4 for the specific truth: TouchChat
(PRC-Saltillo's vocabulary sets, dedicated devices), LAMP (built around
motor planning; Pip respects that, and its board never moves on its own),
TD Snap (Windows and eye-gaze hardware ecosystem), CoughDrop (the closest
in architecture: web and multi-device; Pip is free to start and every
supporter edits free), and free apps (Cboard is free and open source;
Pip adds a natural voice, feelings, phone modeling, and drawings).
**Every claim needs a source.**

### 7.5 FAQ — full list

**Money**
1. **Is Pip really free? What's the catch?** Every built-in word speaks,
   free, forever. You also get 20 words of your own, your child's device
   plus one helper, backup, and all voices. If you want more, it's $49
   once. That's the whole catch.
2. **What does $49 get me?** Unlimited words of your own, every helper on
   the team, the full progress dashboard and report, and 300 drawings.
3. **Is it a subscription? Will you take features away later?** No, and no.
   Nothing your child has is ever taken away, even if you never pay.
4. **Is it $49 per child or per family?** Per child: the person who
   speaks. Siblings each have their own. Every adult helper is free.
5. **I'm an SLP. Do I pay?** Never. Set up as many clients as you like.
6. **Can our school or district buy it?** Yes. License codes, 50% off 20
   or more, purchase orders welcome. → /schools
7. **Will Medicaid or insurance pay for Pip?** Not today. They fund
   dedicated speech devices through medical suppliers. At $0 to start and
   $49 once, most families don't need to wait for funding.
8. **Why is it so cheap?** Pictures and voices are shared by everyone, and
   storage costs pennies. We price what it costs us, plus a fair margin,
   not what the market has tolerated.

**Getting started**
9. **What do I need?** An iPad, or any device with a modern browser. Open
   Pip and tap Start. No download and no account.
10. **Is there an App Store app?** Not yet. Pip runs in Safari. Add it to
    your Home Screen and it opens full screen like any app. *(Update when
    iOS ships.)*
11. **Does it work without Wi-Fi?** *(GATED, see § 2. Don't publish until the
    service worker ships.)*
12. **How do I keep my child from leaving the app?** Use the iPad's
    Guided Access. → /start shows how.
13. **Can I start with fewer buttons?** Yes. Start with 15 and grow to 30,
    60, or 90 without starting over.

**Daily life**
14. **Will the buttons move around?** Never on their own. Suggestions live
    in one strip. You decide if a word moves.
15. **Can I record my own voice for a word?** Yes, for any word or name.
16. **Can my child say things with feeling?** Yes: happy, sad, or angry,
    for any sentence.
17. **What if the iPad breaks?** Open Pip on any device and scan the QR
    card. Everything comes back. Backup is free.
18. **How do grandparents and teachers join?** Invite them as helpers.
    Free gets one helper; Lifetime gets everyone.

**Trust**
19. **Does Pip listen to us?** No. The microphone is only used when you
    choose to record a word.
20. **What leaves my child's device?** *(Precise copy from the privacy
    owner docs, founder-reviewed.)*
21. **Is Pip for teens and adults too?** Yes. You choose child, teen, or
    adult when you start.

**The big worries** *(GATED: health claims, founder + citations)*
22. **Will AAC stop my child from learning to talk?** Research has looked
    at this for decades, and AAC doesn't hold back speech; studies often
    find the opposite. [citations]
23. **Is my child ready for AAC?** There's no test to pass first. Every
    child deserves words now. [citations]
24. **Does Pip replace speech therapy?** No. Pip is a tool; your SLP is the
    expert. Pip makes it easy to work together.
25. **Can I bring my board over from Proloquo2Go or TouchChat?** No. Pip
    has its own layout, built from scratch. Many families try Pip
    alongside their current app, since it costs nothing.

---

## 8. Roadmap

| Phase | Ships | Done when |
| --- | --- | --- |
| **0 — Unblock** | Founder decisions (§ 10). DNS fix (035: delete stale apex/www records). Competitor price re-verification with screenshots. Andika Regular added. | `pipaac.org` resolves to `pipaac-site`; § 10 answered. |
| **1 — Home page** | Long-form home: tile headline, Try it board, receipt, Tonight, features, privacy, top-8 FAQ, final CTA. `/start` handoff. | Owner Works Test: on a phone, a cold visitor hears a tile within 1 tap, builds a sentence, and lands on app.pipaac.org. Lighthouse ≥ 95 on all four. Zero third-party requests (DevTools). |
| **2 — The channel** | `/slps`, `/pricing`, full `/faq`, `/about` (after the founder interview), `/privacy` (legal). | SLP_Channel § 5 test: 10 SLPs read /slps; record whether "same session" lands. |
| **3 — Compare** | `/compare` hub + 7 pages, every cell sourced and dated. | Each page has a source list and a check date. |
| **4 — Resources** | `/schools`, `/learn` (modeling guide; printable core boards with "Try this board free" QR; SLP_Channel § 4), `/press`. | — |
| **5 — Proof** | Founding Families: real families with written consent, real words, and a measured **time from session start to first word** (SLP_Channel § 5: "that number is the marketing"). Offline claim lands after the service worker. | First consented story is live. |
| **Ongoing** | Copy tests only with an honest instrument (§ 10, Q5). | — |

---

## 9. Where we start

**The home page, starting with the hero and the Try it board.**

Why this first:

- It's the **one asset every other page reuses.** /slps, every compare
  page, and every SLP's email all point to "hear it yourself."
- It **proves the wow before we write 5,000 more words.** If tapping
  tiles on a marketing page doesn't move people, we learn that in a week.
- It turns the skeleton into something a founder can text to an SLP
  **tomorrow**.

Slice B1, the first build after approval:

1. Hero with the tile H1 (speaking), sub, and CTA.
2. The Core 15 Try it board with 3 feelings (clips copied from the
   shipped catalog; no new mints).
3. The receipt, then the final CTA.
4. Deploy (after DNS).

Then B2 fills in the long copy between them, in the order of § 7.1.

---

## 10. Decisions I need from you

1. **Headline.** Recommend **A: "No child waits for a voice."** Options:
   B "Your child's voice shouldn't cost $300." or C "Every word free.
   Tonight." (A is the mission and owns the SLP pitch; B is sharper
   direct response. Later we could test B on /compare traffic.)
2. **The Try it board on the marketing site.** It's interactive, so it
   needs your call (`site/README.md`). It's static files only: ~15 shipped
   clips, no network calls, nothing stored. OK?
3. **Name competitors** on the receipt and compare pages? It's legal when
   true and dated. I recommend yes, with the generous tone in § 6.
4. **Founder story for /about.** 20 minutes: Why AAC? Who was the child
   or family that made it personal? What made you angry about the market?
   What do you want a parent to feel when they first open Pip?
5. **Measurement.** The site has no trackers (decided). To learn anything,
   I propose **one cookieless, IP-less counter**: the site Worker counts
   `Start free` clicks per page section and nothing else. The alternative
   is to measure nothing and rely on SLP interviews. Your call.
6. **Offline.** Build the app-shell service worker before launch so "works
   without Wi-Fi" can go on the page, or launch without the claim?
7. **Audience.** Families of children first, with teens and adults
   welcomed in one line plus the FAQ. Agree?
8. **Contact address.** For example `hello@pipaac.org` (Email Routing).
   No forms (decided posture).
