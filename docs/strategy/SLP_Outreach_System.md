# SLP outreach system

Status: revised research-first proposal, 2026-10-05. Non-commercial classification
is a design objective, not a legal determination or a proven exemption.
No accounts connected, prospects imported,
emails sent, scheduled jobs enabled, or billing changes made by this slice.

## Founder intent

Produce researched, personal email drafts; remember every contact and reply;
solicit critical professional input on Pip's AAC interface by email. The initial
program is product research, with actual questions and findings that inform
development. Calls are not part of it. Different agents should be able to do
the writing without resetting the contact history. Any later acquisition or
promotion campaign has its own message classification and eligibility decision.

SLP distribution intent: [SLP_Channel.md](SLP_Channel.md). Current free/paid
copy owner: [Pricing_And_Packaging.md](../product/Pricing_And_Packaging.md),
section 4.2. Product claims require current supporting evidence; old strategy
prose is not evidence that a capability shipped.

## Fast lane: founder finds a site, agent drafts (live 2026-10-06)

Founder pastes a URL (a blog, clinic or SLP page found while browsing). The
agent, in one pass:

1. Fetches the page, takes the published contact email verbatim (never guesses
   one), and runs `node scripts/outreach/draft.mjs --check <email>`; a hit
   (same address or same domain) stops unless the founder says write again.
2. Reads 1–3 of their own posts and picks **one** angle: the single Pip
   feature that matches something they actually wrote. Quote one real line.
   Matching pages: `/modeling` (modeling without expectation, phone lights the
   word), `/add-any-word` (own words, Pip draws them), `/slps`, `/method`,
   `/compare`. Read the page before claiming what it shows.
3. Writes ≤ 100 words: their line → who Mike is → what Pip does in one plain
   sentence → ask for honest feedback → optionally, if they write for
   families/SLPs, whether they'd want to write about it → one link → sign-off.
   No P.S. Subject = their topic, not ours.
