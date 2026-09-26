# Grok Voice: Catalog Clip Minting

**Status:** founder listen 2026-09-25. Voice `ara`.
**Applies to:** single-word catalog clips from xAI Grok Voice (`https://api.x.ai/v1/tts`).
**Truth owner:** the approved MP3 in `data/samples/approved/`, and the founder's listen. Whisper only checks that the word came through.

Sentences (▶ and the transform buttons) are a different path. Send the sentence as plain text. No phonetic replace, no trailing comma, no speech tags. Context carries *a*, *the*, and *to*.

---

## 1. Rules

1. **Mint locally, ten clips at a time.** The founder listens before any clip is approved. Do not upload to R2 and do not overwrite the ElevenLabs catalog until that listen says the file is the one.
2. **Default payload is the spoken word.** `voice_id: "ara"`, `language: "en"`, `speed: 1`. No speech tags. The one exception is *ow*, shipped as `<loud>ow</loud>`.
3. **IPA is the pronunciation lock, and only an exception.** Use it when spelling produces the wrong word (*a* → "ay", *of* → "Ove", *are* → "R") or when a listen prefers that take (*in*, *to*, *for*). A reduced function-word vowel is not automatically right for a tile that plays alone. `/tə/` for *to* and `/əv/` for *of* both failed the 2026-09-25 listen. *to* shipped as `/tu/`. *of* shipped as `/ʌv/`. *for* shipped as `/fɔr/`. *are* shipped as `/ɑr/`. Leave every other catalog word as plain spelling. A wrong phonetic spelling is a worse bug than the model's own reading.
4. **A trailing comma is the ending lock.** `text: "in,"` keeps an isolated clip from chopping off. Add it only after a listen says that take dies at the end. *in* did not need one: the founder picked the IPA take.
5. **`<soft>` is retired.** The founder listen (2026-09-25) rejected it. The tag performs the word and stretches it: `on_soft.mp3` is 1.08 s and sounds mannered; `and_soft.mp3` (0.84 s) lost to plain `ara_and.mp3` (0.77 s). Do not wrap catalog words in `<soft>`.
6. **The approved file is the clip.** The same payload is not the same performance. `function-words/a_ipa.mp3` is 0.60 s and `ara_a_ipa.mp3` is 0.84 s, both `a` + `/ə/`. Re-synthesizing an approved word churns the catalog. Keep the file the founder picked.
7. **Whisper is an intelligibility check.** Naturalness is the founder's ear. A transcript of "Uh" for *a* shows the schwa landed. It does not show that the clip sounds like a person. A later listen can replace an earlier pick: plain *to* was approved first, then `to_tu.mp3` (`/tu/`) replaced it. Keep the file the founder names.
8. **Trim only at ship time.** Before a clip is baked into the catalog, trim leading silence over 150 ms and trailing silence over 200 ms. The files in `data/samples/approved/` are the untrimmed takes the founder is judging.
9. **A final /t/ or /d/ can leave a detached pop.** The stop closes, the wave goes silent, then a separate burst releases. That burst is the little effect at the end. The explore scorer deducts for `tail_burst`. Prefer a new take over cutting the pop off a file the founder has not heard.
10. **A quiet second sound can hide under the −40 dB gate.** `minute_plain.mp3` (batch-05) died, then rose about 7 dB and held near −43 dB. The gate calls that silence, and the pop detector never fires, so the take tied the clean one and won because it was listed first. The scorer now deducts for `residue_shelf`: after the word, a sub-gate level that rises at least 6 dB and holds for 100 ms. A smooth decay does not. On a score tie, the shorter residue wins, so the first recipe row is not the winner by default.
11. **An echo can hide inside a longer take.** `go_period.mp3` is 0.77 s and `go_plain.mp3` is 0.70 s, so the length bonus picked the echo. The ring is the wave dying below 8% of its peak and then a copy returning, while the voice is smeared (crest under 4) and the pitch falls by 48 Hz or more. The scorer deducts for `echo_return`. A final consonant can bounce back too, without that pitch collapse, and it is not deducted.
12. **A clear final consonant is not a pop, and a tie does not keep the first row.** `wait.` releases a short /t/ after the closure. That used to score as `tail_burst` and lose to a plain take whose pitch fell 78 Hz. A release that peaks under 30% of the vowel and then falls is `consonant_release` and is not deducted. When two takes tie, the one whose pitch falls at least 40 Hz less is the winner. That is why `find.` beats plain `find`, whose pitch fell 64 Hz and which also grew a second blob after the word had died.

`speed: 0.9` was tried on *in* and is not part of the recipe.

---

