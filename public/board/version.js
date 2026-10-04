/**
 * Which version is this page running? (founder 2026-10-04: "always know
 * what version something is running".)
 *
 * The truth is the shell this document was served from — the service
 * worker that controlled it at boot answers from its own versioned cache
 * (`pip-shell-<SW_BUILD>`), so that worker's SW_BUILD is the running
 * build. Ask it at boot, before a newer worker can claim the page and
 * answer for code this page never loaded. No controller means the page
 * came from the network, i.e. whatever is deployed.
 *
 * "Latest" is the deployed /sw-build.js, fetched fresh (it is never
 * precached). Running ≠ latest is the stale-shell case: the new version
 * is downloading or ready, and takes over on the next open.
 */

const parseBuild = (text) => /SW_BUILD\s*=\s*"([^"]+)"/.exec(text)?.[1] ?? null;

const bootWorker = navigator.serviceWorker?.controller ?? null;

const askController = () => {
  const sw = bootWorker;
  if (!sw) return Promise.resolve(null);
  return new Promise((resolve) => {
    const ch = new MessageChannel();
    const t = setTimeout(() => resolve(undefined), 3000);
    ch.port1.onmessage = (e) => { clearTimeout(t); resolve(e.data ?? undefined); };
    sw.postMessage({ type: "pip-build" }, [ch.port2]);
  });
};

// null = no controller (served from the network); undefined = no answer.
const running = askController();

async function latestBuild() {
  try {
    const res = await fetch("/sw-build.js", { cache: "no-store" });
    return res.ok ? parseBuild(await res.text()) : null;
  } catch {
    return null; // offline
  }
}

/** One plain line for Settings. */
async function versionLine() {
  const [mine, latest] = await Promise.all([running, latestBuild()]);
  if (mine === null) {
    return latest ? `Version ${latest} · not saved for offline yet` : "Version unknown · offline";
  }
  if (mine === undefined) {
    return latest ? `Version unknown · latest is ${latest}` : "Version unknown";
  }
  if (!latest) return `Version ${mine} · offline, can't check for a newer one`;
  if (mine === latest) return `Version ${mine} · up to date`;
  // A newer worker took control after boot: it has the whole new shell.
  const swapped = (navigator.serviceWorker?.controller ?? null) !== bootWorker;
  return swapped
    ? `Version ${mine} · newer version ${latest} is ready — close Pip and open it again`
    : `Version ${mine} · newer version ${latest} is downloading`;
}

/** Settings → Overview calls this each time it shows. */
export function showVersion() {
  const el = document.getElementById("set-version");
  if (el) versionLine().then((t) => { el.textContent = t; });
}