4. Saves it with `draft.mjs` (Gmail API as mike@pipaac.org). The script reads
   the stored draft back and deletes it unless From is mike@pipaac.org and
   every link is verbatim; only then does it log. Founder reads, edits, sends.
   Never use the claude.ai Gmail connector to write outreach drafts: it rewrites
   every link into a google.com/url redirect (anthropics/claude-code#94247).
   Never fall back to a prefilled compose URL: it doesn't show the sending
   account.

### Gmail API setup (once)

1. console.cloud.google.com, signed in as mike@pipaac.org → new project
   "Pip Outreach" → APIs & Services → enable **Gmail API**.
2. OAuth consent screen → audience **Internal** (Workspace; no review, token
   doesn't expire weekly) → app name "Pip Outreach".
3. Credentials → Create credentials → OAuth client ID → **Desktop app** →
   put `GMAIL_CLIENT_ID` and `GMAIL_CLIENT_SECRET` in the repo `.env`.
4. `node scripts/outreach/draft.mjs --auth` → approve as mike@pipaac.org.
   Scope is `gmail.compose` (drafts and send; the script only makes drafts).
   Token: `~/.pipaac-outreach/token.json` (mode 600). Revoke any time at
   myaccount.google.com/permissions.

**Founding Voices** (founder 2026-10-06): reviewers, AAC users and advocates
get a Pip Lifetime code in the first email, given with no strings ("yours
whether or not you write anything"). Never tie it to a mention or review (that
makes it a paid endorsement). One single-use code per person, never a shared
promo code: mint with `POST /admin/v1/license-codes` on app.pipaac.org,
`{"count":1,"batch":"founding-voices:<name-site>"}`. Redeem: Pip Settings →
"Have a code?". The batch label is the record of who got one.

Tone rules: never call Pip "free" or imply it is fully free — there is a
price. Say "new AAC app". No price, no trial, no "download now", no urgency.
If cost comes up, the honest line is the vision: far cheaper than today's
AAC apps, and free if you don't customize much. One link only. Never claim
Mike read something he hasn't — he reviews every draft before sending.

This lane openly asks for a feature, so it is not the research-only program
below. Its basis: the address is published by them for contact, the message is
about their published AAC work, and Mike is identified; honor any "no thanks".
Add a mailing address to the Gmail signature once (CASL/CAN-SPAM).

Log: `~/.pipaac-outreach/log.jsonl` (outside Git; one line per draft opened,
not proof of a send). Gmail stays the truth for what went out and replies.

## Recommended setup

| Component | Job | Initial choice |
| --- | --- | --- |
| Mailbox | Own messages, editable drafts, sends, replies | `mike@pipaac.org` (founder-confirmed) |
| Contact workspace | Own people, practice links, qualification evidence, campaign stage and next action | Attio Free, subject to the first Works Test |
| Agent | Research and write using the shared brief and contact history | Founder's selected agent |
| Research worker | Fetch a bounded set of pages, cache evidence, prepare work and reconcile messages | Small Python runner borrowing selected LocalFlyers patterns; n8n deferred |
| Research storage | Own research jobs, page cache, generation receipts and unresolved operations | Private SQLite database and bounded artifacts, separate from the product |
| Discovery | Find organizations and their public professional contact pages | Official district directories + search + our own crawler; LeadMarina optional comparison |

Gmail is the authority for message state. Attio is the authority for reviewed
contact records, suppression and campaign state. The research store owns job
state and captured evidence; Attio links to that evidence and carries useful
excerpts. The agent proposes writing and interpretation;
it is not the authority for whether a message was sent, delivered, or answered.

Use Attio's existing People, Companies and list views. Do not build a new CRM
or dashboard before the first real campaign works. Send from Gmail initially;
Attio Free's in-product sending has limits and a "Sent with Attio" footer.
Check the needed custom list attributes and agent email visibility on Free
before promising the experience; new accounts initially trial Pro.
Prove one contact, source note, suppression lookup and API update on the actual
account first. If the narrow workflow is awkward, operate the pilot from one
reviewed contact table and postpone Attio. Choose that owner before importing
contacts; do not maintain two independently editable campaign histories.

Attio's supported MCP connection exposes records, notes, tasks and lists to
compatible agents. Gmail drafting uses its supported API through a connector
or workflow. A specific agent may need its own adapter or authentication;
"interchangeable" does not mean every named bot already supports these tools.

Changing agents preserves Gmail, Attio, campaign instructions, source evidence,
draft IDs, thread IDs and next actions. Never migrate campaign memory into a
chat transcript. Background work needs an active scheduler/runner and a
configured generation provider or agent runner; connecting a desktop chat
alone does not make research and writing happen overnight.

## What LocalFlyers actually contributes

Inspection was read-only. No retailer fetch, harvest, schedule change, paid
model call or live infrastructure verification was performed. These are code
paths inspected, not a claim about current production capacity:

| Inspected path in `/Users/mike/dev/LocalFlyers` | Useful part | Adaptation required |
| --- | --- | --- |
| `harvester/src/deal_harvester/cli.py:1373` → `extractor.py:294` → `fetchers.py:483` → `PacedSession.request` → `shopping_gate.py:803` | CLI extraction, warm HTTP sessions, response decoding, optional browser rendering | Add pacing for every outreach host: the existing gate bypasses hosts outside the retailer roster |
| `extractor.py:190`, reached by `fetch_and_extract` | HTML-to-Markdown text and link extraction | Extract professional contact evidence from the original HTML separately; the cleaner drops headers, footers, navigation, forms and scripts |
| `model_runner.py:661` → `run_model` → `model_usage.attempt_started/attempt_finished` | Replaceable model transport and recorded attempts | Bind an outreach job and budget; existing grocery job caps do not automatically cover a new job |
| `adjudication_cache.py:94` → SQLite lookup/callback/store | Avoid repeated model work for unchanged inputs | New keys must include source content hash and qualification brief/version; retain generation provenance and allow deliberate comparisons |
| `scripts/flyer_refresh.sh` → acquisition lock and CLI invocation | Single running job, explicit failure state, dedicated harvest machine pattern | Give outreach its own process, lock, directories and schedule; confirm Mini capacity first |
| `harvest_engine.py:820` → acquire/normalize/artifacts/catalog commit | Central lifecycle and evidence discipline | Reuse the pattern; grocery publications, deal rows, gold lanes and catalog commits are not outreach concepts |

Recommendation: adapt the small useful pieces into an outreach-owned module,
with origin references and focused proof. Do not require a sibling checkout at
runtime or generalize the whole LocalFlyers harvester into a new framework.
Its root README is stale; entrypoints and implementation were used for this review.

## Bounded discovery and qualification

Two sourcing lanes feed the same research queue:

- **Clinics:** discover pediatric speech practices by region, then inspect
  their services and clinicians for actual AAC relevance. AAC clinicians in
  other settings can qualify; pediatric is the initial campaign focus.
- **Education:** seed school districts/boards and regional education agencies
  from official directories. Look for AAC teams, communication specialists,
  AT staff with AAC responsibilities and relevant SLPs. A broad AT title alone
  does not prove fit or purchasing authority.

Use US NCES district/agency directories and Canadian provincial board
directories as seed inventories. Cities organize clinic discovery; district
identity organizes education research. ZIP/postal codes and individual schools
are optional location metadata, not separate crawling jobs. One regional team
may serve many schools; a multi-location clinic may appear in many searches.

Give each organization an opaque ID, aliases and source links. Domain and email
matches propose duplicates for review; they do not silently merge distinct
districts, clinic branches, people or shared inboxes. Share cached pages where
appropriate without merging the organizations that use them.

Proposed pilot defaults:

1. Begin with 30 organizations: 15 clinics and 15 district/regional candidates
   across BC and Washington. Geography is a proposed starting point.
2. Use known official websites directly. Search only for missing websites or
   difficult staff/service pages, with up to 3 queries per organization.
3. Fetch the home page and useful service, team, AAC/AT and contact pages, up
   to 6 content pages total per organization. Robots/permission checks also
   count against the overall request budget. Respect source restrictions.
4. Start with HTTP. Use a bounded browser exception for an accessible page
   whose useful text needs JavaScript. PDFs and complex directories may be
   queued for a targeted second pass. Login, CAPTCHA, 403 and 429 responses
   remain explicit exceptions; stop rather than starting an escalation loop.
5. Extract published contact details, named-role context and source evidence
   from original HTML, including footers, `mailto:` links and structured data.
   Clean text is a separate input for the agent. Do not guess email addresses.
6. The agent reads captured evidence and returns relevant, not relevant or
   uncertain, with a short reason and exact source reference. AAC keywords
   help find pages; they do not decide clinical fit. Do not equate a site-wide
   AAC service mention with every employee being an AAC specialist.
7. Review relevance and contact eligibility separately. Initially select one
   recipient per organization; a published team inbox can be suitable when
   the team is the relevant contact.
8. Aim for 20 sourced contact cards and 5 personalized draft proposals. These
   are yield goals, not guaranteed output: stop at the request/spend ceiling
   and report the actual result, including unresolved organizations.

Each organization records pages checked, discovery source, last research date,
result and next action. "Researched" means the bounded pass ran; it does not
mean every clinician in the area was found. Later passes can revisit unresolved
or stale sources. No national crawl or geographic map UI is needed for the pilot.

ASHA ProFind remains excluded: a research-focused email does not establish that
our commercial company's directory use is permitted. A purchased or scraped
address is not automatic permission to email. Record publication source,
professional relevance, source restrictions, message/program classification
assessment and the eligibility basis appropriate to that assessment. If a
message is commercial, use the applicable consent, identification and opt-out
requirements. Feedback framing alone does not establish an exemption.

## Research purpose and message classification

The CRTC says survey/market-research messages without commercial content fall
outside CASL's CEM requirements, and warns that research cannot disguise
commercial solicitation. Section 1(2) examines message content, links and
contact information to determine whether one purpose is encouraging commercial
activity. Neither the sender's business identity nor future indirect business
benefit alone settles that question. Free access is not an automatic exemption.

Design the actual program and material around critical professional feedback:

- Record a real question before contacting anyone: vocabulary organization,
  navigation clarity or barriers an SLP sees in the interface. Preserve findings
  and their resulting design decisions, including negative findings.
- Identify Mike as Pip AAC's founder. Do not imply academic research, an
  independent study, accreditation or a neutral third-party evaluator.
- The initial email asks for a specific professional review. No benefit pitch,
  pricing/free-tier pitch, purchase/upgrade offer, recommendation/referral ask,
  customer onboarding invitation or link to the marketing/product signup funnel.
- Provide a short factual review packet when the recipient requests it:
  annotated screenshots, a short demonstration or an evaluation-only surface
  with a fictional profile and clear questions. Materials must represent the
  actual product. They are not created or verified in this proposal.
- An evaluation surface would need its own content review. It should avoid
  signup, trial countdowns, upgrade prompts, promotional copy and links into
  those flows. The existing production app/SLP page is not presumed suitable.
  The presence of a research link does not automatically establish classification.
- Respond to the actual request and retain its scope. A generic reply or an
  agreement to review material does not enroll someone in promotional email.
  Requesting consent to receive CEMs by email is itself covered by section 1(3);
  a research-first exchange is not a workaround for marketing consent.
- Keep a separate eligibility decision for later promotion. Never automatically
  convert reviewers into sales leads or add them to newsletters. Unprompted
  word of mouth may happen; soliciting it is not part of this research sequence.

Success here means substantive feedback, completed reviews, clarified design
questions and changes informed by findings. Acquisition, recommendations and
referral counts are not research objectives or triggers. If the actual purpose
remains adoption/referrals and the research request is just the entry message,
this program description does not establish non-commercial status.

Working assessment: this structure has a stronger basis for non-commercial
classification than the earlier product invitation. It is not a certification.
Assess the final email and any attachments, linked pages and subsequent message
in context before execution. Uncertain messages stay in review; do not label
them legally non-commercial merely because they follow a template. CASL is not
a finding about every other applicable privacy or recipient-jurisdiction rule.

## Cost and operating limits

The infrastructure cost can be small; qualification yield and founder review
time remain unmeasured. Existing machinery reduces implementation work, but
does not establish an end-to-end build estimate or free model capacity.

Brave advertises Search at US$5 per 1,000 requests. As an arithmetic example,
100 organizations × 3 queries would be US$1.50 before credits, excluding model
usage, browser/proxy services, hosting and development. That is not a campaign
quote: Brave requires a plan explicitly granting storage rights when API
results are stored, and the selected provider must permit the intended use.
Confirm those terms before integration; do not assume the base price covers
a persistent prospect database.

Proposed first-run ceilings: 30 organizations, 90 search queries, 180 content
pages, 600 outbound requests overall (including search, redirects, browser
subrequests and permission checks) and US$10 in variable paid usage. Fixed
plan/licensing fees are separate. Confirm the provider rate card and implement
observable request accounting before execution. This proposal does not
authorize billing or a paid batch.

Record physical attempts and usage, cache successful evidence/generations,
and stop on the approved ceiling. An unmetered provider cannot enforce a
dollar cap: use explicit attempt/token limits or choose a metered provider.
No paid scratchpad fan-out. Runtime contact/evidence stores stay private and
outside Git; retention and mailbox access scope are chosen during setup.

After the pilot, replenish a small ready queue rather than crawling continuously.
The proposed steady state is 15 reviewed-ready prospects, at most 20 new
organizations researched per weekday, stopping early once the queue is full.
Run the scheduled worker separately on the Mini only after checking capacity;
existing LocalFlyers jobs and schedules are not changed by this proposal.

## Daily experience

Open an SLP feedback list with these filtered views:

- Ready to review: named prospects, AAC evidence, source links and draft reference.
- Replies needing attention: original thread, short summary and suggested reply.
- Follow-ups due: any reviewed, unanswered research invitation needing a decision.
- Feedback received: clinician's actual observations and a suggested next action.
- Exceptions: failed connections, ambiguous mailbox state and unresolved contacts.

Each research card answers "why this clinician?" in one sourced sentence.
Every email already exists as an editable Gmail draft. A reliable draft-open
reference or link must be verified in the chosen client; do not assume a Gmail
API ID is a working web link. Reviewing and sending in Gmail is sufficient.

The daily briefing links to the work and reports real counts, such as prepared
drafts and observed replies. The brief is illustrative until a live run exists.
Gmail drafts cannot receive custom labels; use Attio views for review state.

## Contact record

Store the minimum needed to operate the campaign:

| Information | Purpose |
| --- | --- |
| Name, practice, role, professional email, region | Identify the person and best contact channel |
| Organization ID, type, aliases and reviewed duplicate links | Preserve clinic/district identity across geographic discovery |
| Discovery source URL and date | Explain where the candidate came from |
| AAC evidence URL and short excerpt | Support relevance and the personal opener |
| Contact eligibility basis and evidence | Distinguish found addresses from eligible outreach |
| Research question, reviewed message/material version and classification assessment | Keep the research purpose and actual content inspectable |
| Scope of recipient's request | Limit materials and subsequent replies to what was requested |
| Campaign stage, next action and due date | Make the daily views useful |
| Draft reference, thread reference, sent-message reference | Reconcile with Gmail |
| Draft text/version and producing agent | Compare agent writing without confusing versions |
| Reply excerpt and feedback summary | Preserve source evidence next to interpretations |
| Opt-out/decline/bounce status | Stop further outreach across the campaign |

Match people by normalized email, with manual review of aliases and shared
practice inboxes. Link practice domains to Companies; do not collapse all
clinicians at a practice into one person. Initially contact one person per
practice. Do not collect patient names, diagnoses, client photos or speech logs
for this outreach workspace. Avoid importing unrelated personal mail.

## Research sequence

First audience: clinicians and education teams with public evidence of AAC work. Sender:
`Mike at Pip AAC <mike@pipaac.org>`. Exact region and available discovery budget
are proposed above and remain unapproved for execution. Compare clinics and
education teams separately; neither has proven reply or feedback yield yet.

First pilot: 10 reviewed contacts. Daily target after the pilot: up to 5 new
qualified invitations on weekdays. These are experiment settings, not platform
limits. Candidate discovery may need more than 5 records to find 5 good matches.

1. Research the clinician/practice and establish relevance and contact eligibility.
2. Record the research question and write one brief review invitation with one
   verified personal detail. Review the actual content and classification basis.
   Before any real invitation is sent, the promised interface example,
   questions, fictional profile and message/material assessment must be ready.
   Draft preparation can happen before that first-send readiness check.
3. Create a Gmail draft and link it to the prospect. Founder reviews and sends.
4. Observe the sent message in Gmail before updating the campaign to contacted.
5. If unanswered after 7 calendar days, flag one possible gentle follow-up in
   the same thread. Founder decides whether to prepare/send it during the pilot;
   automated follow-up preparation is deferred until reconciliation is proven.
6. Any reply stops the unanswered sequence. Out-of-office replies require a new
   reviewed due date; declines, opt-outs and hard bounces stop outreach.
7. If the recipient requests review materials, provide the scoped, reviewed
   packet with a small feedback question. Otherwise respond to what they wrote.
8. Capture observations with their source, thank the reviewer and record the
   design finding/next action. Do not ask them to share or recommend Pip.

No appointment links or call requests. No clinical endorsement or outcome
claims. The founder's role remains transparent. Content and actual purpose,
including linked material, determine classification; the template label does not.

### Initial email draft

Subject: SLP feedback on AAC navigation

Hi [Name],

I saw [specific, verified detail about your AAC work]. I'm Mike, founder of
Pip AAC. I'm gathering professional feedback on the vocabulary organization
and navigation in the AAC interface we're working on.

Would you be willing to review a short interface example and email one or
two critical observations about what is confusing or missing?

No call is needed. Please keep any examples general, without client details.

Thanks,
Mike
Founder, Pip AAC
mike@pipaac.org
[Final signature/identity details reviewed for this message.]

Replace placeholders before materializing a prospect draft. Choose a different
factual opener when there is no named clinician. Never invent a personal
connection or suggest the founder read an article they did not inspect.

### Unanswered follow-up draft

Hi [Name],

One follow-up on my request for professional feedback on AAC navigation.
If you would like to review the interface example, please let me know.
If it isn't of interest, I'll leave it here.

Thanks,
Mike
Founder, Pip AAC
mike@pipaac.org
[Final signature/identity details reviewed for this message.]

### Reply when a clinician requests the review example

Hi [Name],

Thanks. Here is the interface example you requested: [reviewed attachment].
It uses a fictional profile.

Looking at [specific screen or task], what feels confusing or missing?
Any critical observations by email would help inform our next design changes.
Please leave out client-identifying information.

Mike
Founder, Pip AAC
mike@pipaac.org

Do not materialize this draft until the requested packet exists and its content
has been reviewed. Additional requests to test functionality need their own
appropriate materials and scope. A response to an actual recipient request can
be exempt from section 6 under regulation 3(b); that is a separate assessment,
not a finding that all subsequent messages are non-commercial or permitted.

## Shared writing brief for any agent

> Prepare invitations for the SLP professional-feedback program. Read its
> research-purpose section, the recorded research question, current product copy
> owner and the contact's source evidence and email history first. Find one
> verified reason the review request is relevant. Write a short, plain email
> from the founder with one specific request for professional critique by email.
> Prefer about 100 words before the signature. Identify the founder honestly.
> No free-tier or benefit pitch, pricing, purchase/upgrade offer, adoption or
> referral request, marketing/signup link, calls, invented familiarity,
> clinical outcomes or unverified capabilities. Linked/attached review material
> requires its own content assessment; do not infer legal classification.
> Save the draft proposal and evidence to the shared contact record. Do not
> infer contact, delivery, use or endorsement from a draft, a click or a model
> summary. Respect opt-outs and existing drafts. Do not send during this pilot.

This brief governs writing. The implementation owns deduplication, workflow
state, message reconciliation, retry behavior and suppression; those rules
cannot live only in the prompt.

## Reliability and measurement

- Re-running a preparation job must not create duplicate invitations.
- Reserve a contact before preparing work; two agents must not claim the same
  contact simultaneously. Implement the reservation in the runner, not a note.
- Record a durable preparation operation before creating a remote draft. A
  crash or timeout after creation but before saving its ID requires Gmail
  reconciliation, not a blind retry. If the draft cannot be identified, hold
  the operation for review. A local unique key alone does not prevent duplicate
  drafts in Gmail.
- Keep human edits in Gmail. Do not overwrite an edited draft on a later run.
- A missing draft is not evidence of a send: inspect Sent and reconcile the
  message; deletion or uncertainty remains an exception, not "contacted".
- Check replies and suppression immediately before preparing/sending any
  follow-up. Background sync can fail or lag; fail visibly and pause dependent work.
- If the contact workspace is unavailable, pause dependent draft preparation.
  Mailbox-observed replies and opt-outs stop work immediately even if their
  projection into the contact workspace is delayed. Reconcile a changed email
  or recipient before using an existing draft.
- "Sent" means the provider accepted it and it appears in Sent. Delivery to the
  recipient inbox is unproven unless measured separately; hard bounces are evidence
  of failure. An email open or site visit is not proof the clinician tried Pip.
- Report unique research invitations sent, actual human replies, requested
  reviews, useful critical observations, design findings and review time. Compare agent
  drafts first on the same saved evidence without emailing the prospect twice.
- Do not track product conversions or referrals as research outcomes. Do not
  join outreach identities to children's app data.

## Ordered implementation slices and Works Tests

1. **Research proof:** implement the small extraction/job loop, first on saved
   fixtures. Include contact details in a footer, AAC mentioned only on a
   partner page, shared hosting and blocked/empty pages. Then run the authorized
   30-organization pilot and inspect sources directly for the proposed cards.
   No email connection is required to produce draft text and prove this slice.
2. **Connect and verify:** founder signs into the branded mailbox and proves
   the narrow Attio Free workflow; choose the fallback contact table if needed.
   Use designated test contacts only. Verify sender authentication and the
   message headers seen in the receiving test inbox before real outreach.
3. **Draft and reconcile:** create a sourced test prospect and Gmail draft;
   founder edits and sends to a second inbox they control. Verify actual receipt
   there, and the correct sent message and contact state in the campaign.
4. **Reply loop and resilience:** reply/opt out from that second inbox. Repeat
   preparation, interrupt a draft creation, switch writing agent, delete a draft
   and disconnect the contact workspace. Inspect Gmail directly to verify one
   intended draft, preserved human edits, explicit exceptions and no further
   invitation prepared after a reply/opt-out. Verify the existing thread is linked.
5. **Real invitations:** founder reviews and sends 10 eligible invitations,
   split across the two sourcing lanes as qualified contacts permit. Assess
   actual replies, requested reviews, useful feedback and review time.
6. **Unattended preparation:** replenish the small queue and materialize up to
   5 new Gmail drafts per weekday after the live loop works. Prepare suggested
   replies; add follow-up drafting only after its stop conditions are proven.
   Automated sending remains a later decision.

Truth owners: Gmail messages; selected contact workspace for campaign records;
research evidence, operation receipts and reservations in the Python runner.
Lie-prone layers: qualification labels, CRM status,
agent summaries, self-reported job success and analytics interpreted as use.
Missing proof: all external integration Works Tests above. This document is a
reviewable setup proposal; it does not claim an operating system.

## Social channels after the feedback loop

These are separate, potentially promotional programs, outside the research
sequence. As a later slice, prepare two useful
LinkedIn post drafts weekly and schedule approved posts through supported
publishing tools. Use anonymized lessons or clinician quotes only with permission.
For Reddit, prepare community-specific contributions and review each community's
rules before publishing; a recurring promotional-post quota is not the goal.
Instagram can reuse approved educational material and support opted-in/inbound
conversations. Cold-DM automation and scraped social profiles are not part of
this crawler. All frequencies here are proposed campaign settings.

## Source checks (2026-10-05)

- [Attio plans and features](https://attio.com/help/reference/workspace-settings-billing/attio-plans-and-features): Free mailbox sync/API; in-product sending limits and footer.
- [Attio MCP](https://attio.com/help/reference/attio-ai/attio-mcp): compatible clients, records, notes, tasks and lists; all plans.
- [Attio email sync](https://attio.com/help/reference/email-calendar/email-and-calendar-syncing): past/future mail sync and communication attributes.
- [Gmail drafts](https://developers.google.com/workspace/gmail/api/guides/drafts): draft creation/update, stable draft IDs, sent-message replacement and draft label restrictions.
- [Gmail sync](https://developers.google.com/workspace/gmail/api/guides/sync): full/partial mailbox reconciliation.
- [LeadMarina MCP](https://leadmarina.com/docs/mcp): discovery and enrichment tools; actual AAC coverage untested.
- [LeadMarina pricing](https://leadmarina.com/): optional comparison source; subscription pricing, not an assumed pay-as-you-go winner.
- [NCES CCD](https://nces.ed.gov/ccd/index.asp) and [directory release](https://nces.ed.gov/use-work/dataset/2024-25-common-core-data-ccd-preliminary-directory-files): US public school/district seed inventories, not AAC qualification.
- [BC district information](https://open.canada.ca/data/en/dataset/87bda664-6d2f-43df-bdd4-9b150d60d67a/resource/a64fb9f8-1790-4063-9187-c59b6f17a228): example Canadian provincial seed source.
- [Brave Search API](https://brave.com/search/api/): advertised search price and explicit storage-rights requirement; terms/provider selection remain setup work.
- [ASHA ProFind](https://www.asha.org/profind/): prohibition on commercial use of profile information.
- [CRTC FAQ](https://www.crtc.gc.ca/eng/com500/faq500.htm): public address publication does not automatically establish outreach eligibility.
- [CRTC survey/market-research FAQ](https://crtc.gc.ca/eng/com500/faq500.htm/): research without commercial content versus research combined with commercial solicitation.
- [CASL section 1](https://laws-lois.justice.gc.ca/eng/acts/E-1.6/FullText.html): CEM purpose/content test and requests for consent to CEMs.
- [Electronic Commerce Protection Regulations, section 3(b)](https://laws-lois.justice.gc.ca/eng/regulations/SOR-2013-221/FullText.html): responding to a recipient's request/inquiry is a distinct section 6 exemption.
- [LinkedIn automation policy](https://www.linkedin.com/help/linkedin/answer/a1340567) and [Reddit spam policy](https://support.reddithelp.com/hc/en-us/articles/360043504051-Spam): social preparation/publishing must fit the relevant platform and community.
- [CRTC consent guidance](https://crtc.gc.ca/eng/com500/guide.htm) and [FTC commercial email guidance](https://www.ftc.gov/business-guidance/resources/can-spam-act-compliance-guide-business): recipient eligibility and commercial outreach requirements must be implemented for the chosen campaign.

## Setup progress

Scope: research-first outreach proposal and replacement invitation templates,
building on the read-only LocalFlyers implementation review.
Changed: this proposal and the strategy index; sender is `mike@pipaac.org`.
Verified: traced LocalFlyers extraction, pacing, model transport/receipts and
harvest lifecycle; current vendor/source documentation; product copy owner;
fresh-context architecture review; proposal whitespace and referenced local
source checks. Research templates/brief were checked for superseded promotional
copy; fresh-context consistency review added the review-packet first-send gate.
No live scrape or account integration ran. Legal classification is unproven.
Runtime audit, full wall and production deploy are not applicable to this
docs-only proposal; external Works Tests remain open.
Left: final email/material classification assessment, actual review packet,
implementation, approved provider/budget, account connections and live proof.
Next: implement the bounded research slice and prove sourced contact cards
and draft text before enabling external jobs or sending invitations.
Save: commit handoff `e6dcae87-5432-4e6d-b75e-a3902127f0f3` timed out waiting
for processing. The proposal and index remain in the working tree; the next
save action is to inspect that queue item and let the commit watcher process it.
