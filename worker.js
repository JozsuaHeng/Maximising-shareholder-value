// Cloudflare Worker — this is a real Worker project (not classic "Pages"),
// so there's no functions/ auto-routing convention here. wrangler.jsonc's
// `assets.run_worker_first: ["/api/*"]` sends only /api/* requests to this
// script; everything else (index.html, style.css, script.js, ...) is
// served directly from the static assets binding without touching this
// file at all.
//
// The whole point: FINNHUB_API_KEY, TWELVE_DATA_API_KEY, FRED_API_KEY and
// COINGECKO_API_KEY are set as secrets in the Cloudflare dashboard
// (Settings → Variables and secrets), readable only here via `env`, never
// sent to the browser. The page calls /api/finnhub, /api/twelvedata,
// /api/fred and /api/coingecko instead of calling those APIs directly.
//
// Two layers of caching:
// 1. Per-request edge caching (see cacheTTL below) — a normal cache, keyed
//    by the exact request URL, populated the first time any visitor asks
//    for something.
// 2. A scheduled background job (`scheduled()` below, runs every 5 minutes
//    via wrangler.jsonc's cron trigger) that proactively refreshes the
//    home page's curated symbols into Cloudflare KV — a globally-readable
//    store, unlike layer 1's cache (which is per-edge-location, so a cron
//    run in one location wouldn't warm the cache for visitors hitting a
//    different one). Real visitors then read straight from KV for those
//    symbols instead of ever calling Finnhub/CoinGecko directly — this is
//    what actually solves the free-tier rate-limit problem, rather than
//    just reducing how often it's hit.
//
// HOME_CACHE (the KV binding) is optional — if it's not bound yet (see
// README for setup), everything still works exactly as before, just
// without the pre-warming speedup. Never let a missing KV binding break a
// request; always fall through to the normal live-fetch path.
//
// CORS is allowed from any origin on these responses. That's deliberate:
// FRED has no CORS support of its own, so even local development (running
// on localhost, a different origin than this Worker) has to call this
// proxy directly — there's no way around that without also running a
// local proxy, which isn't worth it for one API. The data returned isn't
// user-specific or sensitive; the actual secrets never leave this file.

// Keep in sync with HOME_CATEGORIES in home.js (minus crypto, which is
// pre-warmed separately via CoinGecko's batch endpoint below).
const PREWARM_SYMBOLS = [
  "AAPL", "MSFT", "GOOGL", "AMZN", "NVDA", "META",
  "JNJ", "PG", "KO", "JPM", "V", "WMT",
  "T", "XOM", "VZ", "PFE", "MO", "IBM",
  "TSLA", "NFLX", "SHOP", "PLTR", "CRWD", "AMD",
  "SPY", "QQQ", "VTI", "DIA", "IWM", "VOO",
  "TLT", "BND", "AGG", "HYG", "IEF", "LQD",
];
const PREWARM_CRYPTO_IDS = "bitcoin,ethereum,solana,ripple,dogecoin,cardano";
const KV_TTL_SECONDS = 600; // 10 min safety-net expiry, well beyond the 5-min cron interval

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === "/api/finnhub") {
      return handleFinnhub(url, env, ctx);
    }
    if (url.pathname === "/api/twelvedata") {
      return proxy(url, "https://api.twelvedata.com", "apikey", env.TWELVE_DATA_API_KEY, "TWELVE_DATA_API_KEY", ctx);
    }
    if (url.pathname === "/api/fred") {
      return proxy(url, "https://api.stlouisfed.org/fred", "api_key", env.FRED_API_KEY, "FRED_API_KEY", ctx);
    }
    if (url.pathname === "/api/coingecko") {
      return handleCoinGecko(url, env, ctx);
    }

    // Anything else falls back to the static site (shouldn't normally be
    // reached, since run_worker_first only routes /api/* here).
    return env.ASSETS.fetch(request);
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(prewarmHomeData(env));
  },
};

async function handleFinnhub(url, env, ctx) {
  const path = url.searchParams.get("path");
  const symbol = url.searchParams.get("symbol");

  if (path === "/quote" && symbol && env.HOME_CACHE && PREWARM_SYMBOLS.includes(symbol)) {
    try {
      const cached = await env.HOME_CACHE.get(`quote:${symbol}`);
      if (cached) return jsonBody(cached);
    } catch {
      // KV read failed for some reason — fall through to the live path below
    }
  }

  return proxy(url, "https://finnhub.io/api/v1", "token", env.FINNHUB_API_KEY, "FINNHUB_API_KEY", ctx);
}

async function handleCoinGecko(url, env, ctx) {
  const path = url.searchParams.get("path");

  // This app only ever calls CoinGecko for the fixed 6-coin home page
  // batch, so a path match is enough to serve the pre-warmed value —
  // if that ever changes (different ids requested), this needs revisiting.
  if (path === "/simple/price" && env.HOME_CACHE) {
    try {
      const cached = await env.HOME_CACHE.get("crypto:batch");
      if (cached) return jsonBody(cached);
    } catch {
      // fall through
    }
  }

  return proxy(url, "https://api.coingecko.com/api/v3", "x_cg_demo_api_key", env.COINGECKO_API_KEY, "COINGECKO_API_KEY", ctx, false);
}

async function prewarmHomeData(env) {
  if (!env.HOME_CACHE) return; // KV not set up yet — nothing to do

  await Promise.all(PREWARM_SYMBOLS.map(async symbol => {
    try {
      const res = await fetch(`https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${env.FINNHUB_API_KEY}`);
      if (res.ok) {
        const body = await res.text();
        await env.HOME_CACHE.put(`quote:${symbol}`, body, { expirationTtl: KV_TTL_SECONDS });
      }
    } catch {
      // leave that symbol's old KV value (if any) in place rather than erroring the whole run
    }
  }));

  try {
    const keyParam = env.COINGECKO_API_KEY ? `&x_cg_demo_api_key=${env.COINGECKO_API_KEY}` : "";
    const res = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${PREWARM_CRYPTO_IDS}&vs_currencies=usd&include_24hr_change=true${keyParam}`);
    if (res.ok) {
      const body = await res.text();
      await env.HOME_CACHE.put("crypto:batch", body, { expirationTtl: KV_TTL_SECONDS });
    }
  } catch {
    // leave old value in place
  }
}

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

function jsonBody(bodyText) {
  return withCors(new Response(bodyText, { headers: { "content-type": "application/json" } }));
}

function withCors(response) {
  const headers = new Headers(response.headers);
  headers.set("access-control-allow-origin", "*");
  return new Response(response.body, { status: response.status, headers });
}

function jsonResponse(obj, status) {
  return withCors(new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json" } }));
}