## 2. Phonetics table

IPA goes in `replace`. The text stays the spelled word so the key matches.

| Word | Text | Replace | Why |
| --- | --- | --- | --- |
| a | `a` | `{ "a": "/ə/" }` | Spelling says the letter "ay". Ear picked this take. |
| an | `an` | `{ "an": "/æn/" }` | Keeps the vowel-nasal word. |
| the | `the` | `{ "the": "/ðə/" }` | Spelling can say "thee". |
| in | `in` | `{ "in": "/ɪn/" }` | Ear picked `ara_in_ipa.mp3`. Plain *in* was also fine. |
| of | `of` | `{ "of": "/ʌv/" }` | Ear picked `of_uv.mp3`. Plain *of* came out as "Ove". |
| to | `to` | `{ "to": "/tu/" }` | Ear picked `to_tu.mp3` over plain *to*. `/tə/` was bad. |
| for | `for` | `{ "for": "/fɔr/" }` | Ear picked `for_or.mp3`. |
| are | `are` | `{ "are": "/ɑr/" }` | Ear picked `are_ar.mp3`. Plain *are* came out as the letter "R". |
| ow | `<loud>ow</loud>` | none | Both loud takes were great. Kept loud alone. Loud plus emphasis also passed and was not kept. |
| close | `close` | `{ "close": "/kloʊz/" }` | Ear picked `close_kloz.mp3`. The verb "shut", not the adjective. |

Plain text, no replace, ear-approved: *and*, *I*, *on*, *up*, *or*, *at*, *it*, *is*, *am*, *was*, *off*, *you*, *TV*, *read*, *aunt*, *who*, *one*, *two*, *our*, *hour*, *yes*, *oops*, *my*, *mine*, *she*, *we*, *they*, *this*, *that*, *want*, *like*, *go*, *come*, *get*, *do*, *see*, *look*, *take*, *give*, *help*, *stop*, *eat*, *drink*, *open*, *turn*, *need*, *feel*, *tell*, *think*, *work*, *out*, *down*, *away*, *here*, *there*, *all done*, *big*, *good*, *over*, *under*. Period takes, ear-approved: *minute*, *put*, *no*, *wow*, *me*, *he*, *make*, *play*, *can*, *find*, *wait*, *happy*, *little*, *more*, *with*. *bad* is `<emphasis>bad!</emphasis>` for now. The ear called it raspy and kept it anyway.

### Rejected payloads

Do not mint these again.

| Word | Payload | Verdict |
| --- | --- | --- |
| to | `{ "to": "/tə/" }` | Bad. Whisper heard "Tuh." The reduced vowel is the wrong tile. |
| to | plain `to` | Replaced. Approved first, then the ear preferred `/tu/`. |
| of | `{ "of": "/əv/" }` | Not great. Whisper heard "of"; the listen still rejected it. |
| of | plain `of` | Not chosen. Whisper heard "Ove". |
| for | plain `for` | Not chosen. Ear preferred `/fɔr/`. |
| are | plain `are` | Not chosen. Whisper heard the letter "R". |
| ow | plain `ow` | Not chosen. Whisper heard "ảo". |
| ow | `<emphasis>ow</emphasis>` | Not chosen. The loud takes were the ones that passed. |
| ow | `<loud><emphasis>ow</emphasis></loud>` | Passed. Not kept. Loud alone was enough. |
| read | `{ "read": "/rid/" }` | Not chosen. Whisper heard "rid". Ear preferred plain `read`. |
| close | plain `close` | Not chosen. Ear preferred `/kloʊz/`. |
| on, up, in, to, and | `<soft>…</soft>` | Retired. Sounds performed. |

---

## 3. Approved clips

These are the files to upload when the catalog moves to `ara`. Nothing has been uploaded.

