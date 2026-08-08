// "Global Markets" homepage panel — a real, geographically-accurate world
// map (worldmap.svg — public domain, CIA World Factbook base map via
// Wikimedia Commons, equirectangular projection) with exchange markers
// placed using their real latitude/longitude, and live open/closed status
// computed entirely from real timezone data via the browser's built-in
// Intl API (same zero-network-call technique clock.js uses for the header
// clock). No API calls beyond the one-time fetch of the static SVG file.
//
// Calibration: confirmed directly (2026-08-07) that this specific file's
// viewBox maps lon/lat to x/y with the plain equirectangular formula
//   x = (lon + 180) / 360 * viewBoxWidth
//   y = (90 - lat) / 180 * viewBoxHeight
// by overlaying reference lines at known cities and checking they landed
// on the correct landmass — don't assume this holds for a different map
// file without re-checking the same way.
//
// Trading hours are each exchange's normal weekday regular session in
// local time — doesn't account for local public holidays (no free data
// source for that used elsewhere in this app either), so "open" here
// means "within normal hours on a weekday," not a guarantee it's not a
// holiday closure today.

// `mapCountry` overrides `country` only for finding which landmass to
// highlight on the map — Hong Kong isn't a separate polygon in this map
// file (it's folded into China's), so HKEX highlights China's outline
// instead. `country` itself (used for the deep-dive page's Home Market
// card, matched against Finnhub's real profile2.country) stays accurate.
// `ticker` — a country ETF standing in for each exchange's real index
// (same reasoning as the homepage's other index proxies: Finnhub's free
// tier has no live foreign index data). Quotes come from home.js's
// MARKET_TICKERS fetch (homeState.marketTickers) — this file doesn't
// fetch anything itself, just reads what home.js already pulled.
// `compact: true` — this exchange sits close enough to a neighbor (real
// lon/lat, not a display choice) that showing a full second "TICKER +X%"
// line on the map itself collides with the next city over. Compact
// markers show just the city name on the map (like before) and keep the
// ticker/price/% detail in the hover tooltip only, which already has
// room for it. Non-compact markers get the full always-visible treatment.
const EXCHANGES = [
  { code: "NYSE", name: "NYSE / Nasdaq", ticker: "SPY", city: "New York", country: "US", tz: "America/New_York", open: "09:30", close: "16:00", lat: 40.71, lon: -74.01, compact: true },
  { code: "TSX", name: "Toronto Stock Exchange", ticker: "EWC", city: "Toronto", country: "CA", tz: "America/Toronto", open: "09:30", close: "16:00", lat: 43.65, lon: -79.38, compact: true },
  { code: "B3", name: "B3", ticker: "EWZ", city: "São Paulo", country: "BR", tz: "America/Sao_Paulo", open: "10:00", close: "17:00", lat: -23.55, lon: -46.63 },
  // London/Paris/Frankfurt sit close enough together in real lon/lat that
  // even their city-name-only labels needed nudging apart — see below.
  { code: "LSE", name: "London Stock Exchange", ticker: "EWU", city: "London", country: "GB", tz: "Europe/London", open: "08:00", close: "16:30", lat: 51.51, lon: -0.13, labelAnchor: "end", labelDx: -3.4, compact: true },
  { code: "EPA", name: "Euronext Paris", ticker: "EWQ", city: "Paris", country: "FR", tz: "Europe/Paris", open: "09:00", close: "17:30", lat: 48.86, lon: 2.35, labelDy: 4.6, compact: true },
  { code: "FRA", name: "Deutsche Börse (Xetra)", ticker: "EWG", city: "Frankfurt", country: "DE", tz: "Europe/Berlin", open: "09:00", close: "17:30", lat: 50.11, lon: 8.68, labelAnchor: "start", labelDx: 3.4, compact: true },
  { code: "JSE", name: "Johannesburg Stock Exchange", ticker: "EZA", city: "Johannesburg", country: "ZA", tz: "Africa/Johannesburg", open: "09:00", close: "17:00", lat: -26.20, lon: 28.05 },
  { code: "NSE", name: "National Stock Exchange", ticker: "INDA", city: "Mumbai", country: "IN", tz: "Asia/Kolkata", open: "09:15", close: "15:30", lat: 19.08, lon: 72.88 },
  { code: "SGX", name: "Singapore Exchange", ticker: "EWS", city: "Singapore", country: "SG", tz: "Asia/Singapore", open: "09:00", close: "17:00", lat: 1.35, lon: 103.82 },
  // Shanghai/Hong Kong sit close together too — same nudge treatment.
  { code: "SSE", name: "Shanghai Stock Exchange", ticker: "MCHI", city: "Shanghai", country: "CN", tz: "Asia/Shanghai", open: "09:30", close: "15:00", lat: 31.23, lon: 121.47, labelAnchor: "end", labelDx: -3.4, compact: true },
  { code: "HKEX", name: "Hong Kong Exchange", ticker: "EWH", city: "Hong Kong", country: "HK", mapCountry: "cn", tz: "Asia/Hong_Kong", open: "09:30", close: "16:00", lat: 22.32, lon: 114.17, labelDy: 4.6, compact: true },
  { code: "TSE", name: "Tokyo Stock Exchange", ticker: "EWJ", city: "Tokyo", country: "JP", tz: "Asia/Tokyo", open: "09:00", close: "15:00", lat: 35.68, lon: 139.65 },
  { code: "ASX", name: "Australian Securities Exchange", ticker: "EWA", city: "Sydney", country: "AU", tz: "Australia/Sydney", open: "10:00", close: "16:00", lat: -33.87, lon: 151.21 },
];

