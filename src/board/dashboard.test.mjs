/**
 * 016 slice 4 Works Test — the dashboard and the report.
 *
 * A fixture month of hand-authored stats_day rows (the shape slice 1's
 * engine writes — proven there): three weeks including a quiet day and
 * a second device on one day. Every aggregate below is computed by hand
 * in this file. The entitlement gate is tested through the real UI
 * module on a DOM stub: a Lifetime supporter sees the dashboard, a free
 * supporter sees the win card and the offer.
 *
 * Fixture (day indices; week index = floor(day/7)):
 *   W0 d14000: want×8, more×2 (first)   — 4 sentences, mean 2, longest 4, wpm 5 (n4), strip 3, hour 9
 *   W0 d14001: want×4, juice×2          — 2 sentences, mean 3, longest 3, wpm 6 (n2), group 2, hour 14
 *   W0 d14002: quiet (no row)
 *   W1 d14007: want×15, help×5 (first)  — 8 sentences, mean 2.5, longest 5, wpm 4 (n8), strip 5, hour 10
 *   W2 d14014: cooper×8 (first, entity) — 0 sentences, keyboard source, hour 16
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { dashboard, headlines, rangeTotals, sentenceButtons, weightedMedian } from "../../public/shared/dashboard.mjs";
import { reportPdf } from "../../public/shared/report.mjs";
import { saveSpotList, setListGoal } from "../../public/shared/spotlight.mjs";
import { mountProgress } from "../../public/board/progress-ui.js";

const SCHEMA = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "schema.sql"), "utf8",
);
const W0 = 2000, D0 = W0 * 7, D1 = D0 + 1, D7 = (W0 + 1) * 7, D14 = (W0 + 2) * 7;

function statsDb() {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = OFF");
  for (const t of [
    "learner_event_log", "sentence", "core_cell", // the win card's backfill path reads these
    "stats_day", "sync_op", "spotlight_list", "spotlight_item", "transform_event",
  ]) {
    const ddl = SCHEMA.match(new RegExp(`CREATE TABLE IF NOT EXISTS ${t} \\([^;]+\\);`))?.[0];
    assert.ok(ddl, `schema for ${t}`);
    db.exec(ddl);
  }
  return db;
}

function putDay(db, day, p, device = "dev_a") {
  db.prepare(
    "INSERT OR REPLACE INTO stats_day (day, device_id, computed_at, payload) VALUES (?, ?, 1, ?)",
  ).run(day, device, JSON.stringify({
    day, computed_at: 1, words: 0, different: 0, new: 0, sentences: 0,
    words_per_sentence: null, longest_sentence: 0, wpm_median: null, wpm_samples: 0,
    core: 0, fringe: 0, own: 0, spotlit: 0,
    sources: { grid: 0, strip: 0, group: 0, keyboard: 0 },
    hours: Array(24).fill(0), lengths: {}, per_word: {}, ...p,
  }));
}

const hours = (h, n) => { const a = Array(24).fill(0); a[h] = n; return a; };

function fixture() {
  const db = statsDb();
  putDay(db, D0, {
    words: 10, new: 1, sentences: 4, words_per_sentence: 2, longest_sentence: 4,
    wpm_median: 5, wpm_samples: 4, core: 6, fringe: 4, spotlit: 2,
    sources: { grid: 7, strip: 3 }, hours: hours(9, 10),
    per_word: { "sense:want": { taps: 8, spotlit: 0 }, "sense:more": { taps: 2, spotlit: 2, first: 1 } },
  });
  putDay(db, D1, {
    words: 6, sentences: 2, words_per_sentence: 3, longest_sentence: 3,
    wpm_median: 6, wpm_samples: 2, fringe: 4, own: 2,
    sources: { grid: 4, group: 2 }, hours: hours(14, 6),
    per_word: { "sense:want": { taps: 4, spotlit: 0 }, "sense:juice": { taps: 2, spotlit: 0 } },
  });
  putDay(db, D7, {
    words: 20, new: 1, sentences: 8, words_per_sentence: 2.5, longest_sentence: 5,
    wpm_median: 4, wpm_samples: 8, core: 15, fringe: 5,
    sources: { grid: 15, strip: 5 }, hours: hours(10, 20),
    per_word: { "sense:want": { taps: 15, spotlit: 0 }, "sense:help": { taps: 5, spotlit: 0, first: 1 } },
  });
  putDay(db, D14, {
    words: 8, new: 1, own: 8,
    sources: { keyboard: 8 }, hours: hours(16, 8),
    per_word: { "entity:cooper": { taps: 8, spotlit: 0, first: 1 } },
  });
  saveSpotList(db, "spl_g", "Goals", ["sense:more", "sense:help"], 1);
  setListGoal(db, "spl_g", true);
  return db;
}

const nameOf = (kind, id) => ({
  want: "want", more: "more", juice: "juice", help: "help", cooper: "Cooper",
}[id] ?? null);

test("rangeTotals: every aggregate equals the hand-computed value", () => {
  const db = fixture();
  const t = rangeTotals(db, D0, D14);
  assert.equal(t.words, 44);            // 10 + 6 + 20 + 8
  assert.equal(t.different, 5);         // want, more, juice, help, cooper
  assert.equal(t.newCount, 3);
  assert.deepEqual(t.firstKeys.sort(), ["entity:cooper", "sense:help", "sense:more"]);
  assert.equal(t.sentences, 14);
  assert.ok(Math.abs(t.wordsPerSentence - 34 / 14) < 1e-9); // 8+6+20 words / 14
  assert.equal(t.longest, 5);
  // wpm: daily medians (4,n8),(5,n4),(6,n2) — 8 of 14 samples at 4.
  assert.equal(t.wpm, 4);
  assert.equal(t.core, 21); assert.equal(t.fringe, 13); assert.equal(t.own, 10);
  assert.equal(t.spotlit, 2);
  assert.equal(t.sources.strip, 8); assert.equal(t.sources.keyboard, 8);
  assert.equal(t.hours[9], 10); assert.equal(t.hours[14], 6);
  assert.equal(t.hours[10], 20); assert.equal(t.hours[16], 8);
  // Days 14000/14007/14014 are all Thursdays (7-day spacing) → 10+20+8.
  // d14001 is Friday.
  assert.equal(t.dows[(D0 + 4) % 7], 38);
  assert.equal(t.dows[(D1 + 4) % 7], 6);
  assert.deepEqual(
    t.weeks.map((w) => [w.week, w.words, w.different]),
    [[W0, 16, 3], [W0 + 1, 20, 2], [W0 + 2, 8, 1]],
  );
  assert.equal(t.topWords[0].key, "sense:want");
  assert.equal(t.topWords[0].taps, 27); // 8 + 4 + 15
});

test("headlines: breadth leads for symbol mode, rate for label-only", () => {
  const db = fixture();
  const t = rangeTotals(db, D0, D14);
  const sym = headlines(t, "symbol").map((h) => h.label);
  const lab = headlines(t, "label").map((h) => h.label);
  assert.deepEqual(sym, ["different words", "words per sentence", "words"]);
  assert.deepEqual(lab, ["words per minute", "words", "different words"]);
  assert.deepEqual(headlines(t).find((h) => h.label === "words").trend, [16, 20, 8]);
});

test("dashboard: names resolve, strip share and goals land", () => {
  const db = fixture();
  const d = dashboard(db, D0, D14, { nameOf, mode: "symbol" });
  assert.equal(d.topWords[0].name, "want");
  assert.deepEqual(d.newWords.map((w) => w.name).sort(), ["Cooper", "help", "more"]);
  assert.ok(Math.abs(d.stripShare - 8 / 44) < 1e-9);
  assert.equal(d.goals.length, 1);
  const g = d.goals[0].weeks;
  assert.deepEqual({ ...g[W0]["sense:more"] }, { own: 0, glow: 2 });
  assert.deepEqual({ ...g[W0 + 1]["sense:help"] }, { own: 5, glow: 0 });
});

/** Every string the PDF draws, in page order — read back out of the
 *  content streams, so the test measures the file, not the code's
 *  intent. WinAnsi octal escapes decode to their characters. */
