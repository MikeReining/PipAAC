/**
 * The one-tap progress report (016 slice 4, Stats_And_Progress § 4.2):
 * a self-contained PDF for an IEP meeting, in the Progress page's order
 * — headline numbers with their trend, goal words on their own vs with
 * the glow, new words, sentences, most-used words, kinds of words, when,
 * and the week-by-week table. No library: Helvetica text and vector
 * bars and lines, drawn on US-letter pages. Generated on the device,
 * shared through the system share sheet. Same rules as the page: ink
 * for data, amber only for "with the glow", no norms, no judging color.
 */

import { WEEK_DAYS, dashboard } from "./dashboard.mjs";

const te = new TextEncoder();
const PAGE_W = 612, PAGE_H = 792, M = 48, W = PAGE_W - 2 * M;
/** The report's content width in points (the color header is drawn to it). */
export const REPORT_W = W;
const C = {
  ink: "0.165 0.141 0.114", edge: "0.541 0.522 0.471", glow: "0.910 0.635 0",
  line: "0.847 0.831 0.784", muted: "0.357 0.325 0.282", own: "0.812 0.788 0.733",
};
/* The color report: tile and chip sizes in points, and the board's six
 * role borders for the band (Design_System § Palette). */
const TILE_W = 44, CHIP_H = 16;
const BAND = ["0.690 0.498 0", "0.180 0.545 0.227", "0.184 0.435 0.816",
  "0.816 0.263 0.549", "0.435 0.333 0.690", "0.776 0.157 0.157"];
const BUTTONS = { fix: "fix it", question: "ask it", past: "past", future: "future" };
const fmt = (n) => (n == null ? "—" : Number.isInteger(n) ? n.toLocaleString("en-US") : n.toFixed(1));
const dayLabel = (day) => new Date(day * 86_400_000)
  .toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

/* WinAnsi: the standard fonts' encoding. Latin-1 maps through; the few
 * typographic marks the report uses get their WinAnsi codes; anything
 * else (emoji, other scripts) becomes "?" rather than garbage bytes. */
const WIN = { "—": 0x97, "–": 0x96, "·": 0xb7, "’": 0x92, "‘": 0x91, "“": 0x93, "”": 0x94, "…": 0x85, "•": 0x95 };
function pdfString(s) {
  let out = "";
  for (const ch of String(s)) {
    const code = WIN[ch] ?? ch.codePointAt(0);
    if (ch === "(" || ch === ")" || ch === "\\") out += `\\${ch}`;
    else if (code < 0x80) out += ch;
    else if (code <= 0xff) out += `\\${code.toString(8).padStart(3, "0")}`;
    else out += "?";
  }
  return out;
}
/* Helvetica advance widths are not stored here; digits are exactly
 * 0.556 em and the average letter is close to 0.5 em — enough to
 * right-align numbers and wrap a word list. */