function getExchangeStatus(ex) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: ex.tz,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    weekday: "short",
  }).formatToParts(new Date());
  const map = {};
  parts.forEach(p => { map[p.type] = p.value; });
  const hhmm = `${map.hour === "24" ? "00" : map.hour}:${map.minute}`;
  const isWeekday = !["Sat", "Sun"].includes(map.weekday);
  const isOpen = isWeekday && hhmm >= ex.open && hhmm <= ex.close;
  return { isOpen, hhmm };
}

// Used by script.js's ticker deep-dive page (right column) — looks up
// this stock's own listing exchange by country and returns its live
// open/closed status, or null if it's not one of the 13 exchanges above.
function getHomeMarketStatus(countryCode) {
  const ex = EXCHANGES.find(e => e.country === countryCode);
  if (!ex) return null;
  return { ex, ...getExchangeStatus(ex) };
}

let worldMapSvgRoot = null; // cached after the first fetch+inject

async function renderWorldMarkets() {
  const container = document.getElementById("worldMarketsMap");
  if (!container) return;

  if (!worldMapSvgRoot) {
    try {
      const res = await fetch("worldmap.svg");
      const text = await res.text();
      container.innerHTML = text;
      worldMapSvgRoot = container.querySelector("svg");
      if (!worldMapSvgRoot) throw new Error("no <svg> root in worldmap.svg");
      worldMapSvgRoot.classList.add("world-markets-svg");
      worldMapSvgRoot.removeAttribute("width");
      worldMapSvgRoot.removeAttribute("height");
      worldMapSvgRoot.setAttribute("preserveAspectRatio", "xMidYMid meet");
    } catch {
      container.innerHTML = '<p class="muted small">Couldn\'t load the world map.</p>';
      return;
    }
  }

  const svgNS = "http://www.w3.org/2000/svg";
  const vb = worldMapSvgRoot.viewBox.baseVal;
  const lonToX = lon => (lon + 180) / 360 * vb.width;
  const latToY = lat => (90 - lat) / 180 * vb.height;

  // Subtle lon/lat graticule — built once (it never changes) and drawn on
  // top of the land/ocean paths but under the markers, same convention as
  // most reference-line map overlays.
  if (!worldMapSvgRoot.querySelector("#worldMapGridLayer")) {
    const gridLayer = document.createElementNS(svgNS, "g");
    gridLayer.setAttribute("id", "worldMapGridLayer");
    gridLayer.setAttribute("class", "world-map-grid");
    for (let lon = -180; lon <= 180; lon += 30) {
      const line = document.createElementNS(svgNS, "line");
      const x = lonToX(lon);
      line.setAttribute("x1", x); line.setAttribute("x2", x);
      line.setAttribute("y1", 0); line.setAttribute("y2", vb.height);
      gridLayer.appendChild(line);
    }
    for (let lat = -60; lat <= 90; lat += 30) {
      const line = document.createElementNS(svgNS, "line");
      const y = latToY(lat);
      line.setAttribute("x1", 0); line.setAttribute("x2", vb.width);
      line.setAttribute("y1", y); line.setAttribute("y2", y);
      gridLayer.appendChild(line);
    }
    worldMapSvgRoot.appendChild(gridLayer);
  }

  // Highlight the landmass of any country whose exchange is open right
  // now. Country paths carry a "land <iso2>" class (a few also/only carry
  // a matching id — worldmap.svg isn't perfectly consistent), so match on
  // both. Cleared and rebuilt every render since open/closed changes over
  // time.
  worldMapSvgRoot.querySelectorAll(".country-market-open").forEach(el => el.classList.remove("country-market-open"));
  const highlightCountry = code => {
    if (!code) return;
    const c = code.toLowerCase();
    worldMapSvgRoot.querySelectorAll(`.land.${c}`).forEach(el => el.classList.add("country-market-open"));
    worldMapSvgRoot.querySelectorAll(`[id="${c}"]`).forEach(el => el.classList.add("country-market-open"));
  };

  let markersLayer = worldMapSvgRoot.querySelector("#exchangeMarkersLayer");
  if (markersLayer) markersLayer.remove();
  markersLayer = document.createElementNS(svgNS, "g");
  markersLayer.setAttribute("id", "exchangeMarkersLayer");

  // Marker geometry is sized relative to the map's own viewBox units (not
  // fixed pixels), same idea as the rest of this map — so markers stay
  // correctly proportioned regardless of the SVG's rendered size.
  const r = vb.width * 0.0016;

  let openCount = 0;
  EXCHANGES.forEach(ex => {
    const { isOpen, hhmm } = getExchangeStatus(ex);
    if (isOpen) { openCount++; highlightCountry(ex.mapCountry || ex.country); }
    const x = lonToX(ex.lon), y = latToY(ex.lat);

    const g = document.createElementNS(svgNS, "g");
    g.setAttribute("class", "exchange-marker");
    g.setAttribute("transform", `translate(${x}, ${y})`);

    if (isOpen) {
      const pulse = document.createElementNS(svgNS, "circle");
      pulse.setAttribute("r", r * 1.6);
      pulse.setAttribute("class", "exchange-pulse");
      g.appendChild(pulse);
    }

    const dot = document.createElementNS(svgNS, "circle");
    dot.setAttribute("r", r);
    dot.setAttribute("class", isOpen ? "exchange-dot exchange-dot-open" : "exchange-dot exchange-dot-closed");
    g.appendChild(dot);

    const tickerQuote = (typeof homeState !== "undefined" && homeState.marketTickers) ? homeState.marketTickers[ex.ticker] : null;
    const dp = tickerQuote ? (tickerQuote.dp ?? 0) : null;
    const showTickerOnMap = dp !== null && !ex.compact;
    const belowDot = !!ex.labelDy;
    // Compact markers keep the original single-line spacing (just the
    // city name); non-compact ones get wider spacing to fit a second
    // "TICKER +X%" line without the two touching.
    const cityY = belowDot ? ex.labelDy * r : (showTickerOnMap ? -r * 3.6 : -r * 2.2);
    const tickerY = belowDot ? (ex.labelDy * r + r * 2.6) : -r * 1.2;

    const label = document.createElementNS(svgNS, "text");
    label.setAttribute("class", "exchange-label");
    label.setAttribute("x", `${(ex.labelDx || 0) * r}`);
    label.setAttribute("y", `${cityY}`);
    label.setAttribute("text-anchor", ex.labelAnchor || "middle");
    label.textContent = ex.city;
    g.appendChild(label);

    if (showTickerOnMap) {
      const tickerLabel = document.createElementNS(svgNS, "text");
      tickerLabel.setAttribute("class", `exchange-ticker-label ${dp >= 0 ? "positive" : "negative"}`);
      tickerLabel.setAttribute("x", `${(ex.labelDx || 0) * r}`);
      tickerLabel.setAttribute("y", `${tickerY}`);
      tickerLabel.setAttribute("text-anchor", ex.labelAnchor || "middle");
      tickerLabel.textContent = `${ex.ticker} ${dp >= 0 ? "+" : ""}${dp.toFixed(1)}%`;
      g.appendChild(tickerLabel);
    }

    // Hover tooltip — plain SVG, revealed via CSS :hover
    const tooltip = document.createElementNS(svgNS, "g");
    tooltip.setAttribute("class", "exchange-tooltip");
    const tw = vb.width * 0.15, th = vb.width * (tickerQuote ? 0.08 : 0.06);
    const tx = ex.lon > 60 ? -tw - r * 2 : r * 2;
    const ty = ex.lat < -20 ? -th - r * 2 : r * 2;
    tooltip.setAttribute("transform", `translate(${tx}, ${ty})`);
    const box = document.createElementNS(svgNS, "rect");
    box.setAttribute("width", tw); box.setAttribute("height", th);
    box.setAttribute("rx", vb.width * 0.005);
    tooltip.appendChild(box);
    const nameText = document.createElementNS(svgNS, "text");
    nameText.setAttribute("x", tw * 0.06); nameText.setAttribute("y", th * (tickerQuote ? 0.28 : 0.4));
    nameText.setAttribute("class", "exchange-tooltip-name");
    nameText.textContent = ex.name;
    tooltip.appendChild(nameText);
    const statusText = document.createElementNS(svgNS, "text");
    statusText.setAttribute("x", tw * 0.06); statusText.setAttribute("y", th * (tickerQuote ? 0.56 : 0.78));
    statusText.setAttribute("class", `exchange-tooltip-status ${isOpen ? "positive" : ""}`);
    statusText.textContent = `${isOpen ? "Open" : "Closed"} · ${ex.city} ${hhmm}`;
    tooltip.appendChild(statusText);
    if (tickerQuote) {
      const priceText = document.createElementNS(svgNS, "text");
      priceText.setAttribute("x", tw * 0.06); priceText.setAttribute("y", th * 0.85);
      priceText.setAttribute("class", `exchange-tooltip-status ${dp >= 0 ? "positive" : "negative"}`);
      priceText.textContent = `${ex.ticker}: ${chartFormatCurrency ? chartFormatCurrency(tickerQuote.c) : `$${tickerQuote.c.toFixed(2)}`} (${dp >= 0 ? "+" : ""}${dp.toFixed(2)}%)`;
      tooltip.appendChild(priceText);
    }
    g.appendChild(tooltip);

    markersLayer.appendChild(g);
  });

  worldMapSvgRoot.appendChild(markersLayer);

  const summaryEl = document.getElementById("worldMarketsSummary");
  if (summaryEl) {
    summaryEl.textContent = `${openCount} of ${EXCHANGES.length} major exchanges currently open`;
  }
}

renderWorldMarkets();
setInterval(renderWorldMarkets, 30000);
