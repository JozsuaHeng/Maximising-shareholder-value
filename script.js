// ---- Config ----
const THEME_KEY = "stockDashboardTheme";
const RECENTLY_VIEWED_KEY = "stockDashboardRecentlyViewed";
const RECENTLY_VIEWED_MAX = 8;

// Purely local — zero API cost. Used to power the homepage's "Recently
// Viewed" strip (home.js) without fetching anything extra.
function recordRecentlyViewed(symbol, name) {
  try {
    const list = getRecentlyViewed().filter(item => item.symbol !== symbol);
    list.unshift({ symbol, name });
    localStorage.setItem(RECENTLY_VIEWED_KEY, JSON.stringify(list.slice(0, RECENTLY_VIEWED_MAX)));
  } catch {
    // localStorage unavailable (e.g. private browsing) — just skip tracking
  }
}

function getRecentlyViewed() {
  try {
    const raw = localStorage.getItem(RECENTLY_VIEWED_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

// Local (Live Server) calls Finnhub directly using config.js's key.
// Deployed (Cloudflare Pages) calls the /api/finnhub proxy instead, which
// attaches the key server-side — the key never reaches the browser there.
// config.js is gitignored either way, so it's simply absent on the
// deployed site (a harmless 404 on that one <script> tag, nothing reads
// FINNHUB_API_KEY/TWELVE_DATA_API_KEY when IS_LOCAL_DEV is false).
const IS_LOCAL_DEV = ["localhost", "127.0.0.1", ""].includes(location.hostname);

// Every Finnhub request, whether called directly (local dev) or proxied
// (deployed), builds its URL through this one function — so it's the one
// place to log "a Finnhub request is about to be sent" for the API usage
// widget (apiUsage.js). This tracks requests THIS BROWSER TAB initiated,
// not actual Finnhub hits — some of these get served from Cloudflare's
// edge cache and never reach Finnhub at all, so it's an upper-bound
// estimate, not a precise live quota. See apiUsage.js for why a fully
// accurate shared counter isn't possible from the client.
const finnhubCallLog = [];
function finnhubUrl(path, params) {
  finnhubCallLog.push(Date.now());
  const search = new URLSearchParams(params || {});
  if (IS_LOCAL_DEV) {
    search.set("token", FINNHUB_API_KEY);
    return `https://finnhub.io/api/v1${path}?${search.toString()}`;
  }
  search.set("path", path);
  return `/api/finnhub?${search.toString()}`;
}

// ---- DOM refs ----
const homeTitle = document.getElementById("homeTitle");
const themeToggle = document.getElementById("themeToggle");
const tickerInput = document.getElementById("tickerInput");
const searchBtn = document.getElementById("searchBtn");
const homeView = document.getElementById("homeView");
const dashboard = document.getElementById("dashboard");
const statusEl = document.getElementById("status");

const companyName = document.getElementById("companyName");
const tickerBadge = document.getElementById("ticker");
const exchangeEl = document.getElementById("exchange");
const industryEl = document.getElementById("industry");
const logo = document.getElementById("logo");
const priceEl = document.getElementById("price");
const changeEl = document.getElementById("change");
const openVal = document.getElementById("openVal");
const highVal = document.getElementById("highVal");
const lowVal = document.getElementById("lowVal");
const prevCloseVal = document.getElementById("prevCloseVal");

const descriptionContent = document.getElementById("descriptionContent");

const valuationGrid = document.getElementById("valuationGrid");
const growthGrid = document.getElementById("growthGrid");
const profitabilityGrid = document.getElementById("profitabilityGrid");
const healthGrid = document.getElementById("healthGrid");
const dividendsGrid = document.getElementById("dividendsGrid");
const momentumGrid = document.getElementById("momentumGrid");

const rangeGrid = document.getElementById("rangeGrid");
const rangeGaugeWrap = document.getElementById("rangeGaugeWrap");
const rangeGaugeMarker = document.getElementById("rangeGaugeMarker");
const rangeLowLabel = document.getElementById("rangeLowLabel");
const rangeHighLabel = document.getElementById("rangeHighLabel");

const earningsContent = document.getElementById("earningsContent");
const financialsContent = document.getElementById("financialsContent");
const sharesContent = document.getElementById("sharesContent");
const ownershipContent = document.getElementById("ownershipContent");
const filingsContent = document.getElementById("filingsContent");
const insiderContent = document.getElementById("insiderContent");
const peersContent = document.getElementById("peersContent");
const newsContent = document.getElementById("newsContent");
const companyFacts = document.getElementById("companyFacts");
const upcomingEvents = document.getElementById("upcomingEvents");
const companyHeadlines = document.getElementById("companyHeadlines");
const recommendationContent = document.getElementById("recommendationContent");
const scenarioContent = document.getElementById("scenarioContent");
const homeMarketCard = document.getElementById("homeMarketCard");
const homeMarketContent = document.getElementById("homeMarketContent");

const outlookHeadline = document.getElementById("outlookHeadline");
const outlookBullets = document.getElementById("outlookBullets");
const outlookCaveat = document.getElementById("outlookCaveat");

const tooltipOverlay = document.getElementById("tooltipOverlay");
const tooltipPopup = document.getElementById("tooltipPopup");
const tooltipTerm = document.getElementById("tooltipTerm");
const tooltipWhat = document.getElementById("tooltipWhat");
const tooltipFormula = document.getElementById("tooltipFormula");
const tooltipHigh = document.getElementById("tooltipHigh");
const tooltipLow = document.getElementById("tooltipLow");
const tooltipSectorDynamic = document.getElementById("tooltipSectorDynamic");
const tooltipSector = document.getElementById("tooltipSector");
const tooltipClose = document.getElementById("tooltipClose");

// ---- Current-ticker sector context (used by traffic lights + tooltips) ----
let currentIndustry = null;
let currentBucket = "default";

// ---- Instrument type (stock / etf / crypto) ----
// Companies, ETFs, and crypto need genuinely different analysis sections
// below the chart — an ETF/crypto has no P/E, margins, or earnings, and
// Finnhub's fundamentals endpoints confirm this by simply returning empty
// for them (verified directly, 2026-08-28) rather than erroring. Crypto
// symbols are unambiguous (":" in the symbol, e.g. "BINANCE:BTCUSDT").
// ETFs use the exact same ticker format as stocks, so they're detected by
// the live result instead: a real company's profile2 always has at least
// a name; an ETF's comes back as an empty object.
function getInstrumentType(symbol, profile) {
  if (symbol.includes(":")) return "crypto";
  if (!profile || !profile.name) return "etf";
  return "stock";
}

// Section ids hidden for ETF/crypto — all of these come back empty from
// Finnhub for non-company instruments (confirmed directly): no earnings,
// no margins, no balance sheet, no dividends, no analyst coverage, no
// peers. Kept visible for both: Momentum/Range (repurposed for crypto —
// see renderCryptoRange), SEC Filings (ETFs really do file fund-specific
// forms; hidden separately for crypto only, which has none).
const NON_STOCK_HIDDEN_SECTIONS = [
  "growthSection", "profitabilitySection", "dividendsSection",
  "earningsSection", "financialsSection", "sharesSection",
  "insiderSection", "peersSection", "recommendationSection",
];

function applyInstrumentTypeUI(type) {
  const hide = type === "stock" ? [] : NON_STOCK_HIDDEN_SECTIONS;
  NON_STOCK_HIDDEN_SECTIONS.forEach(id => {
    document.getElementById(id)?.classList.toggle("hidden", hide.includes(id));
  });
  document.getElementById("filingsSection")?.classList.toggle("hidden", type === "crypto");
  document.getElementById("momentumSection")?.classList.toggle("hidden", type === "crypto");

  const valuationTitle = document.getElementById("valuationTitle");
  const healthTitle = document.getElementById("healthTitle");
  const rangeTitle = document.getElementById("rangeTitle");
  if (type === "stock") {
    valuationTitle.textContent = "Valuation";
    healthTitle.textContent = "Financial Health";
    rangeTitle.firstChild.textContent = "52-Week Range ";
  } else if (type === "etf") {
    valuationTitle.textContent = "Price Performance";
    healthTitle.textContent = "Trading Activity & Risk";
    rangeTitle.firstChild.textContent = "52-Week Range ";
  } else if (type === "crypto") {
    valuationTitle.textContent = "Market Stats";
    healthTitle.textContent = "Performance";
    rangeTitle.firstChild.textContent = "All-Time High / Low ";
  }
}

// ---- Theme ----
function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  localStorage.setItem(THEME_KEY, theme);
  themeToggle.textContent = theme === "light" ? "☀️" : "🌙";
}

(function initTheme() {
  const saved = localStorage.getItem(THEME_KEY);
  const theme = saved || (window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark");
  applyTheme(theme);
})();

themeToggle.addEventListener("click", () => {
  const current = document.documentElement.getAttribute("data-theme");
  applyTheme(current === "light" ? "dark" : "light");
});

// ---- Nav ----
homeTitle.addEventListener("click", goHome);
searchBtn.addEventListener("click", () => {
  if (typeof hideSuggestions === "function") hideSuggestions();
  const sym = tickerInput.value.trim().toUpperCase();
  if (sym) loadTicker(sym);
});
tickerInput.addEventListener("keydown", e => {
  if (e.key === "Enter") searchBtn.click();
});
tooltipClose.addEventListener("click", hideTooltip);
tooltipOverlay.addEventListener("click", hideTooltip);
document.addEventListener("keydown", e => {
  if (e.key === "Escape") hideTooltip();
});

function goHome() {
  dashboard.classList.add("hidden");
  document.getElementById("compareView").classList.add("hidden");
  homeView.classList.remove("hidden");
  tickerInput.value = "";
  setStatus("");
  if (typeof renderRecentlyViewed === "function") renderRecentlyViewed();
}

// ---- Fetch helper ----
async function fetchJSON(url) {
  const res = await fetch(url);
  if (!res.ok) {
    const err = new Error(`Request failed: ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

// ---- Formatting helpers ----
function isNum(v) {
  return typeof v === "number" && !Number.isNaN(v);
}

function formatPct(val) {
  return (val === undefined || val === null) ? undefined : `${val.toFixed(2)}%`;
}

function formatCurrency(value) {
  return isNum(value) ? `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "N/A";
}

function formatCount(value) {
  return isNum(value) ? value.toLocaleString(undefined, { maximumFractionDigits: 2 }) : "N/A";
}

// Compact form for big numbers (crypto market cap, volume) — 1234567890
// -> "$1.23B". formatCurrency's comma-grouped 2-decimal style is built
// for share prices, not crypto-sized totals.
function formatCompactCurrency(value) {
  if (!isNum(value)) return "N/A";
  const abs = Math.abs(value);
  if (abs >= 1e12) return `$${(value / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `$${(value / 1e6).toFixed(2)}M`;
  return formatCurrency(value);
}

// Deterministic color per string (e.g. a news source name) — same input
// always gives the same color, picked from a fixed palette rather than
// generated freely, so it stays visually consistent with the rest of the
// theme instead of clashing.
const BADGE_COLORS = ["#1baf7a", "#2a78d6", "#eb6834", "#9085e9", "#e0ab2e", "#d55181", "#199e70", "#5598e7"];
function colorFromString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
  return BADGE_COLORS[hash % BADGE_COLORS.length];
}

// High-volume news feeds (a heavily-covered stock, or general market
// news) routinely have 8+ headlines published on the same calendar day,
// so a date-only stamp made every item in the list look identical even
// though they were hours apart. Relative time makes the actual spread
// visible.
function formatRelativeTime(date) {
  const diffMs = Date.now() - date.getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString();
}

function displaySymbol(symbol) {
  if (symbol.startsWith("BINANCE:")) return symbol.replace("BINANCE:", "").replace("USDT", "");
  return symbol;
}

// ---- Main flow ----
// Split into "core" (quote/profile/metric/recommendation — the ~4 calls
// needed for the primary dashboard view) and "secondary" (earnings,
// peers, news, financials, filings, earnings calendar, insider
// transactions — 7 more calls powering supplementary sections). This
// used to be one 11-call Promise.all: correct, but slow, and any single
// failure among all 11 (increasingly likely as more sections were added)
// reverted the *entire* page back to the home screen, which looked like
// "search is broken" even though it was really just a Finnhub rate-limit
// hit on one of eleven simultaneous calls. Now the dashboard renders as
// soon as the small core batch resolves, and secondary sections fill in
// progressively — a failure there degrades one section, not the page.
let loadToken = 0;

async function loadTicker(symbol) {
  if (IS_LOCAL_DEV && FINNHUB_API_KEY === "YOUR_API_KEY_HERE") {
    setStatus("Add your free Finnhub API key to config.js first. See README.md.", true);
    return;
  }

  if (symbol.includes(":")) return loadCryptoTicker(symbol);

  const myToken = ++loadToken;
  homeView.classList.add("hidden");
  dashboard.classList.add("hidden");
  document.getElementById("compareView").classList.add("hidden");
  setStatus(`Loading ${displaySymbol(symbol)}...`);

  try {
    const [quote, profile, metricRes, recommendationRes] = await Promise.all([
      fetchJSON(finnhubUrl("/quote", { symbol })),
      fetchJSON(finnhubUrl("/stock/profile2", { symbol })),
      fetchJSON(finnhubUrl("/stock/metric", { symbol, metric: "all" })),
      fetchJSON(finnhubUrl("/stock/recommendation", { symbol })).catch(() => []),
    ]);

    if (myToken !== loadToken) return; // a newer search started while this one was in flight

    if (!quote || quote.c === 0) {
      setStatus(`No data found for "${symbol}". Check the ticker and try again.`, true);
      homeView.classList.remove("hidden");
      return;
    }

    const metric = metricRes.metric || {};
    const instrumentType = getInstrumentType(symbol, profile);
    currentIndustry = profile.finnhubIndustry || null;
    currentBucket = getSectorBucket(currentIndustry);
    recordRecentlyViewed(symbol, profile.name || symbol);

    applyInstrumentTypeUI(instrumentType);
    renderOverview(symbol, quote, profile);
    renderHomeMarketStatus(profile);
    renderCompanyFacts(profile);
    renderDescription(profile.name);

    if (instrumentType === "etf") {
      renderETFPerformance(metric);
      renderETFTradingActivity(metric);
    } else {
      renderValuation(metric, profile);
      renderGrowth(metric);
      renderProfitability(metric);
      renderDividends(metric);
      renderHealth(metric);
    }
    renderMomentum(metric);
    renderRange(metric);
    renderRangeGauge(metric, quote);
    const latestRecommendation = renderRecommendation(recommendationRes);
    renderScenarios(quote, metric);
    if (instrumentType === "etf") {
      renderOutlook({ symbol, metric, type: "etf" });
    } else {
      renderOutlook({ symbol, quote, metric, recommendation: latestRecommendation, type: "stock" });
    }

    dashboard.classList.remove("hidden");
    setStatus("");

    initChart(symbol);
    initInvestCalc(symbol);
    loadSecondaryData(symbol, profile, myToken);
  } catch (err) {
    if (myToken !== loadToken) return;
    console.error(err);
    setStatus(describeFetchError(err), true);
    homeView.classList.remove("hidden");
  }
}

// CoinGecko's full /coins/{id} response nests most fields under
// market_data.<field>.usd — flattened here into the plain shape
// renderCryptoMarketStats/renderCryptoPerformance/renderCryptoRange
// expect (verified this shape directly against a live request, 2026-08-28).
function flattenCoinGeckoDetail(detail) {
  const md = detail && detail.market_data;
  if (!md) return null;
  return {
    market_cap_rank: detail.market_cap_rank,
    market_cap: md.market_cap?.usd,
    total_volume: md.total_volume?.usd,
    circulating_supply: md.circulating_supply,
    max_supply: md.max_supply,
    price_change_percentage_24h: md.price_change_percentage_24h,
    price_change_percentage_7d: md.price_change_percentage_7d,
    price_change_percentage_30d: md.price_change_percentage_30d,
    price_change_percentage_1y: md.price_change_percentage_1y,
    ath: md.ath?.usd,
    ath_date: md.ath_date?.usd,
    ath_change_percentage: md.ath_change_percentage?.usd,
    atl: md.atl?.usd,
    atl_date: md.atl_date?.usd,
  };
}

// Crypto: Finnhub returns nothing beyond a bare price for these symbols
// (confirmed directly, 2026-08-28), so this skips the normal
// company-fundamentals fetch entirely and pulls from CoinGecko instead
// (same source as the homepage Crypto tab) — only works for the 6 coins
// curated there; anything else still gets a working price via Finnhub's
// quote but no detailed stats, disclosed rather than shown as blank N/A.
async function loadCryptoTicker(symbol) {
  const myToken = ++loadToken;
  homeView.classList.add("hidden");
  dashboard.classList.add("hidden");
  document.getElementById("compareView").classList.add("hidden");
  setStatus(`Loading ${displaySymbol(symbol)}...`);

  try {
    const quote = await fetchJSON(finnhubUrl("/quote", { symbol }));
    if (myToken !== loadToken) return;
    if (!quote || quote.c === 0) {
      setStatus(`No data found for "${symbol}". Check the ticker and try again.`, true);
      homeView.classList.remove("hidden");
      return;
    }

    const coingeckoId = typeof CRYPTO_COINGECKO_IDS !== "undefined" ? CRYPTO_COINGECKO_IDS[symbol] : null;
    let coin = null;
    if (coingeckoId) {
      try {
        const detail = await fetchJSON(coingeckoUrl(`/coins/${coingeckoId}`, { localization: "false", tickers: "false", community_data: "false", developer_data: "false" }));
        coin = flattenCoinGeckoDetail(detail);
      } catch {
        coin = null;
      }
    }
    if (myToken !== loadToken) return;

    currentIndustry = null;
    currentBucket = "default";
    const profile = { name: symbol.split(":")[1] || symbol };
    recordRecentlyViewed(symbol, profile.name);

    applyInstrumentTypeUI("crypto");
    renderOverview(symbol, quote, profile);
    renderHomeMarketStatus(profile);
    renderCompanyFacts(profile); // already self-hides with no ipo/country/weburl
    renderDescription(null); // already has a specific "common for ETFs and crypto" message
    renderCryptoMarketStats(coin);
    renderCryptoPerformance(coin);
    renderCryptoRange(coin, quote.c);
    renderOutlook({ symbol, coin, type: "crypto" });
    renderOwnership(); // static disclaimer, zero API cost
    upcomingEvents.innerHTML = ""; // no earnings calendar for crypto — clear any stale stock's date

    dashboard.classList.remove("hidden");
    setStatus("");

    initChart(symbol); // already shows "not supported for this format" for exotic symbols
    initInvestCalc(symbol); // already shows "not available" for exotic symbols
    loadCryptoNews(myToken);
  } catch (err) {
    if (myToken !== loadToken) return;
    console.error(err);
    setStatus(describeFetchError(err), true);
    homeView.classList.remove("hidden");
  }
}

// Deliberately NOT loadSecondaryData() — that fires 7 Finnhub calls
// (earnings/financials/filings/insider/peers/etc.) that are all
// guaranteed empty for a crypto symbol (confirmed directly), wasting
// rate-limit quota on calls we already know the answer to. Finnhub's
// general crypto news category is a much better fit than company-news
// (which is keyed off a ticker symbol crypto doesn't really have) — one
// call, actually relevant content instead of an empty list.
async function loadCryptoNews(myToken) {
  newsContent.innerHTML = '<p class="muted">Loading...</p>';
  try {
    const newsRes = await fetchJSON(finnhubUrl("/news", { category: "crypto" }));
    if (myToken !== loadToken) return;
    renderNews(newsRes, newsContent);
  } catch {
    if (myToken !== loadToken) return;
    newsContent.innerHTML = '<p class="muted">Couldn\'t load crypto news right now.</p>';
  }
}

async function loadSecondaryData(symbol, profile, myToken) {
  const today = new Date();
  const twoWeeksAgo = new Date(today.getTime() - 14 * 24 * 60 * 60 * 1000);
  const fmt = d => d.toISOString().slice(0, 10);

  const loadingNote = '<p class="muted">Loading...</p>';
  earningsContent.innerHTML = loadingNote;
  financialsContent.innerHTML = loadingNote;
  sharesContent.innerHTML = loadingNote;
  filingsContent.innerHTML = loadingNote;
  insiderContent.innerHTML = loadingNote;
  peersContent.innerHTML = loadingNote;
  newsContent.innerHTML = loadingNote;

  const [earningsRes, peersRes, newsRes, financialsRes, filingsRes, earningsCalendarRes, insiderRes] = await Promise.all([
    fetchJSON(finnhubUrl("/stock/earnings", { symbol })).catch(() => []),
    fetchJSON(finnhubUrl("/stock/peers", { symbol })).catch(() => []),
    fetchJSON(finnhubUrl("/company-news", { symbol, from: fmt(twoWeeksAgo), to: fmt(today) })).catch(() => []),
    fetchJSON(finnhubUrl("/stock/financials-reported", { symbol, freq: "quarterly" })).catch(() => null),
    fetchJSON(finnhubUrl("/stock/filings", { symbol })).catch(() => []),
    fetchJSON(finnhubUrl("/calendar/earnings", { symbol })).catch(() => null),
    fetchJSON(finnhubUrl("/stock/insider-transactions", { symbol })).catch(() => null),
  ]);

  if (myToken !== loadToken) return; // user searched something else before this resolved

  renderUpcomingEvents(earningsCalendarRes);
  renderCompanyHeadlines(newsRes);
  renderEarnings(earningsRes);
  renderFinancials(financialsRes);
  renderShares(profile, financialsRes);
  renderOwnership();
  renderFilings(filingsRes);
  renderInsiderTransactions(insiderRes, profile);
  renderPeers(peersRes, symbol);
  renderNews(newsRes, newsContent);
}

// Distinguishes the common failure cases instead of one generic message —
// a 429 (rate limit) is temporary and self-resolving; a 401/403 means the
// API key itself is wrong or missing; anything else is worth checking the
// console for. Conflating these made a transient rate-limit blip look
// exactly like a broken setup.
function describeFetchError(err) {
  if (err && err.status === 429) {
    // Kept brief on purpose — the header's "Finnhub usage" widget already
    // shows the live count against the 60/min limit and when it resets,
    // so repeating the full explanation down here was redundant.
    return "Rate limited — try again shortly.";
  }
  if (err && (err.status === 401 || err.status === 403)) {
    return IS_LOCAL_DEV
      ? "Your Finnhub API key looks invalid or missing — check config.js."
      : "The site's Finnhub API key looks invalid or missing — check the FINNHUB_API_KEY secret in Cloudflare.";
  }
  return "Something went wrong fetching data. Check the browser console (Cmd+Option+I → Console) for details.";
}

function setStatus(msg, isError = false) {
  statusEl.textContent = msg;
  statusEl.className = "status" + (isError ? " error" : "");
}

// ---- Renderers ----
function renderOverview(symbol, quote, profile) {
  companyName.textContent = profile.name || displaySymbol(symbol);
  tickerBadge.textContent = displaySymbol(symbol);
  exchangeEl.textContent = profile.exchange || "--";
  industryEl.textContent = profile.finnhubIndustry || "--";

  if (profile.logo) {
    logo.src = profile.logo;
    logo.classList.remove("hidden");
  } else {
    logo.classList.add("hidden");
  }

  priceEl.textContent = formatCurrency(quote.c);
  const change = quote.d ?? 0;
  const pct = quote.dp ?? 0;
  changeEl.textContent = `${change >= 0 ? "+" : ""}${change.toFixed(2)} (${pct.toFixed(2)}%)`;
  changeEl.className = "change " + (change >= 0 ? "positive" : "negative");

  openVal.textContent = formatCurrency(quote.o);
  highVal.textContent = formatCurrency(quote.h);
  lowVal.textContent = formatCurrency(quote.l);
  prevCloseVal.textContent = formatCurrency(quote.pc);
}

// "Is this stock's own listing exchange open right now?" — reuses the
// exchange/timezone data already built for the homepage's world map
// (worldMarkets.js), keyed off the country Finnhub's profile2 already
// returned. Zero extra API calls; hidden entirely for countries not in
// that 13-exchange list rather than showing a wrong/guessed status.
let homeMarketInterval = null;
function renderHomeMarketStatus(profile) {
  clearInterval(homeMarketInterval);
  if (typeof getHomeMarketStatus !== "function") { homeMarketCard.classList.add("hidden"); return; }

  const paint = () => {
    const status = getHomeMarketStatus(profile.country);
    if (!status) { homeMarketCard.classList.add("hidden"); return; }
    homeMarketCard.classList.remove("hidden");
    const { ex, isOpen, hhmm } = status;
    homeMarketContent.innerHTML = `
      <p class="home-market-status">
        <span class="home-market-dot ${isOpen ? "open" : "closed"}"></span>
        <strong>${ex.name}</strong> is currently <strong class="${isOpen ? "positive" : ""}">${isOpen ? "OPEN" : "CLOSED"}</strong>
      </p>
      <p class="muted small">${ex.city} local time: ${hhmm} · regular hours ${ex.open}–${ex.close}</p>
    `;
  };
  paint();
  homeMarketInterval = setInterval(paint, 30000);
}

function renderCompanyFacts(profile) {
  companyFacts.innerHTML = "";
  const facts = [
    ["Founded / IPO", profile.ipo || null],
    ["Headquarters", profile.country || null],
    ["Website", profile.weburl || null],
  ];
  const hasAny = facts.some(([, v]) => v);
  if (!hasAny) {
    companyFacts.classList.add("hidden");
    return;
  }
  companyFacts.classList.remove("hidden");
  facts.forEach(([label, value]) => {
    if (!value) return;
    const item = document.createElement("div");
    item.className = "company-fact";
    const labelEl = document.createElement("span");
    labelEl.className = "company-fact-label";
    labelEl.textContent = label;
    item.appendChild(labelEl);
    if (label === "Website") {
      const link = document.createElement("a");
      link.href = value;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = value.replace(/^https?:\/\//, "").replace(/\/$/, "");
      item.appendChild(link);
    } else {
      const valueEl = document.createElement("span");
      valueEl.className = "company-fact-value";
      valueEl.textContent = value;
      item.appendChild(valueEl);
    }
    companyFacts.appendChild(item);
  });
}

function renderCompanyHeadlines(newsArr) {
  companyHeadlines.innerHTML = "";
  if (!newsArr || newsArr.length === 0) return;
  const top = [...newsArr].sort((a, b) => b.datetime - a.datetime).slice(0, 3);

  const label = document.createElement("div");
  label.className = "company-headlines-label";
  label.textContent = "Recent headlines";
  companyHeadlines.appendChild(label);

  top.forEach(item => {
    const link = document.createElement("a");
    link.className = "company-headline-link";
    link.href = item.url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = item.headline || "";
    companyHeadlines.appendChild(link);
  });
}

function renderUpcomingEvents(earningsCalendarRes) {
  upcomingEvents.innerHTML = "";
  const items = earningsCalendarRes && Array.isArray(earningsCalendarRes.earningsCalendar) ? earningsCalendarRes.earningsCalendar : [];
  const next = items.find(e => e.date && new Date(e.date) >= new Date(new Date().toDateString()));

  if (!next) return; // no known upcoming event — say nothing rather than a confusing empty box

  const label = document.createElement("div");
  label.className = "company-headlines-label";
  label.textContent = "Upcoming Event";
  upcomingEvents.appendChild(label);

  const row = document.createElement("div");
  row.className = "upcoming-event-row";
  const hourLabel = { bmo: "before market open", amc: "after market close", dmh: "during market hours" }[next.hour] || "";
  const epsPart = isNum(next.epsEstimate) ? ` · EPS estimate ${next.epsEstimate.toFixed(2)}` : "";
  row.textContent = `Q${next.quarter} ${next.year} earnings — ${next.date}${hourLabel ? " (" + hourLabel + ")" : ""}${epsPart}`;
  upcomingEvents.appendChild(row);
}

async function renderDescription(companyDisplayName) {
  if (!companyDisplayName) {
    descriptionContent.textContent = "No company description available for this symbol (common for ETFs and crypto, which aren't operating companies).";
    return;
  }
  descriptionContent.textContent = "Looking up a short description...";
  const text = await fetchCompanyDescription(companyDisplayName);
  descriptionContent.textContent = text || "No public description found for this symbol.";
}

async function fetchCompanyDescription(companyDisplayName) {
  try {
    const searchUrl = `https://en.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(companyDisplayName)}&format=json&origin=*&limit=1`;
    const searchRes = await fetchJSON(searchUrl);
    const title = searchRes && searchRes[1] && searchRes[1][0];
    if (!title) return null;
    const summaryUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, "_"))}`;
    const summary = await fetchJSON(summaryUrl);
    return summary && summary.extract ? summary.extract : null;
  } catch {
    return null;
  }
}

// Small "here's what that number means with real dollars" callout shown
// below each indicator category — same real numbers already fetched for
// the cards above, just re-expressed against a concrete $100 so the
// abstract ratio/percentage has a tangible anchor. Zero extra API cost:
// pure arithmetic on data already on the page.
function renderRealLifeExample(containerId, points) {
  const el = document.getElementById(containerId);
  if (!el) return;
  const list = (points || []).filter(Boolean);
  if (list.length === 0) { el.innerHTML = ""; return; }
  el.innerHTML = `<p class="real-life-example-label">In plain numbers</p><ul class="real-life-example-list">${list.map(p => `<li>${p}</li>`).join("")}</ul>`;
}

function renderValuation(metric, profile) {
  valuationGrid.innerHTML = "";
  const items = [
    ["P/E Ratio", metric.peTTM, "peRatio", false],
    ["P/B Ratio", metric.pbAnnual, "pbRatio", false],
    ["EV/EBITDA", metric.evEbitdaTTM, "evEbitda", false],
    ["EV/Revenue", metric.evRevenueTTM, "evRevenue", false],
    ["Market Cap ($M)", profile.marketCapitalization, "marketCap", false],
    ["EPS (TTM)", metric.epsTTM, "epsTTM", false],
    ["Shares Outstanding (M)", profile.shareOutstanding, "sharesOutstanding", false],
  ];
  items.forEach(([label, value, defKey, isPercent]) => valuationGrid.appendChild(makeIndicatorCard(label, value, defKey, isPercent)));

  const pe = metric.peTTM;
  const pb = metric.pbAnnual;
  renderRealLifeExample("valuationExample", [
    isNum(pe) && pe > 0 && `Put $100 into this stock and you're claiming about <strong>$${(100 / pe).toFixed(2)}</strong> of the company's annual earnings. That's the flip side of a P/E of ${pe.toFixed(1)}: you're paying $${pe.toFixed(0)} today for every $1 the company earns in a year.`,
    isNum(pb) && pb > 0 && `That same $100 also buys a claim on about <strong>$${(100 / pb).toFixed(2)}</strong> of the company's net assets (what's left over if it sold everything and paid off all its debts) — a P/B of ${pb.toFixed(1)} means you're paying $${pb.toFixed(0)} for every $1 of that.`,
  ]);
}