const textW = (s, size) => [...String(s)].reduce((w, ch) => w + (/[0-9]/.test(ch) ? 0.556 : /[il.,:;'|!]/.test(ch) ? 0.25 : /[mwMW]/.test(ch) ? 0.85 : 0.52), 0) * size;

/** A tiny top-down canvas over PDF pages: y grows downward from the
 *  top margin; a block that doesn't fit starts a new page. */
function canvas() {
  const pages = [];
  let ops = null;
  let y = 0;
  const newPage = () => { ops = []; pages.push(ops); y = M; };
  newPage();
  const Y = (top) => (PAGE_H - top).toFixed(1);
  const api = {
    get y() { return y; },
    set y(v) { y = v; },
    need(h) { if (y + h > PAGE_H - M) newPage(); },
    text(x, top, s, { size = 10, bold = false, color = C.ink, align = "left" } = {}) {
      const dx = align === "right" ? -textW(s, size) : align === "center" ? -textW(s, size) / 2 : 0;
      ops.push(`BT /${bold ? "F2" : "F1"} ${size} Tf ${color} rg ${(x + dx).toFixed(1)} ${Y(top)} Td (${pdfString(s)}) Tj ET`);
    },
    rect(x, top, w, h, color) {
      if (w <= 0 || h <= 0) return;
      ops.push(`${color} rg ${x.toFixed(1)} ${Y(top + h)} ${w.toFixed(1)} ${h.toFixed(1)} re f`);
    },
    /** A JPEG placed by name (pagesToPdf's `images`), top-left at (x, top). */
    image(name, x, top, w, h) {
      ops.push(`q ${w.toFixed(2)} 0 0 ${h.toFixed(2)} ${x.toFixed(1)} ${Y(top + h)} cm /${name} Do Q`);
    },
    stroke(points, color, width = 1) {
      if (points.length < 2) return;
      const [p0, ...rest] = points;
      ops.push(`${color} RG ${width} w 1 J 1 j ${p0[0].toFixed(1)} ${Y(p0[1])} m ${rest.map(([x, t]) => `${x.toFixed(1)} ${Y(t)} l`).join(" ")} S`);
    },
    pages,
  };
  return api;
}

/** Column chart in [x, x+w] × [top, top+h]; `hi` is the ink column. */
function drawColumns(c, x, top, w, h, values, labels, { every = 1, hi = null } = {}) {
  const n = values.length, gap = n > 14 ? 1.5 : 3;
  const bw = (w - gap * (n - 1)) / n;
  const max = Math.max(...values.map((v) => v ?? 0)) || 1;
  const peak = hi ?? values.indexOf(max);
  c.stroke([[x, top + h], [x + w, top + h]], C.line, 0.5);
  values.forEach((v, i) => {
    const bh = ((v ?? 0) / max) * (h - 4);
    c.rect(x + i * (bw + gap), top + h - bh, bw, bh, i === peak ? C.ink : C.edge);
    if (i % every === 0) c.text(x + i * (bw + gap) + bw / 2, top + h + 10, labels[i], { size: 7, color: C.muted, align: "center" });
  });
}

/** Weekly own (ink) / glow (amber) bars for one target. */
function drawOwnGlow(c, x, top, w, h, own, glow, max) {
  const slots = Math.max(own.length, 8), lead = slots - own.length, gap = 2;
  const bw = (w - gap * (slots - 1)) / slots;
  own.forEach((o, i) => {
    const bx = x + (lead + i) * (bw + gap);
    const ho = (o / max) * h, hg = (glow[i] / max) * h;
    if (!o && !glow[i]) { c.rect(bx, top + h - 0.8, bw, 0.8, C.line); return; }
    c.rect(bx, top + h - ho, bw, ho, C.ink);
    c.rect(bx, top + h - ho - hg - (o && glow[i] ? 1 : 0), bw, hg, C.glow);
  });
}

function heading(c, title, meta) {
  c.need(40);
  c.y += 14;
  c.text(M, c.y, title, { size: 13, bold: true });
  if (meta) c.text(M + W, c.y, meta, { size: 9, color: C.muted, align: "right" });
  c.y += 10;
}

function legend(c) {
  c.rect(M, c.y + 2, 7, 7, C.ink);
  c.text(M + 11, c.y + 9, "On their own", { size: 8, color: C.muted });
  c.rect(M + 80, c.y + 2, 7, 7, C.glow);
  c.text(M + 91, c.y + 9, "With the glow", { size: 8, color: C.muted });
  c.y += 16;
}

/** The report's pages for a dashboard aggregate. Pure — the same
 *  drawing feeds the PDF and the tests. `nameOf(kind, id)` names goal
 *  targets the way the page does. */
export function reportPages(dash, { userName, fromLabel, toLabel }, nameOf = () => null, { art = null } = {}) {
  const c = canvas();
  const name = (key) => nameOf(...key.split(":")) ?? key.split(":")[1];
  const week = (w) => dayLabel(Math.max(w * WEEK_DAYS, dash.fromDay));
  const periods = dash.by === "day" ? dash.days : dash.weeks;
  const plabels = periods.map((p) => (dash.by === "day" ? dayLabel(p.day) : week(p.week)));
  // The color report (art supplied): the board's six role colors as a
  // band, a drawn header, and words as their tiles. Without art, the
  // printer-friendly report: Helvetica, ink and grey, amber only for glow.
  const tileOf = (key) => art?.tiles?.get(key) ?? null;
  const chipOf = (key) => art?.chips?.get(key) ?? null;

  if (art?.header) {
    BAND.forEach((color, i) => c.rect((PAGE_W / BAND.length) * i, 0, PAGE_W / BAND.length + 0.5, 6, color));
    const h = art.header;
    c.image(h.name, M, c.y, W, (W * h.h) / h.w);
    c.y += (W * h.h) / h.w + 8;
    c.text(M, c.y + 4, `Every number comes from ${userName}'s own taps on the board. No comparisons with other children.`, { size: 8, color: C.muted });
    c.y += 18;
  } else {
    c.text(M, c.y + 14, "Pip progress report", { size: 20, bold: true });
    c.text(M, c.y + 32, `${userName} · ${fromLabel} – ${toLabel}`, { size: 11 });
    c.text(M, c.y + 46, `Every number comes from ${userName}'s own taps on the board. No comparisons with other children.`, { size: 8, color: C.muted });
    c.y += 62;
  }

  // Headline numbers with their trend.
  const bw = (W - 24) / 3, bh = 96;
  dash.headline.forEach((h, i) => {
    const x = M + i * (bw + 12);
    c.stroke([[x, c.y], [x + bw, c.y], [x + bw, c.y + bh], [x, c.y + bh], [x, c.y]], C.line, 0.75);
    c.text(x + 10, c.y + 28, fmt(h.value), { size: 22, bold: true });
    c.text(x + 10, c.y + 42, h.label, { size: 9, color: C.muted });
    const pts = h.trend.map((v, j) => (v == null ? null : [j, v])).filter(Boolean);
    if (pts.length >= 2) {
      const max = Math.max(...pts.map((p) => p[1])) || 1;
      const sx = (j) => x + 10 + (j * (bw - 20)) / Math.max(h.trend.length - 1, 1);
      const sy = (v) => c.y + 76 - (v / max) * 26;
      c.stroke(pts.map(([j, v]) => [sx(j), sy(v)]), C.ink, 1.25);
      const [lj, lv] = pts.at(-1);
      c.rect(sx(lj) - 1.75, sy(lv) - 1.75, 3.5, 3.5, C.ink);
      c.text(x + 10, c.y + 89, `${plabels[pts[0][0]]}: ${fmt(pts[0][1])}`, { size: 7, color: C.muted });
      c.text(x + bw - 10, c.y + 89, `${dash.by === "day" ? "today" : "this week"} so far: ${fmt(lv)}`, { size: 7, color: C.muted, align: "right" });
    }
  });
  c.y += bh + 6;

  // Goal words and sentence buttons: every target, by week.
  const weeks = dash.weeks.map((w) => w.week);
  const ogRows = [];
  for (const g of dash.goals) {
    ogRows.push({ title: g.name });
    for (const key of g.targets) {
      ogRows.push({
        key,
        name: name(key),
        own: weeks.map((w) => g.weeks[w]?.[key]?.own ?? 0),
        glow: weeks.map((w) => g.weeks[w]?.[key]?.glow ?? 0),
      });
    }
  }
  const presses = Object.entries(BUTTONS).filter(([m]) => dash.buttons.total[m]);
  if (presses.length) {
    ogRows.push({ title: "Sentence buttons" });
    for (const [m, name] of presses) {
      ogRows.push({
        name,
        own: weeks.map((w) => dash.buttons.weeks[w]?.[m]?.own ?? 0),
        glow: weeks.map((w) => dash.buttons.weeks[w]?.[m]?.glow ?? 0),
      });
    }
  }
  if (ogRows.length) {
    heading(c, "Goal words", `by week, ${week(weeks[0])} – ${week(weeks.at(-1))}`);
    legend(c);
    const max = Math.max(1, ...ogRows.filter((r) => r.own).flatMap((r) => r.own.map((o, i) => o + r.glow[i])));
    for (const r of ogRows) {
      if (r.title) { c.need(18); c.y += 12; c.text(M, c.y, r.title, { size: 10, bold: true }); c.y += 4; continue; }
      const t = r.key ? tileOf(r.key) : null;
      const rh = t ? TILE_W * t.h / t.w + 6 : 24, mid = (rh - 24) / 2;
      c.need(rh);
      if (t) c.image(t.name, M + 6, c.y + 3, TILE_W, TILE_W * t.h / t.w);
      else c.text(M + 6, c.y + 14, r.name, { size: 10 });
      drawOwnGlow(c, M + 110, c.y + 2 + mid, 250, 18, r.own, r.glow, max);
      const own = r.own.reduce((a, b) => a + b, 0), glow = r.glow.reduce((a, b) => a + b, 0);
      c.text(M + 375, c.y + 10 + mid, `${r.own.at(-1) ?? 0} on their own this week`, { size: 8 });
      c.text(M + 375, c.y + 20 + mid, `${own} own · ${glow} with the glow`, { size: 8, color: C.muted });
      c.y += rh;
    }
  }

  // New words, newest first, each with its first day.
  heading(c, "New words", `${dash.newWords.length} first said in this range`);
  if (!dash.newWords.length) {
    c.text(M, c.y + 10, "No new words in this range.", { size: 10, color: C.muted });
    c.y += 16;
  } else if (dash.newWords.every((w) => tileOf(w.key))) {
    const gap = 10, per = Math.floor((W + gap) / (TILE_W + gap));
    c.y += 8;
    dash.newWords.forEach((w, i) => {
      const t = tileOf(w.key), th = TILE_W * t.h / t.w;
      if (i % per === 0) { if (i) c.y += th + 18; c.need(th + 18); }
      const x = M + (i % per) * (TILE_W + gap);
      c.image(t.name, x, c.y, TILE_W, th);
      c.text(x + TILE_W / 2, c.y + th + 10, dayLabel(w.day), { size: 7.5, color: C.muted, align: "center" });
    });
    const last = tileOf(dash.newWords.at(-1).key);
    c.y += TILE_W * last.h / last.w + 20;
  } else {
    let x = M;
    c.y += 12;
    for (const w of dash.newWords) {
      const s = `${w.name} (${dayLabel(w.day)})`;
      const sw = textW(s, 10) + 14;
      if (x + sw > M + W) { x = M; c.y += 15; c.need(15); }
      c.text(x, c.y, s, { size: 10 });
      x += sw;
    }
    c.y += 8;
  }

  // Sentences.
  const wps = periods.map((p) => p.wordsPerSentence);
  heading(c, "Sentences", dash.longest ? `longest: ${dash.longest} words · mean ${fmt(dash.wordsPerSentence)} words` : null);
  c.need(90);
  c.text(M, c.y + 8, `Words per sentence, by ${dash.by}`, { size: 8, color: C.muted });
  drawColumns(c, M, c.y + 14, W, 56, wps, plabels, { every: Math.max(1, Math.ceil(wps.length / 6)), hi: wps.length - 1 });
  c.y += 84;

  // Most-used words.
  const top = dash.topWords.slice(0, 10);
  heading(c, "Most-used words", "taps");
  for (const t of top) {
    const chip = chipOf(t.key);
    const rh = chip ? 18 : 14, mid = (rh - 14) / 2;
    c.need(rh);
    if (chip) c.image(chip.name, M, c.y + 1, Math.min(92, (CHIP_H * chip.w) / chip.h), CHIP_H);
    else c.text(M, c.y + 10, t.name, { size: 9 });
    c.rect(M + 100, c.y + 3 + mid, ((W - 140) * t.taps) / (top[0]?.taps || 1), 8, C.ink);
    c.text(M + W, c.y + 10 + mid, fmt(t.taps), { size: 9, color: C.muted, align: "right" });
    c.y += rh;
  }

  // Kinds of words.
  const total = dash.core + dash.fringe + dash.own;
  heading(c, "Kinds of words", `${fmt(total)} taps`);
  c.need(44);
  let kx = M;
  for (const [n, color] of [[dash.core, C.ink], [dash.fringe, C.edge], [dash.own, C.own]]) {
    const kw = total ? (W * n) / total : 0;
    c.rect(kx, c.y + 2, Math.max(0, kw - 1.5), 12, color);
    kx += kw;
  }
  const pct = (n) => (total ? `${Math.round((n / total) * 100)}%` : "—");
  c.text(M, c.y + 28, `Core ${pct(dash.core)}  ·  Fringe ${pct(dash.fringe)}  ·  Own words ${pct(dash.own)}  ·  Smart bar picked ${Math.round(dash.stripShare * 100)}% of taps`, { size: 9 });
  c.y += 36;

  // When.
  heading(c, "When", null);
  c.need(80);
  const HOUR = (h) => (h === 0 ? "12a" : h < 12 ? `${h}a` : h === 12 ? "12p" : `${h - 12}p`);
  drawColumns(c, M, c.y + 6, W * 0.6, 50, dash.hours, dash.hours.map((_, i) => HOUR(i)), { every: 3 });
  drawColumns(c, M + W * 0.66, c.y + 6, W * 0.34, 50, dash.dows, ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]);
  c.y += 74;

  // Week by week.
  heading(c, "Week by week", null);
  const cols = [["Week of", 0, "left"], ["Words", 150, "right"], ["Different", 220, "right"],
    ["Words per sentence", 330, "right"], ["Longest", 400, "right"], ["Words per minute", W, "right"]];
  c.need(28);
  c.y += 12;
  for (const [h, x, align] of cols) c.text(M + x, c.y, h, { size: 8, bold: true, color: C.muted, align });
  c.y += 4;
  for (const w of [...dash.weeks].reverse()) {
    c.need(14);
    c.y += 13;
    const vals = [week(w.week), fmt(w.words), fmt(w.different), fmt(w.wordsPerSentence), w.longest ? fmt(w.longest) : "—", fmt(w.wpm)];
    vals.forEach((v, i) => c.text(M + cols[i][1], c.y, v, { size: 9, align: cols[i][2] }));
    c.stroke([[M, c.y + 4], [M + W, c.y + 4]], C.line, 0.4);
  }

  c.pages.forEach((ops, i) => ops.push(
    `BT /F1 7 Tf ${C.muted} rg ${M} 28 Td (${pdfString(`Pip progress report · ${userName} · page ${i + 1} of ${c.pages.length}${art ? " · pipaac.org" : ""}`)}) Tj ET`));
  return c.pages;
}

/** A valid PDF of drawn pages (two standard fonts, WinAnsi), plus any
 *  JPEGs the pages place: [{ name, jpeg: Uint8Array, w, h }] in pixels.
 *  JPEG bytes go in as-is (DCTDecode), so the file is built as bytes. */
export function pagesToPdf(pages, images = []) {
  const kids = pages.map((_, i) => 3 + i * 2);
  const f1 = 3 + pages.length * 2, f2 = f1 + 1;
  const img0 = f2 + 1;
  const xobjects = images.length
    ? `/XObject<<${images.map((im, i) => `/${im.name} ${img0 + i} 0 R`).join("")}>>`
    : "";
  const objs = [];
  objs[0] = "<</Type/Catalog/Pages 2 0 R>>";
  objs[1] = `<</Type/Pages/Kids[${kids.map((k) => `${k} 0 R`).join(" ")}]/Count ${pages.length}>>`;
  pages.forEach((ops, i) => {
    const content = ops.join("\n");
    objs[kids[i] - 1] =
      `<</Type/Page/Parent 2 0 R/MediaBox[0 0 ${PAGE_W} ${PAGE_H}]/Contents ${kids[i] + 1} 0 R` +
      `/Resources<</Font<</F1 ${f1} 0 R/F2 ${f2} 0 R>>${xobjects}>>>>`;
    objs[kids[i]] = `<</Length ${te.encode(content).length}>>stream\n${content}\nendstream`;
  });
  objs[f1 - 1] = "<</Type/Font/Subtype/Type1/BaseFont/Helvetica/Encoding/WinAnsiEncoding>>";
  objs[f2 - 1] = "<</Type/Font/Subtype/Type1/BaseFont/Helvetica-Bold/Encoding/WinAnsiEncoding>>";
  images.forEach((im, i) => {
    objs[img0 - 1 + i] = [
      `<</Type/XObject/Subtype/Image/Width ${im.w}/Height ${im.h}/ColorSpace/DeviceRGB` +
        `/BitsPerComponent 8/Filter/DCTDecode/Length ${im.jpeg.length}>>stream\n`,
      im.jpeg,
      "\nendstream",
    ];
  });

  const parts = [];
  let at = 0;
  const put = (p) => { const b = typeof p === "string" ? te.encode(p) : p; parts.push(b); at += b.length; };
  put("%PDF-1.4\n");
  const xref = [0];
  objs.forEach((body, i) => {
    xref.push(at);
    put(`${i + 1} 0 obj\n`);
    for (const p of [].concat(body)) put(p);
    put("\nendobj\n");
  });
  const xrefAt = at;
  let tail = `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objs.length; i++) tail += `${String(xref[i]).padStart(10, "0")} 00000 n \n`;
  tail += `trailer\n<</Size ${objs.length + 1}/Root 1 0 R>>\nstartxref\n${xrefAt}\n%%EOF`;
  put(tail);
  const out = new Uint8Array(at);
  let o = 0;
  for (const b of parts) { out.set(b, o); o += b.length; }
  return out;
}

/** The report for a range: aggregate → pages → PDF bytes. The
 *  printer-friendly report; the color one passes `art` and `images`
 *  (drawn on the device by board/report-art.js) to the same pages. */
export function reportPdf(db, fromDay, toDay, meta, nameOf, mode, { art = null, images = [] } = {}) {
  const dash = dashboard(db, fromDay, toDay, { nameOf, mode });
  return { pdf: pagesToPdf(reportPages(dash, meta, nameOf, { art }), images), dash };
}
