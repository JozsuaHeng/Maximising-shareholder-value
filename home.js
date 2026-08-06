// home.js — tabbed home page: curated categories, dynamically-computed
// Winners/Losers/Most Active, a Macro tab (FRED), and a grid/heatmap view
// toggle. Depends on finnhubUrl()/fetchJSON()/isNum()/formatCurrency()/
// displaySymbol()/loadTicker()/renderNews() from script.js, so this file
// must load after it.
//
// Only the active tab's data is fetched, and each category is fetched
// once and cached in `homeState.quotes` for the rest of the session — so
// browsing a couple of tabs costs far fewer requests than the old
// all-categories-at-once layout, while Winners/Losers/Most Active (which
// need every category's data to rank) fetch whatever isn't loaded yet on
// first visit to one of those tabs.

const CRYPTO_COINGECKO_IDS = {
  "BINANCE:BTCUSDT": "bitcoin",
  "BINANCE:ETHUSDT": "ethereum",
  "BINANCE:SOLUSDT": "solana",
  "BINANCE:XRPUSDT": "ripple",
  "BINANCE:DOGEUSDT": "dogecoin",
  "BINANCE:ADAUSDT": "cardano",
};

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

const HOME_CATEGORIES = [
  { id: "trending-tech", title: "Trending Tech", items: [["AAPL", "Apple"], ["MSFT", "Microsoft"], ["GOOGL", "Alphabet"], ["AMZN", "Amazon"], ["NVDA", "Nvidia"], ["META", "Meta"]] },
  { id: "blue-chip", title: "Blue Chip", items: [["JNJ", "Johnson & Johnson"], ["PG", "Procter & Gamble"], ["KO", "Coca-Cola"], ["JPM", "JPMorgan Chase"], ["V", "Visa"], ["WMT", "Walmart"]] },
  { id: "dividend-payers", title: "Dividend Payers", items: [["T", "AT&T"], ["XOM", "ExxonMobil"], ["VZ", "Verizon"], ["PFE", "Pfizer"], ["MO", "Altria"], ["IBM", "IBM"]] },
  { id: "growth", title: "Growth", items: [["TSLA", "Tesla"], ["NFLX", "Netflix"], ["SHOP", "Shopify"], ["PLTR", "Palantir"], ["CRWD", "CrowdStrike"], ["AMD", "AMD"]] },
  { id: "etfs", title: "ETFs", items: [["SPY", "S&P 500"], ["QQQ", "Nasdaq 100"], ["VTI", "Total Market"], ["DIA", "Dow Jones"], ["IWM", "Russell 2000"], ["VOO", "S&P 500 (Vanguard)"]] },
  { id: "bond-etfs", title: "Bond ETFs", items: [["TLT", "20+Y Treasury"], ["BND", "Total Bond Market"], ["AGG", "US Aggregate Bond"], ["HYG", "High Yield Corp"], ["IEF", "7-10Y Treasury"], ["LQD", "Investment Grade Corp"]] },
  { id: "crypto", title: "Crypto", items: [["BINANCE:BTCUSDT", "Bitcoin"], ["BINANCE:ETHUSDT", "Ethereum"], ["BINANCE:SOLUSDT", "Solana"], ["BINANCE:XRPUSDT", "XRP"], ["BINANCE:DOGEUSDT", "Dogecoin"], ["BINANCE:ADAUSDT", "Cardano"]] },
];

const DYNAMIC_TABS = [
  { id: "winners", title: "Winners" },
  { id: "losers", title: "Losers" },
  { id: "active", title: "Most Active" },
];

const homeState = {
  activeTab: "trending-tech", // cheap default (one category, 6 calls) rather than a dynamic tab (needs all categories)
  viewMode: "grid",
  quotes: {}, // symbol -> { symbol, name, quote, categoryId }
  loadedCategoryIds: new Set(),
};

const homeTabsEl = document.getElementById("homeTabs");
const homeContentEl = document.getElementById("homeContent");
const homeViewToggleEl = document.getElementById("homeViewToggle");
const homeNewsListEl = document.getElementById("homeNewsList");

function initHome() {
  buildTabs();
  buildViewToggle();
  switchTab(homeState.activeTab);
  loadMarketNews();
}

function buildTabs() {
  homeTabsEl.innerHTML = "";
  const allTabs = [...DYNAMIC_TABS, ...HOME_CATEGORIES, { id: "macro", title: "Macro" }];
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

  const isMacro = tabId === "macro";
  homeViewToggleEl.classList.toggle("hidden", isMacro);

  if (isMacro) {
    renderMacroTab();
    return;
  }

  homeContentEl.innerHTML = '<p class="muted">Loading...</p>';
  const isDynamic = DYNAMIC_TABS.some(t => t.id === tabId);
  if (isDynamic) {
    await ensureAllCategoriesLoaded();
  } else {
    await ensureCategoryLoaded(tabId);
  }

  // The user may have clicked a different tab while this one was still
  // loading — only render if this is still the tab they're looking at.
  if (homeState.activeTab === tabId) renderActiveTab();
}

