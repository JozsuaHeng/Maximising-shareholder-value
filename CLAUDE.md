# CLAUDE.md

## Name

The app is called **$MSV** ("Maximising Shareholder Value" — a joke name;
the dashboard itself is genuinely useful). Logo is an emerald circular
badge with "MSV" lettering and a small uptick-arrow accent, styled after
coin/badge-style crypto logos (e.g. CoinMarketCap) per the user's request
— fixed-color (not currentColor), so it looks the same in both themes.
Favicon is a simplified version without the arrow accent (illegible at
16px with it — tested visually before shipping).

## What this project is

A home page of browsable stock/ETF/bond-ETF/crypto categories, plus a
single-stock "deep-dive" view: price, valuation, growth, profitability,
financial health, dividends, momentum, 52-week range, analyst
recommendation trends, recent earnings, similar companies, latest news,
and a rule-based plain-English outlook — all on one page, two-column
layout (full analysis on the left, recommendations + outlook sticky on the
right), with hover (?) tooltips explaining every term in plain English
(what it means, what a high/low number usually implies, and how that
shifts by sector).

It is **not** a multi-stock screener/filter tool — that was considered and
deliberately scoped out in favor of one-ticker-at-a-time depth (see project
memory `project_stock_dashboard` for the decision context).

Plain HTML/CSS/JS. No build tools, no npm install, no framework. Runs via
the VS Code "Live Server" extension (see README.md for why).

## Data sources