function renderGrowth(metric) {
  growthGrid.innerHTML = "";
  const items = [
    ["Revenue Growth (TTM YoY)", metric.revenueGrowthTTMYoy, "revenueGrowth", true],
    ["EPS Growth (TTM YoY)", metric.epsGrowthTTMYoy, "epsGrowth", true],
    ["Revenue Growth (5Y)", metric.revenueGrowth5Y, "revenueGrowth", true],
    ["EPS Growth (5Y)", metric.epsGrowth5Y, "epsGrowth", true],
  ];
  items.forEach(([label, value, defKey, isPercent]) => growthGrid.appendChild(makeIndicatorCard(label, value, defKey, isPercent)));

  const rev = metric.revenueGrowthTTMYoy;
  const epsGrowth = metric.epsGrowthTTMYoy;
  renderRealLifeExample("growthExample", [
    isNum(rev) && `If this company made $100 in revenue this time last year, it's making about <strong>$${(100 * (1 + rev / 100)).toFixed(2)}</strong> now — that's what its ${rev >= 0 ? "+" : ""}${rev.toFixed(1)}% year-over-year revenue growth means in practice.`,
    isNum(epsGrowth) && `If it earned $100 in profit per share last year, it's earning about <strong>$${(100 * (1 + epsGrowth / 100)).toFixed(2)}</strong> per share now — that's its ${epsGrowth >= 0 ? "+" : ""}${epsGrowth.toFixed(1)}% year-over-year EPS growth.`,
  ]);
}