function pdfText(pdf) {
  const WIN = { 0o227: "—", 0o226: "–", 0o267: "·" };
  const raw = new TextDecoder("latin1").decode(pdf);
  return [...raw.matchAll(/\(((?:\\.|[^\\)])*)\) Tj/g)].map((m) => m[1]
    .replace(/\\([0-7]{3})/g, (_, o) => WIN[parseInt(o, 8)] ?? String.fromCharCode(parseInt(o, 8)))
    .replace(/\\([()\\])/g, "$1"));
}

test("the report carries the hand-computed numbers, in the page's order, as a valid PDF", () => {
  const db = fixture();
  const { pdf, dash } = reportPdf(db, D0, D14, {
    userName: "Maya", fromLabel: "Jan 1", toLabel: "Jan 31",
  }, nameOf, "symbol");
  const raw = new TextDecoder("latin1").decode(pdf);
  assert.ok(raw.startsWith("%PDF-1.4") && raw.endsWith("%%EOF"));
  assert.match(raw, /\/BaseFont\/Helvetica\/Encoding\/WinAnsiEncoding/);
  const text = pdfText(pdf);
  const at = (needle) => {
    const i = text.findIndex((t) => t.includes(needle));
    assert.ok(i >= 0, `report missing: ${needle}\n${text.join(" | ")}`);
    return i;
  };
  at("Maya · Jan 1 – Jan 31");
  at("5"); // different words, the breadth headline
  assert.equal(dash.words, 44);
  at("44"); // words
  const goals = at("Goal words");
  at("0 own · 2 with the glow"); // more: 2 taps, both under the glow
  at("5 own · 0 with the glow"); // help: 5 taps, none glowing
  const newWords = at("New words");
  at("3 first said in this range");
  at("Cooper (");
  const sentences = at("Sentences");
  const top = at("Most-used words");
  at("want");
  at("27");
  at("Smart bar picked 18% of taps");
  const table = at("Week by week");
  assert.ok(goals < newWords && newWords < sentences && sentences < top && top < table,
    "sections follow the page's order");
  // The fill operators are there: bars and lines, not just text.
  assert.match(raw, /re f/);
  assert.match(raw, / l S/);
  // Escaping: a name with parens can't break the content stream.
  const { pdf: p2 } = reportPdf(db, D0, D14, {
    userName: "A (kid)", fromLabel: "x", toLabel: "y",
  }, nameOf, "symbol");
  assert.ok(pdfText(p2).some((t) => t.includes("A (kid) · x – y")));
  assert.match(new TextDecoder("latin1").decode(p2), /A \\\(kid\\\)/);
});

