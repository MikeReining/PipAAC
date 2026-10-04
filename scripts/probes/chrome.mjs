/** 043 F — one Chrome lookup for every probe. Resolution order:
 *  `CHROME_BIN` env → platform paths → PATH names (what CI runners
 *  ship). Throws with the searched list, so a missing browser fails
 *  the gate with a reason instead of a spawn ENOENT. */
import { existsSync } from "node:fs";
import { execFileSync } from "node:child_process";

const DARWIN_PATHS = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
];
const PATH_NAMES = [
  "google-chrome", "google-chrome-stable", "chromium", "chromium-browser", "chrome",
];

export function resolveChrome() {
  if (process.env.CHROME_BIN && existsSync(process.env.CHROME_BIN)) {
    return process.env.CHROME_BIN;
  }
  if (process.platform === "darwin") {
    for (const p of DARWIN_PATHS) if (existsSync(p)) return p;
  }
  for (const name of PATH_NAMES) {
    try {
      const found = execFileSync("which", [name], { encoding: "utf8" }).trim();
      if (found) return found;
    } catch { /* not on PATH */ }
  }
  throw new Error(
    `chrome: no browser found. Set CHROME_BIN, or install Chrome/Chromium. ` +
    `Searched: CHROME_BIN env${process.platform === "darwin" ? ", " + DARWIN_PATHS.join(", ") : ""}, PATH names ${PATH_NAMES.join(", ")}`);
}