function renderProfitability(metric) {
  profitabilityGrid.innerHTML = "";
  const items = [
    ["Gross Margin", metric.grossMarginTTM, "grossMargin", true],
    ["Operating Margin", metric.operatingMarginTTM, "operatingMargin", true],
    ["Net Margin", metric.netProfitMarginTTM, "netMargin", true],
    ["Return on Equity", metric.roeTTM, "roe", true],
  ];
  items.forEach(([label, value, defKey, isPercent]) => profitabilityGrid.appendChild(makeIndicatorCard(label, value, defKey, isPercent)));

  const grossMargin = metric.grossMarginTTM;
  const netMargin = metric.netProfitMarginTTM;
  const roe = metric.roeTTM;
  renderRealLifeExample("profitabilityExample", [
    isNum(grossMargin) && `For every $100 in sales, about <strong>$${grossMargin.toFixed(2)}</strong> is left after just the direct cost of making the product/service (its gross margin) — before rent, salaries, marketing, and everything else are even counted.`,
    isNum(netMargin) && `After ALL costs — including those overheads, interest, and tax — it keeps about <strong>$${netMargin.toFixed(2)}</strong> of every $100 in sales as actual profit (its net margin).`,
    isNum(roe) && `Separately, for every $100 shareholders have invested in the business, it generates about <strong>$${roe.toFixed(2)}</strong> back in profit each year (its return on equity).`,
  ]);
}

