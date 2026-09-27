// Prototype: one address per word (026 follow-up). Every word keeps one
// cell on every page it appears on. Home-board words keep their home cell
// in every door; stop and help travel into every door; each door adds its
// CHILDES starters (door_starters.en.json) as room allows; every other
// word gets one cell shared by all the doors that hold it, solved so words
// on the same page never collide (words that never meet may share a
// cell). Doors use the full grid — Back lives in the top bar, Next only
// on multi-page doors (none here).
//
// Writes public/preview-addresses.html (local preview, not committed).
//
//   node scripts/catalog/preview_addresses.mjs
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { seedResolver } from './seed_members.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (p) => JSON.parse(readFileSync(path.join(REPO, p), 'utf8'));
const LEX = read('data/launch_lexicon.json').entries;
const CAT = read('data/catalog/catalog.json');
const TOPICS = read('data/group_seed.topics.json');
const SPEC = read('data/occasions/meal_doors.proposed.json');
const STARTERS = read('data/prediction/door_starters.en.json');
const OUT = path.join(REPO, 'public/preview-addresses.html');

const { resolve, members, home } = seedResolver(LEX, CAT);
const L = SPEC.layout;
const COLS = CAT.layouts[L].cols;
const CELLS = COLS * CAT.layouts[L].rows;
const homeCell = new Map(CAT.coreCells.filter((c) => c.layout === L).map((c) => [c.sense_id, c.slot_index]));
const HOME = home[L];
const label = new Map(CAT.labels.filter((l) => l.kind === 'lemma' && l.locale === 'en').map((l) => [l.sense_id, l.text]));
const sense = new Map(CAT.senses.map((s) => [s.id, s]));
const imageKey = new Map(CAT.images.map((i) => [i.id, i.key]));

// ---- doors: own words + travelling home words ----
const always = SPEC.alwaysTravel.map((w) => resolve(w, 'alwaysTravel'));
const doors = SPEC.doors.map((d) => {
  const own = d.topic ? members(TOPICS.groups.find((g) => g.key === d.topic)) : d.words.map((w) => resolve(w, d.key));
  const fringe = own.filter((s) => !HOME.has(s));
  const core = new Set([...own.filter((s) => HOME.has(s)), ...always]);
  const room = CELLS - fringe.length - core.size;
  const starters = [];
  for (const r of STARTERS.doors[d.key].ranked) {
    if (starters.length >= Math.min(SPEC.starterCap, room)) break;
    if (!core.has(r.sense)) starters.push(r.sense);
  }
  for (const s of starters) core.add(s);
  return { key: d.key, name: d.name, topic: !!d.topic, fringe, core, starters };
});

