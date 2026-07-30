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

// NOTE: In a plain HTML/JS app, these keys are visible to anyone who views
// your page source. That's fine for a personal/local project. If you ever
// deploy this publicly, move the API calls to a small backend so the keys
// aren't exposed in the browser.
