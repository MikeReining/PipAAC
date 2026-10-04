# 042 — Help: answers, one search, Write to us

**Status:** Built 2026-10-04. Founder review open: the "Is this normal?"
answers (§ 4), then the founder checks the hello@pipaac.org inbox for the
production smoke message (§ 6).

## Founder intent (2026-10-04)

Settings had no help: no FAQ, no way to find an answer when a question
comes up (which is mid-use, not on the website), no contact, no feedback.
The site FAQ had no search and wasn't reachable from the app. The founder
looked for Help in the sidebar and never noticed the search box. They typed
"emotions" and got nothing, though feeling faces are exactly that. Search
has to understand what a parent means ("how do you demonstrate things" →
Spotlight and modeling), not match the words.

Rulings: no reply-time promise, just send the email. "Is this normal?"
answers come from AAC best practice, researched and written by the agent.

## Decisions

1. **One source of answers.** `src/help/answers.en.json` (topics + answers,
   each optionally `go: {sec, at}` → a Settings row, `site: true` → also on
   pipaac.org/faq). `scripts/help/build_help.mjs` derives
   `public/help.en.json` (the answers plus every labelled Settings row, read
   from `index.html`) and rewrites the FAQ section and JSON-LD of
   `site/public/faq.html`. Drift gate: `help:index` in `check:fast`. The
   build refuses an answer whose Show me target doesn't exist.
2. **Help is a Settings page** (sidebar, under You), not a separate site:
   a search box, "Start here" (three answers picked by state: offline,
   helper's device, free week over, else first week), topics that fold, and
   Write to us. The top search box searches the same index ("Search or
   ask: …").
3. **Search by meaning, two stages, model-owned** (Design Invariant 7: no
   synonym tables). The hand-written `SYNONYMS` table in `settings-ui.js`
   is deleted. `GET /api/v1/help/search` (`src/worker/help.js`):
   `bge-m3` embeddings (the picture finder's model) pick the 20 nearest
   entries; `bge-reranker-base` (a cross-encoder) orders them; hits under a
   tenth of the best score are dropped. An answer is embedded as its
   question alone and with its answer, and it keeps the better score.
   Settings rows with almost no text are left out because they matched
   everything a little. Entry vectors are cached per help version (isolate
   + colo cache).
4. **Instant and offline pass on the device** (`public/shared/help_search.mjs`
   `localHits`): query words found at the start of words. It paints at
   once. Meaning results replace it when they land, and after that a local
   hit stays only if it holds every query word.
5. **Write to us** = one box (message, optional email, a ticked "include
   app details" whose wording names what is sent and that the child's
   words never are). `POST /api/v1/help/write` emails hello@pipaac.org
   from the verified `accounts@pipaac.org` with Reply-To the parent. If the
   device is offline, the message waits in a local outbox (≤10) and sends
   on `online` or the next Settings open. Per-IP fair use: 20/day, 3/min.
   Search: 500/day, 40/min.
6. **The site FAQ search** (`site/public/site.js`) matches words on the
   page, then asks the app's search (CORS allows pipaac.org only) and shows
   the matching answers.

## Truth owners

| Fact | Owner |
| --- | --- |
| Answer text, topics, Show me targets | `src/help/answers.en.json` |
| Feature claims inside answers | Sentence_Bar.md (✨ ❓ ⏪ ⏩); 040 § 3 (free vs Lifetime); `voices.mjs` (voices) |
| Searchable Settings rows | `public/index.html` (derived by the build) |
| Ranking | `src/worker/help.js` (models); `help_search.mjs` (local + merge) |
| Where messages go | `src/worker/help.js` `HELP_TO` |

## 4. "Is this normal?" — sources (founder review)

The answers paraphrase widely agreed AAC practice, not one source:
ASHA Practice Portal, AAC (no prerequisites; aided language modeling);
ASHA Early Intervention AAC page; Millar, Light & Schlosser 2006 and later
reviews (AAC does not hinder speech, and often helps); Sennott, Light &
McNaughton 2016 (modeling has large effects); AbleNet and PrAACtical AAC on
AAC babbling and repetitive tapping; Speak For Yourself on never taking a
device away as a consequence. The answers make no therapy claims. They say
what's common, point to modeling and the SLP, and say once, at the top of
the topic, that the child's SLP knows them best.

## 5. Proof

**Works Test (owner-visible):** in Settings, type "emotions" → the first
result is Feeling faces with its answer open; Show me lands on the Feeling
faces row, highlighted. Type "how do you demonstrate things" on the Help
page → "How do I teach them to use it?" first. Seen in Chrome against
`npm run dev:agent`, 2026-10-04.

**Ranking instrument:** `node scripts/help/search_probe.mjs <origin>` runs
40 parent-phrased queries, written before the results were seen, against
the real models. Embeddings alone scored 25/39, then 34/39 after the
question-alone vectors and dropping near-empty rows. The reranker brought
it to **37/39**. The misses: "teacher" (the
on-device pass still returns the helpers answer) and "robot voice reads
each word separately". "refund" has no answer and falls through to Write to
us.

**Unit tests:** `src/worker/help.test.mjs` covers Show me targets exist,
the reranker's order is kept, CORS goes to the site only, the email can't
gain a header from form text (seen failing with the sanitising removed),
and the merge rules.

## 6. Open

- Founder: read the "Is this normal?" answers. Then confirm the smoke
  message ("Pip help: [smoke] …") reached hello@pipaac.org: the Worker
  reports `sent: true`, but only the inbox proves delivery.
- Searches that find nothing are not logged yet (proposed: anonymous
  count + query under the research setting). This waits for a privacy
  ruling on storing query text.
- Help content is English only (`help.en.json`), like the rest of the app.