function renderHealth(metric) {
  healthGrid.innerHTML = "";
  const items = [
    ["Quick Ratio", metric.quickRatioAnnual, "quickRatio", false],
    ["Current Ratio", metric.currentRatioAnnual, "currentRatio", false],
    ["Debt/Equity", metric["totalDebt/totalEquityAnnual"], "debtToEquity", false],
  ];
  items.forEach(([label, value, defKey, isPercent]) => healthGrid.appendChild(makeIndicatorCard(label, value, defKey, isPercent)));

  const de = metric["totalDebt/totalEquityAnnual"];
  const currentRatio = metric.currentRatioAnnual;
  renderRealLifeExample("healthExample", [
    isNum(de) && `For every $100 of the company's own money (shareholder equity), it has borrowed about <strong>$${(de * 100).toFixed(2)}</strong> more from lenders and creditors — that's what a Debt-to-Equity ratio of ${de.toFixed(2)} means.`,
    isNum(currentRatio) && `For every $100 of bills it owes within the next year, it has about <strong>$${(currentRatio * 100).toFixed(2)}</strong> in cash and other assets that could be turned into cash within a year to cover them (its current ratio of ${currentRatio.toFixed(2)}).`,
  ]);
}

function renderDividends(metric) {
  dividendsGrid.innerHTML = "";
  const items = [
    ["Dividend Yield", metric.dividendYieldIndicatedAnnual, "dividendYield", true],
    ["Dividend Per Share", metric.dividendPerShareTTM, "dividendPerShare", false],
    ["5Y Dividend Growth", metric.dividendGrowthRate5Y, "dividendGrowth5Y", true],
  ];
  items.forEach(([label, value, defKey, isPercent]) => dividendsGrid.appendChild(makeIndicatorCard(label, value, defKey, isPercent)));

  const yieldPct = metric.dividendYieldIndicatedAnnual;
  const divGrowth5Y = metric.dividendGrowthRate5Y;
  if (isNum(yieldPct) && yieldPct > 0) {
    renderRealLifeExample("dividendsExample", [
      `Invest $100 in this stock today and you'd collect about <strong>$${yieldPct.toFixed(2)}</strong> per year in dividend payments alone (before taxes) — separate from any gain or loss in the share price itself.`,
      isNum(divGrowth5Y) && `That payout itself has also been growing: if it paid $100 in dividends 5 years ago, it's paying about <strong>$${(100 * (1 + divGrowth5Y / 100)).toFixed(2)}</strong> now (${divGrowth5Y >= 0 ? "+" : ""}${divGrowth5Y.toFixed(1)}% over 5 years).`,
    ]);
  } else {
    renderRealLifeExample("dividendsExample", [`This company currently pays no meaningful dividend, so a $100 investment wouldn't generate cash income this way — any return would have to come from the share price itself changing.`]);
  }
}

