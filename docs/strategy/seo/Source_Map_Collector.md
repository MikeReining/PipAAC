# Source map collector

**Spec + Slice A built 2026-10-06.** The rules for what the rows mean live in
`docs/strategy/SEO_Playbook.md`. If this spec and the playbook
disagree, the playbook wins, and this file gets edited in the same
change.

This is not a product phase. `docs/phases/` is the app queue. This
tool runs on the founder's Mac, reads public search pages, and writes
notes under `docs/strategy/seo/`.

## Founder ruling

No API calls. No suggest endpoint, no SerpAPI, no Search Console API,
no OpenAI, Gemini, or Perplexity HTTP API. The collector looks at the
same screen a person sees, in a local browser or a local app, and
writes down the links that are actually there.

A hand-rolled loop over a paid endpoint is still a batch run and
still needs the same approval as bulk art or voice. This tool does
not ask for that approval because it never makes those calls.

## What the tool does

Once a month it turns the buyer questions into a source map.

1. Read the seed phrases.
2. In Google, read the suggestion dropdown, People Also Ask, and the
   related searches. That expands the phrase list.
3. For each kept phrase, open Google's first results page and a fresh
   ChatGPT answer. Record every cited or ranking URL the screen shows.
4. Fill `destination` from the rule table below when the rule matches.
   Leave `realistic` blank. A person fills that later.

TikTok Creator Search Insights is out of this tool. It only opens
inside the phone app. Someone types those queries by hand.

## Where it runs

The founder's Mac. Checked 2026-10-06:

| Installed | Use in v1 |
| --- | --- |
| Google Chrome | Yes. The only browser the collector drives. |
| ChatGPT.app | Slice B, only if chatgpt.com in Chrome cannot show sources. |
| `claude` CLI, Claude.app, `grok` CLI | Not a v1 engine. A model answer with no web citations is not an observation. |

Gemini and Perplexity are not installed. The run records
`engine not available` and continues. Slice C is how one of them gets
added later, through a local app, under the same proof.

The founder logs in once, in the collector's Chrome window. The
script never types a password, never reads 1Password, and never copies
cookies into the repo.

## Slices

Build them in order. Slice A is useful on its own.

**Slice A. Google.** Seeds, suggestion dropdown, People Also Ask,
related searches, organic results, AI overview when the box is
present, destination rules, tests, gitignore.

**Slice B. ChatGPT.** Same Chrome profile, chatgpt.com, a new chat
for every phrase, citation links only.

**Slice C. Another local engine.** Only after that engine's own app
or CLI prints or shows real web citation URLs. Same proof as the
others. No HTTP client inside the adapter.

## Command

Wire these in `package.json`. Node, same as the rest of the repo
(`>=24`). Driver: Playwright, launched against the installed Chrome
(`channel: "chrome"`), with a persistent profile at `data/seo/profile/`.
A different driver is allowed only if the smoke check below still
holds.

```text
npm run seo:collect                      # full monthly run
npm run seo:collect -- --dry-run         # print the phrase queue, no browser
npm run seo:collect -- --limit 1         # first seed only, live, for the smoke check
npm run seo:collect -- --engine google   # one engine
npm run seo:collect -- --force           # ignore today's saved pages
```

One run at a time. Take a lock file under `data/seo/`. A second
invocation exits and names the lock. One query at a time. One window.
Wait until the results or the answer are visible, and give up on that
query after 30 seconds. Pause 3 to 8 seconds between queries.

## Seeds

Create `docs/strategy/seo/buyer-questions.json` with these phrases,
copied from the playbook:

- best AAC app for iPad
- free AAC app for a nonverbal child
- AAC app without a subscription
- Proloquo2Go alternative
- TouchChat vs Proloquo2Go
- AAC app the therapist and the family can both edit
- how to start AAC before the device is funded

`--check-seeds` fails if a phrase is in the JSON and missing from
`SEO_Playbook.md` § Buyer questions, or the other way around. Edit
both in the same change. The playbook stays the list a person reads.

## Expanding phrases

Google only. For each seed:

- Focus the search box and type the seed. Do not press Enter yet.
- Read every suggestion in the dropdown.
- Press Enter.
- Read every People Also Ask question.
- Read every related search.

Do not type a suggestion back into the box. One level of expansion.

Keep every seed. Dedupe the rest without case sensitivity. Keep at
most 18 extra phrases, 25 phrases in the citation pass. When there
are more than 18 extras, keep the phrase that showed up under the
most seeds, then the one Google listed earlier. Write the dropped
phrases at the top of the run note so a person can pull one back.

## What to record

For each kept phrase, for each engine that ran.

**Google.** The organic results on the first page. Engine value
`Google`. Skip anything labeled Sponsored or Ad. Skip Chrome and
Google account chrome (sign-in, maps pin, support footer). Do not
open page 2.

**Google AI.** If an AI overview box is on the page, record the links
inside that box with engine `Google AI`. If the box is absent, write
one note for that phrase, `no AI overview`, and move on.

**ChatGPT.** A new chat per phrase. Send the phrase as written, with
nothing added before or after it. Wait until the answer stops. Record
the URLs in the sources panel, footnotes, and link cards. Engine
value `ChatGPT`. Zero links means one row with an empty URL and the
note `no citations shown`. Do not scrape URLs out of the model's
prose and call them citations.

