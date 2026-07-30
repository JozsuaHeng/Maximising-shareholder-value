# $MSV — Setup in VS Code

("$MSV" = "Maximising Shareholder Value" — a tongue-in-cheek name, hover
the logo in the header for the joke. The dashboard itself is genuinely
useful; the name just doesn't take itself seriously.)

Plain HTML/CSS/JS. No build tools, no npm install required.

A home page of boxed, browsable categories (stocks, ETFs, bond ETFs,
crypto) with a "Today's Movers" bubble strip and a market news feed, and a
single-stock "deep-dive" view: price, valuation, growth, profitability,
financial health, dividends, momentum, 52-week range, analyst
recommendations, recent earnings, similar companies (with names), latest
news, historical price-reference points, and a plain-English automated
outlook — with hover (?) tooltips on every term explaining what it means,
its formula, what a high/low reading usually implies, and how that shifts
by sector (using the actual detected industry of whatever you searched).
Light and dark themes, both easy on the eyes.

Also: a live clock (your timezone + NYSE open/close countdown), a proper
price chart with axes and 1D/1W/1M/6M/1Y ranges, RSI/MACD/volume/support-
resistance panels, real financial statements (revenue, profit) pulled from
each company's own SEC-filed reports, a shares breakdown (float vs. total
vs. diluted), and direct links to recent SEC filings (10-K/10-Q/8-K).
Responsive down to phone width.

## Files
- `index.html` — page structure
- `style.css` — theme-aware (light/dark) styling
- `script.js` — home page, search logic, API calls, rendering
- `chart.js` — the interactive price chart + RSI/MACD/volume/support-resistance
- `clock.js` — the header clock (timezone, market hours, optional city/country)
- `definitions.js` — the plain-English text + formulas shown in (?) tooltips
- `sectorRules.js` — sector-bucket mapping + traffic-light thresholds
- `analysis.js` — the rule-based logic behind the "Outlook" section
- `config.example.js` — template for your API keys (tracked in git)
- `config.js` — your actual API keys go here (gitignored — never committed)

## Steps

1. **Open the folder in VS Code**
   File → Open Folder → select this `stock-dashboard` folder.

2. **Get a free Finnhub API key** (required)
   Go to https://finnhub.io/register, sign up, and copy the API key from
   your dashboard.

3. **Get a free Twelve Data API key** (optional — only needed for the price chart)
   Finnhub's free plan blocks historical price charts. Twelve Data is a
   separate free API (800 requests/day) that doesn't. Go to
   https://twelvedata.com/pricing, sign up on the free tier, and copy your
   key.

4. **Add your keys**
   Copy `config.example.js` to a new file named `config.js` in the same
   folder, then paste in your Finnhub key (and Twelve Data key). Save the
   file. (`config.js` is gitignored, so your real keys never get committed.)

5. **Install the Live Server extension**
   Extensions panel (`Cmd+Shift+X`) → search "Live Server" (Ritwick Dey) →
   Install. Needed because opening `index.html` directly as a `file://`
   page blocks the API calls (CORS); Live Server runs it on
   `http://localhost` instead, which works fine.

6. **Run it**
   Right-click `index.html` → "Open with Live Server".

7. **Try it**
   Browse the home page categories, or search a ticker. Click the logo/
   title any time to go back home. Click 🌙/☀️ top-right to switch themes.

## What's on the dashboard

**Home page**: seven boxed categories (Trending Tech, Blue Chip, Dividend
Payers, Growth, ETFs, Bond ETFs, Crypto) laid out across the full page
width, each with a live trend badge. "Bonds" shows major bond ETFs (TLT,
BND, AGG, etc.) and "Options" is replaced with Crypto — Finnhub's free
plan has no data for either individual bonds or options, confirmed
directly, so these are honest substitutes rather than fake placeholders.
A "Today's Movers" bubble chart highlights the biggest swings across every
category (bubble size = size of the move), and a Market News panel shows
general financial headlines — all using data already being fetched, no
extra API cost.

**Ticker deep-dive** (left column): Overview, About the Company (via
Wikipedia — Finnhub doesn't provide descriptions), Price Chart (via Twelve
Data), Valuation, Growth, Profitability, Financial Health, Dividends,
Momentum, 52-Week Range, Recent Earnings, Similar Stocks (peer companies
with their names, not just tickers), Latest News.

**Right column (sticky sidebar)**: Analyst Recommendations (click the (?)
for where this data actually comes from), Price Reference Points, and
Outlook.

**Traffic lights**: most indicator cards show a small colored dot (green /
amber / orange / red) plus a "Typical range" / "Slightly outside typical" /
etc. label, comparing the number to rough norms for the company's *actual*
detected industry (via `sectorRules.js`, using Finnhub's `finnhubIndustry`
field). These are rule-of-thumb bands, not live sector averages — treat
them as a starting point, not gospel. A few ratios (e.g. quick/current
ratio for banks) intentionally show no dot because the ratio doesn't apply
well to that industry.

**Tooltips**: click any (?) for a centered popup with what the term means,
its formula, what high/low usually imply, and — when you've searched a
ticker — a sentence grounded in that specific company's real industry
(e.g. "Detected industry: Aerospace & Defense..."), plus the general
static sector notes below it.

**Price Reference Points**: intentionally NOT a forecast. Finnhub's free
plan has no real analyst price-target or forward-estimate data (confirmed
directly — the endpoints return "no access"), and this dashboard won't
invent numbers to fill that gap. Instead it re-expresses the stock's own
52-week high/low as plain reference points, with a beta-based note on
historical volatility — clearly labeled as historical, not predictive.