function renderMomentum(metric) {
  momentumGrid.innerHTML = "";
  const items = [
    ["YTD Return", metric.yearToDatePriceReturnDaily, "ytdReturn", true],
    ["52-Week Return", metric["52WeekPriceReturnDaily"], "week52Return", true],
    ["vs. S&P 500 (13-wk)", metric["priceRelativeToS&P50013Week"], "priceVsSP500", true],
    ["Beta", metric.beta, "beta", false],
  ];
  items.forEach(([label, value, defKey, isPercent]) => momentumGrid.appendChild(makeIndicatorCard(label, value, defKey, isPercent)));

  const ytd = metric.yearToDatePriceReturnDaily;
  const week52 = metric["52WeekPriceReturnDaily"];
  renderRealLifeExample("momentumExample", [
    isNum(ytd) && `$100 invested in this stock at the start of this calendar year would be worth about <strong>$${(100 * (1 + ytd / 100)).toFixed(2)}</strong> today, based on its ${ytd >= 0 ? "+" : ""}${ytd.toFixed(1)}% year-to-date price move alone (not counting dividends).`,
    isNum(week52) && `Looking at a full rolling 12 months instead (not just this calendar year), that same $100 would be worth about <strong>$${(100 * (1 + week52 / 100)).toFixed(2)}</strong>, based on its ${week52 >= 0 ? "+" : ""}${week52.toFixed(1)}% return over the past year.`,
  ]);
}

function renderRange(metric) {
  rangeGrid.innerHTML = "";
  const items = [
    ["52-Week High", metric["52WeekHigh"], "fiftyTwoWeekHigh", false],
    ["52-Week Low", metric["52WeekLow"], "fiftyTwoWeekLow", false],
  ];
  items.forEach(([label, value, defKey, isPercent]) => rangeGrid.appendChild(makeIndicatorCard(label, value, defKey, isPercent)));
}

// Shared by the stock/ETF 52-week gauge and the crypto all-time-high/low
// gauge below — same visualization (where does the current price sit
// between a low and a high reference point), fed different reference
// points depending on instrument type.
function renderRangeGaugeGeneric(low, high, price) {
  if (!isNum(high) || !isNum(low) || !isNum(price) || high <= low) {
    rangeGaugeWrap.classList.add("hidden");
    return;
  }
  rangeGaugeWrap.classList.remove("hidden");
  const pct = Math.min(100, Math.max(0, ((price - low) / (high - low)) * 100));
  rangeGaugeMarker.style.left = `${pct}%`;
  rangeLowLabel.textContent = formatCurrency(low);
  rangeHighLabel.textContent = formatCurrency(high);
}

function renderRangeGauge(metric, quote) {
  renderRangeGaugeGeneric(metric["52WeekLow"], metric["52WeekHigh"], quote.c);
}

// ---- ETF-specific sections (Price Performance / Trading Activity & Risk) ----
// Repurposes the same valuationGrid/healthGrid containers a stock uses,
// with metrics that actually exist for a fund — see getInstrumentType()
// for why (Finnhub's fundamentals endpoints come back empty for ETFs).
function renderETFPerformance(metric) {
  valuationGrid.innerHTML = "";
  const items = [
    ["5-Day Return", metric["5DayPriceReturnDaily"], "return5Day", true],
    ["Month-to-Date Return", metric.monthToDatePriceReturnDaily, "returnMTD", true],
    ["13-Week Return", metric["13WeekPriceReturnDaily"], "return13Week", true],
    ["26-Week Return", metric["26WeekPriceReturnDaily"], "return26Week", true],
    ["YTD Return", metric.yearToDatePriceReturnDaily, "ytdReturn", true],
    ["52-Week Return", metric["52WeekPriceReturnDaily"], "week52Return", true],
  ];
  items.forEach(([label, value, defKey, isPercent]) => valuationGrid.appendChild(makeIndicatorCard(label, value, defKey, isPercent)));

  const week52 = metric["52WeekPriceReturnDaily"];
  renderRealLifeExample("valuationExample", [
    isNum(week52) && `$100 invested in this fund a year ago would be worth about <strong>$${(100 * (1 + week52 / 100)).toFixed(2)}</strong> today, based on its ${week52 >= 0 ? "+" : ""}${week52.toFixed(1)}% return over the past 12 months (not counting any dividends it paid out along the way).`,
  ]);
}

function renderETFTradingActivity(metric) {
  healthGrid.innerHTML = "";
  const items = [
    ["Beta", metric.beta, "beta", false],
    ["3-Month Volatility", metric["3MonthADReturnStd"], "volatility3Month", false],
    ["Avg Volume (10-Day, M)", metric["10DayAverageTradingVolume"], "avgVolume10Day", false],
    ["Avg Volume (3-Month, M)", metric["3MonthAverageTradingVolume"], "avgVolume3Month", false],
  ];
  items.forEach(([label, value, defKey, isPercent]) => healthGrid.appendChild(makeIndicatorCard(label, value, defKey, isPercent)));

  const beta = metric.beta;
  renderRealLifeExample("healthExample", [
    isNum(beta) && beta !== 1 && `If the overall market moved 10% (up or down), this fund has historically moved about <strong>${(beta * 10).toFixed(1)}%</strong> — that's what a beta of ${beta.toFixed(2)} means in practice.`,
  ]);
}

// ---- Crypto-specific sections (Market Stats / Performance) ----
// `coin` is CoinGecko's per-coin object (same shape the homepage Crypto
// tab uses) — Finnhub returns nothing usable for crypto beyond price.
function renderCryptoMarketStats(coin) {
  valuationGrid.innerHTML = "";
  if (!coin) { valuationGrid.innerHTML = '<p class="muted">Detailed crypto data isn\'t available for this coin.</p>'; return; }
  const items = [
    ["Market Cap", coin.market_cap, "marketCap", false],
    ["Market Cap Rank", coin.market_cap_rank, "marketCapRank", false],
    ["24H Volume", coin.total_volume, "volume24h", false],
    ["Circulating Supply", coin.circulating_supply, "circSupply", false],
    ["Max Supply", coin.max_supply, "maxSupply", false],
  ];
  items.forEach(([label, value, defKey]) => {
    const card = makeIndicatorCard(label, value, defKey, false);
    if (isNum(value) && (label === "Market Cap" || label === "24H Volume")) {
      const valueEl = card.querySelector(".indicator-value");
      if (valueEl) valueEl.textContent = formatCompactCurrency(value);
    } else if (isNum(value) && (label === "Circulating Supply" || label === "Max Supply")) {
      const valueEl = card.querySelector(".indicator-value");
      if (valueEl) valueEl.textContent = value.toLocaleString(undefined, { maximumFractionDigits: 0 });
    } else if (isNum(value) && label === "Market Cap Rank") {
      const valueEl = card.querySelector(".indicator-value");
      if (valueEl) valueEl.textContent = `#${value}`;
    }
    valuationGrid.appendChild(card);
  });

  renderRealLifeExample("valuationExample", [
    isNum(coin.market_cap_rank) && `By total market value, this is currently the <strong>#${coin.market_cap_rank}</strong> largest cryptocurrency out of thousands that exist.`,
  ]);
}

function renderCryptoPerformance(coin) {
  healthGrid.innerHTML = "";
  if (!coin) { healthGrid.innerHTML = '<p class="muted">Detailed crypto data isn\'t available for this coin.</p>'; return; }
  const items = [
    ["24H Return", coin.price_change_percentage_24h, "return24h", true],
    ["7-Day Return", coin.price_change_percentage_7d, "return7Day", true],
    ["30-Day Return", coin.price_change_percentage_30d, "return30Day", true],
    ["1-Year Return", coin.price_change_percentage_1y, "return1Year", true],
  ];
  items.forEach(([label, value, defKey, isPercent]) => healthGrid.appendChild(makeIndicatorCard(label, value, defKey, isPercent)));

  const pct30d = coin.price_change_percentage_30d;
  renderRealLifeExample("healthExample", [
    isNum(pct30d) && `$100 put into this coin 30 days ago would be worth about <strong>$${(100 * (1 + pct30d / 100)).toFixed(2)}</strong> today, based on its ${pct30d >= 0 ? "+" : ""}${pct30d.toFixed(1)}% move over that month.`,
  ]);
}

function renderCryptoRange(coin, price) {
  rangeGrid.innerHTML = "";
  if (!coin) return;
  const fmtDate = iso => iso ? new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : "";
  const items = [
    ["All-Time High", coin.ath, "allTimeHigh", false],
    ["All-Time Low", coin.atl, "allTimeLow", false],
  ];
  items.forEach(([label, value, defKey]) => rangeGrid.appendChild(makeIndicatorCard(label, value, defKey, false)));

  const dateNote = document.createElement("p");
  dateNote.className = "muted small";
  dateNote.textContent = [
    coin.ath_date ? `All-time high reached ${fmtDate(coin.ath_date)}.` : "",
    coin.atl_date ? `All-time low reached ${fmtDate(coin.atl_date)}.` : "",
  ].filter(Boolean).join(" ");
  rangeGrid.appendChild(dateNote);

  renderRangeGaugeGeneric(coin.atl, coin.ath, price);
}

