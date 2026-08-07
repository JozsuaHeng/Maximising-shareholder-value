// home.js — tabbed home page: curated browse categories, dynamically-
// computed Winners/Losers/Most Active, Crypto, a Macro tab (FRED), and a
// grid/heatmap view toggle. Depends on finnhubUrl()/fetchJSON()/isNum()/
// formatCurrency()/displaySymbol()/loadTicker()/renderNews() from
// script.js, so this file must load after it.
//
// Two different kinds of tab, deliberately decoupled:
// - BROWSE_CATEGORIES: name + ticker only, no live data fetched at all —
//   so these can be as long a list as makes sense with zero API cost.
//   Click through to the real deep-dive page for actual numbers.
// - Winners/Losers/Most Active/Crypto: need real quotes to be meaningful
//   at all, so they draw from a smaller, separate RANKING_STOCK_SYMBOLS
//   universe (the original curated ~36) — kept small specifically to
//   control API cost, independent of how long the browse lists get.

const CRYPTO_COINGECKO_IDS = {
  "BINANCE:BTCUSDT": "bitcoin",
  "BINANCE:ETHUSDT": "ethereum",
  "BINANCE:SOLUSDT": "solana",
  "BINANCE:XRPUSDT": "ripple",
  "BINANCE:DOGEUSDT": "dogecoin",
  "BINANCE:ADAUSDT": "cardano",
};
const CRYPTO_ITEMS = Object.keys(CRYPTO_COINGECKO_IDS).map(symbol => [symbol, { bitcoin: "Bitcoin", ethereum: "Ethereum", solana: "Solana", ripple: "XRP", dogecoin: "Dogecoin", cardano: "Cardano" }[CRYPTO_COINGECKO_IDS[symbol]]]);

// FRED has no CORS support at all (confirmed directly), so unlike
// Finnhub/Twelve Data/CoinGecko, it can't be called directly even from
// local dev — this always goes through the deployed Worker.
const FRED_PROXY_BASE = "https://maximising-shareholder-value.jozsua-heng.workers.dev";

function coingeckoUrl(params) {
  const search = new URLSearchParams(params || {});
  if (IS_LOCAL_DEV) {
    if (typeof COINGECKO_API_KEY !== "undefined" && COINGECKO_API_KEY && COINGECKO_API_KEY !== "YOUR_COINGECKO_KEY_HERE") {
      search.set("x_cg_demo_api_key", COINGECKO_API_KEY);
    }
    return `https://api.coingecko.com/api/v3/simple/price?${search.toString()}`;
  }
  search.set("path", "/simple/price");
  return `/api/coingecko?${search.toString()}`;
}

function fredUrl(seriesId, extraParams) {
  const search = new URLSearchParams({
    path: "/series/observations",
    series_id: seriesId,
    file_type: "json",
    sort_order: "desc",
    limit: "1",
    ...extraParams,
  });
  return `${FRED_PROXY_BASE}/api/fred?${search.toString()}`;
}

