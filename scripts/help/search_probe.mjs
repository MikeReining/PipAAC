#!/usr/bin/env node
/**
 * 042 Works Test instrument — does Help search find the right entry for
 * the words a parent actually types? Hits a running Worker (the real
 * embedding model, not a fake) and checks each query's expected entry is
 * in the top 3 results.
 *
 *   node scripts/help/search_probe.mjs http://localhost:21088
 *   node scripts/help/search_probe.mjs https://app.pipaac.org
 *
 * Expectations name an answer id (a:…) or a Settings row by
 * "<page>/<label>" (s:…). Written from a parent's side, before looking
 * at results; a miss means fix the answer's words, not this list.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { repoRoot } from "../catalog/paths.mjs";

export const PROBES = [
  ["emotions", ["a:feelings", "s:talking/Feeling faces"]],
  ["feelings", ["a:feelings", "s:talking/Feeling faces"]],
  ["can she sound happy or upset", ["a:feelings", "s:talking/Feeling faces"]],
  ["how do you demonstrate things", ["a:modeling", "a:spotlight", "s:spotlight/Spotlight"]],
  ["how do I practice words with him", ["a:spotlight", "a:modeling", "s:spotlight/Spotlight"]],
  ["teach new words", ["a:spotlight", "a:modeling", "s:spotlight/Spotlight"]],
  ["highlight words", ["a:spotlight", "s:spotlight/Spotlight"]],
  ["he keeps hitting the same button", ["a:same-button"]],
  ["stimming", ["a:stim", "a:same-button"]],
  ["she won't use it", ["a:not-using"]],
  ["will it stop him talking", ["a:speech"]],
  ["too young for a device", ["a:ready"]],
  ["swear words", ["a:silly"]],
  ["take it away as punishment", ["a:keep-in-reach", "a:silly"]],
  ["teacher", ["a:helpers", "a:school-home", "a:helpers-how", "s:team/Team"]],
  ["grandma", ["a:helpers", "a:people"]],
  ["add a photo of dad", ["a:people", "s:words/People & places"]],
  ["new word", ["a:add-word"]],
  ["bigger buttons", ["a:bigger", "s:board/Buttons per screen"]],
  ["hard to hit the buttons", ["a:bigger", "s:board/Buttons per screen"]],
  ["no pictures", ["a:words-only", "s:board/Buttons show"]],
  ["slow down the voice", ["a:speed", "s:talking/Speaking speed"]],
  ["boy voice", ["a:voice", "s:talking/Voice"]],
  ["what does the magic wand do", ["a:sentence-buttons", "s:talking/Sentence bar"]],
  ["past tense", ["a:sentence-buttons"]],
  ["robot voice reads each word separately", ["a:word-by-word"]],
  ["no internet", ["a:offline", "a:word-by-word"]],
  ["lock settings", ["a:pin", "s:backup/Settings PIN"]],
  ["forgot code to get in", ["a:forgot-pin"]],
  ["iPad broke", ["a:ipad-breaks", "a:recovery-card"]],
  ["backup", ["a:recovery-card", "s:backup/Recovery card", "a:ipad-breaks"]],
  ["privacy", ["a:what-leaves", "s:backup/Backup & privacy", "a:listen"]],
  ["is it recording us", ["a:listen"]],
  ["cancel subscription", ["a:subscription"]],
  ["price", ["a:lifetime", "a:free"]],
  ["refund", []],
  ["IEP report", ["a:progress"]],
  ["siblings both use it", ["a:two-kids", "s:team/People on this device"]],
  ["typing", ["a:keyboard", "s:board/Keyboard"]],
  ["delete everything", ["a:delete", "s:backup/Delete"]],
];

if (import.meta.url === `file://${process.argv[1]}`) {
  const base = process.argv[2] ?? "http://localhost:21088";
  const help = JSON.parse(readFileSync(join(repoRoot, "public/help.en.json"), "utf8"));
  const name = (id) => id.startsWith("s:")
    ? (({ sec, label }) => `s:${sec}/${label}`)(help.settings[Number(id.slice(2))])
    : id;
  let pass = 0, scored = 0;
  for (const [q, want] of PROBES) {
    const res = await fetch(`${base}/api/v1/help/search?q=${encodeURIComponent(q)}`);
    const { hits = [], error } = await res.json();
    const top = hits.slice(0, 3).map((h) => `${name(h.id)} ${h.score}`);
    if (!want.length) {
      console.log(`  info  ${q.padEnd(40)} ${top.join(" · ") || "(nothing)"}`);
      continue;
    }
    scored++;
    const ok = hits.slice(0, 3).some((h) => want.includes(name(h.id)));
    if (ok) pass++;
    console.log(`${ok ? "  PASS" : "  MISS"}  ${q.padEnd(40)} ${error ?? (top.join(" · ") || "(nothing)")}`);
  }
  console.log(`\n${pass}/${scored} queries found an expected entry in the top 3`);
  process.exit(pass === scored ? 0 : 1);
}