| Word | File | Payload | Basis |
| --- | --- | --- | --- |
| a | `data/samples/approved/a.mp3` | `a` + `/ə/` | Ear, from `function-words/a_ipa.mp3` |
| an | `data/samples/approved/an.mp3` | `an` + `/æn/` | IPA rule, from `function-words/an_ipa.mp3` |
| the | `data/samples/approved/the.mp3` | `the` + `/ðə/` | IPA rule, from `function-words/the_ipa.mp3` |
| in | `data/samples/approved/in.mp3` | `in` + `/ɪn/` | Ear, from `ara_in_ipa.mp3` |
| and | `data/samples/approved/and.mp3` | `and` | Ear, from `ara_and.mp3` |
| I | `data/samples/approved/i.mp3` | `I` | Ear, from `batch-02/i.mp3` |
| on | `data/samples/approved/on.mp3` | `on` | Ear, from `batch-02/on.mp3` |
| up | `data/samples/approved/up.mp3` | `up` | Ear, from `batch-02/up.mp3` |
| or | `data/samples/approved/or.mp3` | `or` | Ear, from `batch-02/or.mp3` |
| at | `data/samples/approved/at.mp3` | `at` | Ear, from `batch-02/at.mp3` |
| it | `data/samples/approved/it.mp3` | `it` | Ear, from `batch-02/it.mp3` |
| is | `data/samples/approved/is.mp3` | `is` | Ear, from `batch-02/is.mp3` |
| am | `data/samples/approved/am.mp3` | `am` | Ear, from `batch-02/am.mp3` |
| to | `data/samples/approved/to.mp3` | `to` + `/tu/` | Ear, from `batch-02/to_tu.mp3`. Replaces plain `to`. |
| of | `data/samples/approved/of.mp3` | `of` + `/ʌv/` | Ear, from `batch-02/of_uv.mp3` |
| for | `data/samples/approved/for.mp3` | `for` + `/fɔr/` | Ear, from `batch-03/for_or.mp3` |
| are | `data/samples/approved/are.mp3` | `are` + `/ɑr/` | Ear, from `batch-03/are_ar.mp3` |
| was | `data/samples/approved/was.mp3` | `was` | Ear, from `batch-03/was.mp3` |
| off | `data/samples/approved/off.mp3` | `off` | Ear, from `batch-03/off.mp3` |
| you | `data/samples/approved/you.mp3` | `you` | Ear, from `batch-03/you.mp3` |
| TV | `data/samples/approved/tv.mp3` | `TV` | Ear, plain `batch-03/tv.mp3`. The "tee vee" take also passed and was not the one kept. |
| ow | `data/samples/approved/ow.mp3` | `<loud>ow</loud>` | Ear, from `batch-03/ow_loud.mp3`. `ow_loud_emphasis.mp3` also passed. |
| read | `data/samples/approved/read.mp3` | `read` | Ear, from `batch-04/read_plain.mp3` |
| close | `data/samples/approved/close.mp3` | `close` + `/kloʊz/` | Ear, from `batch-04/close_kloz.mp3` |
| don't | `data/samples/approved/dont.mp3` | `<emphasis>don't!</emphasis>` | Ear, `batch-04-for` shortlist |
| can't | `data/samples/approved/cant.mp3` | plain `can't` | Ear, `batch-04-for` shortlist |
| won't | `data/samples/approved/wont.mp3` | plain `won't` | Ear, `batch-04-for` shortlist |
| didn't | `data/samples/approved/didnt.mp3` | plain `didn't` | Ear, `batch-04-for` shortlist |
| wind | `data/samples/approved/wind.mp3` | plain `wind` | Ear, `batch-04-for` shortlist (weather noun) |
| minute | `data/samples/approved/minute.mp3` | `minute.` | Ear, `batch-05` period take. Plain take had a residue shelf. |
| aunt | `data/samples/approved/aunt.mp3` | `aunt` | Ear, `batch-05` shortlist |
| who | `data/samples/approved/who.mp3` | `who` | Ear, `batch-05` shortlist |
| one | `data/samples/approved/one.mp3` | `one` | Ear, `batch-05` shortlist |
| two | `data/samples/approved/two.mp3` | `two` | Ear, `batch-05` shortlist |
| put | `data/samples/approved/put.mp3` | `put.` | Ear, `batch-05` shortlist |
| our | `data/samples/approved/our.mp3` | `our` | Ear, `batch-05` shortlist |
| hour | `data/samples/approved/hour.mp3` | `hour` | Ear, `batch-05` shortlist |
| no | `data/samples/approved/no.mp3` | `no.` | Ear, `batch-05` shortlist |
| yes | `data/samples/approved/yes.mp3` | `yes` | Ear, `batch-05` shortlist |
| wow | `data/samples/approved/wow.mp3` | `wow.` | Ear, `batch-05` shortlist |
| oops | `data/samples/approved/oops.mp3` | `oops` | Ear, `batch-05` shortlist |
| me | `data/samples/approved/me.mp3` | `me.` | Ear, `batch-06` shortlist |
| my | `data/samples/approved/my.mp3` | `my` | Ear, `batch-06` shortlist |
| mine | `data/samples/approved/mine.mp3` | `mine` | Ear, `batch-06` shortlist |
| he | `data/samples/approved/he.mp3` | `he.` | Ear, `batch-06` shortlist |
| she | `data/samples/approved/she.mp3` | `she` | Ear, `batch-06` shortlist |
| we | `data/samples/approved/we.mp3` | `we` | Ear, `batch-06` shortlist |
| they | `data/samples/approved/they.mp3` | `they` | Ear, `batch-06` shortlist |
| that | `data/samples/approved/that.mp3` | `that` | Ear, `batch-06` shortlist. Both takes had a tail burst. |
| this | `data/samples/approved/this.mp3` | `this` | Ear, `batch-06` shortlist |
| want | `data/samples/approved/want.mp3` | `want` | Ear, `batch-06` shortlist. Both takes had a tail burst. |
| like | `data/samples/approved/like.mp3` | `like` | Ear, `batch-07` shortlist |
| go | `data/samples/approved/go.mp3` | `go` | Ear replaced the echo period take with plain `go` |
| come | `data/samples/approved/come.mp3` | `come` | Ear, `batch-07` shortlist |
| get | `data/samples/approved/get.mp3` | `get` | Ear, `batch-07` shortlist. Both takes had a tail burst. |
| make | `data/samples/approved/make.mp3` | `make.` | Ear, `batch-07` shortlist |
| do | `data/samples/approved/do.mp3` | `do` | Ear, `batch-07` shortlist |
| see | `data/samples/approved/see.mp3` | `see` | Ear, `batch-07` shortlist. Whisper heard "C." |
| look | `data/samples/approved/look.mp3` | `look` | Ear, `batch-07` shortlist. Both takes had a tail burst. |
| take | `data/samples/approved/take.mp3` | `take` | Ear, `batch-07` shortlist |
| give | `data/samples/approved/give.mp3` | `give` | Ear, `batch-07` shortlist |
| help | `data/samples/approved/help.mp3` | `help` | Ear, `batch-08` shortlist |
| stop | `data/samples/approved/stop.mp3` | `stop` | Ear, `batch-08` shortlist |
| play | `data/samples/approved/play.mp3` | `play.` | Ear, `batch-08` shortlist |
| eat | `data/samples/approved/eat.mp3` | `eat` | Ear, `batch-08` shortlist |
| drink | `data/samples/approved/drink.mp3` | `drink` | Ear, `batch-08` shortlist |
| open | `data/samples/approved/open.mp3` | `open` | Ear, `batch-08` shortlist |
| turn | `data/samples/approved/turn.mp3` | `turn` | Ear, `batch-08` shortlist |
| can | `data/samples/approved/can.mp3` | `can.` | Ear preferred the period take. Clearer and longer than plain. |
| need | `data/samples/approved/need.mp3` | `need` | Ear, `batch-08` shortlist |
| feel | `data/samples/approved/feel.mp3` | `feel` | Ear, `batch-08` shortlist |
| tell | `data/samples/approved/tell.mp3` | `tell` | Ear, `batch-09` shortlist |
| think | `data/samples/approved/think.mp3` | `think` | Ear, `batch-09` shortlist |
| find | `data/samples/approved/find.mp3` | `find.` | Ear replaced plain `find`. That take's pitch fell 64 Hz and grew a second blob. |
| work | `data/samples/approved/work.mp3` | `work` | Ear, `batch-09` shortlist |
| wait | `data/samples/approved/wait.mp3` | `wait.` | Ear replaced plain `wait`. The period take has the /t/. |
| out | `data/samples/approved/out.mp3` | `out` | Ear, `batch-09` shortlist |
| down | `data/samples/approved/down.mp3` | `down` | Ear, `batch-09` shortlist |
| away | `data/samples/approved/away.mp3` | `away` | Ear, `batch-09` shortlist |
| here | `data/samples/approved/here.mp3` | `here` | Ear, `batch-09` shortlist |
| there | `data/samples/approved/there.mp3` | `there` | Ear, `batch-09` shortlist |
| with | `data/samples/approved/with.mp3` | `with.` | Ear, `batch-10` shortlist |
| under | `data/samples/approved/under.mp3` | `under` | Ear, `batch-10` shortlist |
| over | `data/samples/approved/over.mp3` | `over` | Ear, `batch-10` shortlist |
| more | `data/samples/approved/more.mp3` | `more.` | Ear, `batch-10` shortlist |
| all done | `data/samples/approved/all-done.mp3` | `all done` | Ear, `batch-10` shortlist |
| big | `data/samples/approved/big.mp3` | `big` | Ear, `batch-10` shortlist |
| little | `data/samples/approved/little.mp3` | `little.` | Ear, `batch-10` shortlist |
| good | `data/samples/approved/good.mp3` | `good` | Ear, `batch-10` shortlist |
| bad | `data/samples/approved/bad.mp3` | `<emphasis>bad!</emphasis>` | Ear, for now. Plain and period were raspy. This take still dips to 92 Hz. |
| happy | `data/samples/approved/happy.mp3` | `happy.` | Ear replaced plain `happy`. That take was raspy. |