function renderRecommendation(recArr) {
  recommendationContent.innerHTML = "";

  if (!recArr || recArr.length === 0) {
    recommendationContent.innerHTML = '<p class="muted">No analyst recommendation data available for this symbol.</p>';
    return null;
  }

  const sorted = [...recArr].sort((a, b) => new Date(b.period) - new Date(a.period));
  const latest = sorted[0];
  const { strongBuy = 0, buy = 0, hold = 0, sell = 0, strongSell = 0, period } = latest;
  const total = strongBuy + buy + hold + sell + strongSell;

  if (total === 0) {
    recommendationContent.innerHTML = '<p class="muted">No analyst recommendation data available for this symbol.</p>';
    return null;
  }

  const segments = [
    ["Strong Buy", strongBuy, "rec-strongbuy"],
    ["Buy", buy, "rec-buy"],
    ["Hold", hold, "rec-hold"],
    ["Sell", sell, "rec-sell"],
    ["Strong Sell", strongSell, "rec-strongsell"],
  ];

  const bar = document.createElement("div");
  bar.className = "rec-bar";
  segments.forEach(([label, count, cls]) => {
    if (count <= 0) return;
    const seg = document.createElement("div");
    seg.className = `rec-segment ${cls}`;
    seg.style.width = `${(count / total) * 100}%`;
    seg.title = `${label}: ${count}`;
    bar.appendChild(seg);
  });
  recommendationContent.appendChild(bar);

  const legend = document.createElement("div");
  legend.className = "rec-legend";
  segments.forEach(([label, count, cls]) => {
    const item = document.createElement("span");
    item.className = "rec-legend-item";
    item.innerHTML = `<span class="rec-dot ${cls}"></span>${label}: ${count}`;
    legend.appendChild(item);
  });
  recommendationContent.appendChild(legend);

  const periodNote = document.createElement("p");
  periodNote.className = "muted small";
  periodNote.textContent = `As of ${period} · ${total} analysts`;
  recommendationContent.appendChild(periodNote);

  return latest;
}

function renderEarnings(earningsArr) {
  earningsContent.innerHTML = "";

  if (!earningsArr || earningsArr.length === 0) {
    earningsContent.innerHTML = '<p class="muted">No earnings history available for this symbol.</p>';
    return;
  }

  const sorted = [...earningsArr].sort((a, b) => new Date(b.period) - new Date(a.period)).slice(0, 4);

  const table = document.createElement("div");
  table.className = "earnings-table";

  const header = document.createElement("div");
  header.className = "earnings-row earnings-header";
  ["Quarter", "Expected EPS", "Actual EPS"].forEach(t => {
    const c = document.createElement("div");
    c.textContent = t;
    header.appendChild(c);
  });
  table.appendChild(header);

  sorted.forEach(q => {
    const row = document.createElement("div");
    row.className = "earnings-row";
    const surprisePct = q.surprisePercent;
    const beat = isNum(surprisePct) ? surprisePct >= 0 : null;

    const cells = [
      q.period || "--",
      isNum(q.estimate) ? q.estimate.toFixed(2) : "N/A",
      isNum(q.actual) ? q.actual.toFixed(2) : "N/A",
    ];
    cells.forEach((val, i) => {
      const c = document.createElement("div");
      c.textContent = val;
      // Actual EPS colored by whether it beat/missed the expected figure
      // (same info the old "Surprise %" column carried), so no separate
      // column is needed just to see which quarters beat estimates.
      if (i === 2 && beat !== null) c.className = beat ? "positive" : "negative";
      row.appendChild(c);
    });
    table.appendChild(row);
  });

  earningsContent.appendChild(table);
}

// Finnhub's financials-reported endpoint returns raw XBRL concepts, and
// different companies/filings sometimes use slightly different tag names
// for the same line item — try a few known variants and use the first
// that's present.
function findConcept(reportSection, candidates) {
  if (!reportSection) return undefined;
  for (const name of candidates) {
    const match = reportSection.find(item => item.concept === name);
    if (match && isNum(match.value)) return match.value;
  }
  return undefined;
}

function getLatestFilingsWithIC(financialsRes, count) {
  if (!financialsRes || !Array.isArray(financialsRes.data)) return [];
  return financialsRes.data
    .filter(f => f.report && Array.isArray(f.report.ic))
    .sort((a, b) => new Date(b.endDate) - new Date(a.endDate))
    .slice(0, count);
}

function renderFinancials(financialsRes) {
  const filings = getLatestFilingsWithIC(financialsRes, 4);

  if (filings.length === 0) {
    financialsContent.innerHTML = '<p class="muted">No detailed financial-statement data available for this symbol.</p>';
    return;
  }

  const table = document.createElement("div");
  table.className = "earnings-table financials-table";

  const header = document.createElement("div");
  header.className = "earnings-row earnings-header";
  ["Period End", "Revenue", "Gross Profit", "Operating Income", "Net Income"].forEach(t => {
    const c = document.createElement("div");
    c.textContent = t;
    header.appendChild(c);
  });
  table.appendChild(header);

  filings.forEach(f => {
    const ic = f.report.ic;
    const revenue = findConcept(ic, ["us-gaap_RevenueFromContractWithCustomerExcludingAssessedTax", "us-gaap_Revenues", "us-gaap_RevenueFromContractWithCustomerIncludingAssessedTax"]);
    const grossProfit = findConcept(ic, ["us-gaap_GrossProfit"]);
    const operatingIncome = findConcept(ic, ["us-gaap_OperatingIncomeLoss"]);
    const netIncome = findConcept(ic, ["us-gaap_NetIncomeLoss", "us-gaap_ProfitLoss"]);

    const row = document.createElement("div");
    row.className = "earnings-row";
    [
      f.endDate ? f.endDate.slice(0, 10) : "--",
      isNum(revenue) ? formatCount(revenue / 1e6) + "M" : "N/A",
      isNum(grossProfit) ? formatCount(grossProfit / 1e6) + "M" : "N/A",
      isNum(operatingIncome) ? formatCount(operatingIncome / 1e6) + "M" : "N/A",
      isNum(netIncome) ? formatCount(netIncome / 1e6) + "M" : "N/A",
    ].forEach(val => {
      const c = document.createElement("div");
      c.textContent = val;
      row.appendChild(c);
    });
    table.appendChild(row);
  });

  financialsContent.innerHTML = "";
  financialsContent.appendChild(table);

  const note = document.createElement("p");
  note.className = "muted small";
  note.textContent = "Figures in USD millions, pulled directly from each company's own SEC-filed reports (via Finnhub) — not adjusted or estimated.";
  financialsContent.appendChild(note);
}

function renderShares(profile, financialsRes) {
  const total = profile.shareOutstanding;
  const float = profile.floatingShare;
  const filings = getLatestFilingsWithIC(financialsRes, 1);
  const diluted = filings.length ? findConcept(filings[0].report.ic, ["us-gaap_WeightedAverageNumberOfDilutedSharesOutstanding"]) : undefined;
  const basic = filings.length ? findConcept(filings[0].report.ic, ["us-gaap_WeightedAverageNumberOfSharesOutstandingBasic"]) : undefined;

  sharesContent.innerHTML = "";

  if (!isNum(total)) {
    sharesContent.innerHTML = '<p class="muted">Share-count data isn\'t available for this symbol.</p>';
    return;
  }

  const heldPct = isNum(float) ? Math.max(0, Math.min(100, ((total - float) / total) * 100)) : 0;
  const floatPct = isNum(float) ? 100 - heldPct : 100;

  const wrap = document.createElement("div");
  wrap.className = "shares-wrap";

  if (isNum(float)) {
    const donut = document.createElement("div");
    donut.className = "shares-donut";
    donut.style.background = `conic-gradient(var(--accent) 0% ${floatPct}%, var(--bg-surface-2) ${floatPct}% 100%)`;
    const donutLabel = document.createElement("div");
    donutLabel.className = "shares-donut-label";
    donutLabel.textContent = `${floatPct.toFixed(0)}%\nfloat`;
    donut.appendChild(donutLabel);
    wrap.appendChild(donut);
  }

  const legend = document.createElement("div");
  legend.className = "shares-legend";
  // Finnhub reports total/float already in millions; the financials-
  // reported figures (basic/diluted) come back as raw absolute counts.
  // Multiply the former by 1e6 so every row shows the same real,
  // un-abbreviated number — "(M)" labels were confusing (13,159.2M read
  // like 13,159.2, not 13.16 billion).
  const rows = [
    ["Total Shares Outstanding", formatCount(total * 1e6), "sharesOutstandingTotal"],
    isNum(float) ? ["Public Float", formatCount(float * 1e6), "publicFloat"] : null,
    isNum(basic) ? ["Weighted Avg. Basic Shares", formatCount(basic), "weightedAvgBasicShares"] : null,
    isNum(diluted) ? ["Weighted Avg. Diluted Shares", formatCount(diluted), "weightedAvgDilutedShares"] : null,
  ].filter(Boolean);
  rows.forEach(([label, value, defKey]) => {
    const row = document.createElement("div");
    row.className = "shares-row";
    const l = document.createElement("span");
    l.className = "shares-row-label";
    l.textContent = label;
    const helpBtn = document.createElement("button");
    helpBtn.className = "help-btn";
    helpBtn.textContent = "?";
    helpBtn.addEventListener("click", () => showTooltip(label, defKey));
    l.appendChild(helpBtn);
    const v = document.createElement("span");
    v.className = "shares-row-value";
    v.textContent = value;
    row.appendChild(l);
    row.appendChild(v);
    legend.appendChild(row);
  });
  wrap.appendChild(legend);
  sharesContent.appendChild(wrap);

  const note = document.createElement("p");
  note.className = "muted small";
  note.textContent = "Float = shares actually available for public trading (total minus closely-held/restricted shares). Diluted shares assume outstanding options/RSUs convert to stock — always ≥ basic shares.";
  sharesContent.appendChild(note);
}