**Finnhub free tier** (https://finnhub.io) — the primary source. Known
free-tier limits that shaped this build:
- Historical price candles (`/stock/candle`) are unreliable/blocked for US
  stocks on the free plan — confirmed directly via live requests, not
  assumed. Also confirmed blocked: crypto candles, and forex quotes/candles
  entirely (not just charts).
- No bid/ask endpoint, no company description field, no bonds, no options
  data on free tier — all confirmed via live requests, not faked.
- Recommendation trends, earnings surprises, peers, and company-news ARE
  available free and are used (Analyst Recommendations, Recent Earnings,
  Similar Stocks, Latest News sections).

**Twelve Data free tier** (https://twelvedata.com) — added specifically
because Finnhub blocks historical candles. Confirmed via live request to
have real CORS support (`access-control-allow-origin: *`), unlike Yahoo's
unofficial chart endpoint (no CORS headers → unusable from a browser) or
Stooq (bot-verification wall, no CORS). 800 requests/day free, optional —
chart card degrades gracefully without a key.

**Wikipedia REST API** (no key needed, CORS-enabled, confirmed via live
request) — powers the "About the Company" description Finnhub doesn't
provide. Looked up via the MediaWiki opensearch endpoint (`&origin=*` is
the CORS-enabling parameter) then the REST summary endpoint.

## Home page asset-class substitutions

Decided with the user (AskUserQuestion) after confirming Finnhub's free
plan has zero bonds or options data: "Bonds" category shows major bond
ETFs (TLT, BND, AGG, etc. — real tradable tickers with real data) instead
of individual bonds. "Options" was replaced with Crypto (options-chain
data isn't realistically available free anywhere; Finnhub's free tier does
support crypto quotes, just not crypto candles).

## The "AI Outlook" section

This is **rule-based synthesis**, not a live LLM call — `analysis.js` turns
the fetched numbers into plain-English takeaways using fixed thresholds
(e.g. P/E > 30 reads as "premium valuation"). It is not connected to any AI
API and costs nothing to run. If a live Claude-generated version is wanted
later, that's a deliberate future upgrade, not an oversight.

## No fabricated forecasts

Confirmed directly that Finnhub's free tier has no analyst price-target or
forward EPS/revenue-estimate endpoints (`/stock/price-target`,
`/stock/eps-estimate`, `/stock/revenue-estimate` all return "no access").
When the user asked for price forecasts/scenarios, the "Price Reference
Points" card was built instead of inventing numbers: it just re-expresses
the stock's own real 52-week high/low as reference points plus a
beta-based volatility note, explicitly labeled "historical, not a
forecast." Don't add speculative price targets to this dashboard without
a real, disclosed data source behind them.

## Sector-aware traffic lights & tooltips

`sectorRules.js` maps Finnhub's `finnhubIndustry` string (a detailed
taxonomy, not a handful of GICS sectors — confirmed values include things
like "Banking", "Aerospace & Defense", "Beverages") to a smaller set of
buckets with rough threshold ranges per indicator. `getTrafficLight()`
drives the colored dot on indicator cards; `getSectorSentence()` drives the
dynamic sentence injected into the tooltip above the static sector text,
grounded in the actual company just searched. Traffic-light labels are
phrased as distance-from-typical ("Typical range" / "Slightly outside
typical" / etc.) rather than good/bad — for a few indicators (e.g.
Current/Quick Ratio) landing far ABOVE the typical range isn't actually
bad, just unusual, so a "good/weak" framing would mislead in that
direction.

## v4 additions (chart rebuild, financials, filings, clock)

- **Chart** (`chart.js`): Twelve Data time_series with a range→interval map
  (1D=5min, 1W=30min, 1M/6M/1Y=1day) rather than exposing range and
  interval as separate controls — simpler UX, one decision per click.
  RSI/MACD computed client-side with standard formulas; support/resistance
  is a simple local-extrema clustering heuristic, explicitly labeled as
  such, not authoritative.
- **Financial Statements / Shares Breakdown**: both pull from Finnhub's
  `financials-reported` endpoint (confirmed free tier), which surfaces raw
  XBRL concepts from each company's actual SEC filings. Different filings
  sometimes use different XBRL tag names for the same line item (e.g.
  revenue) — `findConcept()` in script.js tries several known variants.
- **No fabricated ownership data**: `/stock/ownership` confirmed blocked on
  free tier. Don't wire up a paid workaround without the user explicitly
  choosing to pay for it.
- **No fabricated 10-K risk-factor extraction**: SEC filings are linked
  directly to EDGAR, not parsed. 10-Ks are long unstructured legal
  documents; don't attempt to auto-extract "risk factors" text without a
  real, tested parsing approach.
- **Clock/geolocation**: local time + timezone come from the browser's own
  `Intl` API (accurate, no network call). City/country come from a free
  IP-geolocation API (`ipwho.is`, confirmed CORS-enabled) — that reflects
  the browser's actual network egress, not something Claude has live
  access to; don't claim to know the user's location without the page
  itself having fetched it.
- **Color theme**: navy + emerald (dark) was the user's explicit choice
  over the earlier gold/charcoal direction — CSS variables in `style.css`
  make this a `:root` / `:root[data-theme="light"]` swap if it changes
  again.

## v5 additions (chart polish, session shading, moving averages)

- **Chart x-axis**: intraday ranges (1D/1H/4H/1W) use time-proportional
  positioning (`getXMapper` in `chart.js`), not even bar spacing — this is
  what makes overnight gaps show as a real jump, and what session shading
  is anchored to. Daily-bar ranges (1M/6M/1Y) stay index-based, matching
  convention (no empty space for weekends).
- **Session shading**: confirmed Twelve Data's free tier ignores
  `extended_hours=true` entirely (byte-identical response with/without it,
  tested directly) — pre-market/after-hours bands are drawn from computed
  time boundaries, not from data presence, and will always be empty of
  price data on the free plan. Don't represent them as showing real
  extended-hours price action without upgrading the Twelve Data plan.
- **Synced crosshair**: all four panels (price/volume/RSI/MACD) share
  `PAD_LEFT`/`PAD_RIGHT` constants specifically so their x-axes line up
  pixel-for-pixel; `attachHover()` is wired identically on all four
  canvases and each hover redraws all four via `renderAllPanels(series,
  hoverIdx)`.
- **Massive.com** (user's friend suggested it): researched, not integrated.
  Real company, but free tier is 5 calls/min + EOD-only data — this app's
  per-search call volume (~20 calls) would exhaust that instantly. Paid
  tiers start at $29/mo. Revisit only if a specific data need arises that
  Finnhub/Twelve Data can't cover.

## Public deployment: Cloudflare Worker proxy

User enabled GitHub Pages after being warned it wouldn't work — confirmed
directly (`config.js` 404s on the deployed site, Pages is static-only, no
functions).

First attempt used `functions/api/*.js` (classic Cloudflare Pages
Functions convention) — **wrong for this account's setup**. Cloudflare's
dashboard created a genuine **Worker** project (evidenced by "Deploy
command: npx wrangler deploy" in their Settings → Build, not a Pages-style
deploy), which doesn't auto-detect a `functions/` folder at all — that
convention only applies to classic Pages projects. The
`functions/` directory was deleted; don't recreate it for this repo.

Current setup: `wrangler.jsonc` (assets binding, `run_worker_first:
["/api/*"]`) + a single `worker.js` entry point that handles `/api/finnhub`
and `/api/twelvedata` and falls through to `env.ASSETS.fetch()` for
everything else. Real keys are Cloudflare-side secrets
(`FINNHUB_API_KEY`, `TWELVE_DATA_API_KEY`), read via `env` in
`worker.js`, never sent to the browser.

`script.js` detects `IS_LOCAL_DEV` (hostname is localhost/127.0.0.1) and
switches between calling the APIs directly (local dev, using `config.js`)
and calling `/api/finnhub` / `/api/twelvedata` (deployed). Every Finnhub
call site goes through the `finnhubUrl(path, params)` helper in
`script.js`; Twelve Data goes through `twelveDataUrl(path, params)` in
`chart.js` — don't add a new direct `fetch` call to either API without
going through these, or it'll break on the deployed site while working
fine locally (easy to miss since local dev is the default test path).

Cloudflare's "Variables cannot be added to a Worker that only has static
assets" error goes away once a deploy has picked up `wrangler.jsonc` (it
needs to see the `main`/`assets` config before the dashboard exposes the
secrets UI) — if this recurs after further changes, check a deploy
actually ran with the current `wrangler.jsonc` before assuming the config
is wrong.

GitHub Pages remains disabled/irrelevant now that this Worker is the
deploy target — don't re-suggest it for this repo.

## Rate-limit resilience + chart session-gap fix (2026-07-31)

- **Worker-side caching**: `worker.js`'s `proxy()` now caches upstream
  responses at Cloudflare's edge (`caches.default`) with per-path TTLs
  (`cacheTTL()`) — 20s for quotes, 1hr for filings/financials/earnings
  calendar (rarely change), 120s for everything else. This is a shared
  cache across all visitors, not per-browser — meaningfully cuts real
  Finnhub/Twelve Data calls since the home page alone requests ~42 quotes
  per load.
- **Staggered home page loads**: `renderHomePage()` in `script.js` now
  delays each category's start by `categoryIndex * 200ms` instead of
  firing all 7 categories' ~42 requests in the same instant.
- **Chart session-gap bug (found and fixed 2026-07-31)**: intraday charts
  (1D/1H/4H/1W) were drawing one continuous line across overnight/weekend
  gaps, connecting yesterday's close straight to today's open — looked
  like a dramatic crash that never happened. Root cause: time-proportional
  x-axis (added for session shading) compresses the gap into a small
  width, but the line-drawing loops still connected every point with
  `lineTo()` regardless of the real time gap. Fixed via `isSessionGap()` /
  `getSegments()` in `chart.js` — any gap > 3x the interval's normal bar
  spacing now breaks the line (new `moveTo()`) instead of connecting
  through it. Applied to the price line, area fill, SMA/EMA overlays, and
  the RSI/MACD panel lines — all of them iterate the same time-based
  x-axis, so all of them had the same bug. If a new line-drawing feature
  is added to the chart later, it needs the same segment-aware treatment
  or it'll reintroduce this.
- Both the rate-limit issue and the chart bug were only caught by testing
  against real live data over a real multi-day range — worth remembering
  that a lot of chart/time-series bugs like this don't show up with a
  single day of mock data.

## Home page lazy-loading (2026-07-31)

User asked to optimize home page requests further after the caching/
staggering fix. Confirmed directly that Finnhub has no batch/multi-symbol
quote endpoint (`?symbol=AAPL,MSFT` just returns an empty quote) — so the
only real lever left was requesting fewer things upfront. `renderHomePage`
now uses an `IntersectionObserver` (rootMargin 400px) per category
section instead of fetching all 7 categories' ~42 quotes immediately —
`loadCategoryQuotes()` only fires once a category's box is about to
scroll into view, and unobserves itself after firing once.

Tested by counting actual requests at different viewport heights: at a
typical desktop size the 3-column layout is compact enough that most/all
categories are near the initial viewport anyway (modest savings there),
but at mobile width (single column) only ~12 of 42 requests fired on
initial load — most of the win is on mobile/narrow viewports, not desktop.
This is expected given the layout, not a bug.

Known limitation (not fixed, low-impact by design): if a user scrolls
instantly from top to bottom (e.g. dragging the scrollbar thumb, not a
gradual scroll), sections that were never actually rendered in the
viewport during the jump won't have fired their IntersectionObserver
callback. Not treated as worth fixing — the observer keeps listening
until a section fires once, so scrolling back up past a missed section
still triggers it. If this becomes a real complaint, the fix would be a
scroll-end fallback that force-loads any still-unloaded category once the
user nears the bottom of the page.

## Search autocomplete + comparison view (2026-07-31)

**Autocomplete** (`autocomplete.js`): confirmed Finnhub's `/search`
endpoint works free tier before building. Debounced 300ms, results cached
1hr in `worker.js` (symbol↔name mappings barely ever change, and popular
queries like "apple" repeat a lot across users, so this is a good caching
target). One real bug hit during implementation: the file's keydown
listener on `#tickerInput` was firing AFTER `script.js`'s existing plain
"Enter → search" listener (registration order = bubble-phase firing
order), so `stopImmediatePropagation()` on Enter-with-a-suggestion-
highlighted did nothing — the search had already fired by the time it
ran. Fixed by registering autocomplete's listener on the **capture**
phase (`addEventListener(..., true)`), which always runs before bubble-
phase listeners regardless of registration order, so `stopPropagation()`
there correctly pre-empts the later bubble-phase handler. Worth
remembering for any future multi-listener-on-one-element situation.

**Comparison** (`compare.js`): new `#compareView`, up to 4 tickers side
by side. Reuses `getSectorBucket()`/`getTrafficLight()`/`TRAFFIC_LABELS`
from `sectorRules.js` per-column (each ticker's traffic-light color is
judged against *that company's own* detected industry, not a shared
bucket) and `showTooltip()` from `script.js` for the (?) buttons — same
definitions used elsewhere, so the numbers/explanations stay consistent
with the single-ticker deep-dive view. `COMPARE_ROWS` in `compare.js` is
the list of metrics shown; add a row there (with a `get()` function
reading from the existing `{quote, profile, metric}` shape) to add more.

Both new views wired into the existing `goHome()`/`loadTicker()` view-
toggling so only one of home/dashboard/compare is ever visible — if a
new top-level view is added later, remember to hide it from those two
functions too, or it'll stay visible when navigating away.

## Tabbed home page + FRED/CoinGecko (2026-08-04)

Replaced the old all-categories-at-once scrolling home page (`renderHomePage`
et al. in `script.js`) with `home.js`: a tab bar (Winners/Losers/Most
Active + the 7 curated categories + Macro) where **only the active tab's
data is fetched**, cached in `homeState.quotes` for the session so
revisiting a tab is free. Winners/Losers/Most Active need every
category's data to rank, so visiting one of those for the first time
triggers fetching whatever categories aren't loaded yet (staggered, same
200ms-per-category pattern as before). Default tab is a cheap static
category (`trending-tech`), not a dynamic one — keeps the common case
(look at one or two tabs) cheap; only picking a dynamic tab pays the
full-category-set cost.

