# SEO playbook

**v1 — 2026-10-05.** This is the guide for how pipaac.org gets found.
Follow it. When a step is done, a play starts working, or a rule turns
out to be wrong, edit this file in the same change. Do not open a second
SEO doc, and do not park this work in `docs/phases/`. Phases are for
product slices. Discovery is this playbook plus the notes it names.

Read this before drafting a pitch, adding a marketing page "for SEO",
or reporting that Pip is hard to find.

## The job

A parent or an SLP looking for an AAC app asks a question. "Best AAC
app for iPad." "Proloquo2Go alternative." "An AAC app that is not a
subscription." Google answers with a list. ChatGPT, Gemini, and
Perplexity usually search first, with something like "best AAC app
2026", read the pages that rank, and recommend whoever those pages
already recommend. A perfect page that nobody cites stays invisible.

The work is to get the pages we already have into the articles those
buyers are already reading. The compare pages are that asset. Links
exist so a specific page shows up for a specific question. They are
not a score we collect.

v1 comes from the operating order in [Borja's 2026-10-04 note](https://x.com/borjafat/status/2106860317481525608)
on running link building as a small department: citation map first,
collect what you already earned, give a publisher something before you
ask, get onto the lists, then add links slowly. We kept that order.
We did not adopt the product around it. No Distribb account, no
backlink exchange, no imported skill pack. Claims come from our own
docs. A human sends every email.

## What we measure

The scoreboard is Google Search Console on `https://pipaac.org`.

- Impressions and clicks on the buyer questions below.
- Which of our URLs earn them.
- Whether a compare page has reached the top 10 for one of those
  questions.

That is the report. A third-party domain score (Domain Rating,
Authority Score, Trust Flow) is someone else's estimate. We can leave
the cell blank. We never invent a number to fill it.

A link is judged over months. A URL that received a link in the last
60 days is still in the waiting room. The first months on a new site
look flat. Flat is the expected shape, not a reason to change the plan.

Search Console reads Google's own record of search. It is the one
measurement tool this playbook allows. The marketing site stays
free of analytics pixels, and nothing in this work is added to
`app.pipaac.org`. The origin split is the point: marketing never
shares an origin with child data (`docs/product/SSOT.md`, domain row).

## Who does what

Three seats.

**The page.** `site/public/` is what gets cited. Prices, the free
tier, and "never a subscription" match
`docs/product/Pricing_And_Packaging.md` § 4. Competitor facts match
`site/compare-data.json`, which is regenerated into
`site/public/compare/` with `npm run site:compare`. A pitch that
disagrees with those two files is wrong, even if it sounds sharper.

**The agent.** Finds prospects from the source map, opens their page,
checks each claim, drafts the note, and names the one destination URL.
The agent writes only what it opened that week. An empty email, an
unknown price, and a missing domain score stay empty. The agent does
not send mail, does not buy a placement, and does not run a script
that loops a paid chat API to "refresh the source map." Asking the
buyer questions is a manual monthly pass. A hand-rolled loop over a
paid endpoint is a batch run and needs the same founder approval as
bulk art or voice.

**The founder.** Sends every email from `mike@pipaac.org` and approves
every placement. Drafts wait in `docs/strategy/seo/drafts/` until then.

SLP research outreach (`SLP_Outreach_System.md`) uses the same mailbox
and the same contact memory. A person already in that program does not
also receive a discovery pitch. Research mail asks them about the
product. Discovery mail is about their article. Those stay different
conversations, and the contact record is checked before a draft is
written.

## The order

Each step is empty work until the one above it exists.

1. Instrument the site so Search Console can see it.
2. Fix the buyer questions, in this doc.
3. Map who already gets cited when those questions are asked.
4. Collect mentions and links we already earned.
5. Give ten publishers a verified correction, with no link ask.
6. Add further placements slowly, one reviewed placement a day at most.
7. Read Search Console every Monday.
8. Pitch listicles from the source map. The compare pages are already
   worth listing. The pitches still wait until the map exists, so we
   are writing to pages buyers actually see.

## 1. Instrument

Done when all of these are true.

- `https://pipaac.org/` serves the site, and `www` redirects to the
  apex. True as of 2026-10-05.
- `site/public/robots.txt` allows crawling and names the sitemap.
- `site/public/sitemap.xml` lists every indexable URL. Include the
  compare pages. Leave out the 404.
- Every indexable page carries a canonical URL on `https://pipaac.org`.
- The Search Console property is verified, the founder can open it,
  and the sitemap is submitted.

As of v1, the repo has no `robots.txt`, no `sitemap.xml`, and no
canonicals. That is the first build. Connect Search Console before the
first pitch. A draft written earlier has nowhere to learn from.

## 2. Buyer questions

These are the prompts we type into the engines, and the queries we
watch in Search Console. Re-ask them on the first Monday of the month.
The answers move.

Parents:

- best AAC app for iPad
- free AAC app for a nonverbal child
- AAC app without a subscription
- Proloquo2Go alternative
- TouchChat vs Proloquo2Go

The team around the child:

- AAC app the therapist and the family can both edit
- how to start AAC before the device is funded

Add a question when Search Console shows real impressions for a
phrasing that is not on this list. Drop a question after a quarter
in which it drew none. Edit the list here so the next pass uses the
same words.

## 3. The source map

Once a month, ask every buyer question in ChatGPT, Gemini, Perplexity,
and Google — both the AI overview and the ordinary results. Open every
cited URL and every result on the first page. Record one row per URL:

| Column | What goes in it |
| --- | --- |
| question | The buyer question, copied from § 2 |
| engine | ChatGPT, Gemini, Perplexity, Google, or Google AI |
| url | The cited or ranking page |
| domain | Hostname only |
| page type | listicle, review, clinical, directory, forum, video, or other |
| realistic | Yes only if a careful pitch could earn a mention this quarter |
| destination | The one Pip URL that page would deserve, from the table in § 5 |
| checked | The date the page was opened |

File it at `docs/strategy/seo/source-map.md`. Replace the rows for an
engine when that month's pass is done, and keep a short note of what
changed. Create the folder on the first pass.

**Realistic** means a person edits that page and might update it
because we showed them something true. Reddit, YouTube, Wikipedia, the
app stores, and journal publishers stay on the map as watch rows.
They tell us who the engines trust. They are not the outreach list
this quarter. The people we write to are the parent blogs, SLP
resource roundups, and special-education lists in the tail.

Rank the outreach list by how often a domain appears across engines
and questions. A quiet page that three engines cite is ahead of a
famous domain that never comes up for these questions.

## 4. Collect what is already ours

Run this before the first cold note, and again each quarter.

- **Lost links.** A link that lands on a page we moved or deleted
  should redirect to the page that replaced it. Restoring the page is
  better. Sending every old URL to the homepage wastes the link.
- **Unlinked mentions.** Search `"Pip AAC" -site:pipaac.org` and
  `pipaac.org -site:pipaac.org`. Someone named the product and did not
  link. Ask them to add the source so a reader can check the claim.
- **Tools we pay for.** A customer story is worth offering only when
  we can show real use, with screenshots we are allowed to publish.
  Vendors often link out to the customer they feature. Skip the story
  if we cannot show the work.

v1 will probably come back empty. Write "none" and the date at the top
of `docs/strategy/seo/source-map.md`. An honest empty is the baseline.

## 5. One link, one destination

A publisher links to the page that finishes the reader's job. The
draft names that URL before any sentence is written.

| The sentence is about | Link to |
| --- | --- |
| Proloquo (the subscription app) | `/compare/proloquo` |
| Proloquo2Go | `/compare/proloquo2go` |
| TouchChat | `/compare/touchchat` |
| LAMP Words for Life | `/compare/lamp-words-for-life` |
| TD Snap | `/compare/td-snap` |
| CoughDrop | `/compare/coughdrop` |
| Choosing among them | `/compare/` |
| Price, the free tier, $49 once | `/pricing` |
| How Pip is built | `/method` |
| Modeling AAC at home, or a parent who can't reach the iPad | `/modeling` |
| Therapists, and that the SLP does not pay | `/slps` |
| A school or a classroom set | `/schools` |
| A general mention of the product | `/` |

`/about` becomes a destination once the founder story replaces the
`TODO(founder)` note in `site/public/about.html`. Until then it is a
thin page, and we do not ask anyone to cite it. `/privacy` and `/faq`
are trust pages. They belong on the sitemap. They are not pitch targets.

Anchors on other people's sites are "Pip", "Pip AAC", the URL, or
plain words ("this comparison", "the pricing page"). An exact-match
anchor such as "best free AAC app" is for the rare link we would still
want if the anchor were just the brand name. A run of keyword anchors
is the easiest footprint for a spam system to see.

## 6. Give something before you ask

The first email about a page contains a finished correction and no
request for a link.

Build it from their page, in their voice.

- **A stale fact.** A price, a version, or a product name that their
  page still states. The sheet has the old sentence, what changed, the
  source URL, and a replacement sentence they can paste.
- **A dead product that still looks alive.** The app shut down, was
  acquired, or left AAC, and the URL still loads, so a broken-link
  checker never flags it. Send the notice and replacement copy for
  that slot. If Pip is not the closest thing they could put there,
  name the product that is. Editors remember who did not oversell.
- **A list that is missing the job we actually do.** The list
  recommends two or more of Proloquo, Proloquo2Go, TouchChat, LAMP
  Words for Life, TD Snap, and CoughDrop, and never mentions an option
  a family can start tonight without a subscription or a $300
  license. Pitch one reader need the list does not cover. Point at
  the compare page that proves it. This pitch uses the source map. It
  is not a blast to every AAC roundup on the internet.

The verify gate is the whole craft. Every factual sentence was opened
and checked, the same week, against the vendor's own page and against
`site/compare-data.json`. Six true corrections earn a reply. One
invented price or clinical claim, and that editor is right to ignore
us from then on. We do not claim speech outcomes, funding results, or
"SLPs prefer Pip." We claim what the pricing doc and the compare file
say, and we quote the vendor when we describe the vendor.

If they ask to be paid, the conversation stops. v1 does not buy
links. A paid placement would have to carry `rel="sponsored"` or
`rel="nofollow"`, and it would be a separate founder decision.

Volume for this kind of note is 10 to 30 a month. Each one is
obviously about a single page. That limit is what keeps them human.

## 7. Pace

Gift notes are the body of the work. On top of them, at most one
further reviewed placement a day, and only a placement a reader of
that paragraph would actually want to click. A new domain that grows
dozens of links in an afternoon looks automated. In a category about
how a child talks, it also looks careless.

We do not join a link exchange, a credit network, or any program that
places links in bulk. Excessive link exchange sits under Google's
spam policies no matter how on-topic the sites are. The test for every
placement, exchange or not: would a parent or an SLP reading that
paragraph want this link?

## 8. Monday review

Once a week, open Search Console and write a few lines to
`docs/strategy/seo/reviews/YYYY-MM-DD.md`.

- Buyer questions that gained or lost impressions.
- Our pages that moved.
- Links we know we earned, with the destination URL and the date the
  founder sent or the editor published.
- What we will not chase next week.

Leave any URL alone for 60 days after its first earned link. Raise
the pace in § 7 only after a compare page sits in the top 10 for a
buyer question. Until that happens, the pace stands.

## Pages worth citing

Live on pipaac.org today:

- `/` — what Pip is
- `/pricing` — free to start, $49 once
- `/method` — how it is built
- `/slps` — the therapist does not pay
- `/schools` — a classroom set
- `/compare/` — the hub
- `/compare/proloquo`
- `/compare/proloquo2go`
- `/compare/touchchat`
- `/compare/lamp-words-for-life`
- `/compare/td-snap`
- `/compare/coughdrop`

A new article or a new landing page has to do a job this list does
not already do. "We need a blog for SEO" is not that job. Phase 035
left a blog out of scope on purpose. Adding one is a founder
decision, made by editing this section first.

## First execution

Check these here when they are done. Keep the note short: date, what
landed, and where the evidence is.

- [ ] `robots.txt`, `sitemap.xml`, and canonicals, deployed with the site
- [ ] Search Console verified for `https://pipaac.org`, sitemap submitted, founder can open it
- [ ] First source map filed at `docs/strategy/seo/source-map.md`
- [ ] Reclaim pass written down, including "none" if that is the truth
- [ ] Ten gift drafts in `docs/strategy/seo/drafts/`, each verified, none sent until the founder sends them
- [ ] First Monday review after Search Console has data

## How this doc changes

Edit this playbook when a buyer question earns a place or loses one,
when a play produces placements or gets ignored often enough to stop,
when the destination table gains a page, or when a rule here conflicts
with a newer founder decision.

Week-to-week evidence goes in `docs/strategy/seo/`. The rules stay
here, so the next session starts from the guide instead of from a
chat.
