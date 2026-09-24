// Phase 010 slice 2 review page: 50 drawings at a time, everything approved
// unless tapped. One tap = re-roll, two = reject, three = back to approve.
//
//   node scripts/art/review_server.mjs [--port 8787]   then open http://localhost:8787
//
// Decisions land in out/extended_art/review.json ({ id: "approve"|"reroll"|"reject" }).
// `node scripts/art/extended_batch.mjs --reroll` redraws the re-roll pile.
import { createServer } from "node:http";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseCatalog } from "./extended_batch.mjs";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");
const OUT = join(repoRoot, "out/extended_art");
const REVIEW = join(OUT, "review.json");
const PAGE = 50;

const readReview = () => (existsSync(REVIEW) ? JSON.parse(readFileSync(REVIEW, "utf8")) : {});

function pending() {
  const review = readReview();
  const rows = parseCatalog(readFileSync(join(repoRoot, "docs/product/Extended_Vocabulary_Catalog.md"), "utf8"));
  return rows.filter((r) => r.art === "draw" && !review[r.id] && existsSync(join(OUT, `${r.id}.png`)));
}

const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Extended art review</title><style>
body{margin:0;padding:12px;font:14px -apple-system,sans-serif;background:#f6f4ef;color:#1d1b16}
header{display:flex;gap:12px;align-items:center;position:sticky;top:0;background:#f6f4ef;padding:6px 0;z-index:1}
button{font:inherit;padding:8px 16px;border-radius:8px;border:1px solid #1d1b16;background:#1d1b16;color:#fff;cursor:pointer}
#grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px}
.t{background:#fff;border:4px solid #fff;border-radius:10px;padding:4px;cursor:pointer;user-select:none}
.t img{width:100%;aspect-ratio:1;object-fit:contain;display:block}
.t .l{font-weight:600;margin-top:4px}.t .s{font-size:11px;color:#777}
.t.reroll{border-color:#e39b16;background:#fdf1dc}.t.reject{border-color:#c62828;background:#fbdcdc;opacity:.6}
</style></head><body>
<header><b id="left"></b><span>Tap = re-roll · tap again = reject · Enter = save page</span><button id="save">Save page (approve the rest)</button></header>
<div id="grid"></div><script>
const S=["approve","reroll","reject"];let items=[],st={};
async function load(){const r=await (await fetch("/api/page")).json();items=r.items;st={};
document.getElementById("left").textContent=r.left+" left";
const g=document.getElementById("grid");g.innerHTML="";
for(const it of items){st[it.id]=0;const d=document.createElement("div");d.className="t";
d.innerHTML='<img loading="lazy" src="/img/'+encodeURIComponent(it.id)+'.png"><div class="l"></div><div class="s"></div>';
d.querySelector(".l").textContent=it.label;d.querySelector(".s").textContent=it.section;
d.onclick=()=>{st[it.id]=(st[it.id]+1)%3;d.className="t "+S[st[it.id]]};g.appendChild(d)}
window.scrollTo(0,0)}
async function save(){const decisions={};for(const it of items)decisions[it.id]=S[st[it.id]];
await fetch("/api/decide",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(decisions)});load()}
document.getElementById("save").onclick=save;document.onkeydown=e=>{if(e.key==="Enter")save()};load();
</script></body></html>`;

const port = Number(process.argv.includes("--port") ? process.argv[process.argv.indexOf("--port") + 1] : 8787);
createServer((req, res) => {
  const url = new URL(req.url, "http://x");
  if (url.pathname === "/") return res.writeHead(200, { "content-type": "text/html" }).end(html);
  if (url.pathname === "/api/page") {
    const p = pending();
    return res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ left: p.length, items: p.slice(0, PAGE) }));
  }
  if (url.pathname.startsWith("/img/")) {
    const file = join(OUT, decodeURIComponent(url.pathname.slice(5)).replace(/[\/\\]/g, ""));
    if (!existsSync(file)) return res.writeHead(404).end();
    return res.writeHead(200, { "content-type": "image/png", "cache-control": "no-store" }).end(readFileSync(file));
  }
  if (url.pathname === "/api/decide" && req.method === "POST") {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      const review = { ...readReview(), ...JSON.parse(body) };
      writeFileSync(REVIEW, JSON.stringify(review, null, 1));
      res.writeHead(204).end();
    });
    return;
  }
  res.writeHead(404).end();
}).listen(port, () => console.log(`review: http://localhost:${port}`));