function renderOwnership() {
  ownershipContent.innerHTML = `
    <p class="muted">Institutional-ownership / major-shareholder data (who holds the biggest stakes) requires a paid Finnhub plan — confirmed directly, not shown here to avoid presenting stale or fabricated figures.</p>
    <p class="muted small">If you want this for free elsewhere: a stock's 13F/13D/13G filings (which disclose large institutional holders) are public on <a href="https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany" target="_blank" rel="noopener noreferrer">SEC EDGAR</a>, and most brokerage apps (e.g. Fidelity, Schwab) show a basic "ownership" tab for free.</p>
  `;
}

// Plain-English name + one-line description for the SEC form types that
// actually show up here in practice (10-K/10-Q/8-K are prioritized below,
// but less common ones can still appear). Anything not in this list falls
// back to a generic description rather than showing a bare, meaningless
// code — addressing "when users click the link, it doesn't really mean
// anything."
const FILING_TYPE_INFO = {
  "10-K": { name: "Annual Report", desc: "Full-year financial results, risk factors, and a detailed look at the whole business — the most complete filing a company makes, once a year." },
  "10-K/A": { name: "Annual Report (Amended)", desc: "A correction or update to a previously filed annual report." },
  "10-Q": { name: "Quarterly Report", desc: "Financial results for the past three months. Less detailed than the annual report; filed three times a year (the fourth quarter is covered by the 10-K instead)." },
  "10-Q/A": { name: "Quarterly Report (Amended)", desc: "A correction or update to a previously filed quarterly report." },
  "8-K": { name: "Major Event Notice", desc: "Filed within days of something significant happening — an acquisition, executive change, earnings release, or similar — whenever it occurs, not on a fixed schedule." },
  "DEF 14A": { name: "Proxy Statement", desc: "Sent to shareholders ahead of the annual meeting. Covers executive pay, board elections, and anything shareholders are being asked to vote on." },
  "DEFA14A": { name: "Proxy Statement (Additional)", desc: "Extra material related to an upcoming shareholder vote, filed alongside or after the main proxy statement." },
  "S-1": { name: "IPO Registration", desc: "Filed before a company's stock starts trading publicly, to register the shares with the SEC." },
  "S-3": { name: "Securities Registration", desc: "A streamlined filing for registering new stock or debt, used by companies that already file regularly." },
  "S-8": { name: "Employee Stock Plan Registration", desc: "Registers shares set aside for employee compensation plans (stock options, RSUs, etc.)." },
  "4": { name: "Insider Transaction", desc: "An individual insider — an executive, director, or major shareholder — reporting a purchase or sale of company stock." },
  "3": { name: "Initial Insider Ownership", desc: "An executive, director, or major shareholder's first report of how much company stock they own." },
  "SC 13G": { name: "Large Shareholder Disclosure", desc: "Filed by an investor who has passively acquired 5%+ of the company's shares." },
  "SC 13D": { name: "Large Shareholder Disclosure (Active)", desc: "Filed by an investor who has acquired 5%+ of the company's shares and may be seeking to influence the company." },
  "11-K": { name: "Employee Stock Plan Annual Report", desc: "Yearly financial report for the company's employee stock purchase or retirement plan." },
  // ETFs/funds file completely different forms than companies do (no 10-K,
  // no earnings) — these are the ones that actually show up for the ETFs
  // in this app's curated lists, confirmed via a live filings request.
  "NPORT-P": { name: "Portfolio Holdings Report", desc: "A monthly snapshot of exactly what the fund holds — every position, and how much of the fund's money is in each one." },
  "N-CEN": { name: "Annual Fund Census", desc: "A yearly operational report about the fund itself (service providers, share classes, etc.) — not its holdings or performance." },
  "N-30D": { name: "Shareholder Report", desc: "A periodic report to the fund's own shareholders covering performance and a summary of holdings, similar in spirit to a company's earnings report." },
  "497": { name: "Prospectus Supplement", desc: "An update to the fund's prospectus — the document describing its strategy, fees, and risks." },
  "497J": { name: "Prospectus Certification", desc: "A short filing certifying that a previously filed prospectus update meets SEC requirements." },
  "485BPOS": { name: "Registration Update", desc: "An update to the fund's core registration statement with the SEC — routine, not tied to any specific event." },
  "NSAR-U": { name: "Annual Report (Legacy Form)", desc: "An older annual reporting form for funds, since replaced by N-CEN — may still appear in older filing history." },
  "24F-2NT": { name: "Share Sales Notice", desc: "An annual notice of how many new shares the fund sold over the year, used to calculate SEC registration fees — a regulatory formality, not performance data." },
};

function getFilingInfo(form) {
  if (FILING_TYPE_INFO[form]) return FILING_TYPE_INFO[form];
  if (form && form.startsWith("424B")) return { name: "Prospectus", desc: "Details the terms of a securities offering — what's being sold, at what price, and to whom." };
  return { name: form || "SEC Filing", desc: "A filing type this dashboard doesn't have a plain-English description for yet — open it on EDGAR to see the actual content." };
}

function renderFilings(filingsArr) {
  if (!filingsArr || filingsArr.length === 0) {
    filingsContent.innerHTML = '<p class="muted">No SEC filings found for this symbol (common for non-US-listed companies).</p>';
    return;
  }

  const priority = { "10-K": 0, "10-Q": 1, "8-K": 2 };
  const sorted = [...filingsArr]
    .sort((a, b) => new Date(b.filedDate) - new Date(a.filedDate))
    .sort((a, b) => (priority[a.form] ?? 9) - (priority[b.form] ?? 9))
    .slice(0, 8);

  const COLLAPSED_COUNT = 3;

  const list = document.createElement("div");
  list.className = "filings-list";
  sorted.forEach((f, i) => {
    const info = getFilingInfo(f.form);

    const row = document.createElement("a");
    row.className = "filing-item";
    if (i >= COLLAPSED_COUNT) row.classList.add("filing-item-extra", "hidden");
    row.href = f.filingUrl || f.reportUrl;
    row.target = "_blank";
    row.rel = "noopener noreferrer";

    const top = document.createElement("div");
    top.className = "filing-item-top";

    const badge = document.createElement("span");
    badge.className = "filing-form";
    badge.textContent = f.form || "?";

    const name = document.createElement("span");
    name.className = "filing-name";
    name.textContent = info.name;

    const date = document.createElement("span");
    date.className = "filing-date";
    date.textContent = f.filedDate ? f.filedDate.slice(0, 10) : "--";

    top.appendChild(badge);
    top.appendChild(name);
    top.appendChild(date);

    const desc = document.createElement("p");
    desc.className = "filing-desc";
    desc.textContent = info.desc;

    const linkCue = document.createElement("span");
    linkCue.className = "filing-link-cue";
    linkCue.textContent = "View the actual filing on SEC EDGAR ↗";

    row.appendChild(top);
    row.appendChild(desc);
    row.appendChild(linkCue);
    list.appendChild(row);
  });

  filingsContent.innerHTML = "";
  filingsContent.appendChild(list);

  const extraCount = sorted.length - COLLAPSED_COUNT;
  if (extraCount > 0) {
    const expandBtn = document.createElement("button");
    expandBtn.type = "button";
    expandBtn.className = "filings-expand-btn";
    expandBtn.textContent = `Show ${extraCount} more filing${extraCount === 1 ? "" : "s"}`;
    expandBtn.addEventListener("click", () => {
      list.querySelectorAll(".filing-item-extra").forEach(el => el.classList.remove("hidden"));
      expandBtn.remove();
    });
    filingsContent.appendChild(expandBtn);
  }

  const note = document.createElement("p");
  note.className = "muted small";
  note.textContent = "Descriptions above explain what each filing type generally contains. This dashboard doesn't parse out sections like risk factors automatically — 10-Ks and other filings are long, unstructured legal documents; open the filing to read those directly.";
  filingsContent.appendChild(note);
}

function renderInsiderTransactions(data, profile) {
  const arr = data && Array.isArray(data.data) ? data.data : null;
  if (!arr || arr.length === 0) {
    insiderContent.innerHTML = '<p class="muted">No insider transaction data available for this symbol (common for non-US-listed companies, which don\'t file with the SEC).</p>';
    return;
  }

  // Finnhub's shareOutstanding is already in millions — a raw share
  // count on its own (e.g. "-65,000") doesn't say much without knowing
  // how big the company is; expressing it as a % of total shares
  // outstanding makes it comparable across any stock at a glance.
  const totalShares = isNum(profile?.shareOutstanding) ? profile.shareOutstanding * 1e6 : null;

  const sorted = [...arr].sort((a, b) => new Date(b.transactionDate) - new Date(a.transactionDate)).slice(0, 8);

  const table = document.createElement("div");
  table.className = "earnings-table insider-table";

  const header = document.createElement("div");
  header.className = "earnings-row earnings-header";
  ["Insider", "Date", "Shares Changed", "% of Shares Out.", "Price"].forEach(t => {
    const c = document.createElement("div");
    c.textContent = t;
    header.appendChild(c);
  });
  table.appendChild(header);

  sorted.forEach(t => {
    const row = document.createElement("div");
    row.className = "earnings-row";
    const change = t.change;
    const acquired = isNum(change) ? change > 0 : null;
    const pctOfShares = isNum(change) && totalShares ? (change / totalShares) * 100 : null;

    const cells = [
      t.name || "--",
      t.transactionDate || "--",
      isNum(change) ? `${change >= 0 ? "+" : ""}${change.toLocaleString()}` : "N/A",
      isNum(pctOfShares) ? `${pctOfShares >= 0 ? "+" : ""}${pctOfShares.toFixed(4)}%` : "N/A",
      isNum(t.transactionPrice) && t.transactionPrice > 0 ? formatCurrency(t.transactionPrice) : "N/A",
    ];
    cells.forEach((val, i) => {
      const c = document.createElement("div");
      c.textContent = val;
      if ((i === 2 || i === 3) && acquired !== null) c.className = acquired ? "positive" : "negative";
      row.appendChild(c);
    });
    table.appendChild(row);
  });

  insiderContent.innerHTML = "";
  insiderContent.appendChild(table);

  const note = document.createElement("p");
  note.className = "muted small";
  note.textContent = "From SEC Form 4 filings (executives/directors reporting their own trades). Many of these are routine — scheduled vesting, tax payments, pre-planned trading programs — not necessarily a signal either way.";
  insiderContent.appendChild(note);
}

