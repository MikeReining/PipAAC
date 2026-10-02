/**
 * pipaac.org — marketing site worker (035).
 *
 * Two jobs, deliberately thin:
 *   1. www.pipaac.org → pipaac.org (301), so the apex is the one origin.
 *   2. Security headers on every response — this is a static site, so the
 *      worker exists for chrome only; copy/design live in public/.
 *
 * Everything else falls through to the ASSETS binding (run_worker_first).
 */
const SECURITY = {
  "strict-transport-security": "max-age=63072000; includeSubDomains; preload",
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
  "referrer-policy": "strict-origin-when-cross-origin",
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.hostname === "www.pipaac.org") {
      url.hostname = "pipaac.org";
      return Response.redirect(url.toString(), 301);
    }
    const res = await env.ASSETS.fetch(request);
    const headers = new Headers(res.headers);
    for (const [k, v] of Object.entries(SECURITY)) headers.set(k, v);
    return new Response(res.body, {
      status: res.status, statusText: res.statusText, headers,
    });
  },
};