// ---- solve fringe addresses ----
// Occasion doors and the home board are guaranteed consistent: a word
// gets one cell free in every occasion door that holds it. A full topic
// door (Food: every food, the backup list) gives way — a word keeps its
// address there when the cell is free, else takes the nearest free cell.
const zoneOf = new Map();
SPEC.zones.forEach(([, ws], zi) => ws.forEach((w, wi) => zoneOf.set(resolve(w, 'zones'), zi * 100 + wi)));
const allFringe = [...new Set(doors.flatMap((d) => d.fringe))];
const unzoned = allFringe.filter((s) => !zoneOf.has(s));
if (unzoned.length) throw new Error(`no zone: ${unzoned.map((s) => label.get(s)).join(', ')}`);
// Most-shared words first (they need a cell free on the most pages), zone
// order within a tier so neighbors stay neighbors.
const occCount = (s) => doors.filter((d) => !d.topic && d.fringe.includes(s)).length;
allFringe.sort((a, b) => occCount(b) - occCount(a) || zoneOf.get(a) - zoneOf.get(b));
// column-major, like 018 D5's bands: each column fills top to bottom
const order = [...Array(CELLS).keys()].sort((a, b) => (a % COLS) - (b % COLS) || a - b);
const coreCellsOf = (d) => new Set([...d.core].map((s) => homeCell.get(s)));
const taken = new Map(doors.map((d) => [d.key, coreCellsOf(d)]));
const address = new Map(); // sense -> its one cell
const placed = new Map(doors.map((d) => [d.key, new Map()])); // door -> sense -> cell
const put = (d, s, c) => { taken.get(d.key).add(c); placed.get(d.key).set(s, c); };
const deferred = []; // [topic door, sense]: placed after, next to the address
for (const s of allFringe) {
  const ds = doors.filter((d) => d.fringe.includes(s));
  const occ = ds.filter((d) => !d.topic);
  const free = (set) => order.find((c) => set.every((d) => !taken.get(d.key).has(c)));
  let cell = free(ds);
  if (cell === undefined) {
    cell = free(occ);
    if (cell === undefined) throw new Error(`occasion doors cannot share a cell for ${label.get(s)}`);
    for (const d of ds.filter((x) => x.topic)) deferred.push([d, s]);
  }
  address.set(s, cell);
  for (const d of ds) if (!deferred.some(([x, y]) => x === d && y === s)) put(d, s, cell);
}
const dist = (a, b) => Math.abs((a % COLS) - (b % COLS)) + Math.abs(Math.floor(a / COLS) - Math.floor(b / COLS));
const moved = []; // [door, sense] that sit next to their address, not on it
for (const [d, s] of deferred) {
  const want = address.get(s);
  const cell = order.filter((c) => !taken.get(d.key).has(c)).sort((a, b) => dist(a, want) - dist(b, want))[0];
  put(d, s, cell);
  moved.push([d, s]);
}

// ---- render grids ----
const views = [{ key: 'home', name: 'Home', grid: Array(CELLS).fill(null) }];
for (const [s, c] of homeCell) views[0].grid[c] = s;
for (const d of doors) {
  const grid = Array(CELLS).fill(null);
  for (const s of d.core) grid[homeCell.get(s)] = s;
  for (const s of d.fringe) {
    const c = placed.get(d.key).get(s);
    if (grid[c]) throw new Error(`${d.key}: ${label.get(s)} collides with ${label.get(grid[c])} at ${c}`);
    grid[c] = s;
  }
  views.push({ key: d.key, name: d.name, grid, starters: d.starters });
}

// ---- measure from the rendered grids, not the solver ----
const cellsByWord = new Map();
for (const v of views) v.grid.forEach((s, c) => {
  if (!s) return;
  if (!cellsByWord.has(s)) cellsByWord.set(s, { views: [], cells: new Set() });
  cellsByWord.get(s).views.push(v.key);
  cellsByWord.get(s).cells.add(c);
});
const repeated = [...cellsByWord].filter(([, x]) => x.views.length > 1);
const sameCell = repeated.filter(([, x]) => x.cells.size === 1);
const pctSame = ((100 * sameCell.length) / repeated.length).toFixed(1);
console.log(`${repeated.length} words appear on 2+ pages; ${sameCell.length} (${pctSame}%) sit in the same cell on all of them`);
for (const v of views.slice(1)) {
  console.log(`  ${v.name.padEnd(10)} ${v.grid.filter(Boolean).length}/${CELLS} cells · starters: ${v.starters.map((s) => label.get(s)).join(', ')}`);
}
if (moved.length) console.log(`  off their address, topic door only: ${moved.map(([d, s]) => `${label.get(s)} (${d.name})`).join(', ')}`);