test("weightedMedian: weighting, odd/even, empty", () => {
  assert.equal(weightedMedian([{ median: 4, samples: 8 }, { median: 9, samples: 1 }]), 4);
  assert.equal(weightedMedian([{ median: 3, samples: 1 }, { median: 9, samples: 1 }]), 9);
  assert.equal(weightedMedian([]), null);
  assert.equal(weightedMedian([{ median: 7, samples: 0 }]), null);
});

/* --- The gate (Works Test 1): Lifetime → dashboard, free → card + offer.
 * A DOM stub: text and visibility only. The drawn page is proven in the
 * browser (docs/phases/016 § slice 4 closeout). */

function domEl(tag = "div") {
  const n = {
    tag, children: [], text: "", hidden: false, dataset: {}, style: {}, value: "", attrs: {},
    _cls: new Set(),
    classList: {
      add: (c) => n._cls.add(c), remove: (c) => n._cls.delete(c),
      toggle: (c, on) => (on ? n._cls.add(c) : n._cls.delete(c)),
      contains: (c) => n._cls.has(c),
    },
    set className(v) { n._cls = new Set(String(v).split(" ").filter(Boolean)); },
    get className() { return [...n._cls].join(" "); },
    set textContent(v) { n.text = String(v); n.children = []; },
    get textContent() { return n.text + n.children.map((c) => c.textContent).join(""); },
    appendChild(c) { n.children.push(c); return c; },
    append(...cs) {
      for (const c of cs) n.children.push(typeof c === "string" ? { textContent: c } : c);
    },
    replaceChildren() { n.children = []; },
    setAttribute(k, v) { n.attrs[k] = v; },
    insertAdjacentHTML(_, html) { n.children.push({ textContent: html.replace(/<[^>]+>/g, "") }); },
    addEventListener(ev, fn) { (n._ev ??= {})[ev] = fn; },
    querySelectorAll() { return []; },
    closest() { return n; },
    focus() {}, scrollIntoView() {},
    get innerHTML() { return n.text; }, set innerHTML(v) { n.text = String(v).replace(/<[^>]+>/g, ""); n.children = []; },
    click() { (n.onclick ?? n._ev?.click)?.({ target: n }); },
  };
  return n;
}