// Browsable only — no quotes ever fetched for these, so length is free.
const BROWSE_CATEGORIES = [
  { id: "trending-tech", title: "Trending Tech", items: [["AAPL", "Apple"], ["MSFT", "Microsoft"], ["GOOGL", "Alphabet"], ["AMZN", "Amazon"], ["NVDA", "Nvidia"], ["META", "Meta"], ["ORCL", "Oracle"], ["ADBE", "Adobe"], ["INTC", "Intel"], ["CSCO", "Cisco"], ["UBER", "Uber"], ["ABNB", "Airbnb"]] },
  { id: "blue-chip", title: "Blue Chip", items: [["JNJ", "Johnson & Johnson"], ["PG", "Procter & Gamble"], ["KO", "Coca-Cola"], ["JPM", "JPMorgan Chase"], ["V", "Visa"], ["WMT", "Walmart"], ["MCD", "McDonald's"], ["DIS", "Disney"], ["HD", "Home Depot"], ["UNH", "UnitedHealth"], ["COST", "Costco"], ["PEP", "PepsiCo"]] },
  { id: "dividend-payers", title: "Dividend Payers", items: [["T", "AT&T"], ["XOM", "ExxonMobil"], ["VZ", "Verizon"], ["PFE", "Pfizer"], ["MO", "Altria"], ["IBM", "IBM"], ["CVX", "Chevron"], ["MMM", "3M"], ["KMI", "Kinder Morgan"], ["O", "Realty Income"], ["D", "Dominion Energy"], ["SO", "Southern Company"]] },
  { id: "growth", title: "Growth", items: [["TSLA", "Tesla"], ["NFLX", "Netflix"], ["SHOP", "Shopify"], ["PLTR", "Palantir"], ["CRWD", "CrowdStrike"], ["AMD", "AMD"], ["RBLX", "Roblox"], ["DDOG", "Datadog"], ["ZS", "Zscaler"], ["NET", "Cloudflare"], ["SNOW", "Snowflake"], ["ROKU", "Roku"]] },
  { id: "etfs", title: "ETFs", items: [["SPY", "S&P 500"], ["QQQ", "Nasdaq 100"], ["VTI", "Total Market"], ["DIA", "Dow Jones"], ["IWM", "Russell 2000"], ["VOO", "S&P 500 (Vanguard)"], ["ARKK", "ARK Innovation"], ["XLK", "Technology Sector"], ["XLF", "Financial Sector"], ["XLE", "Energy Sector"], ["EFA", "Developed Markets"], ["EEM", "Emerging Markets"]] },
  { id: "bond-etfs", title: "Bond ETFs", items: [["TLT", "20+Y Treasury"], ["BND", "Total Bond Market"], ["AGG", "US Aggregate Bond"], ["HYG", "High Yield Corp"], ["IEF", "7-10Y Treasury"], ["LQD", "Investment Grade Corp"], ["MUB", "National Muni Bond"], ["SHY", "1-3Y Treasury"], ["VCIT", "Intermediate Corp Bond"], ["EMB", "Emerging Markets Bond"], ["JNK", "High Yield Bond"], ["BIV", "Intermediate-Term Bond"]] },
];

// Small, curated universe used ONLY to rank Winners/Losers/Most Active —
// the original 6-per-category set, kept separate from the (now much
// longer) browse lists above so ranking cost doesn't grow with them.
// Trimmed from 6 to 4 per category (36 -> 24 symbols, 2026-08-07) to cut
// real Finnhub usage — this is the single biggest cost center in the app
// (a first-ever visit to Winners/Losers/Most Active fires one quote call
// per symbol here, all at once). ETF/bond rows lost DIA/IWM and AGG/IEF
// specifically since DIA/IWM are already covered by the homepage's index
// strip (home.js loadIndexStrip) — no loss of information, just no
// double-fetching the same names two different ways.
const RANKING_STOCK_SYMBOLS = [
  ["AAPL", "Apple"], ["MSFT", "Microsoft"], ["NVDA", "Nvidia"], ["META", "Meta"],
  ["JNJ", "Johnson & Johnson"], ["PG", "Procter & Gamble"], ["JPM", "JPMorgan Chase"], ["WMT", "Walmart"],
  ["T", "AT&T"], ["XOM", "ExxonMobil"], ["PFE", "Pfizer"], ["IBM", "IBM"],
  ["TSLA", "Tesla"], ["NFLX", "Netflix"], ["PLTR", "Palantir"], ["AMD", "AMD"],
  ["SPY", "S&P 500"], ["QQQ", "Nasdaq 100"], ["VTI", "Total Market"], ["VOO", "S&P 500 (Vanguard)"],
  ["TLT", "20+Y Treasury"], ["BND", "Total Bond Market"], ["HYG", "High Yield Corp"], ["LQD", "Investment Grade Corp"],
];

const DYNAMIC_TABS = [
  { id: "winners", title: "Winners" },
  { id: "losers", title: "Losers" },
  { id: "active", title: "Most Active" },
];

const homeState = {
  activeTab: "trending-tech", // cheap default — a browse category costs zero API calls
  viewMode: "grid",
  quotes: {}, // ranking-universe symbol -> { symbol, name, quote }
  rankingLoaded: false,
  cryptoLoaded: false,
};

const homeTabsEl = document.getElementById("homeTabs");
const homeContentEl = document.getElementById("homeContent");
const homeViewToggleEl = document.getElementById("homeViewToggle");
const homeNewsListEl = document.getElementById("homeNewsList");
const indexStripEl = document.getElementById("indexStrip");
const recentlyViewedRowEl = document.getElementById("recentlyViewedRow");

