# 035 — pipaac.org: design + copy spec

**PROPOSED 2026-10-02; revised the same day with founder direction.**
Lead designer + copywriter. Phase doc: `035_Marketing_Site.md`. Price
truth: `docs/product/Pricing_And_Packaging.md` § 4. Brand:
`docs/product/Design_System.md`.

Founder direction (2026-10-02):

- Headline attacks price and rent: **"Your child's voice shouldn't cost $300."**
- **Attack the competition aggressively** on one-size-fits-all. Mom knows
  best. Every user is unique. Pip is fully customizable, and tiles still
  never move on their own.
- A **methodology page** that makes that argument in full.
- **The most wanted response is creating the child's board**, not clicking
  around a demo. **Board first, account second**: they get invested before
  we ask.

---

## 0. The big idea

Every AAC company sells you **their** app. Pip builds **your child's**.

The incumbents charge $250–$300, or rent the voice by the month, and then
hand every child the same locked layout because *they* decided that's what's
best. Pip is free to start, $49 once for the whole family, and built around
one belief: **nobody knows your child better than you.**

The site makes one argument in three beats:

1. **The price is wrong.** $300 or a monthly rent for a child to speak.
2. **The philosophy is wrong.** One app for every child, locked, "for their
   own good."
3. **Pip fixes both.** Free, yours, fully customizable, and stable, so
   nothing moves unless you move it.

Then it asks for one thing: **Create your child's board, free.**

---

## 1. The conversion path: board first

```text
pipaac.org  ──[Create your child's board — free]──►  app.pipaac.org
                                                          │
            Welcome: child's name + "Who's it for?"  (one screen, built)
                                                          │
            60-second demo: want → apple → ✨ "I want an apple."
                            ⏪ "I wanted an apple."    (built)
                                                          │
            "Now try your own."  Free play on their board
                                                          │
            First customization (Grandma, the dog)  →  Save [Name]'s board
            = supporter account: email + passkey  (Protect card, built)
```