async function ensureCategoryLoaded(categoryId) {
  if (homeState.loadedCategoryIds.has(categoryId)) return;
  const cat = HOME_CATEGORIES.find(c => c.id === categoryId);
  if (!cat) return;

  if (categoryId === "crypto") {
    await loadCryptoQuotes(cat);
  } else {
    await Promise.all(cat.items.map(async ([symbol, name]) => {
      try {
        const q = await fetchJSON(finnhubUrl("/quote", { symbol }));
        if (isNum(q.c) && q.c !== 0) {
          homeState.quotes[symbol] = { symbol, name, quote: q, categoryId };
        }
      } catch {
        // leave this symbol unset — it just won't appear in results
      }
    }));
  }
  homeState.loadedCategoryIds.add(categoryId);
}

async function loadCryptoQuotes(cat) {
  try {
    const ids = cat.items.map(([symbol]) => CRYPTO_COINGECKO_IDS[symbol]).join(",");
    const data = await fetchJSON(coingeckoUrl({ ids, vs_currencies: "usd", include_24hr_change: "true" }));
    cat.items.forEach(([symbol, name]) => {
      const entry = data[CRYPTO_COINGECKO_IDS[symbol]];
      if (entry && isNum(entry.usd)) {
        homeState.quotes[symbol] = {
          symbol, name,
          quote: { c: entry.usd, dp: entry.usd_24h_change ?? 0 },
          categoryId: "crypto",
        };
      }
    });
  } catch {
    // leave crypto symbols unset
  }
}

async function ensureAllCategoriesLoaded() {
  const remaining = HOME_CATEGORIES.filter(c => !homeState.loadedCategoryIds.has(c.id));
  await Promise.all(remaining.map((cat, i) => new Promise(resolve => {
    setTimeout(() => { ensureCategoryLoaded(cat.id).then(resolve); }, i * 200);
  })));
}

function renderActiveTab() {
  const tabId = homeState.activeTab;
  let items;

  if (tabId === "winners" || tabId === "losers" || tabId === "active") {
    const all = Object.values(homeState.quotes);
    if (tabId === "winners") {
      items = all.filter(q => (q.quote.dp ?? 0) > 0).sort((a, b) => (b.quote.dp ?? 0) - (a.quote.dp ?? 0)).slice(0, 12);
    } else if (tabId === "losers") {
      items = all.filter(q => (q.quote.dp ?? 0) < 0).sort((a, b) => (a.quote.dp ?? 0) - (b.quote.dp ?? 0)).slice(0, 12);
    } else {
      items = [...all].sort((a, b) => Math.abs(b.quote.dp ?? 0) - Math.abs(a.quote.dp ?? 0)).slice(0, 12);
    }
  } else {
    const cat = HOME_CATEGORIES.find(c => c.id === tabId);
    if (!cat) { homeContentEl.innerHTML = ""; return; }
    items = cat.items.map(([symbol]) => homeState.quotes[symbol]).filter(Boolean);
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
// be — that needs profile2 data for all 42 symbols, doubling requests for
// a homepage feature). Color intensity carries the signal instead.
function heatColor(changePct) {
  const clamped = Math.max(-8, Math.min(8, changePct || 0));
  const intensity = 0.18 + (Math.abs(clamped) / 8) * 0.6;
  return clamped >= 0 ? `rgba(27,175,122,${intensity})` : `rgba(208,59,59,${intensity})`;
}

// ---- Macro tab (FRED) ----
const MACRO_SERIES = [
  { id: "FEDFUNDS", label: "Fed Funds Rate", defKey: null, unit: "%", params: {} },
  { id: "CPIAUCSL", label: "Inflation (CPI, YoY)", defKey: null, unit: "%", params: { units: "pc1" } },
  { id: "UNRATE", label: "Unemployment Rate", defKey: null, unit: "%", params: {} },
  { id: "DGS10", label: "10-Year Treasury Yield", defKey: null, unit: "%", params: {} },
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

function loadMarketNews() {
  fetchJSON(finnhubUrl("/news", { category: "general" }))
    .then(items => renderNews(items.slice(0, 8), homeNewsListEl))
    .catch(() => { homeNewsListEl.innerHTML = '<p class="muted">Couldn\'t load market news right now.</p>'; });
}

initHome();