// A small, fixed set of index proxies — 4 quote calls, once per homepage
// visit, cached for the session. Deliberately NOT tied to any tab (always
// visible) since a "what's the market doing right now" strip is exactly
// the kind of thing Yahoo Finance-style pages lead with.
const INDEX_STRIP_SYMBOLS = [
  ["SPY", "S&P 500"],
  ["QQQ", "Nasdaq 100"],
  ["DIA", "Dow Jones"],
  ["IWM", "Russell 2000"],
];

function initHome() {
  buildTabs();
  buildViewToggle();
  switchTab(homeState.activeTab);
  loadMarketNews();
  loadIndexStrip();
  renderRecentlyViewed();
}

async function loadIndexStrip() {
  indexStripEl.innerHTML = INDEX_STRIP_SYMBOLS.map(([symbol, name]) =>
    `<div class="index-chip" data-symbol="${symbol}"><span class="index-chip-name">${name}</span><span class="index-chip-value muted">···</span></div>`
  ).join("");

  const results = await Promise.all(INDEX_STRIP_SYMBOLS.map(async ([symbol]) => {
    try {
      const q = await fetchJSON(finnhubUrl("/quote", { symbol }));
      return isNum(q.c) && q.c !== 0 ? { symbol, quote: q } : null;
    } catch {
      return null;
    }
  }));

  results.forEach(r => {
    if (!r) return;
    const chip = indexStripEl.querySelector(`.index-chip[data-symbol="${r.symbol}"] .index-chip-value`);
    if (!chip) return;
    const dp = r.quote.dp ?? 0;
    chip.classList.remove("muted");
    chip.classList.add(dp >= 0 ? "positive" : "negative");
    chip.textContent = `${formatCurrency(r.quote.c)} (${dp >= 0 ? "+" : ""}${dp.toFixed(2)}%)`;
  });

  Array.from(indexStripEl.children).forEach(chip => {
    chip.addEventListener("click", () => loadTicker(chip.dataset.symbol));
  });
}

// Zero API cost — reads what script.js already saved to localStorage
// after each successful ticker load. Name-only chips, same as browse
// categories, so revisiting one is free until actually clicked.
function renderRecentlyViewed() {
  const recent = getRecentlyViewed();
  if (recent.length === 0) {
    recentlyViewedRowEl.classList.add("hidden");
    return;
  }
  recentlyViewedRowEl.classList.remove("hidden");
  recentlyViewedRowEl.innerHTML = '<span class="recently-viewed-label">Recently viewed</span>';
  recent.forEach(({ symbol, name }) => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "recently-viewed-chip";
    chip.innerHTML = `<strong>${symbol}</strong><span class="muted">${name}</span>`;
    chip.addEventListener("click", () => loadTicker(symbol));
    recentlyViewedRowEl.appendChild(chip);
  });
}

function buildTabs() {
  homeTabsEl.innerHTML = "";
  const allTabs = [...DYNAMIC_TABS, ...BROWSE_CATEGORIES, { id: "crypto", title: "Crypto" }, { id: "macro", title: "Macro" }];
  allTabs.forEach(tab => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "home-tab" + (tab.id === homeState.activeTab ? " active" : "");
    btn.textContent = tab.title;
    btn.dataset.tabId = tab.id;
    btn.addEventListener("click", () => switchTab(tab.id));
    homeTabsEl.appendChild(btn);
  });
}

function buildViewToggle() {
  homeViewToggleEl.querySelectorAll("button").forEach(btn => {
    btn.addEventListener("click", () => {
      homeState.viewMode = btn.dataset.mode;
      homeViewToggleEl.querySelectorAll("button").forEach(b => b.classList.toggle("active", b === btn));
      renderActiveTab();
    });
  });
}

async function switchTab(tabId) {
  homeState.activeTab = tabId;
  Array.from(homeTabsEl.children).forEach(btn => btn.classList.toggle("active", btn.dataset.tabId === tabId));

  if (tabId === "macro") {
    homeViewToggleEl.classList.add("hidden");
    renderMacroTab();
    return;
  }

  const isDynamic = DYNAMIC_TABS.some(t => t.id === tabId);
  const isCrypto = tabId === "crypto";

  // Grid/Heatmap only makes sense where there's a live % change to color
  // by — browse categories (name + ticker only) don't have one.
  homeViewToggleEl.classList.toggle("hidden", !isDynamic && !isCrypto);

  if (!isDynamic && !isCrypto) {
    renderBrowseCategory(tabId);
    return;
  }

  homeContentEl.innerHTML = '<p class="muted">Loading...</p>';
  if (isDynamic) {
    await ensureRankingLoaded();
  } else {
    await ensureCryptoLoaded();
  }

  // The user may have clicked a different tab while this one was still
  // loading — only render if this is still the tab they're looking at.
  if (homeState.activeTab === tabId) renderActiveTab();
}

