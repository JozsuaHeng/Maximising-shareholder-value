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

## Config / secrets

`config.js` holds the real Finnhub (and optional Twelve Data) API keys and
is gitignored. `config.example.js` is the tracked template — copy it to
`config.js` and fill in the keys, per README.md.