async function renderPeers(peersArr, currentSymbol) {
  const filtered = (peersArr || []).filter(s => s && s.toUpperCase() !== currentSymbol.toUpperCase()).slice(0, 10);

  if (filtered.length === 0) {
    peersContent.innerHTML = '<p class="muted">No similar-company data available for this symbol.</p>';
    return;
  }

  peersContent.innerHTML = "";
  const row = document.createElement("div");
  row.className = "peer-row";
  peersContent.appendChild(row);

  filtered.forEach(async sym => {
    const chip = document.createElement("button");
    chip.className = "peer-chip";
    const tickerSpan = document.createElement("span");
    tickerSpan.className = "peer-ticker";
    tickerSpan.textContent = sym;
    chip.appendChild(tickerSpan);
    chip.addEventListener("click", () => loadTicker(sym));
    row.appendChild(chip);

    try {
      const p = await fetchJSON(finnhubUrl("/stock/profile2", { symbol: sym }));
      if (p && p.name) {
        const nameSpan = document.createElement("span");
        nameSpan.className = "peer-name";
        nameSpan.textContent = p.name;
        chip.insertBefore(nameSpan, tickerSpan);
      }
    } catch {
      // leave as ticker-only
    }
  });
}

function renderNews(newsArr, container) {
  container.innerHTML = "";

  if (!newsArr || newsArr.length === 0) {
    container.innerHTML = '<p class="muted">No recent news found.</p>';
    return;
  }

  const sorted = [...newsArr].sort((a, b) => b.datetime - a.datetime).slice(0, 8);

  const list = document.createElement("div");
  list.className = "news-list";
  sorted.forEach(item => {
    const row = document.createElement("a");
    row.className = "news-item";
    row.href = item.url;
    row.target = "_blank";
    row.rel = "noopener noreferrer";

    const source = item.source || "Unknown";
    const badge = document.createElement("div");
    badge.className = "news-source-badge";
    badge.style.background = colorFromString(source);
    badge.textContent = source.charAt(0).toUpperCase();

    const body = document.createElement("div");
    body.className = "news-item-body";

    const headline = document.createElement("div");
    headline.className = "news-headline";
    headline.textContent = item.headline || "";

    const meta = document.createElement("div");
    meta.className = "news-meta";
    const date = new Date((item.datetime || 0) * 1000);
    meta.textContent = `${source} · ${formatRelativeTime(date)}`;

    body.appendChild(headline);
    body.appendChild(meta);
    row.appendChild(badge);
    row.appendChild(body);
    list.appendChild(row);
  });
  container.appendChild(list);
}

function renderScenarios(quote, metric) {
  scenarioContent.innerHTML = "";
  const price = quote.c;
  const high = metric["52WeekHigh"];
  const low = metric["52WeekLow"];
  const beta = metric.beta;

  if (!isNum(price)) {
    scenarioContent.innerHTML = '<p class="muted">Not enough data for reference points.</p>';
    return;
  }

  const rows = [];
  if (isNum(high) && high > price) {
    rows.push(["If it revisited its 52-week high", high, ((high - price) / price) * 100]);
  }
  if (isNum(low) && low < price) {
    rows.push(["If it revisited its 52-week low", low, ((low - price) / price) * 100]);
  }

  if (rows.length > 0) {
    const list = document.createElement("div");
    list.className = "scenario-list";
    rows.forEach(([label, target, pct]) => {
      const row = document.createElement("div");
      row.className = "scenario-row";
      const labelEl = document.createElement("span");
      labelEl.className = "scenario-label";
      labelEl.textContent = label;
      const valEl = document.createElement("span");
      valEl.className = "scenario-value " + (pct >= 0 ? "positive" : "negative");
      valEl.textContent = `${formatCurrency(target)} (${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%)`;
      row.appendChild(labelEl);
      row.appendChild(valEl);
      list.appendChild(row);
    });
    scenarioContent.appendChild(list);
  }

  if (isNum(beta)) {
    const betaNote = document.createElement("p");
    betaNote.className = "muted small";
    betaNote.textContent = `Beta of ${beta.toFixed(2)} means this stock has historically moved about ${beta.toFixed(1)}× as much as the overall market — a rough sense of how wide future swings could be, in either direction.`;
    scenarioContent.appendChild(betaNote);
  }

  const disclaimer = document.createElement("p");
  disclaimer.className = "muted small scenario-disclaimer";
  disclaimer.textContent = "These are the stock's own historical high/low re-expressed as reference points — not a prediction of where the price is headed. No free (or paid) data source can honestly forecast future prices; treat any tool that claims to as suspect.";
  scenarioContent.appendChild(disclaimer);
}

function renderOutlook(data) {
  const outlook = data.type === "etf" ? generateETFOutlook(data)
    : data.type === "crypto" ? generateCryptoOutlook(data)
    : generateOutlook(data);
  outlookHeadline.textContent = outlook.headline;
  outlookBullets.innerHTML = "";
  outlook.bullets.forEach(b => {
    const li = document.createElement("li");
    li.textContent = b;
    outlookBullets.appendChild(li);
  });
  outlookCaveat.textContent = outlook.caveat;
}

function makeIndicatorCard(label, value, defKey, isPercent) {
  const wrap = document.createElement("div");
  wrap.className = "indicator";

  const labelRow = document.createElement("div");
  labelRow.className = "indicator-label";
  const labelText = document.createElement("span");
  labelText.textContent = label;
  labelRow.appendChild(labelText);

  const light = isNum(value) ? getTrafficLight(defKey, value, currentBucket) : null;
  if (light) {
    const dot = document.createElement("span");
    dot.className = `traffic-dot traffic-${light}`;
    dot.title = TRAFFIC_LABELS[light];
    labelRow.appendChild(dot);
  }

  const helpBtn = document.createElement("button");
  helpBtn.className = "help-btn";
  helpBtn.textContent = "?";
  helpBtn.addEventListener("click", () => showTooltip(label, defKey, isNum(value) ? value : undefined));
  labelRow.appendChild(helpBtn);

  const valueRow = document.createElement("div");
  valueRow.className = "indicator-value";
  if (!isNum(value)) {
    valueRow.textContent = "N/A";
  } else if (isPercent) {
    valueRow.textContent = `${value.toFixed(2)}%`;
  } else {
    valueRow.textContent = value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  if (light) {
    const badge = document.createElement("span");
    badge.className = `traffic-label traffic-label-${light}`;
    badge.textContent = TRAFFIC_LABELS[light];
    valueRow.appendChild(badge);
  }

  wrap.appendChild(labelRow);
  wrap.appendChild(valueRow);
  return wrap;
}

function showTooltip(label, defKey, value) {
  const def = DEFINITIONS[defKey];
  tooltipTerm.textContent = label;
  if (!def) {
    tooltipWhat.textContent = "No definition added yet — add one in definitions.js.";
    tooltipFormula.textContent = "";
    tooltipHigh.textContent = "";
    tooltipLow.textContent = "";
    tooltipSectorDynamic.classList.add("hidden");
    tooltipSector.textContent = "";
  } else {
    tooltipWhat.textContent = def.what;
    tooltipFormula.textContent = def.formula || "";
    tooltipHigh.textContent = def.high;
    tooltipLow.textContent = def.low;

    if (typeof value === "number" && currentIndustry) {
      tooltipSectorDynamic.textContent = getSectorSentence(defKey, value, currentIndustry, currentBucket);
      tooltipSectorDynamic.classList.remove("hidden");
    } else {
      tooltipSectorDynamic.classList.add("hidden");
    }
    tooltipSector.textContent = def.sector || "";
  }
  tooltipOverlay.classList.remove("hidden");
  tooltipPopup.classList.remove("hidden");
}

function hideTooltip() {
  tooltipOverlay.classList.add("hidden");
  tooltipPopup.classList.add("hidden");
}

// ---- Init ----
document.getElementById("recommendationHelpBtn").addEventListener("click", () => showTooltip("Analyst Recommendations", "recommendation"));
document.getElementById("rangeHelpBtn").addEventListener("click", () => showTooltip("52-Week Range", "fiftyTwoWeekRangeContext"));
document.getElementById("rsiHelpBtn").addEventListener("click", () => showTooltip("RSI (14)", "rsi"));
document.getElementById("macdHelpBtn").addEventListener("click", () => showTooltip("MACD (12, 26, 9)", "macd"));
document.getElementById("sharesHelpBtn").addEventListener("click", () => showTooltip("Shares Breakdown", "sharesBreakdown"));
document.getElementById("insiderHelpBtn").addEventListener("click", () => showTooltip("Insider Transactions", "insiderTransactions"));