async function gateRun(ent, seed = () => {}) {
  const db = statsDb();
  seed(db);
  const ids = ["prog-body", "prog-range", "prog-mode", "prog-share", "prog-foot", "prog-sub",
    "dev-license", "dev-lifetime-row"];
  const nodes = Object.fromEntries(ids.map((id) => [id, domEl()]));
  for (const seg of ["prog-range", "prog-mode"]) {
    for (const v of seg === "prog-range" ? ["week", "month", "all"] : ["symbol", "label"]) {
      const b = domEl("button"); b.dataset.v = v;
      nodes[seg].children.push(b);
    }
  }
  globalThis.document = {
    getElementById: (id) => nodes[id],
    createElement: (tag) => domEl(tag),
  };
  globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
  const shown = [];
  let onShow = null;
  mountProgress({
    db, me: { id: "usr_1", name: "Maya" }, nameOf,
    entitlement: async () => ent,
    settings: { show: (id) => shown.push(id), onShow: (fn) => { onShow = fn; } },
  });
  onShow("progress");
  await new Promise((r) => setTimeout(r, 10)); // render is async
  return { ...nodes, shown };
}

const find = (n, pred) => pred(n) ? n : (n.children ?? []).map((c) => find(c, pred)).find(Boolean);

test("gate: free sees the win card and one way in, with no control that does nothing", async () => {
  const today = Math.floor((Date.now() - new Date().getTimezoneOffset() * 60000) / 86_400_000);
  const free = await gateRun("free", (db) => putDay(db, today - 20, {
    words: 4, per_word: { "sense:more": { taps: 4, spotlit: 0, first: 1 } },
  }));
  for (const id of ["prog-range", "prog-share", "prog-foot"]) {
    assert.equal(free[id].hidden, true, `${id} is hidden on the free view`);
  }
  const text = free["prog-body"].textContent;
  assert.match(text, /Pip has counted 3 weeks of Maya's words/);
  assert.doesNotMatch(text, /different words/, "no dashboard numbers");
  const buy = find(free["prog-body"], (n) => n.id === "prog-buy");
  assert.match(buy.textContent, /Get Pip Lifetime · \$49 once/);
  buy.click();
  assert.deepEqual(free.shown, ["you"], "the button opens the license row's page");

  const life = await gateRun("lifetime");
  for (const id of ["prog-range", "prog-share", "prog-foot"]) assert.equal(life[id].hidden, false);
});

test("Lifetime: goal words list every target, tapped or not, own vs glow", async () => {
  const today = Math.floor((Date.now() - new Date().getTimezoneOffset() * 60000) / 86_400_000);
  const life = await gateRun("lifetime", (db) => {
    putDay(db, today, {
      words: 5, sentences: 2, words_per_sentence: 2.5, longest_sentence: 3,
      per_word: { "sense:more": { taps: 5, spotlit: 2, first: 1 } },
    });
    saveSpotList(db, "spl_g", "Goals", ["sense:more", "sense:help"], 1);
    setListGoal(db, "spl_g", true);
  });
  const text = life["prog-body"].textContent;
  assert.match(text, /Goal words/);
  assert.match(text, /3 own · 2 with the glow/, "more: 5 taps, 2 under the glow");
  assert.match(text, /0 own · 0 with the glow/, "help is a target with no taps yet");
  assert.match(text, /New words/);
});

// 032 E4: ✨ / ❓ presses sum across days and devices, by week, own vs glow.
test("sentence buttons: totals and weeks add up across devices", () => {
  const db = statsDb();
  putDay(db, D0, { transforms: { fix: { own: 1, glow: 2 } } });
  putDay(db, D1, { transforms: { fix: { own: 1, glow: 0 }, question: { own: 0, glow: 1 } } }, "dev_b");
  putDay(db, D7, { transforms: { fix: { own: 3, glow: 0 } } });
  putDay(db, D14, {}); // an older device's row, no transforms key
  const b = sentenceButtons(db, D0, D14);
  assert.deepEqual(b.total, { fix: { own: 5, glow: 2 }, question: { own: 0, glow: 1 } });
  assert.deepEqual(b.weeks[W0].fix, { own: 2, glow: 2 });
  assert.deepEqual(b.weeks[W0 + 1].fix, { own: 3, glow: 0 });
  assert.equal(b.weeks[W0 + 2], undefined);
  assert.deepEqual(dashboard(db, D0, D14).buttons, b);
});

test("Progress shows sentence buttons: on their own vs with the glow", async () => {
  const today = Math.floor((Date.now() - new Date().getTimezoneOffset() * 60000) / 86_400_000);
  const life = await gateRun("lifetime", (db) => putDay(db, today, {
    words: 3, different: 3, per_word: { "sense:more": { taps: 3, spotlit: 0 } },
    transforms: { fix: { own: 2, glow: 1 } },
  }));
  const text = life["prog-body"].textContent;
  assert.match(text, /Sentence buttons/);
  assert.match(text, /✨ fix it.*2 own · 1 with the glow/);
  assert.doesNotMatch(text, /❓ ask it/, "an unpressed button is not listed");
});