"Most Active" is **not** volume-based — Finnhub's `/quote` has no volume
field, and fetching it separately would double requests for a homepage
feature. It's ranked by absolute size of today's price move instead, with
a disclosed caveat in the UI. Don't present it as real volume-based
"most active" without adding a real volume data source first.

**Heatmap view**: uniform-size color-intensity tiles, not a true
size-weighted treemap (that needs market cap for all ~40+ symbols shown
across tabs, which isn't available without doubling requests via
profile2 calls). `heatColor()` in `home.js` maps % change to opacity.

**Crypto now uses CoinGecko, not Finnhub** — confirmed CoinGecko has real
CORS support AND a genuine batch endpoint (`/simple/price?ids=a,b,c`,
all coins in one request), unlike Finnhub's crypto quotes (one call per
symbol, and generally worse-supported). `CRYPTO_COINGECKO_IDS` in
`home.js` maps the existing `BINANCE:*` symbol strings to CoinGecko coin
ids. CoinGecko's key is optional (public endpoint works without one, just
lower shared rate limit) — `worker.js`'s `proxy()` has a `keyRequired`
parameter specifically for this (defaults `true` for Finnhub/Twelve
Data/FRED, `false` for CoinGecko) — don't remove that or an unconfigured
COINGECKO_API_KEY will 500 instead of falling back to the public tier.