// ---- art ----
const art = new Map();
for (const s of cellsByWord.keys()) {
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
const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const words = Object.fromEntries([...cellsByWord.keys()].map((s) => [s, {
  label: label.get(s), role: role(s), art: art.get(s) ?? null,
  pages: cellsByWord.get(s).views.length, same: cellsByWord.get(s).cells.size === 1,
}]));
const data = {
  cols: COLS, cells: CELLS,
  views: views.map((v) => ({ key: v.key, name: v.name, grid: v.grid, starters: v.starters ?? [] })),
  words,
  starterNotes: Object.fromEntries(doors.map((d) => [d.key, STARTERS.doors[d.key].ranked.slice(0, 40)
    .map((r) => ({ w: r.word, share: r.share, used: d.core.has(r.sense) }))])),
};
const svg = (f) => readFileSync(path.join(REPO, 'public/icons', f), 'utf8')
  .replace(/<metadata>[\s\S]*?<\/metadata>/, '').replace(/ xmlns:c2pa="[^"]*"/, '')
  .replace(/width="96" height="96"/, 'width="30" height="30"');

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>One Address Per Word</title>
<!-- Local founder preview (026 follow-up). Generated by scripts/catalog/preview_addresses.mjs — not committed. -->
<style>
  @font-face { font-family: "Andika"; src: url("/fonts/andika-bold.woff2") format("woff2"); font-weight: 700; }
  :root { --ink: #2a241d; --ink-text: #1a1a1a; --cream: #f6f4ef; --line: #d8d4c8; --tray: #e8e3d6; --edge: #8a8578;
    --muted: #5b5348; --press-f: #f2efe6; --gap: 6px; --word-font: "Andika", -apple-system, "Helvetica Neue", sans-serif; }
  .r-Yellow { --rb: #b07f00; --rf: #fdf0c8; } .r-Green { --rb: #2e8b3a; --rf: #dcf0dd; }
  .r-Blue { --rb: #2f6fd0; --rf: #dcecfd; } .r-Pink { --rb: #d0438c; --rf: #fbdfee; }
  .r-Purple { --rb: #6f55b0; --rf: #ebe5f7; } .r-Red { --rb: #c62828; --rf: #fbdcdc; } .r-None { --rb: #8a8578; --rf: #f2efe6; }
  * { box-sizing: border-box; margin: 0; }
  body { font-family: -apple-system, "Helvetica Neue", sans-serif; background: var(--cream); color: var(--ink-text); padding: 16px; }
  main { max-width: 1180px; margin: 0 auto; }
  h1 { font-size: 21px; } .lede { color: var(--muted); font-size: 14px; line-height: 1.5; margin: 4px 0 12px; max-width: 900px; }
  .tabs { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 10px; align-items: center; }
  .tabs button { font: inherit; font-size: 15px; padding: 7px 14px; border: 2px solid var(--edge); background: #fff; border-radius: 10px; cursor: pointer; }
  .tabs button[aria-pressed="true"] { background: var(--ink); color: #fff; border-color: var(--ink); }
  .tabs label { font-size: 13px; color: var(--muted); margin-left: 10px; display: flex; gap: 6px; align-items: center; }
  .device { background: #1d1a16; border-radius: 26px; padding: 12px; }
  .screen { background: var(--cream); border-radius: 16px; padding: 10px; }
  .topbar { display: grid; grid-template-columns: 56px 1fr; gap: 8px; margin-bottom: 8px; align-items: stretch; }
  .corner { display: flex; align-items: center; justify-content: center; border-radius: 12px; }
  .corner.back { border: 2px solid var(--ink); background: #fff; }
  .corner.gear { opacity: .6; }
  .bar { background: #fff; border: 2px solid var(--line); border-radius: 12px; min-height: 52px; display: flex; align-items: center; padding: 0 14px;
    font-family: var(--word-font); font-weight: 700; font-size: 20px; color: var(--muted); }
  .strip { display: flex; justify-content: flex-end; background: var(--tray); border-radius: 12px; padding: 6px; margin-bottom: 8px; gap: 6px; }
  .strip .folder { width: 64px; height: 40px; border: 2px solid var(--edge); border-radius: 10px; display: flex; align-items: center; justify-content: center; background: var(--tray); }
  .grid { display: grid; grid-template-columns: repeat(var(--cols), 1fr); gap: var(--gap); }
  .cell { aspect-ratio: 1.25; border-radius: 10px; border: 3px solid var(--rb); background: #fff; display: flex; flex-direction: column; overflow: hidden; position: relative; min-width: 0; }
  .cell .tl { height: 26%; background: var(--rf); font-family: var(--word-font); font-weight: 700; font-size: clamp(9px, 1.25vw, 15px);
    display: flex; align-items: center; justify-content: center; white-space: nowrap; overflow: hidden; padding: 0 2px; }
  .cell .ta { flex: 1; min-height: 0; display: flex; align-items: center; justify-content: center; padding: 3px; }
  .cell .ta img { max-width: 100%; max-height: 100%; object-fit: contain; }
  .cell.hole { border: 2px dashed var(--line); background: transparent; }
  .cell.travel::after { content: ""; position: absolute; top: 4px; right: 4px; width: 9px; height: 9px; border-radius: 50%; background: var(--ink); }
  body.hide-dots .cell.travel::after { display: none; }
  .cell.flash { outline: 3px solid #e8a200; outline-offset: 1px; }
  .cell.same-as-last { outline: 3px solid #e8a200; outline-offset: 1px; }
  body:not(.show-same) .cell.same-as-last { outline: none; }
  .row { display: grid; grid-template-columns: 1fr 320px; gap: 16px; margin-top: 16px; }
  .panel { background: #fff; border: 1px solid var(--line); border-radius: 14px; padding: 12px 14px; }
  .panel h2 { font-size: 15px; margin-bottom: 8px; }
  .panel p, .panel li { font-size: 13px; line-height: 1.5; color: var(--muted); }
  .minis { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
  .mini h3 { font-size: 12px; margin-bottom: 4px; }
  .mini .g { display: grid; grid-template-columns: repeat(var(--cols), 1fr); gap: 2px; }
  .mini .g i { aspect-ratio: 1.25; border-radius: 2px; background: var(--rf, transparent); border: 1px solid var(--rb, var(--line)); }
  .mini .g i.on { background: #e8a200; border-color: #e8a200; }
  .stat { font-size: 26px; font-weight: 700; color: var(--ink-text); }
  .st { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 6px; }
  .st span { font-size: 12px; padding: 2px 6px; border-radius: 6px; background: var(--tray); }
  .st span.used { background: var(--ink); color: #fff; }
  @media (max-width: 860px) { .row { grid-template-columns: 1fr; } .minis { grid-template-columns: repeat(2, 1fr); } }
</style>
</head>
<body class="show-same">
<main>
  <h1>One address per word — prototype</h1>
  <p class="lede">Flip between pages (buttons or ← →). Every word sits in one cell on every page it appears on. Home-board words keep their home cell in every door; <b>stop</b> and <b>help</b> travel everywhere; each door adds its CHILDES sentence starters. Dot = the word is on more than one page. Amber ring = same word, same cell as the page you just left. Hover any word to light its cell on every page below.</p>
  <div class="tabs" id="tabs"></div>
  <div class="device"><div class="screen">
    <div class="topbar"><div class="corner" id="corner"></div><div class="bar">I want …</div></div>
    <div class="strip"><div class="folder">${svg('folder.svg')}</div></div>
    <div class="grid" id="grid" style="--cols:${COLS}"></div>
  </div></div>
  <div class="row">
    <div class="panel"><h2>Every page, one hover</h2><div class="minis" id="minis"></div></div>
    <div class="panel">
      <h2>Measured on the rendered pages</h2>
      <div class="stat">${sameCell.length}/${repeated.length}</div>
      <p>words that appear on 2+ pages sit in the same cell on all of them (${pctSame}%). Occasion doors and the home board always agree; ${moved.length ? `in the full ${moved[0][0].name} door ${moved.length} words sit next to their address instead: ${moved.map(([, s]) => esc(label.get(s))).join(', ')}.` : 'the topic door agrees too.'}</p>
      <h2 style="margin-top:14px">Starters on this page</h2>
      <p id="stnote"></p><div class="st" id="st"></div>
    </div>
  </div>
</main>
<script>
const D = ${JSON.stringify(data)};
const BACK = '<svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="#2a241d" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 4.5 7.5 12l7.5 7.5"/></svg>';
const GEAR = ${JSON.stringify(svg('settings-gear.svg'))};
let cur = 0, last = null;
const tabs = document.getElementById('tabs');
D.views.forEach((v, i) => { const b = document.createElement('button'); b.textContent = v.name; b.onclick = () => show(i); tabs.appendChild(b); });
const lab = document.createElement('label');
lab.innerHTML = '<input type="checkbox" id="same" checked> ring same-as-last';
tabs.appendChild(lab);
document.getElementById('same').onchange = (e) => document.body.classList.toggle('show-same', e.target.checked);
function tile(s, c, prev) {
  const el = document.createElement('div');
  if (!s) { el.className = 'cell hole'; return el; }
  const w = D.words[s];
  el.className = 'cell r-' + w.role + (w.pages > 1 ? ' travel' : '') + (prev && prev[c] === s ? ' same-as-last' : '');
  el.innerHTML = '<span class="tl">' + w.label + '</span><span class="ta">' + (w.art ? '<img src="' + w.art + '" alt="">' : '') + '</span>';
  el.onmouseenter = () => light(s); el.onmouseleave = () => light(null);
  return el;
}
function show(i) {
  last = D.views[cur].grid; cur = i;
  const v = D.views[i];
  [...tabs.querySelectorAll('button')].forEach((b, j) => b.setAttribute('aria-pressed', String(j === i)));
  document.getElementById('corner').className = 'corner ' + (v.key === 'home' ? 'gear' : 'back');
  document.getElementById('corner').innerHTML = v.key === 'home' ? GEAR : BACK;
  const g = document.getElementById('grid'); g.innerHTML = '';
  v.grid.forEach((s, c) => g.appendChild(tile(s, c, i === 0 && last === D.views[0].grid ? null : last)));
  const st = document.getElementById('st'); st.innerHTML = '';
  const notes = D.starterNotes[v.key];
  document.getElementById('stnote').textContent = notes
    ? 'Home words children said around this page\\'s words (CHILDES), most-used first. Dark = on this page.'
    : 'The home board: every word here keeps this cell on every door.';
  (notes || []).forEach((n) => { const x = document.createElement('span'); x.className = n.used ? 'used' : ''; x.textContent = n.w + ' ' + (100 * n.share).toFixed(1) + '%'; st.appendChild(x); });
}
const minis = document.getElementById('minis');
D.views.forEach((v) => {
  const m = document.createElement('div'); m.className = 'mini';
  m.innerHTML = '<h3>' + v.name + '</h3>';
  const g = document.createElement('div'); g.className = 'g'; g.style.setProperty('--cols', D.cols);
  v.grid.forEach((s) => { const i = document.createElement('i'); if (s) { i.className = 'r-' + D.words[s].role; i.dataset.s = s; i.onmouseenter = () => light(s); i.onmouseleave = () => light(null); } g.appendChild(i); });
  m.appendChild(g); minis.appendChild(m);
});
function light(s) { minis.querySelectorAll('i').forEach((i) => i.classList.toggle('on', !!s && i.dataset.s === s)); }
document.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowRight') show((cur + 1) % D.views.length);
  if (e.key === 'ArrowLeft') show((cur - 1 + D.views.length) % D.views.length);
});
show(0);
</script>
</body>
</html>`;
writeFileSync(OUT, html);
console.log(`${path.relative(REPO, OUT)} (${Math.round(html.length / 1024)} KB)`);
