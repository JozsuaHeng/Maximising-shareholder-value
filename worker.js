// Cloudflare Worker — this is a real Worker project (not classic "Pages"),
// so there's no functions/ auto-routing convention here. wrangler.jsonc's
// `assets.run_worker_first: ["/api/*"]` sends only /api/* requests to this
// script; everything else (index.html, style.css, script.js, ...) is
// served directly from the static assets binding without touching this
// file at all.
//
// The whole point: FINNHUB_API_KEY, TWELVE_DATA_API_KEY and FRED_API_KEY
// are set as secrets in the Cloudflare dashboard (Settings → Variables and
// secrets), readable only here via `env`, never sent to the browser. The
// page calls /api/finnhub, /api/twelvedata and /api/fred (see
// finnhubUrl()/twelveDataUrl()/fredUrl() in script.js/chart.js/home.js)
// instead of calling those APIs directly.
//
// Also caches upstream responses at Cloudflare's edge for a short time
// (see cacheTTL below). This isn't just about speed — Finnhub's free tier
// caps out at 60 requests/minute, and the home page alone requests dozens
// of quotes on load. Caching means repeat requests for the same symbol
// (across visitors, or the same visitor reloading) get served without
// touching Finnhub again, so the real request count stays far lower than
// the raw number of page loads would suggest.
//
// CORS is allowed from any origin on these responses. That's deliberate:
// FRED has no CORS support of its own, so even local development (running
// on localhost, a different origin than this Worker) has to call this
// proxy directly — there's no way around that without also running a
// local proxy, which isn't worth it for one API. The data returned isn't
// user-specific or sensitive; the actual secrets never leave this file.

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === "/api/finnhub") {
      return proxy(url, "https://finnhub.io/api/v1", "token", env.FINNHUB_API_KEY, "FINNHUB_API_KEY", ctx);
    }
    if (url.pathname === "/api/twelvedata") {
      return proxy(url, "https://api.twelvedata.com", "apikey", env.TWELVE_DATA_API_KEY, "TWELVE_DATA_API_KEY", ctx);
    }
    if (url.pathname === "/api/fred") {
      return proxy(url, "https://api.stlouisfed.org/fred", "api_key", env.FRED_API_KEY, "FRED_API_KEY", ctx);
    }
    if (url.pathname === "/api/coingecko") {
      return proxy(url, "https://api.coingecko.com/api/v3", "x_cg_demo_api_key", env.COINGECKO_API_KEY, "COINGECKO_API_KEY", ctx, false);
    }

    // Anything else falls back to the static site (shouldn't normally be
    // reached, since run_worker_first only routes /api/* here).
    return env.ASSETS.fetch(request);
  },
};

// How long to cache each kind of request, in seconds. Quotes change fast
// (short cache); filings/financials/earnings calendar/FRED economic data
// barely change within a day (long cache); everything else is a
// reasonable middle ground. Tune per-path rather than one blanket value,
// since caching a quote for an hour would make the dashboard feel stale,
// but caching a 10-K filing list for only 20 seconds wastes the cache
// entirely.
function cacheTTL(path) {
  if (path === "/quote" || path === "/simple/price") return 20;
  if (
    path === "/stock/filings" ||
    path === "/stock/financials-reported" ||
    path === "/calendar/earnings" ||
    path === "/search" ||
    path === "/series/observations" // FRED — monthly/quarterly data, safe to cache for hours
  ) return 3600;
  return 120;
}

async function proxy(url, apiBase, keyParamName, key, keyEnvName, ctx, keyRequired = true) {
  const path = url.searchParams.get("path");
  if (!path) {
    return jsonResponse({ error: "Missing 'path' parameter" }, 400);
  }
  if (keyRequired && !key) {
    return jsonResponse({ error: `${keyEnvName} not configured on the server` }, 500);
  }

  const search = new URLSearchParams(url.searchParams);
  search.delete("path");
  if (key) search.set(keyParamName, key);
  const targetUrl = `${apiBase}${path}?${search.toString()}`;

  const cache = caches.default;
  const cacheKey = new Request(targetUrl);

  const cached = await cache.match(cacheKey);
  if (cached) return withCors(cached);

  try {
    const res = await fetch(targetUrl);
    const body = await res.text();
    const response = new Response(body, {
      status: res.status,
      headers: {
        "content-type": "application/json",
        "cache-control": res.ok ? `public, max-age=${cacheTTL(path)}` : "no-store",
      },
    });
    if (res.ok) ctx.waitUntil(cache.put(cacheKey, response.clone()));
    return withCors(response);
  } catch {
    return jsonResponse({ error: "Upstream request failed" }, 502);
  }
}

function withCors(response) {
  const headers = new Headers(response.headers);
  headers.set("access-control-allow-origin", "*");
  return new Response(response.body, { status: response.status, headers });
}

function jsonResponse(obj, status) {
  return withCors(new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json" } }));
}
