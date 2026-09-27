// Prototype: block doors (026 D10 follow-up). A door is a set of blocks;
// a block keeps its word order and one column position on every door that
// holds it. yes/no/stop/help sit in their home cells on every door (the
// home board's last column minus not and hurt); filler words are left to
// the Smart bar. Optional: the home board's top row repeats on every door.
//
// Writes public/preview-blocks.html (local preview, not committed).
//
//   node scripts/catalog/preview_blocks.mjs
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { seedResolver } from './seed_members.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (p) => JSON.parse(readFileSync(path.join(REPO, p), 'utf8'));
const LEX = read('data/launch_lexicon.json').entries;
const CAT = read('data/catalog/catalog.json');
const SPEC = read('data/occasions/block_doors.proposed.json');
const OUT = path.join(REPO, 'public/preview-blocks.html');

const { resolve } = seedResolver(LEX, CAT);
const L = SPEC.layout;
const COLS = CAT.layouts[L].cols;
const ROWS = CAT.layouts[L].rows;
const CELLS = COLS * ROWS;
const homeCell = new Map(CAT.coreCells.filter((c) => c.layout === L).map((c) => [c.sense_id, c.slot_index]));
const label = new Map(CAT.labels.filter((l) => l.kind === 'lemma' && l.locale === 'en').map((l) => [l.sense_id, l.text]));
const sense = new Map(CAT.senses.map((s) => [s.id, s]));
const imageKey = new Map(CAT.images.map((i) => [i.id, i.key]));

const frame = SPEC.frame.map((w) => resolve(w, 'frame'));
const frameCol = homeCell.get(frame[0]) % COLS;
if (frame.some((s) => homeCell.get(s) % COLS !== frameCol)) throw new Error('frame words must share one home column');
const contentCols = [...Array(COLS).keys()].filter((c) => c !== frameCol);
const topRow = CAT.coreCells.filter((c) => c.layout === L && c.slot_index < COLS && c.slot_index % COLS !== frameCol);

const blocks = new Map(SPEC.blocks.map((b) => [b.key, { ...b, senses: b.words.map((w) => resolve(w, b.key)) }]));
const seen = new Map();
for (const b of blocks.values()) for (const s of b.senses) {
  if (seen.has(s)) throw new Error(`${label.get(s)} is in ${seen.get(s)} and ${b.key} — one block per word`);
  seen.set(s, b.key);
}
const doorsOf = (bk) => SPEC.doors.filter((d) => d.blocks.includes(bk));

// Block columns, one layout per mode. Shared blocks sit right, next to the
// frame; a block used by one door fills from the left.
function solve(withTopRow) {
  const rowStart = withTopRow ? 1 : 0;
  const rows = ROWS - rowStart;
  const width = (b) => Math.ceil(b.senses.length / rows);
  const used = new Map(SPEC.doors.map((d) => [d.key, new Set()]));
  const at = new Map();
  const order = [...blocks.values()].sort((a, b) => doorsOf(b.key).length - doorsOf(a.key).length);
  for (const b of order) {
    const w = width(b);
    const ds = doorsOf(b.key);
    const starts = contentCols.slice(0, contentCols.length - w + 1)
      .filter((c) => contentCols.indexOf(c) + w <= contentCols.length && contentCols[contentCols.indexOf(c) + w - 1] === c + w - 1);
    const pref = ds.length > 1 ? [...starts].reverse() : starts;
    const start = pref.find((c) => ds.every((d) => [...Array(w).keys()].every((k) => !used.get(d.key).has(c + k))));
    if (start === undefined) throw new Error(`${withTopRow ? 'top row on' : 'top row off'}: no room for ${b.name}`);
    at.set(b.key, { col: start, w });
    for (const d of ds) for (let k = 0; k < w; k++) used.get(d.key).add(start + k);
  }
  const views = [{ key: 'home', name: 'Home', grid: Array(CELLS).fill(null), rects: [] }];
  for (const [s, c] of homeCell) views[0].grid[c] = s;
  for (const d of SPEC.doors) {
    const grid = Array(CELLS).fill(null);
    for (const s of frame) grid[homeCell.get(s)] = s;
    if (withTopRow) for (const c of topRow) grid[c.slot_index] = c.sense_id;
    const rects = [];
    for (const bk of d.blocks) {
      const b = blocks.get(bk);
      const { col, w } = at.get(bk);
      b.senses.forEach((s, i) => { grid[(rowStart + (i % rows)) * COLS + col + Math.floor(i / rows)] = s; });
      rects.push({ name: b.name, col, w, row: rowStart, rows });
    }
    views.push({ key: d.key, name: d.name, grid, rects });
  }
  return views;
}
const modes = { off: solve(false), on: solve(true) };

