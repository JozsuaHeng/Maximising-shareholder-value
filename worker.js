// Cloudflare Worker — this is a real Worker project (not classic "Pages"),
// so there's no functions/ auto-routing convention here. wrangler.jsonc's
// `assets.run_worker_first: ["/api/*"]` sends only /api/* requests to this
// script; everything else (index.html, style.css, script.js, ...) is
// served directly from the static assets binding without touching this
// file at all.
//
// The whole point: FINNHUB_API_KEY and TWELVE_DATA_API_KEY are set as
// secrets in the Cloudflare dashboard (Settings → Variables and secrets),
// readable only here via `env`, never sent to the browser. The page calls
// /api/finnhub and /api/twelvedata (see finnhubUrl()/twelveDataUrl() in
// script.js/chart.js) instead of calling Finnhub/Twelve Data directly.

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/finnhub") {
      return proxy(url, "https://finnhub.io/api/v1", "token", env.FINNHUB_API_KEY, "FINNHUB_API_KEY");
    }
    if (url.pathname === "/api/twelvedata") {
      return proxy(url, "https://api.twelvedata.com", "apikey", env.TWELVE_DATA_API_KEY, "TWELVE_DATA_API_KEY");
    }

    // Anything else falls back to the static site (shouldn't normally be
    // reached, since run_worker_first only routes /api/* here).
    return env.ASSETS.fetch(request);
  },
};

async function proxy(url, apiBase, keyParamName, key, keyEnvName) {
  const path = url.searchParams.get("path");
  if (!path) {
    return jsonResponse({ error: "Missing 'path' parameter" }, 400);
  }
  if (!key) {
    return jsonResponse({ error: `${keyEnvName} not configured on the server` }, 500);
  }

  const search = new URLSearchParams(url.searchParams);
  search.delete("path");
  search.set(keyParamName, key);

  try {
    const res = await fetch(`${apiBase}${path}?${search.toString()}`);
    const body = await res.text();
    return new Response(body, {
      status: res.status,
      headers: { "content-type": "application/json", "cache-control": "no-store" },
    });
  } catch {
    return jsonResponse({ error: "Upstream request failed" }, 502);
  }
}

function jsonResponse(obj, status) {
  return new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json" } });
}
