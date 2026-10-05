/**
 * Which version is this page running — and what's happening with a
 * newer one. Settings → Overview shows the line, an action button
 * (Check / Download / Update now / Retry) and a real progress bar.
 *
 * The truth is the shell this document was served from — the service
 * worker that controlled it at boot answers from its own versioned
 * cache (`pip-shell-<SW_BUILD>`), so that worker's SW_BUILD is the
 * running build. Ask it at boot, before a newer worker can claim the
 * page and answer for code this page never loaded. No controller means
 * the page came from the network, i.e. whatever is deployed.
 *
 * "Latest" is the deployed /sw-build.js, fetched fresh (it is never
 * precached). Running ≠ latest means a newer build exists — and the
 * page then *makes it true*: registration.update() starts the real
 * install instead of just claiming one is "downloading" (the 2026-10-05
 * bug — a long-lived home-screen tab never re-checked, so nothing was
 * downloading while the line said otherwise). States come from the
 * registration's real workers (installing / waiting / redundant), the
 * download percentage from the worker's pip-shell-progress posts.
 *
 * SW_VERSION is the human number ("1.1.0"); SW_BUILD keeps the content
 * hash for support and cache identity. Pre-1.1.0 workers answered
 * "pip-build" with a bare build string — display falls back to it.
 */

const parseBuild = (text) => ({
  build: /SW_BUILD\s*=\s*"([^"]+)"/.exec(text)?.[1] ?? null,
  version: /SW_VERSION\s*=\s*"([^"]+)"/.exec(text)?.[1] ?? null,
});

/** What a human calls this build: the semver, else the raw build id. */
const name = (v) => v?.version ?? v?.build ?? "unknown";

const swSupported = "serviceWorker" in navigator;
const bootWorker = swSupported ? navigator.serviceWorker.controller : null;

let mine = null;     // {build, version} | null (no controller) | undefined (no answer)
let latest = null;   // same shape, from /sw-build.js
let progress = null; // {done, total} from the installing worker
let failed = false;  // an install attempt died redundant / never started
let checking = false;
let lastPhase = "boot";
let onReload = null;

const askController = () => {
  if (!bootWorker) return Promise.resolve(null);
  return new Promise((resolve) => {
    const ch = new MessageChannel();
    const t = setTimeout(() => resolve(undefined), 3000);
    ch.port1.onmessage = (e) => {
      clearTimeout(t);
      const d = e.data;
      resolve(d == null ? undefined
        : typeof d === "string" ? { build: d, version: null } : d);
    };
    bootWorker.postMessage({ type: "pip-build" }, [ch.port2]);
  });
};
const running = askController();

async function latestBuild() {
  try {
    const res = await fetch("/sw-build.js", { cache: "no-store" });
    return res.ok ? parseBuild(await res.text()) : null;
  } catch {
    return null; // offline
  }
}

const reg = () => navigator.serviceWorker?.getRegistration();

/* A newer worker owns the page now (skipWaiting + clients.claim), or a
 * fully-installed one is parked in waiting — either way the whole new
 * shell is cached and a reload lands on it. */
const swapped = () =>
  swSupported && (navigator.serviceWorker.controller ?? null) !== bootWorker;

async function phase() {
  if (!swSupported) return "nosw";
  if (mine === null) return "first";    // network-served: it IS the latest
  if (mine === undefined) return "unknown";
  if (!latest) return "offline";
  if (mine.build === latest.build) return "current";
  /* The build differs — where is the newer worker? A swap alone isn't
   * "ready": the first-install claim also changes the controller (a
   * network-served page was already running the new code). Ready means
   * we know ours is stale AND the new shell is standing by. */
  const r = await reg();
  if (swapped() || r?.waiting) return "ready";
  if (r?.installing) return "downloading";
  return failed ? "failed" : "available";
}

/* --- DOM ---------------------------------------------------------- */

const $ = (id) => document.getElementById(id);