**Macro tab (FRED)**: confirmed FRED has zero CORS support (unlike
Finnhub/Twelve Data/CoinGecko) — even local dev must go through the
deployed Worker for this one, via the hardcoded `FRED_PROXY_BASE` in
`home.js`. `worker.js`'s proxy responses now set
`access-control-allow-origin: *` specifically to make this cross-origin
call work; that header is intentionally permissive since the data
returned isn't sensitive and the real secrets never leave the Worker
either way. Four series shown: `FEDFUNDS`, `CPIAUCSL` (fetched with
`units=pc1` for year-over-year % change, not the raw index), `UNRATE`,
`DGS10` — verified response shape and values directly before building
against them.

## Config / secrets

`config.js` holds the real Finnhub, Twelve Data, FRED, and CoinGecko API
keys and is gitignored. `config.example.js` is the tracked template —
copy it to `config.js` and fill in the keys, per README.md. FRED and
CoinGecko keys also need to be added as Cloudflare secrets (same as the
other two) for the deployed site to use them — see README's Deploying
section.

## Chart range fix (2026-08-04)

Found and fixed a real bug: `RANGE_CONFIGS` in `chart.js` used range
labels (1H, 4H) to mean "bar granularity," not "time window shown" — "1H"
was 100 *hourly* bars (~3 weeks of data), not the last hour. That
mismatch between what the label said and what was actually plotted is
why those charts looked chaotic (many session-gap breaks, no obvious
pattern). Fixed so every range means what it says: 1H = last 60
one-minute bars, 4H = last 48 five-minute bars, 1D = one full trading
session (78 five-minute bars), 1W = ~5 trading days (65 thirty-minute
bars), 3M/6M = daily bars over that many months. `1M`/`1Y` were dropped
per the user's requested button set: 1H, 4H, 1D, 1W, 3M, 6M (also added
`"1min"` to `INTERVAL_MS` for the new 1H range's gap-detection to work).

