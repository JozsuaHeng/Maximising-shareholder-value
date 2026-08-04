// --- Finnhub (required — powers everything except the price chart) ---
// 1. Go to https://finnhub.io/register and create a free account.
// 2. Copy your API key from the dashboard.
// 3. Copy this file to "config.js" (same folder) and paste your key below,
//    replacing "YOUR_API_KEY_HERE".

const FINNHUB_API_KEY = "YOUR_API_KEY_HERE";

// --- Twelve Data (optional — only powers the price chart) ---
// Finnhub's free plan blocks historical price candles, so the chart uses
// a second free API instead. Without this key, everything else on the
// dashboard still works fine — the chart card just shows a note.
// 1. Go to https://twelvedata.com/pricing (the free tier is enough:
//    800 requests/day, 8/minute) and sign up.
// 2. Copy your API key and paste it below.

const TWELVE_DATA_API_KEY = "YOUR_TWELVE_DATA_KEY_HERE";

// --- FRED (optional — only powers the Macro tab) ---
// Fed funds rate, inflation, unemployment, 10-year treasury yield.
// 1. Go to https://fredaccount.stlouisfed.org/apikeys and sign up (free,
//    instant).
// 2. Copy your API key and paste it below.
// Note: FRED has no CORS support, so this always goes through the
// deployed Cloudflare Worker, even in local development.

const FRED_API_KEY = "YOUR_FRED_KEY_HERE";

// --- CoinGecko (optional — improves the Crypto tab's rate limit) ---
// The Crypto tab works without this (CoinGecko's public endpoint needs no
// key), just with a lower, shared rate limit.
// 1. Go to https://www.coingecko.com/en/developers/dashboard and sign up
//    for a free "Demo" key.
// 2. Copy your API key and paste it below.

const COINGECKO_API_KEY = "YOUR_COINGECKO_KEY_HERE";

// NOTE: In a plain HTML/JS app, these keys are visible to anyone who views
// your page source. That's fine for a personal/local project. If you ever
// deploy this publicly, move the API calls to a small backend so the keys
// aren't exposed in the browser.