function renderBrowseCategory(tabId) {
  const cat = BROWSE_CATEGORIES.find(c => c.id === tabId);
  homeContentEl.innerHTML = "";
  if (!cat) return;
  homeContentEl.appendChild(buildSimpleGrid(cat.items));
}

async function ensureRankingLoaded() {
  if (homeState.rankingLoaded) return;
  await Promise.all(RANKING_STOCK_SYMBOLS.map(([symbol, name], i) => new Promise(resolve => {
    setTimeout(async () => {
      try {
        const q = await fetchJSON(finnhubUrl("/quote", { symbol }));
        if (isNum(q.c) && q.c !== 0) homeState.quotes[symbol] = { symbol, name, quote: q };
      } catch {
        // leave this symbol unset — it just won't appear in rankings
      }
      resolve();
    }, i * 30); // light stagger across the ranking universe
  })));
  await ensureCryptoLoaded(); // crypto is part of the ranking pool too
  homeState.rankingLoaded = true;
}

async function ensureCryptoLoaded() {
  if (homeState.cryptoLoaded) return;
  try {
    const ids = CRYPTO_ITEMS.map(([symbol]) => CRYPTO_COINGECKO_IDS[symbol]).join(",");
    const data = await fetchJSON(coingeckoUrl({ ids, vs_currencies: "usd", include_24hr_change: "true" }));
    CRYPTO_ITEMS.forEach(([symbol, name]) => {
      const entry = data[CRYPTO_COINGECKO_IDS[symbol]];
      if (entry && isNum(entry.usd)) {
        homeState.quotes[symbol] = { symbol, name, quote: { c: entry.usd, dp: entry.usd_24h_change ?? 0 } };
      }
    });
    homeState.cryptoLoaded = true;
  } catch {
    // leave crypto symbols unset
  }
}

function renderActiveTab() {
  const tabId = homeState.activeTab;
  let items;

  if (tabId === "crypto") {
    items = CRYPTO_ITEMS.map(([symbol]) => homeState.quotes[symbol]).filter(Boolean);
  } else if (tabId === "winners" || tabId === "losers" || tabId === "active") {
    const all = Object.values(homeState.quotes);
    if (tabId === "winners") {
      items = all.filter(q => (q.quote.dp ?? 0) > 0).sort((a, b) => (b.quote.dp ?? 0) - (a.quote.dp ?? 0)).slice(0, 12);
    } else if (tabId === "losers") {
      items = all.filter(q => (q.quote.dp ?? 0) < 0).sort((a, b) => (a.quote.dp ?? 0) - (b.quote.dp ?? 0)).slice(0, 12);
    } else {
      items = [...all].sort((a, b) => Math.abs(b.quote.dp ?? 0) - Math.abs(a.quote.dp ?? 0)).slice(0, 12);
    }
  } else {
    homeContentEl.innerHTML = "";
    return;
  }

  homeContentEl.innerHTML = "";

  if (items.length === 0) {
    homeContentEl.innerHTML = '<p class="muted">No data available right now — this can happen if the free data tier is temporarily rate-limited. Try switching tabs again in a moment.</p>';
    return;
  }

  homeContentEl.appendChild(homeState.viewMode === "heatmap" ? buildHeatmap(items) : buildGrid(items));

  if (tabId === "active") {
    const note = document.createElement("p");
    note.className = "muted small home-note";
    note.textContent = "Ranked by size of today's price move — real trading volume isn't available on the free data tier.";
    homeContentEl.appendChild(note);
  }
}

// Name + ticker only — no quote, no fetch. Used for the browse categories.
function buildSimpleGrid(items) {
  const row = document.createElement("div");
  row.className = "home-chip-row home-chip-row-tab";
  items.forEach(([symbol, name]) => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "home-chip home-chip-simple";
    chip.innerHTML = `
      <span class="home-chip-name">${name}</span>
      <span class="home-chip-symbol">${displaySymbol(symbol)}</span>
    `;
    chip.addEventListener("click", () => loadTicker(symbol));
    row.appendChild(chip);
  });
  return row;
}