---

## 4. Request

```json
{
  "text": "a",
  "voice_id": "ara",
  "language": "en",
  "replace": { "a": "/ə/" }
}
```

```javascript
export async function synthesizeGrokVoice(text, {
  voiceId = "ara",
  replace = null,
} = {}) {
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) throw new Error("XAI_API_KEY is not set");

  const body = {
    text: text.trim(),
    voice_id: voiceId,
    language: "en",
    speed: 1,
  };
  if (replace && Object.keys(replace).length > 0) body.replace = replace;

  const res = await fetch("https://api.x.ai/v1/tts", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`Grok TTS failed (${res.status}): ${await res.text()}`);
  }
  return Buffer.from(await res.arrayBuffer());
}
```

A word with no table row calls this with no `replace`. A sentence calls it with the sentence and no `replace`.

---

## 9. Local acoustic tools

**One CLI:** `npm run catalog:audio:inspect -- <command> …` (see `node scripts/catalog/audio_inspect.mjs --help`). Needs `ffmpeg` on PATH.

| Command | Role |
| --- | --- |
| `inspect analyze <files>` | Prosody report (pitch drift, energy shape, loudness) |
| `inspect analyze --gate --spoken the path/to/the.mp3` | Same + `activity_after_silence` gate (WorkbookBench) |
| `inspect audit --file FILE --spoken WORD` | Gate only; exit `1` = review |
| `inspect scan --manifest data/samples/approved/manifest.json data/samples/approved/*.mp3` | Batch scan → `.cache/audio-review/scan-*.json` |
| `inspect trim heal --file FILE --spoken WORD` | Fixed 50 ms tail trims until pass or best effort |
| `inspect fix-burst --in FILE --out FILE` | Detached stop **pop** after a quiet gap (`batch-04` algorithm) |
| `inspect fix-burst batch --dir data/samples/batch-04` | Re-run trims from `manifest.json` `source` → `*_trim.mp3` rows |

