# $MSV

A stock research dashboard built for beginners: search any ticker for
valuation, technicals (RSI/MACD/chart), financials, and SEC filings —
every number comes with a plain-English tooltip explaining what it means.

("$MSV" = "Maximising Shareholder Value" — a tongue-in-cheek name, hover
the logo in the header for the joke.)

Plain HTML/CSS/JS. No build tools, no npm install.

## Setup in VS Code

1. Open this folder in VS Code.
2. Get a free API key at [finnhub.io/register](https://finnhub.io/register) (required).
3. Optionally get a free key at [twelvedata.com/pricing](https://twelvedata.com/pricing) (only needed for the price chart — Finnhub's free plan doesn't include historical charts).
4. Copy `config.example.js` to `config.js` and paste your key(s) in. (`config.js` is gitignored — your real keys never get committed.)
5. Install the **Live Server** extension (Extensions panel → search "Live Server"). Needed because opening `index.html` directly blocks the API calls (CORS); Live Server runs it on `localhost` instead.
6. Right-click `index.html` → "Open with Live Server".

## What's on it

A home page of browsable categories (stocks, ETFs, bond ETFs, crypto)
with a live "movers" strip and market news. Search a ticker for a full
deep-dive: price chart with RSI/MACD/volume/support-resistance and
SMA/EMA overlays, valuation/growth/profitability/dividend/momentum
indicators with sector-aware traffic lights, real financial statements
and SEC filings, analyst recommendations, similar companies, and a
rule-based (not AI) outlook. Light/dark themes, mobile-friendly.

## Files

- `index.html` / `style.css` / `script.js` — page + main logic
- `chart.js` — the price chart and technical-analysis panels
- `clock.js` — header clock (timezone + market hours)
- `definitions.js` — tooltip text + formulas
- `sectorRules.js` — sector-aware traffic-light thresholds
- `analysis.js` — the rule-based Outlook logic
- `config.js` (gitignored) / `config.example.js` (template) — API keys
- `functions/api/finnhub.js`, `functions/api/twelvedata.js` — Cloudflare
  Pages proxy, only used on the deployed site (see below)

## Deploying publicly (Cloudflare Pages)

Locally, the app calls Finnhub/Twelve Data directly using `config.js`.
For a public URL, that file is gitignored on purpose — anyone visiting a
plain static site could otherwise view-source your keys. Instead, deploy
via Cloudflare Pages, which runs the two files in `functions/api/` as
small serverless functions that hold your keys server-side:

1. [dash.cloudflare.com](https://dash.cloudflare.com) → **Workers & Pages**
   → **Create** → **Pages** → **Connect to Git** → pick this repo.
2. Build settings: framework preset **None**, build command **blank**,
   output directory **/** (this is a static site, nothing to build).
3. Before the first deploy, go to **Settings → Environment variables** and
   add two **secrets**: `FINNHUB_API_KEY` and `TWELVE_DATA_API_KEY` (your
   real keys — same ones in your local `config.js`).
4. Deploy. Your public URL calls `/api/finnhub` and `/api/twelvedata`
   automatically (the app detects it's not running on `localhost`) — your
   keys stay in Cloudflare's secrets, never in the browser.

GitHub Pages can't do this — it only serves static files, no functions —
which is why the earlier GitHub Pages attempt showed blank data.

## Notes

- **Rate limits**: Finnhub's free tier is 60 calls/min; a ticker search
  uses ~15-20, so avoid rapid-firing searches.
- **API keys are visible client-side when run locally** (view-source,
  network tab) — fine for personal use on your own machine. The deployed
  (Cloudflare Pages) version doesn't have this problem — see above.
- Some data isn't available on free tiers (premarket price, institutional
  ownership, executives) — see `CLAUDE.md` for what was checked and why.
