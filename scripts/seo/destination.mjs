// Source-map collector — destination and page-type rules.
// Pure functions; the rule tables live in docs/strategy/seo/Source_Map_Collector.md
// and docs/strategy/SEO_Playbook.md § 5. Blank is the right answer when no rule
// is sure — do not default the homepage.

export function domainFor(url) {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

const PAGE_TYPE_HOSTS = [
  [/^(?:.+\.)?reddit\.com$/, "forum"],
  [/^(?:.+\.)?youtube\.com$|^youtu\.be$/, "video"],
  [/^(?:.+\.)?wikipedia\.org$/, "other"],
  [/^apps\.apple\.com$|^play\.google\.com$/, "directory"],
];

export function pageTypeFor(url) {
  const host = domainFor(url);
  for (const [re, type] of PAGE_TYPE_HOSTS) {
    if (re.test(host)) return type;
  }
  return "";
}

// First match wins. `proloquo2go` is listed before `proloquo` so the longer
// name wins when a page mentions both.
const NAME_RULES = [
  [/proloquo[\s-]*2[\s-]*go/i, "/compare/proloquo2go"],
  [/touch[\s-]*chat/i, "/compare/touchchat"],
  [/lamp[\s-]*words[\s-]*for[\s-]*life|lamp[\s-]*words/i, "/compare/lamp-words-for-life"],
  [/\btd[\s-]*snap\b/i, "/compare/td-snap"],
  [/cough[\s-]*drop/i, "/compare/coughdrop"],
  [/proloquo/i, "/compare/proloquo"],
];

const PRICE_RE = /price|pricing|\bcost|subscription|\bfree\b/i;
const SLP_RE = /\bslps?\b|speech[-\s]?(?:therapist|therapy|pathologist|language)/i;
const SCHOOL_RE = /\bschools?\b|\bclassrooms?\b/i;

export function destinationFor({ question = "", url = "", title = "" }) {
  const page = `${url} ${title}`;
  for (const [re, dest] of NAME_RULES) {
    if (re.test(page)) return dest;
  }
  if (PRICE_RE.test(question)) return "/pricing";
  if (SLP_RE.test(page)) return "/slps";
  if (SCHOOL_RE.test(page)) return "/schools";
  return "";
}