**Two repair paths for end junk:** `fix-burst` (RMS gap + burst detector + 12 ms fade) targets final /t/ /d/ releases on contractions. `trim heal` (blind 50 ms steps) targets generic `activity_after_silence` flags (sniff-style acting). The explore score also deducts `residue_shelf` (rule 10): a quiet second sound under −40 dB that rises and holds. That is what demotes `minute_plain` under `minute.` .

**Multi-take exploration (batch-04 problem words):** `data/samples/batch-04-for/recipes.json` defines variation matrices; run `npm run catalog:audio:explore -- --batch data/samples/batch-04-for` (mint cap 10 per invocation — re-run until `takes/` is full, then score). Outputs `takes/`, auto-ranked `shortlist/`, and `exploration_report.json`. Legacy `batch-04` baselines: add `--include-legacy` on score.

Mint one-off rows from a batch manifest: `node scripts/catalog/mint_grok_samples.mjs`. Whisper-only: `node scripts/catalog/transcribe_groq.mjs`. Keys: `XAI_API_KEY` / `GROQ_API_KEY` in the environment.

---

## 10. Backup voice (ElevenLabs Aga)

When a Grok take fails the ear or explore shortlist, mint the same **spoken text** with the committed backup clone.

| | |
| --- | --- |
| **Truth file** | `data/catalog/voices.json` → `backup` (`voice_id` `paOIq6PwrBInRivGXL1u`, model `eleven_v3`) |
| **Mint CLI** | `npm run catalog:audio:mint-backup -- --spoken bad` |
| **Exact TTS text** | `npm run catalog:audio:mint-backup -- --spoken bad --text "<emphasis>bad!</emphasis>"` |
| **Output** | `data/samples/backup-mint/<slug>.mp3` plus `<slug>_raw.mp3` when burst-fix runs |
| **Post-process** | `fix-burst` on by default (ElevenLabs often adds a detached tail pop). Pass `--no-fix-burst` to skip. |
| **Secret** | `ELEVENLABS_API_KEY` in the environment only — never commit the key. |

**Process:** Grok explore shortlist first → founder listen → if reject, `mint-backup` with the same `text`/`replace` from the recipe → listen → if good, copy to `data/samples/approved/` and update `manifest.json`. Do not upload to R2 without explicit approval.

Clone reference sample (long): `data/samples/voice-clone/ara_child_paragraph.mp3`. Example backup word: `data/samples/voice-clone/aga_bad.mp3`.