function buildGrid(items) {
  const row = document.createElement("div");
  row.className = "home-chip-row home-chip-row-tab";
  items.forEach(({ symbol, name, quote }) => {
    const chip = document.createElement("button");
    chip.type = "button";
    const change = quote.dp ?? 0;
    const up = change >= 0;
    chip.className = "home-chip " + (up ? "chip-up" : "chip-down");
    chip.innerHTML = `
      <span class="home-chip-name">${name}</span>
      <span class="home-chip-symbol">${displaySymbol(symbol)}</span>
      <span class="home-chip-price ${up ? "positive" : "negative"}">
        <span class="home-chip-arrow">${up ? "▲" : "▼"}</span>${formatCurrency(quote.c)}
        <span class="home-chip-pct">${up ? "+" : ""}${change.toFixed(1)}%</span>
      </span>
    `;
    chip.addEventListener("click", () => loadTicker(symbol));
    row.appendChild(chip);
  });
  return row;
}

function buildHeatmap(items) {
  const grid = document.createElement("div");
  grid.className = "heatmap-grid";
  items.forEach(({ symbol, name, quote }) => {
    const change = quote.dp ?? 0;
    const tile = document.createElement("button");
    tile.type = "button";
    tile.className = "heatmap-tile";
    tile.style.background = heatColor(change);
    tile.title = `${name} — ${formatCurrency(quote.c)}`;
    tile.innerHTML = `
      <span class="heatmap-symbol">${displaySymbol(symbol)}</span>
      <span class="heatmap-change">${change >= 0 ? "+" : ""}${change.toFixed(1)}%</span>
    `;
    tile.addEventListener("click", () => loadTicker(symbol));
    grid.appendChild(tile);
  });
  return grid;
}

// Uniform tile size (not sized by market cap like a "real" treemap would
// be — that needs profile2 data for every symbol shown, doubling
// requests for a homepage feature). Color intensity carries the signal.
function heatColor(changePct) {
  const clamped = Math.max(-8, Math.min(8, changePct || 0));
  const intensity = 0.18 + (Math.abs(clamped) / 8) * 0.6;
  return clamped >= 0 ? `rgba(27,175,122,${intensity})` : `rgba(208,59,59,${intensity})`;
}

// ---- Macro tab (FRED) ----
const MACRO_SERIES = [
  { id: "FEDFUNDS", label: "Fed Funds Rate", unit: "%", params: {} },
  { id: "CPIAUCSL", label: "Inflation (CPI, YoY)", unit: "%", params: { units: "pc1" } },
  { id: "UNRATE", label: "Unemployment Rate", unit: "%", params: {} },
  { id: "DGS10", label: "10-Year Treasury Yield", unit: "%", params: {} },
];

async function renderMacroTab() {
  if (typeof FRED_API_KEY === "undefined" || !FRED_API_KEY || FRED_API_KEY === "YOUR_FRED_KEY_HERE") {
    homeContentEl.innerHTML = '<p class="muted">Add a free FRED API key to config.js to enable this tab (Fed funds rate, inflation, unemployment, 10-year treasury yield). See README.md.</p>';
    return;
  }

  homeContentEl.innerHTML = '<p class="muted">Loading...</p>';

  const results = await Promise.allSettled(MACRO_SERIES.map(async series => {
    const data = await fetchJSON(fredUrl(series.id, series.params));
    const obs = data.observations && data.observations[0];
    return { value: obs ? parseFloat(obs.value) : null, date: obs ? obs.date : null };
  }));

  const grid = document.createElement("div");
  grid.className = "grid macro-grid";
  results.forEach((r, i) => {
    const series = MACRO_SERIES[i];
    const card = document.createElement("div");
    card.className = "indicator";

    const label = document.createElement("div");
    label.className = "indicator-label";
    label.textContent = series.label;

    const value = document.createElement("div");
    value.className = "indicator-value";
    if (r.status === "fulfilled" && isNum(r.value.value)) {
      value.textContent = `${r.value.value.toFixed(2)}${series.unit}`;
      const dateNote = document.createElement("div");
      dateNote.className = "macro-date";
      dateNote.textContent = `As of ${r.value.date}`;
      card.appendChild(label);
      card.appendChild(value);
      card.appendChild(dateNote);
    } else {
      value.textContent = "N/A";
      card.appendChild(label);
      card.appendChild(value);
    }
    grid.appendChild(card);
  });

  homeContentEl.innerHTML = "";
  homeContentEl.appendChild(grid);

  const note = document.createElement("p");
  note.className = "muted small home-note";
  note.textContent = "US economic indicators from the Federal Reserve (FRED). These update monthly or quarterly, not daily — don't expect them to move on every visit.";
  homeContentEl.appendChild(note);
}