async function render() {
  const el = $("set-version");
  const btn = $("update-btn");
  const bar = $("update-bar");
  const fill = $("update-fill");
  const dot = $("corner-dot");
  if (!el) return;
  const p = await phase();
  lastPhase = p;
  const mineName = mine ? name(mine) : name(latest);
  el.dataset.build = mine?.build ?? "";
  /* Between VERSION bumps every deploy is hash-only — "version 1.1.0 is
   * ready" while already on 1.1.0 reads wrong; call it "an update". */
  const upd = latest && name(latest) !== mineName
    ? `version ${name(latest)}` : "an update";
  let line = `Version ${mineName}`;
  let btnText = null;
  switch (p) {
    case "nosw": line += " · offline support unavailable"; break;
    case "first":
      line += progress
        ? ` · saving for offline — ${progress.done} of ${progress.total}`
        : latest ? " · saving for offline" : " · offline";
      break;
    case "unknown":
      line = latest ? `Version unknown · latest is ${name(latest)}` : "Version unknown";
      btnText = "Check for updates";
      break;
    case "offline": line += " · offline, can't check for updates"; break;
    case "current": line += " · up to date"; btnText = "Check for updates"; break;
    case "available":
      line += ` · ${upd} available`;
      btnText = "Download update";
      break;
    case "downloading":
      line += progress
        ? ` · downloading ${upd} — ${progress.done} of ${progress.total}`
        : ` · downloading ${upd}`;
      btnText = "Downloading…";
      break;
    case "ready":
      line += ` · ${upd} is ready`;
      btnText = "Update now";
      break;
    case "failed":
      line += " · couldn't download the update";
      btnText = "Retry update";
      break;
  }
  el.textContent = line;
  if (btn) {
    btn.hidden = !btnText;
    btn.textContent = btnText ?? "";
    btn.disabled = p === "downloading" || checking;
    btn.classList.toggle("secondary", p !== "ready");
  }
  if (bar) {
    bar.hidden = !(p === "downloading" || (p === "first" && progress));
    if (fill && progress) {
      fill.style.width = `${Math.round((progress.done / progress.total) * 100)}%`;
    }
  }
  // macOS-style badge: the gear wears a dot when an update is ready.
  if (dot) dot.hidden = p !== "ready";
}

/** Refresh the facts, then start the download when a diff is real. */
async function check() {
  if (!swSupported || checking) return;
  checking = true;
  try {
    [mine, latest] = await Promise.all([running, latestBuild()])
      .then(([m, l]) => [m ?? mine, l]); // a claimed first install keeps its upgrade
    render();
    if (!latest || (mine?.build && latest.build === mine.build)) return;
    const r = await reg();
    if (!r || r.installing || r.waiting || swapped()) { render(); return; }
    // The diff is real and nothing is in flight — make it download.
    progress = null; // don't flash a previous install's final number
    try { await r.update(); } catch { /* network race — see below */ }
    render();
    if (!r.installing && !r.waiting && !swapped()) {
      // update() found nothing or the install died already — honest fail.
      failed = true;
      render();
    }
  } finally {
    checking = false;
    render();
  }
}

/* Watch whatever worker is currently installing: redundant = the
 * install threw (precache failure) — the label must say so, not keep
 * claiming "downloading". */
function watchInstalling(w) {
  if (!w) return;
  failed = false;
  w.addEventListener("statechange", () => {
    if (w.state === "redundant") { failed = true; render(); }
    else render();
  });
}

async function wireRegistration() {
  const r = await reg();
  if (!r) return;
  r.addEventListener("updatefound", () => watchInstalling(r.installing));
  watchInstalling(r.installing); // an install may predate this module
}

/**
 * Wire once from board.js. `reload` performs the guarded "Update now"
 * reload (flush the db first — a half-saved profile must not die with
 * the tab).
 */
export function initVersionUI({ reload } = {}) {
  onReload = reload ?? null;
  if (!swSupported) { render(); return; }
  wireRegistration();
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (mine === null && latest) mine = latest; // first install claimed us
    // A swap usually means a NEWER build just took over — the cached
    // `latest` predates it, so re-check rather than re-render stale.
    check();
  });
  navigator.serviceWorker.addEventListener("message", (e) => {
    if (e.data?.type !== "pip-shell-progress") return;
    progress = { done: e.data.done, total: e.data.total };
    render();
  });
  // Long-lived home-screen apps never navigate — without these, a
  // session would never learn an update exists.
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) check();
  });
  setInterval(check, 30 * 60 * 1000);
  $("update-btn")?.addEventListener("click", () => {
    if (lastPhase === "ready" && onReload) { onReload(); return; }
    if (lastPhase === "failed") failed = false;
    check();
  });
  check();
}

/** Settings → Overview calls this each time it shows. */
export function showVersion() {
  render();
}