The app's on-ramp already does this
(`docs/product/Design_System.md` § Welcome and first-run demo: "No
photos, PIN, backup or sign-in before the wow"). The demo **is** the try-it
experience, so there's no separate try page and no demo on the home page.
One path.

**What the site promises is exactly what happens next.** The hero
microcopy describes the first 60 seconds in the app, so the click feels
safe and the payoff arrives before the ask.

**The account ask** happens inside the app (the Protect card), and it's the
second conversion. App-side copy for it, for the app's owner to adopt:

> **Save Maya's board.**
> You just built something. Keep it safe: if this iPad breaks, scan
> Maya's card and everything comes back. Free.
> [Save with email] — *No password. Your phone's passkey does it.*

---

## 2. Positioning

### 2.1 The enemy: the one-size-fits-all app

The incumbents' doctrine: every communicator should learn the same
layout, so the layout is theirs to decide and lock. The newest generation of
those apps takes it further and won't let a family customize the board at
all. They call it consistency. It's really their design choice, made
permanent.

**Our attack:** consistency and control aren't the same thing. The
incumbents sell rigidity as if it were stability. Pip separates the two:

| They give you | Pip gives you |
| --- | --- |
| **Frozen:** you can't change it | **Stable:** nothing moves *on its own* |
| One layout, designed for "everyone" | Great defaults, then **your** call |
| Their pictures, their names | Your photos, your people, your recordings, everywhere |
| Start over when your child outgrows it | Grow from 15 to 30, 60, or 90 words without starting over |
| Suggestions that reshuffle the screen (or none) | Suggestions in one strip; the board never budges |
| $250–$300, or rent by the month | **Free.** $49 once for the whole family |

### 2.2 The three cores (every page draws on these)

- **Mom knows best.** You know your child. The SLP knows your child. A
  software company doesn't.
- **A voice is not rented.** Never a subscription for a child to speak.
- **No child waits.** Start tonight, free, on the iPad you already have.

### 2.3 Voice and tone

Direct, warm, a little angry on the family's behalf. Short sentences.
Name the enemy. Never talk down to parents and never use jargon above the
fold. Every section ends on the CTA.

---

## 3. Who we're talking to

| Visitor | Their 3 a.m. question | Landing | The yes |
| --- | --- | --- | --- |
| **Parent** of a child who doesn't speak, or doesn't speak enough | *Can I afford this, will it fit my kid, will I break it?* | Home | Create your child's board |
| **SLP** (the #1 channel) | *Will this save my evenings and make me look good to the family?* | /slps | Set up your first client free |
| **School / district** | *Can we buy 30?* | /schools | Request license codes |
| **Teen or adult communicator** | *Is this a toy?* | Home → FAQ | Create your board |

The page is mobile-first and written for a tired parent reading a phone at
night.

---

## 4. Sitemap

```text
pipaac.org
├─ /                Home: the sales page. MWR = Create your child's board   ← START
├─ /method          "Your child is not a template." The methodology + the attack
├─ /slps            "Start AAC in the first session. The family has it tonight."
├─ /pricing         Free vs $49 once; schools; our promises
├─ /compare         Pip vs the field (hub)
│   ├─ /compare/proloquo
│   ├─ /compare/proloquo2go
│   ├─ /compare/touchchat
│   ├─ /compare/lamp-words-for-life
│   ├─ /compare/td-snap
│   └─ /compare/coughdrop
├─ /faq             Every objection, answered
├─ /about           Why Pip exists (founder story)
├─ /schools         License codes, 50% off 20+, purchase orders
├─ /privacy         Plain English
└─ later: /learn (modeling guide, printable boards with QR), /press
```

Header nav: **Our method · For SLPs · Pricing · Compare · FAQ** with
**[Create a board — free]**. Footer: About, Schools, Privacy, contact,
"This site has no trackers."

Every page's primary CTA is **Create your child's board — free** →
`app.pipaac.org`. The SLP page's CTA reads "Set up your first client free"
and goes to the same place.

---

## 5. Design

### 5.1 The look: "the board, at billboard size"

- **Canvas:** Cream `#f6f4ef`, Ink `#2a241d` type. Sections alternate
  cream and white. **Two ink sections**: the price receipt, and the "frozen
  vs stable" attack.
- **The bird flies here.** Pip Amber `#fcb82b` and Ember `#fc7419` are
  marketing-only colors, so the site is where they live. Poses at the
  section turns: *welcome* (hero), *looking up* (method), *listening*
  (privacy), *resting* (FAQ), *hopping* (final CTA).
- **The grammar band:** a six-color stripe in the real Fitzgerald hexes
  (yellow, green, blue, pink, purple, red) as the section divider and the
  brand signature.
- **Real tiles are the illustration system.** Product tiles at 2–3×
  scale, never stock photos of kids with iPads (every competitor does that).
- **Type:** Andika everywhere. Bold for display, Regular for body (add
  `andika-regular.woff2`, self-hosted). It's the face your child reads on
  the board. Display: clamp(2.5rem, 7vw, 5.5rem). Body: 1.125rem/1.6 at
  60–68ch.
- **CTA button:** solid ink, cream text, 56px tall, full-width on phones,
  and a sticky bottom bar on mobile after the hero scrolls away.

### 5.2 Signature visuals

1. **Hero:** the headline set as a sentence bar of real tiles,
   `[Your child's] [voice] [shouldn't] [cost] [$300]`, with **$300**
   struck through in red and **$0** stamped beside it. On the right (on
   phones, below), an iPad showing a child's board with *their own* photos:
   Grandma, the dog, the park. Bird in the welcome pose on the iPad's edge.
2. **The receipt:** an ink section styled as a till receipt. *"What it
   costs for a child to say 'more.'"* The competitors' prices, then
   **Pip ........ $0.00**.
3. **Frozen vs Stable:** a split screen. Left: a grey, padlocked grid with
   generic tiles labeled *"Their board."* Right: the same grid in full
   color with family photos dropped in, labeled *"Your child's board."* The
   tile positions are identical on both sides, which is the point: stable,
   not frozen.
4. **Grow without starting over:** 15 → 30 → 60 → 90 grids in a row,
   with *I · want · more* in the same relative spots, lit on each.
5. **Phone to iPad:** the parent's phone taps *eat*, and *eat* glows on the
   iPad across the table. *"Model from your phone. Never grab the iPad."*

### 5.3 Motion and sound

Gentle, with no flashing and nothing that moves unless it's scrolled into
view; one fade-up per section, max. `prefers-reduced-motion` turns it all
off. **No audio on the marketing site:** the sound happens in the app,
after the click.

### 5.4 Build bar

Static HTML, one stylesheet, near-zero JS (sticky CTA bar only). First load
under 150 KB including fonts. WCAG 2.2 AA. No third-party requests and no
cookies. Structured data: `SoftwareApplication` (offers $0 and $49),
`FAQPage`, `Organization`.

---

## 6. Home page copy

**`<title>`** Pip AAC: your child's voice shouldn't cost $300. Free AAC app, $49 once.
**Meta:** Pip is the AAC app built around your child, not around everyone. Every word free, forever. $49 once for the whole family. Never a subscription.

---

**[HERO]**

Eyebrow: **The AAC app built around your child**

# Your child's voice shouldn't cost $300.

### And it should never be rented by the month.

Pip is a complete AAC app that you shape around *your* child. Your
people, your photos, your words. Every built-in word speaks, free,
forever. When the whole family wants in, it's **$49 once**. Never a
subscription.

**[Create your child's board — free →]**

*Type your child's name. Sixty seconds later, they're saying "I want an
apple." No credit card. Nothing is ever taken away.*

Trust row: **Free forever · $49 once, never monthly · Every helper free · SLPs free**

---

**[THE PAIN]**

## You were told your child needs a voice. Then you saw the price.

The SLP says your child would benefit from AAC. You go home and look it
up.

**$249.99.** **$299.99.** Or **$9.99 a month, every month,** for as long as
your child needs to talk. Some families are told to wait months for an
evaluation, a funding request, a device.

All that time, your child has things to say.

And when the app finally arrives, it's the same app every other child
gets. Same layout. Same pictures. Same "someone else knows best."

**Your child isn't every other child.**

**[Create your child's board — free →]**

---

**[THE ENEMY — ink section]**

## They decided your child should have the same app as everyone else.

The biggest names in AAC have a philosophy: every communicator should
learn the same board, laid out their way, and families shouldn't change
it. Their newest app takes it all the way: a board you can't customize.

They call it consistency. We call it what it is: **a company deciding it
knows your child better than you do.**

It doesn't.

Your daughter calls her grandmother *Mimi*. Your son's whole world right
now is trains. Your child needs *stop* bigger, *help* closer, and the dog
on the first screen. No template knows that.

**You do.**

### At Pip, mom knows best.

Dad, Grandma, the SLP, and the teacher who sees your child every day know
best too. Pip starts with a great board designed from research on the
words children use most. **Then it's yours.** Put any word in any spot.
Add your people with your photos. Record your own voice for a word. What
you add beats our defaults everywhere, including suggestions.

**[See our method: "Your child is not a template" →]**

---

**[STABLE, NOT FROZEN]**

## "But the buttons shouldn't move." We agree. Completely.

Kids learn where words live, the way your fingers know where the keys are.
Moving them breaks that. The big apps use this as their reason to lock
everything down.

They're mixing up two different things.

**Stable** means nothing moves *on its own*. **Frozen** means *you* can't
move anything either.

Pip is stable:

- **Words never jump around.** Pip's next-word suggestions live in their
  own strip at the top. The board underneath stays exactly where your
  child's hands learned it.
- **Pip never hides a word or clears a sentence on a guess.** Your child
  always has every word they had a second ago.
- **Grow without starting over.** Go from 15 words to 30, 60, or 90 when
  they're ready. The words they know stay where their hands expect them.

And Pip is *not* frozen. When **you** decide a word should move, it moves.

**[Create your child's board — free →]**

---

**[BENEFITS — six cards]**

## Everything your child needs to say. Everything you need to help.

**👵 Grandma's on the board in ten seconds.**
Type her name, snap her photo, done. No photo? Pip finds a picture that
fits, or draws one in the same friendly style as the rest of the board.

**🗣 Say it like you mean it.**
Any sentence, spoken happy, sad, or angry. A furious *"go away"*
shouldn't sound polite. *"I love you"* shouldn't sound like a weather
report.

**📱 Model from your phone. Never grab the iPad.**
Kids learn to talk by hearing talk all around them. Tap a word on your
phone and it glows on your child's iPad across the room. You show them
how, and the iPad stays theirs.

**✨ Spotlight this week's words.**
Pick the words you're practicing. They glow and the rest dim, but nothing
is ever turned off. Your child can still say anything.

**⏪ From "want apple" to "I wanted an apple."**
One tap turns your child's words into a full sentence, or into the past
tense. They say it their way, and Pip helps them say it the long way when
they want to.

**💻 The whole team, on their own devices.**
Parents, grandparents, the SLP, the teacher: everyone adds words from
their own phone or laptop, and the iPad has them the same day. If the iPad
breaks, scan your child's card on a new one and everything comes back.
Backup is free.

**[Create your child's board — free →]**

---

**[THE RECEIPT — ink section]**

## What it costs for a child to say "more."

```
Proloquo2Go ..................... $249.99
TouchChat with WordPower ........ $299.99
LAMP Words for Life ............. $299.99
Proloquo ......... $9.99 a month, forever
──────────────────────────────────────────
Pip ............................... $0.00
```

For the price of one Proloquo2Go, **five families** get Pip Lifetime.

| **Free, forever** | **Pip Lifetime — $49 once** |
| --- | --- |
| Every built-in word speaks | Everything in Free, plus: |
| 20 words of your own: people, pets, places | **Unlimited** words of your own |
| Your child's device + one helper | **Every** helper: both parents, grandparents, SLP, teachers |
| All voices, suggestions, groups, feelings | The full progress dashboard + report for IEP meetings |
| Backup and card restore | 300 drawings |
| Weekly win card | |

*One price per child. Every adult helper is free. SLPs never pay.
Schools: 50% off 20 or more.*

### Our promise: nothing is ever taken away.

Not a trial. Not a countdown. A word your child has keeps speaking whether
you ever pay or not. **A voice is not rented.**

**[Create your child's board — free →]**

---

**[FOR SLPs — strip]**

## SLPs: start AAC in the first session. The family has it tonight.

Build the board on your laptop during the session. Email the family a
card. They scan it at home, and you keep adding words from the office.
Free for you, free for the family to start.

**[How Pip works for SLPs →]**

---

**[PRIVACY — short]** *(pose: listening)*

## Pip never listens.

No microphone, ever, unless you choose to record a word. No ads. No
selling anything about your child. This website doesn't even have a
tracker.

---

**[FAQ — top 8]**

1. Is it really free? What's the catch?
2. What does $49 get me?
3. Will you ever make it a subscription?
4. Will the buttons move around?
5. Can I make it look and sound like *our* family?
6. Does it work on our iPad?
7. Is $49 per child or per family?
8. I'm an SLP. Do I pay?

*(Answers in § 11.)* **[All questions →]**

---

**[FINAL CTA]** *(pose: hopping)*

## Your child has something to say tonight.

Type their name. In sixty seconds they're speaking. Every word free,
forever.

**[Create your child's board — free →]**

*Free forever · $49 once for the whole family · Never a subscription*

**P.S.** If you remember one thing: the people who love your child know
what your child needs. Not an app company. Pip is built on that. Start
free tonight, and make it theirs. **[Create your child's board →]**

---

## 7. /method — "Your child is not a template."

**`<title>`** Our method: your child is not a template | Pip AAC

**[HERO]** *(pose: looking up)*

# Your child is not a template.

### Why Pip lets families shape the board, and why the big AAC apps won't.

---

## The one-size-fits-all mistake

For twenty years, the AAC industry has been built on one idea: every
communicator should learn the same board, designed by the company, and
nobody should change it.

The newest apps take it to the end of the line: **a board you can't
customize.** Same words, same places, same pictures, for every child on
earth.

Ask any parent of a child with special needs how well "the same for
everyone" has worked out for them. Schools, doctors, therapies, forms: all
of it built for an average child who doesn't exist.

**AAC should be the one place that's different.** It's your child's
*voice*.

---

## What we believe

### 1. Mom knows best.

The people who love your child, and the professionals who work with
them, know things no company can. Pip gives them the final say on every
word, every picture, every spot on the board. Our defaults are a starting
point, never a cage.

### 2. Stable, not frozen.

Motor memory matters. Children learn where words live, and moving words
around on them is wrong. The big apps are right about that.

Where they go wrong is the conclusion. *"Words shouldn't move"* became
*"families can't change anything."* Those are different rules. Pip keeps
the first and throws out the second:

- **Nothing moves on its own.** No reshuffling, no "smart" rearranging,
  ever.
- **Suggestions live beside the board, never in it.** The next-word strip
  changes so the board never has to.
- **When you move a word, Pip shows you the cost first,** so it's a
  decision, not an accident.

### 3. Grow without starting over.

Most children outgrow their first board. In a locked app, "upgrading" can
mean learning a new one from scratch. Pip's boards (15, 30, 60, 90 words)
are designed as one family. The words your child knows stay where their
hands expect them. Pip highlights anything that moved so you can practice
it together.

### 4. Every word, from day one.

No tests to pass first. No "earn your next words." Your child gets the
whole vocabulary on the first day, through groups and a keyboard, and you
decide what's on the front screen.

### 5. Their people, their world.

A generic "grandma" picture isn't *their* Grandma. Pip puts your
photos, your names, and your recordings on the board, and they override
ours everywhere, including next-word suggestions. Their dog is on the board
because their dog is their world.

### 6. More than requests.

Too many AAC boards are built for asking for snacks. Children need to
protest, joke, comment, and ask why. Pip's board puts *stop*, *not*,
*what*, and *help* up front, so your child can push back, ask questions,
and join the conversation, not just place an order.

### 7. Say it like you mean it.

Most AAC voices say everything the same way. A furious *"go away"* comes
out polite. *"I love you"* sounds like a weather report. In Pip, any
sentence can be spoken happy, sad, or angry, with one tap on a face. The
words are your child's. Now the feeling is too.

### 8. Model, don't grab.

Children learn AAC by watching it used. In other apps, modeling means
reaching over your child's shoulder or taking the device away. In Pip, you
tap on your phone and the word glows on theirs.

### 9. We never act on a guess.

Pip suggests. It never decides. It never hides a word, clears a sentence,
or finishes a thought because it *thinks* your child is done. If Pip is
wrong, your child loses nothing.

---

## Side by side

*(The Frozen vs Stable table from § 2.1, designed as the ink split-screen
visual.)*

---

## The bottom line

The big apps protect their design. Pip protects your child's.

**[Create your child's board — free →]**

---

## 8. /slps

**H1:** Start AAC in the first session. The family has it tonight.
**Sub:** No funding request. No device to order. No $300 for the family to
find. Pip is free for you, free for every family to start, and $49 once
when they want the whole team.

1. **Build it in the session.** Sign in on your laptop, add the client,
   paste a word list, drop in the family's photos. One sign-in for your
   whole caseload.
2. **Hand over a card, not a device.** Email the family a QR card. They
   scan it at home on the iPad they already own. You stay on the team.
3. **Keep editing from your office.** New words reach the family the same
   day, not at the next session.
4. **Homework that actually happens.** Send this week's Spotlight words.
   Parents model from their phone, and the iPad lights the way.
5. **Data for the IEP.** Every number comes from the child's own taps.
   Full dashboard and PDF report with Lifetime.
6. **Your clinical judgment, finally respected.** You're not stuck with a
   layout someone else locked. Move the words *this* child needs.
7. **A free demo user** on your account for evaluations.

**What we'll never do:** pay you referral fees, lock a family out, or
delete a child's words over money.

**[Set up your first client free →]**

---

## 9. Compare pages: aggressive, specific

**Hub H1:** Same app for every child? Or an app for *your* child?
**Hub lede:** The big AAC apps were built in the early iPad era, priced
like medical devices, and designed around one idea: their board, their
way. Here's how Pip is different.

The hub carries the full table, with Pip first:

| | **Pip** | Proloquo | Proloquo2Go | TouchChat | LAMP WFL | TD Snap | CoughDrop |
| --- | --- | --- | --- | --- | --- | --- | --- |
| To start speaking | **Free** | $9.99/mo | $249.99 | $299.99 | $299.99 | Subscription | $295 or $9/mo |
| Subscription | **Never** | Yes | — | — | — | Yes | Optional |
| Shape the board around your child | **Fully** | Locked | | | | | |
| Every helper edits free | **Yes** | | | | | | $45 to edit |
| Model from your phone | **Yes** | | | | | | |
| Happy / sad / angry voice | **Yes** | | | | | | |
| Runs on the iPad you own | **Yes, in the browser** | | | | | | |

*(Blank cells are filled in at build time.)*

**Per-competitor angle** (each page: H1, the knockout line, 3 sections,
CTA):

| Page | H1 | Knockout line |
| --- | --- | --- |
| Proloquo | **Pip vs Proloquo: your child's board, or theirs?** | "Proloquo rents your child's voice for $9.99 a month and won't let you customize the board. Pip is free, $49 once, and yours to shape." |
| Proloquo2Go | **Pip vs Proloquo2Go: $0 vs $249.99** | "Five families get Pip Lifetime for the price of one Proloquo2Go." |
| TouchChat | **Pip vs TouchChat: $0 vs $299.99** | "$299.99 before your child says a word. Pip: every word free tonight." |
| LAMP WFL | **Pip vs LAMP: motor planning without the lock** | "LAMP is right that words shouldn't move. Pip agrees, and still lets you make the board your child's." |
| TD Snap | **Pip vs TD Snap: no subscription to speak** | "Your child's voice shouldn't stop when a payment does." |
| CoughDrop | **Pip vs CoughDrop: every helper free** | "CoughDrop charges helpers to edit. In Pip, Grandma, the SLP, and the teacher are always free." |

Each page closes with: **"Try Pip tonight alongside what you have. It's
free, so it costs you nothing to see the difference."**
**[Create your child's board — free →]**

---

## 10. /pricing and /about

**/pricing.** H1: **Free. Or $49 once. Never a subscription.** The free vs
Lifetime table from § 6, the schools row (license codes, 50% off 20+, POs),
and the promise block: *nothing is ever taken away · no time limits ·
never deleted for money · every helper free · SLPs free.* Close: **"Why
so cheap? Because a voice shouldn't be a profit center. Pictures and
voices are shared by every family, storage costs pennies, and we price
what it costs us plus a fair margin, not what the market has put up
with."**

**/about.** H1: **We built Pip because [founder story].** Structure:
the founder's story (from the interview, in the founder's words) → why the
industry made us angry (price, rent, one-size-fits-all) → our promises
(the § 7 beliefs as one-liners) → contact.

---

## 11. FAQ (full)

**Money**

1. **Is Pip really free? What's the catch?** Every built-in word speaks,
   free, forever. You also get 20 words of your own, your child's device
   plus one helper, backup, all voices, and feelings. If you want more,
   it's $49 once. That's the whole catch.
2. **What does $49 get me?** Unlimited words of your own, every helper on
   the team, the full progress dashboard and report, and 300 drawings. Once.
   Forever.
3. **Will you ever make it a subscription?** No. A voice is not rented.
4. **Is it $49 per child or per family?** Per child: the person who
   speaks. Every adult helper is free.
5. **I'm an SLP. Do I pay?** Never.
6. **Can our school buy it?** Yes: license codes, 50% off 20 or more,
   purchase orders welcome.
7. **Why is it so much cheaper than the others?** Because we price what it
   costs us, not what families have been forced to pay.

**Making it yours**

8. **Can I really change anything?** Any word in any spot. Your photos,
   your names, your recordings. Show or hide groups. Start with 15
   buttons or 90.
9. **Won't changing things confuse my child?** Nothing changes unless you
   change it. Pip never moves, hides, or reshuffles words on its own, and
   when you do move one, Pip shows you first.
10. **Will the buttons move around?** Never on their own. Suggestions live
    in a strip at the top; the board stays put.
11. **Can I record my own voice for a word?** Yes, for any word or name.
12. **Can my child say things with feeling?** Yes: happy, sad, or angry,
    for any sentence.
13. **What if my child outgrows the board?** Grow from 15 to 30, 60, or 90
    words without starting over.

**Getting started**

14. **What do I need?** An iPad, or any device with a modern browser.
    Tap *Create your child's board*. That's it.
15. **Do I need an account to start?** No. Build the board first. When
    you've added your own people, save it with your email so it's backed
    up.
16. **What if the iPad breaks?** Open Pip on any device and scan your
    child's card. Everything comes back.
17. **How do grandparents and teachers join?** Invite them as helpers on
    their own phones or laptops.
18. **Is Pip for teens and adults?** Yes. Choose "a teen or adult" when
    you start, and you can choose words-only buttons.
19. **Can I bring my board over from another app?** Pip is built
    differently, so you'll set up fresh, but it's quick, and many families
    run Pip alongside their old app while they switch.

**Trust**

20. **Does Pip listen to us?** No. The microphone is only used when you
    choose to record a word.
21. **Does Pip replace speech therapy?** No. It makes therapy and home
    work together.

---

## 12. Roadmap

| Step | Ships |
| --- | --- |
| **1 — Home** | Full long-form home page (§ 6), designed and deployed. DNS: delete the stale apex/www records, then `npm run deploy:site`. |
| **2 — The argument** | /method (§ 7). |
| **3 — The channel** | /slps, /pricing, /faq. |
| **4 — The attack** | /compare hub + six competitor pages. |
| **5 — The rest** | /about (founder interview), /schools, /privacy. Later: /learn, /press. |
| **6 — Proof** | Founding families: real stories, real words, with consent. |

---

## 13. Where we start

**The home page: the hero first, as a designed mockup, then the full
page.**

1. **Hero mockup** (desktop + phone): the struck-through $300 headline,
   the sub, the CTA, the iPad with a family board. One review with the
   founder.
2. **Full home build** in `site/public/index.html`, top to bottom from
   § 6, with the receipt and Frozen vs Stable visuals.
3. **Deploy** once DNS is cleared.

---

## 14. Founder inputs still needed

1. **Founder story** for /about: a 20-minute interview.
2. **Contact address**, e.g. `hello@pipaac.org`.
3. **The Protect card copy** in § 1 is a suggestion for the app; adopt it
   or not.