## Columns

The playbook § The source map owns this table. Implement these fields.

| Column | Who fills it |
| --- | --- |
| question | The phrase that was typed |
| engine | `Google`, `Google AI`, `ChatGPT`, later `Gemini` or `Perplexity` |
| url | The link on the screen. Empty only for the explicit notes above |
| domain | Hostname of `url`, lowercase, no leading `www.` |
| page type | A host rule below, otherwise blank |
| realistic | Always blank. A person sets Yes or leaves it |
| destination | A rule below, otherwise blank |
| checked | The run date, `YYYY-MM-DD` |

Page type, and only these hosts:

| Host | page type |
| --- | --- |
| reddit.com | forum |
| youtube.com, youtu.be | video |
| wikipedia.org | other |
| apps.apple.com, play.google.com | directory |

Every other page stays blank. Guessing "listicle" or "review" from a
title is a person's job during review.

Destination, first match wins. Match against the URL and the visible
title, case insensitive.

| Match | destination |
| --- | --- |
| proloquo2go, proloquo 2 go | `/compare/proloquo2go` |
| touchchat, touch chat | `/compare/touchchat` |
| lamp words for life, lamp-words | `/compare/lamp-words-for-life` |
| td snap, tdsnap | `/compare/td-snap` |
| coughdrop, cough drop | `/compare/coughdrop` |
| proloquo | `/compare/proloquo` |
| The phrase is about price, cost, subscription, or a free AAC app, and no row above matched | `/pricing` |
| The page is about SLPs or speech therapists, and no row above matched | `/slps` |
| The page is about a school or a classroom set, and no row above matched | `/schools` |

`proloquo2go` is listed before `proloquo` so the longer name wins.
`td snap` does not match every Tobii page. An eye-gaze manual stays
blank. Blank is the right answer when the rule is unsure. Do not
default the homepage.

## Files

```text
scripts/seo/collect.mjs              # CLI and browser driver
scripts/seo/phrases.mjs              # seed check, dedupe, cap
scripts/seo/destination.mjs          # the table above, pure
scripts/seo/collect.test.mjs         # parser, destination, seed check
docs/strategy/seo/buyer-questions.json
docs/strategy/seo/runs/YYYY-MM-DD.md # committed summary
docs/strategy/seo/source-map.md      # living map, created on first run
data/seo/profile/                    # Chrome profile, gitignored
data/seo/runs/YYYY-MM-DD/            # raw text, jsonl, screenshots, gitignored
```

Add to `.gitignore`:

```text
data/seo/profile/
data/seo/runs/
```

The committed run note contains the phrase list, the dropped phrases,
the table of rows, and per-engine notes (`no AI overview`,
`no citations shown`, `engine not available`). It does not contain
HTML, screenshots, or cookies.

Raw jsonl, one object per row, stays in `data/seo/runs/` so a rerun
the same day can skip a phrase and engine already saved. `--force`
ignores that cache.

## The living map

`docs/strategy/seo/source-map.md` is the file the playbook names.
The collector may add a row whose question, engine, and url are not
already there. It must not delete a row, must not change `realistic`,
and must not replace a destination a person has edited. Regenerating
the dated run note from scratch is fine. Regenerating the living map
from scratch is not.

After the merge, print three short lists: domains new since the
previous run, domains that disappeared, and rows whose destination
is still blank.

## When the page gets in the way

A captcha, a consent wall, or a login wall stops the run. Leave the
window open. Exit with code 2 and one line: finish the check in the
open window, then rerun. Phrases already saved today stay saved, so
the rerun continues rather than starting over. Do not click through
the wall in a loop. Do not refresh in a burst.

A timeout on one query records `timed out` for that phrase and engine
and continues with the next.

## Proof

Parser and destination tests use small HTML and text fixtures written
for the test. Do not check in a saved Google page.

The destination tests must cover every row of the match table,
including a title that contains both "Proloquo2Go" and "Proloquo" and
resolves to `/compare/proloquo2go`.

The smoke check is `--limit 1` with a live browser. Before extracting
links, save the visible text of the results page into the raw run
folder. Every URL written for that page has to appear in that saved
text. A URL that the parser emitted and the page text does not contain
fails the run. That is the check that the tool observed the page.

`scripts/seo/` must not mention `suggestqueries`, `serpapi`,
`serper`, `api.openai`, `generativelanguage`, or `api.perplexity`.
Add that list to the test file as a source scan.

## Done

- `--dry-run` prints the seven seeds and does not open a browser.
- `scripts/test.sh scripts/seo/collect.test.mjs` passes.
- `--limit 1` on Google writes a run note with at least one URL, and
  that URL is in the saved page text.
- Slice B either records ChatGPT citations under the same proof, or
  the run note says `engine not available` or `no citations shown`
  and contains no invented URL.
- The profile directory and the raw run directory are gitignored.
- A second overlapping run exits on the lock.

## After the run

A person reads the dated note, sets `realistic` on the living map,
and fills blank destinations. The outreach list is the domains that
earned a Yes. Reddit, YouTube, Wikipedia, and the app stores can stay
on the map as watch rows. The playbook says how that choice is made.
The collector does not pitch, draft, or send.
