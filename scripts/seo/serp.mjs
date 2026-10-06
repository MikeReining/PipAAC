// Source-map collector — DOM extractors for Google and ChatGPT.
// Every function takes a DOM document as its argument and touches nothing
// outside it, so the same code runs under page.evaluate in Chrome and under
// linkedom in the parser tests. No HTTP lives here: the browser renders the
// page, these functions only read what is on screen.

function normText(s) {
  return String(s || "").replace(/\s+/g, " ").trim();
}

function anchorUrl(a) {
  return a.href || a.getAttribute("href") || "";
}

function hostOf(url) {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function isHttp(url) {
  return /^https?:/i.test(url);
}

function isGoogleHost(url) {
  return /(^|\.)google\.[a-z.]+$/.test(hostOf(url));
}

function dedupePush(list, seen, item, key) {
  if (!key || seen.has(key)) return;
  seen.add(key);
  list.push(item);
}

// The autocomplete dropdown while typing, before Enter.
export function extractSuggestions(document) {
  const out = [];
  const seen = new Set();
  const nodes = document.querySelectorAll('[role="option"], ul[role="listbox"] li');
  for (const el of nodes) {
    dedupePush(out, seen, normText(el.textContent), normText(el.textContent).toLowerCase());
  }
  return out;
}

function insideAd(a) {
  const adBox = a.closest(
    '#tads, #tadsb, #bottomads, #tvcap, [data-text-ad], .ads-ad, .commercial-unit-desktop-top, [aria-label="Ads"]',
  );
  if (adBox) return true;
  let el = a.parentElement;
  for (let i = 0; el && i < 8; i += 1, el = el.parentElement) {
    for (const child of el.querySelectorAll("span, div")) {
      const t = normText(child.textContent);
      if (t === "Sponsored" || t === "Ad") return true;
    }
  }
  return false;
}

// Climb from a heading-ish element to the smallest ancestor that holds links
// or question rows — how "Related searches" and "AI Overview" are found when
// Google's class names move.
function sectionContainer(document, label) {
  const want = label.toLowerCase();
  let heading = null;
  for (const el of document.querySelectorAll("h1, h2, h3, h4, span, div")) {
    const own = normText(el.childNodes.length === 1 ? el.textContent : "");
    if (own.toLowerCase() === want) {
      heading = el;
      break;
    }
  }
  if (!heading) return null;
  let el = heading;
  while (el.parentElement && el.parentElement !== document.body) {
    el = el.parentElement;
    if (el.querySelector('a[href], .related-question-pair, [data-initq]')) return el;
  }
  return el;
}

function linksWithin(container, seen) {
  const out = [];
  for (const a of container.querySelectorAll('a[href^="http"]')) {
    const url = anchorUrl(a);
    if (!isHttp(url) || isGoogleHost(url) || insideAd(a)) continue;
    dedupePush(out, seen, { url, title: normText(a.textContent) }, url);
  }
  return out;
}

function aiOverviewLinks(document, seen) {
  for (const sel of ['[data-attrid="AIOverview"]', "#eKIzJc", "#m-x-content"]) {
    const box = document.querySelector(sel);
    if (box) return linksWithin(box, seen);
  }
  const box = sectionContainer(document, "AI overview");
  return box ? linksWithin(box, seen) : null;
}

function questionTexts(document, container) {
  const out = [];
  const seen = new Set();
  const sel = ".related-question-pair, [data-initq], [role=\"button\"]";
  for (const el of (container || document).querySelectorAll(sel)) {
    dedupePush(out, seen, normText(el.textContent), normText(el.textContent).toLowerCase());
  }
  return out;
}

// First results page: organic rows (h3 wrapped in an anchor is the stable
// organic signal), the AI overview box when present, People Also Ask, and
// related searches. Sponsored blocks and Google chrome are skipped.
export function extractSerp(document) {
  const organic = [];
  const seen = new Set();
  for (const h3 of document.querySelectorAll("#search h3, #rso h3, #center_col h3")) {
    const a = h3.closest('a[href^="http"], a[href^="/"]');
    if (!a) continue;
    const url = anchorUrl(a);
    if (!isHttp(url) || isGoogleHost(url) || insideAd(a)) continue;
    dedupePush(organic, seen, { url, title: normText(h3.textContent) }, url);
  }
  const ai = aiOverviewLinks(document, seen);
  const paa = questionTexts(document, sectionContainer(document, "People also ask"));
  const related = [];
  const relatedBox = sectionContainer(document, "Related searches");
  const relatedNodes = relatedBox
    ? relatedBox.querySelectorAll('a[href^="/search"], a[href^="http"]')
    : document.querySelectorAll('#brs a, .EIaa9b a, a.k8XOCe');
  const relatedSeen = new Set();
  for (const a of relatedNodes) {
    dedupePush(related, relatedSeen, normText(a.textContent), normText(a.textContent).toLowerCase());
  }
  return { organic, aiOverview: ai, peopleAlsoAsk: paa, related };
}

// ChatGPT answer: real citation surfaces only — the sources panel, footnote
// anchors, and link cards. URLs in the model's prose are not citations.
export function extractChatGPT(document) {
  const links = [];
  const seen = new Set();
  const sel = [
    '[data-testid*="source"] a[href^="http"]',
    'aside a[href^="http"]',
    '[data-message-author-role="assistant"] a[href^="http"]',
    ".agent-turn a[href^=\"http\"]",
    "article a[href^=\"http\"]",
  ].join(", ");
  for (const a of document.querySelectorAll(sel)) {
    const url = anchorUrl(a);
    const host = hostOf(url);
    if (!isHttp(url) || host === "chatgpt.com" || host.endsWith(".chatgpt.com")) continue;
    if (host === "cdn.oaistatic.com" || host === "auth.openai.com") continue;
    dedupePush(links, seen, { url, title: normText(a.textContent) }, url);
  }
  return links;
}

export function chatGPTComposer(document) {
  return (
    document.querySelector("#prompt-textarea") ||
    document.querySelector('div[contenteditable="true"]') ||
    document.querySelector("textarea")
  );
}

// A captcha, a consent wall, or a login wall stops the run. Returns the wall
// kind or null.
export function detectWall(document, pageUrl) {
  const url = String(pageUrl || "");
  const body = String(document.body ? document.body.textContent : "").replace(/\s+/g, " ");
  if (/consent\.google\.|consent\.youtube\./.test(url)) return "consent";
  if (/\/sorry\//.test(url) || /unusual traffic|not a robot|detected unusual/i.test(body)) {
    return "captcha";
  }
  if (/auth\.openai\.com|chatgpt\.com\/auth|\/login/.test(url)) return "login";
  return null;
}

// The honesty artifact for the smoke check: everything visible, plus every
// resolved href on the page. Recorded URLs must appear in the links section —
// that is the proof the tool observed the page rather than inventing targets.
export function pageEvidence(document) {
  const text = document.body ? document.body.innerText || document.body.textContent : "";
  const lines = ["=== VISIBLE TEXT ===", text, "", "=== LINKS ON PAGE ==="];
  for (const a of document.querySelectorAll("a[href]")) {
    lines.push(`${anchorUrl(a)}\t${normText(a.textContent)}`);
  }
  return lines.join("\n");
}

export function evidenceLinks(evidence) {
  const out = new Set();
  let inLinks = false;
  for (const line of String(evidence).split("\n")) {
    if (line === "=== LINKS ON PAGE ===") {
      inLinks = true;
      continue;
    }
    if (!inLinks) continue;
    const url = line.split("\t")[0].trim();
    if (url) out.add(url);
  }
  return out;
}