// ---- measure from the rendered grids ----
function measure(views) {
  const cells = new Map();
  for (const v of views) v.grid.forEach((s, c) => {
    if (!s) return;
    if (!cells.has(s)) cells.set(s, { n: 0, at: new Set() });
    cells.get(s).n++;
    cells.get(s).at.add(c);
  });
  const rep = [...cells.values()].filter((x) => x.n > 1);
  return { repeated: rep.length, same: rep.filter((x) => x.at.size === 1).length, cells };
}
const stats = Object.fromEntries(Object.entries(modes).map(([m, v]) => [m, measure(v)]));
for (const [m, v] of Object.entries(modes)) {
  const st = stats[m];
  console.log(`top row ${m}: ${st.same}/${st.repeated} repeated words in the same cell on every page · ` +
    v.slice(1).map((x) => `${x.name} ${x.grid.filter(Boolean).length}`).join(', '));
}

// ---- art + roles ----
const allWords = new Set([...stats.on.cells.keys(), ...stats.off.cells.keys()]);
const art = new Map();
for (const s of allWords) {
  const key = imageKey.get(sense.get(s)?.default_image_id);
  const f = key && path.join(REPO, 'public', key);
  if (!f || !existsSync(f)) continue;
  const buf = await sharp(f).resize(120, 120, { fit: 'contain', background: '#fff' }).webp({ quality: 78 }).toBuffer();
  art.set(s, `data:image/webp;base64,${buf.toString('base64')}`);
}
// D8: things and places take the neutral frame; people and pronouns stay yellow.
const PEOPLE = new Set(['People, Family & Roles', 'Function Words & Grammar', null]);
const role = (s) => {
  const x = sense.get(s);
  return x.fitzgerald_role === 'Yellow' && !PEOPLE.has(x.category) ? 'None' : x.fitzgerald_role;
};
const words = Object.fromEntries([...allWords].map((s) => [s, { label: label.get(s), role: role(s), art: art.get(s) ?? null }]));
const data = {
  cols: COLS, words,
  modes: Object.fromEntries(Object.entries(modes).map(([m, v]) => [m, v.map(({ key, name, grid, rects }) => ({ key, name, grid, rects }))])),
  stats: Object.fromEntries(Object.entries(stats).map(([m, s]) => [m, { repeated: s.repeated, same: s.same }])),
  pages: Object.fromEntries(Object.entries(stats).map(([m, s]) => [m, Object.fromEntries([...s.cells].map(([k, x]) => [k, x.n]))])),
};
const svg = (f) => readFileSync(path.join(REPO, 'public/icons', f), 'utf8')
  .replace(/<metadata>[\s\S]*?<\/metadata>/, '').replace(/ xmlns:c2pa="[^"]*"/, '')
  .replace(/width="96" height="96"/, 'width="30" height="30"');

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Block Doors</title>
<!-- Local founder preview (026 D10). Generated by scripts/catalog/preview_blocks.mjs — not committed. -->
<style>
  @font-face { font-family: "Andika"; src: url("/fonts/andika-bold.woff2") format("woff2"); font-weight: 700; }
  :root { --ink: #2a241d; --ink-text: #1a1a1a; --cream: #f6f4ef; --line: #d8d4c8; --tray: #e8e3d6; --edge: #8a8578;
    --muted: #5b5348; --gap: 6px; --word-font: "Andika", -apple-system, "Helvetica Neue", sans-serif; }
  .r-Yellow { --rb: #b07f00; --rf: #fdf0c8; } .r-Green { --rb: #2e8b3a; --rf: #dcf0dd; }
  .r-Blue { --rb: #2f6fd0; --rf: #dcecfd; } .r-Pink { --rb: #d0438c; --rf: #fbdfee; }
  .r-Purple { --rb: #6f55b0; --rf: #ebe5f7; } .r-Red { --rb: #c62828; --rf: #fbdcdc; } .r-None { --rb: #8a8578; --rf: #f2efe6; }
  * { box-sizing: border-box; margin: 0; }
  body { font-family: -apple-system, "Helvetica Neue", sans-serif; background: var(--cream); color: var(--ink-text); padding: 16px; }
  main { max-width: 1180px; margin: 0 auto; }
  h1 { font-size: 21px; } .lede { color: var(--muted); font-size: 14px; line-height: 1.5; margin: 4px 0 12px; max-width: 920px; }
  .tabs { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 10px; align-items: center; }
  .tabs button { font: inherit; font-size: 15px; padding: 7px 14px; border: 2px solid var(--edge); background: #fff; border-radius: 10px; cursor: pointer; }
  .tabs button[aria-pressed="true"] { background: var(--ink); color: #fff; border-color: var(--ink); }
  .tabs label { font-size: 13px; color: var(--muted); display: flex; gap: 6px; align-items: center; margin-left: 8px; }
  .device { background: #1d1a16; border-radius: 26px; padding: 12px; }
  .screen { background: var(--cream); border-radius: 16px; padding: 10px; }
  .topbar { display: grid; grid-template-columns: 56px 1fr; gap: 8px; margin-bottom: 8px; }
  .corner { display: flex; align-items: center; justify-content: center; border-radius: 12px; }
  .corner.back { border: 2px solid var(--ink); background: #fff; } .corner.gear { opacity: .6; }
  .bar { background: #fff; border: 2px solid var(--line); border-radius: 12px; min-height: 52px; display: flex; align-items: center; padding: 0 14px;
    font-family: var(--word-font); font-weight: 700; font-size: 20px; color: var(--muted); }
  .strip { display: flex; justify-content: flex-end; background: var(--tray); border-radius: 12px; padding: 6px; margin-bottom: 8px; }
  .strip .folder { width: 64px; height: 40px; border: 2px solid var(--edge); border-radius: 10px; display: flex; align-items: center; justify-content: center; }
  .gridwrap { position: relative; }
  .grid { display: grid; grid-template-columns: repeat(var(--cols), 1fr); gap: var(--gap); }
  .cell { aspect-ratio: 1.25; border-radius: 10px; border: 3px solid var(--rb); background: #fff; display: flex; flex-direction: column; overflow: hidden; min-width: 0; }
  .cell .tl { height: 26%; background: var(--rf); font-family: var(--word-font); font-weight: 700; font-size: clamp(9px, 1.25vw, 15px);
    display: flex; align-items: center; justify-content: center; white-space: nowrap; overflow: hidden; padding: 0 2px; }
  .cell .ta { flex: 1; min-height: 0; display: flex; align-items: center; justify-content: center; padding: 3px; }
  .cell .ta img { max-width: 100%; max-height: 100%; object-fit: contain; }
  .cell.hole { border: 0; background: transparent; }
  body.holes .cell.hole { border: 2px dashed var(--line); }
  .cell.same-as-last { outline: 3px solid #e8a200; outline-offset: 1px; }
  body:not(.ring) .cell.same-as-last { outline: none; }
  .rects { position: absolute; inset: 0; display: grid; grid-template-columns: repeat(var(--cols), 1fr); grid-auto-rows: 1fr; gap: var(--gap); pointer-events: none; }
  .rects div { border: 2px dashed #b9b2a3; border-radius: 12px; margin: -4px; position: relative; }
  .rects span { position: absolute; top: -10px; left: 8px; font-size: 11px; background: var(--cream); padding: 0 4px; color: var(--muted); }
  body:not(.blocks) .rects { display: none; }
  .row2 { display: grid; grid-template-columns: 1fr 300px; gap: 16px; margin-top: 16px; }
  .panel { background: #fff; border: 1px solid var(--line); border-radius: 14px; padding: 12px 14px; }
  .panel h2 { font-size: 15px; margin-bottom: 8px; } .panel p { font-size: 13px; line-height: 1.5; color: var(--muted); }
  .stat { font-size: 26px; font-weight: 700; }
  .minis { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
  .mini h3 { font-size: 12px; margin-bottom: 4px; }
  .mini .g { display: grid; grid-template-columns: repeat(var(--cols), 1fr); gap: 2px; }
  .mini .g i { aspect-ratio: 1.25; border-radius: 2px; background: var(--rf, transparent); border: 1px solid var(--rb, transparent); }
  .mini .g i.on { background: #e8a200; border-color: #e8a200; }
  @media (max-width: 860px) { .row2 { grid-template-columns: 1fr; } .minis { grid-template-columns: repeat(2, 1fr); } }
</style>
</head>
<body class="ring">
<main>
  <h1>Block doors — prototype</h1>
  <p class="lede">Each door is a set of blocks (drinks, fruit, breakfast foods…). A block keeps its order and its columns on every door that has it. <b>yes, no, stop, help</b> stay in the last column everywhere; filler words are left to the Smart bar. Flip pages with the buttons or ← →. Amber ring = same word, same cell as the page you just left.</p>
  <div class="tabs" id="tabs"></div>
  <div class="tabs">
    <label><input type="checkbox" id="top"> Top row on every door</label>
    <label><input type="checkbox" id="blk"> Show blocks</label>
    <label><input type="checkbox" id="hol"> Show empty cells</label>
    <label><input type="checkbox" id="rng" checked> Ring same-as-last</label>
  </div>
  <div class="device"><div class="screen">
    <div class="topbar"><div class="corner" id="corner"></div><div class="bar">I want …</div></div>
    <div class="strip"><div class="folder">${svg('folder.svg')}</div></div>
    <div class="gridwrap"><div class="grid" id="grid" style="--cols:${COLS}"></div><div class="rects" id="rects" style="--cols:${COLS}"></div></div>
  </div></div>
  <div class="row2">
    <div class="panel"><h2>Every page, one hover</h2><div class="minis" id="minis"></div></div>
    <div class="panel"><h2>Measured on the rendered pages</h2><div class="stat" id="stat"></div><p id="statp"></p></div>
  </div>
</main>
<script>
const D = ${JSON.stringify(data)};
const BACK = '<svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="#2a241d" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 4.5 7.5 12l7.5 7.5"/></svg>';
const GEAR = ${JSON.stringify(svg('settings-gear.svg'))};
let mode = 'off', cur = 0, last = null;
const V = () => D.modes[mode];
const tabs = document.getElementById('tabs');
V().forEach((v, i) => { const b = document.createElement('button'); b.textContent = v.name; b.onclick = () => show(i); tabs.appendChild(b); });
const flag = (id, cls) => { document.getElementById(id).onchange = (e) => document.body.classList.toggle(cls, e.target.checked); };
flag('blk', 'blocks'); flag('hol', 'holes'); flag('rng', 'ring');
document.getElementById('top').onchange = (e) => { mode = e.target.checked ? 'on' : 'off'; last = null; show(cur, true); minisDraw(); };
function tile(s, c, prev) {
  const el = document.createElement('div');
  if (!s) { el.className = 'cell hole'; return el; }
  const w = D.words[s];
  el.className = 'cell r-' + w.role + (prev && prev[c] === s ? ' same-as-last' : '');
  el.innerHTML = '<span class="tl">' + w.label + '</span><span class="ta">' + (w.art ? '<img src="' + w.art + '" alt="">' : '') + '</span>';
  el.onmouseenter = () => light(s); el.onmouseleave = () => light(null);
  return el;
}
function show(i, keepLast) {
  if (!keepLast) last = V()[cur].grid;
  cur = i;
  const v = V()[i];
  [...tabs.querySelectorAll('button')].forEach((b, j) => b.setAttribute('aria-pressed', String(j === i)));
  const corner = document.getElementById('corner');
  corner.className = 'corner ' + (v.key === 'home' ? 'gear' : 'back');
  corner.innerHTML = v.key === 'home' ? GEAR : BACK;
  const g = document.getElementById('grid'); g.innerHTML = '';
  v.grid.forEach((s, c) => g.appendChild(tile(s, c, last === v.grid ? null : last)));
  const r = document.getElementById('rects'); r.innerHTML = '';
  r.style.gridTemplateRows = 'repeat(' + (v.grid.length / D.cols) + ', 1fr)';
  v.rects.forEach((x) => { const d = document.createElement('div');
    d.style.gridColumn = (x.col + 1) + ' / span ' + x.w; d.style.gridRow = (x.row + 1) + ' / span ' + x.rows;
    d.innerHTML = '<span>' + x.name + '</span>'; r.appendChild(d); });
  const st = D.stats[mode];
  document.getElementById('stat').textContent = st.same + '/' + st.repeated;
  document.getElementById('statp').textContent = 'words on 2+ pages sit in the same cell on all of them. This page: ' + v.grid.filter(Boolean).length + ' of ' + v.grid.length + ' cells.';
}
const minis = document.getElementById('minis');
function minisDraw() {
  minis.innerHTML = '';
  V().forEach((v) => {
    const m = document.createElement('div'); m.className = 'mini'; m.innerHTML = '<h3>' + v.name + '</h3>';
    const g = document.createElement('div'); g.className = 'g'; g.style.setProperty('--cols', D.cols);
    v.grid.forEach((s) => { const i = document.createElement('i'); if (s) { i.className = 'r-' + D.words[s].role; i.dataset.s = s; i.onmouseenter = () => light(s); i.onmouseleave = () => light(null); } g.appendChild(i); });
    m.appendChild(g); minis.appendChild(m);
  });
}
function light(s) { minis.querySelectorAll('i').forEach((i) => i.classList.toggle('on', !!s && i.dataset.s === s)); }
document.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT') return;
  if (e.key === 'ArrowRight') show((cur + 1) % V().length);
  if (e.key === 'ArrowLeft') show((cur - 1 + V().length) % V().length);
});
minisDraw(); show(0, true);
</script>
</body>
</html>`;
writeFileSync(OUT, html);
console.log(`${path.relative(REPO, OUT)} (${Math.round(html.length / 1024)} KB)`);