## Insider transactions (2026-08-04)

Added via Finnhub's `/stock/insider-transactions` (confirmed free tier).
Shows name, date, net share change (colored by sign — not by the SEC
transaction code, since the sign already says whether shares were
acquired or disposed), and price. Deliberately does NOT try to interpret
transaction codes as bullish/bearish beyond that — many insider sales are
routine (vesting, taxes, 10b5-1 plans) and the UI note says so.

## Background pre-warming: Cron + KV (2026-08-04)

Rate-limit fixes up to this point only reduced how often the ceiling got
hit; this is the structural fix. `worker.js` now has a `scheduled()`
handler (cron trigger in `wrangler.jsonc`, every 5 minutes) that
proactively fetches all `PREWARM_SYMBOLS` (must stay in sync with
`HOME_CATEGORIES` in `home.js`, minus crypto) plus one CoinGecko batch
call, writing results into a KV namespace bound as `HOME_CACHE`.
`handleFinnhub()`/`handleCoinGecko()` check KV first for matching
requests before falling through to the normal live-fetch-and-cache path
— so real user requests for curated symbols are typically served from KV
and never touch Finnhub/CoinGecko's rate limits at all.

Chose KV over the existing Cache API for this specifically because Cache
API is per-edge-location — a cron run executing in one location wouldn't
warm the cache for a visitor hitting a different one. KV is globally
readable, which is what a background-prewarm pattern actually needs.