const NEWS_CATEGORY_COLORS = {
  business: "#1baf7a", general: "#7ea0ff", forex: "#e0ab2e", crypto: "#c77dff", merger: "#e66767", technology: "#3ddc84",
};

function loadMarketNews() {
  fetchJSON(finnhubUrl("/news", { category: "general" }))
    .then(items => renderHomeNews(items.slice(0, 9)))
    .catch(() => { homeNewsListEl.innerHTML = '<p class="muted">Couldn\'t load market news right now.</p>'; });
}

// Richer visual treatment than the plain list used elsewhere (ticker-page
// company news) — same /news response, no extra API cost, just using
// more of what Finnhub already returns (image, category) plus a featured
// "hero" story up top. Falls back to a colored initial-letter badge if an
// item has no image or its image fails to load.
function renderHomeNews(items) {
  homeNewsListEl.innerHTML = "";
  if (!items || items.length === 0) {
    homeNewsListEl.innerHTML = '<p class="muted">No recent news found.</p>';
    return;
  }

  const sorted = [...items].sort((a, b) => b.datetime - a.datetime);
  const [hero, ...rest] = sorted;

  const wrap = document.createElement("div");
  wrap.className = "home-news-wrap";

  wrap.appendChild(buildNewsCard(hero, true));

  const grid = document.createElement("div");
  grid.className = "home-news-grid";
  rest.forEach(item => grid.appendChild(buildNewsCard(item, false)));
  wrap.appendChild(grid);

  homeNewsListEl.appendChild(wrap);
}

function buildNewsCard(item, isHero) {
  const source = item.source || "Unknown";
  const card = document.createElement("a");
  card.className = isHero ? "home-news-hero" : "home-news-card";
  card.href = item.url;
  card.target = "_blank";
  card.rel = "noopener noreferrer";

  const media = document.createElement("div");
  media.className = isHero ? "home-news-hero-media" : "home-news-card-media";
  if (item.image) {
    const img = document.createElement("img");
    img.src = item.image;
    img.alt = "";
    img.loading = "lazy";
    img.onerror = () => { media.innerHTML = ""; media.style.background = colorFromString(source); media.textContent = source.charAt(0).toUpperCase(); };
    media.appendChild(img);
  } else {
    media.style.background = colorFromString(source);
    media.textContent = source.charAt(0).toUpperCase();
  }
  card.appendChild(media);

  const body = document.createElement("div");
  body.className = "home-news-body";

  const metaRow = document.createElement("div");
  metaRow.className = "home-news-meta-row";
  if (item.category) {
    const catBadge = document.createElement("span");
    catBadge.className = "home-news-category";
    catBadge.style.color = NEWS_CATEGORY_COLORS[item.category] || "var(--accent)";
    catBadge.style.borderColor = NEWS_CATEGORY_COLORS[item.category] || "var(--accent)";
    catBadge.textContent = item.category;
    metaRow.appendChild(catBadge);
  }
  const metaText = document.createElement("span");
  metaText.className = "muted small";
  metaText.textContent = `${source} · ${formatRelativeTime(new Date((item.datetime || 0) * 1000))}`;
  metaRow.appendChild(metaText);

  const headline = document.createElement("div");
  headline.className = isHero ? "home-news-hero-headline" : "home-news-card-headline";
  headline.textContent = item.headline || "";

  body.appendChild(metaRow);
  body.appendChild(headline);
  if (isHero && item.summary) {
    const summary = document.createElement("p");
    summary.className = "home-news-hero-summary muted small";
    summary.textContent = item.summary;
    body.appendChild(summary);
  }
  card.appendChild(body);

  return card;
}

initHome();