**Outlook**: rule-based synthesis (`analysis.js`), not a live AI/LLM call —
no extra API key, no cost, doesn't know about news or industry context.

## New in this pass (v5)

- **Logo/name**: now **$MSV** ("Maximising Shareholder Value" — a joke,
  hover the logo for it). Fixed-color dark chip with white lettering, so it
  looks the same regardless of light/dark theme.
- **Chart**: added 1H and 4H range buttons (alongside 1D/1W/1M/6M/1Y).
  Intraday ranges (1D/1H/4H/1W) now use time-proportional spacing instead
  of even bar spacing, so overnight/weekend gaps show as a real visual
  jump — and pre-market (4–9:30am ET) / after-hours (4–8pm ET) windows are
  shaded on the chart. Twelve Data's free plan doesn't return actual pre/
  post-market prices even with `extended_hours=true` (tested directly,
  identical response with or without it) — so the shading marks *when*
  those sessions are, not price action inside them.
- **Synced crosshair**: hovering anywhere on the price/volume/RSI/MACD
  panels now shows the same dashed vertical line across all four, with a
  live value readout in each (price, volume, RSI, MACD).
- **Moving averages**: SMA 20/50 and EMA 20 toggle pills above the chart
  (SMA 20 and EMA 20 on by default).
- **Shares Breakdown** and **52-Week Range** now have (?) tooltips too.
- **Upcoming Events**: next earnings date + EPS estimate, under About the
  Company (from Finnhub's earnings calendar — confirmed free tier).
- Background decoration simplified to a single soft top glow + faint grid,
  replacing the earlier multi-blob gradient.

## Known free-tier gaps (confirmed directly, not guessed)

- **Premarket price**: not available — neither Finnhub's quote endpoint
  nor Twelve Data (even with `extended_hours=true`) return one on free tier.
- **CEO/key people, employee count, city-level HQ**: Finnhub's executive
  endpoint is paywalled, and profile data only has country, not city or
  employee count.
- **Institutional holders**: confirmed blocked on Finnhub free tier. Yahoo
  Finance's internal data endpoint was also checked directly — it now
  requires an auth "crumb" (401 without one) and has no CORS headers at
  all, so it's blocked twice over for a plain client-side app, separate
  from being against Yahoo's terms to scrape.

## Earlier additions

- **Live clock**: your local time comes from the browser's own timezone
  setting (`Intl` API — no network call, always accurate), with a NYSE
  open/closed countdown. US market holidays aren't accounted for, so it
  can be off by a day around holidays like Thanksgiving. City/country
  under the clock IS a network call (a free IP-geolocation API,
  `ipwho.is`) — that one reflects wherever your connection is actually
  exiting from, which can be off if you're on a VPN.
- **Price chart**: real axes, hover crosshair with exact price, and
  1D/1W/1M/6M/1Y range buttons — each range auto-picks a sensible Twelve
  Data interval (e.g. 1D uses 5-minute bars) rather than exposing range
  and interval as two separate controls.
- **Technical analysis**: RSI(14), MACD(12,26,9), volume, and a simple
  support/resistance heuristic (clusters of past price turning points).
  These describe past price action mechanically — not predictions.
- **Financial Statements**: real revenue/gross profit/operating income/net
  income by quarter, pulled from each company's actual SEC-filed reports
  (Finnhub's `financials-reported` endpoint, which surfaces the underlying
  XBRL data — free tier, confirmed directly).
- **Shares Breakdown**: total shares outstanding, public float, and
  weighted-average basic vs. diluted shares — also from SEC-filed data.
- **SEC Filings**: direct links to recent 10-K/10-Q/8-K filings on EDGAR.
  This does NOT parse out sections like risk factors — 10-Ks are long,
  unstructured legal documents, and reliably extracting a "risk factors"
  section isn't realistically automatable for a lightweight free tool.
  Open the actual filing to read those.
- **Institutional ownership** ("who holds this stock"): confirmed Finnhub's
  free tier has zero data here (`/stock/ownership` returns "no access").
  Rather than fabricate or omit silently, there's a card explaining this
  plus where to check for free elsewhere (SEC EDGAR 13F filings, or your
  brokerage's own ownership tab).

## Notes

- **Rate limits**: Finnhub's free tier is 60 calls/minute. A ticker search
  now makes more calls than before (~9 Finnhub calls plus one profile
  lookup per similar-company shown, so ~18-20 total) given how much more
  data is now pulled per search — search a handful per minute rather than
  rapid-firing many. The home page makes ~40 quote calls on load (one per
  tile) as a one-time burst — if a few tiles show "--", they'll fill in on
  the next visit, and the "Today's Movers" strip now fills in progressively
  per category rather than waiting on the single slowest one.
- **Crypto price charts aren't available**: the chart only supports plain
  ticker symbols (stocks/ETFs); crypto symbols like `BINANCE:BTCUSDT` skip
  the chart card gracefully. Forex isn't available anywhere in this
  dashboard — Finnhub's free plan blocks forex quotes entirely, not just
  charts (confirmed directly).
- **No bid/ask**: not available on Finnhub's free tier, so intentionally
  omitted rather than faked.
- **Theme**: your light/dark choice is remembered (localStorage) and
  otherwise follows your system preference on first visit.
- **Adding more indicators**: add an entry to `definitions.js` (with
  `what`/`formula`/`high`/`low`/`sector` fields) and, if you want a traffic
  light, a threshold entry in `sectorRules.js`, then reference both in the
  relevant `renderX()` function in `script.js`.
- **API key exposure**: since this is plain client-side JS, your keys are
  visible in the browser's network tab / page source. Fine for local/
  personal use; move to a small backend if you ever deploy this publicly.