**Requires a KV namespace the user has to create via the Cloudflare
dashboard** (can't be provisioned from code/API access available here) —
`wrangler.jsonc`'s `kv_namespaces[0].id` is a placeholder
(`REPLACE_WITH_YOUR_KV_NAMESPACE_ID`) until they provide the real ID. All
KV access in `worker.js` is guarded with `if (env.HOME_CACHE)` checks, so
nothing breaks if the binding isn't set up yet — the app just runs
exactly as it did before this feature, without the speedup. Don't remove
those guards; a missing binding would otherwise throw on every request.
Real namespace ID (`df39e229e1544feea93c4f806458f93d`) now wired in.

## Chart range semantics fix (2026-08-04)

Found and fixed a real bug: "1H"/"4H" range buttons used to mean "N bars
at 1-hour/4-hour granularity" (100 hourly bars ≈ 3 weeks of data), not
"the last 1/4 hours" like the label implies — that mismatch (not the
session-gap issue, which was a separate earlier bug) is why those charts
looked chaotic to the user. `RANGE_CONFIGS` in `chart.js` now means what
the label says: "1H" = last 60 one-minute bars, "4H" = last 48 five-minute
bars, "1D" = one full trading session (78 five-minute bars, tuned to not
spill into the prior day), "1W" ≈ 5 trading days, "3M"/"6M" = daily bars.
Range list changed to 1H/4H/1D/1W/3M/6M per the user's request (dropped
1M and 1Y). If adding a new range, make sure `outputsize × interval`
actually equals what the label promises — that's the lesson here.

## Fetch error messages are now specific (2026-08-04)

`fetchJSON()` in script.js now attaches the HTTP status to thrown errors
(`err.status`), and `loadTicker`'s catch block uses `describeFetchError()`
to give a specific message: 429 → "rate limit, temporary, wait ~30s";
401/403 → "check your API key" (with different wording for local vs.
deployed, since the fix differs); anything else → generic, points at the
console. Previously all three cases showed the same "check your API key"
message, which made a transient rate-limit blip look like a broken setup
— a real support/debugging problem, not just a UX nicety. Keep this
pattern (attach `.status`, branch on it) for any new fetch call sites
that show errors directly to the user.

## News/ticker-tile visual redesign (2026-08-04)

News items (`renderNews` in script.js) now show a colored initial-letter
badge per source (`colorFromString()` — deterministic hash into a fixed
palette, so the same source always gets the same color) plus an external-
link cue, addressing "market news looks plain." Home page ticker tiles
(`buildGrid` in home.js) gained a colored left accent border (green/red
by direction), a directional arrow, and bolder pricing — addressing "the
grid looks empty." Deliberately did NOT reintroduce decorative background
patterns behind the grid itself (removed earlier at the user's request as
"weird") — the richness comes from the tiles/items themselves, not from
page-level decoration.
