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
// tier has no live foreign index data — these are NOT the literal NIKKEI/
// HANG SENG/SENSEX values, just the closest free real substitute). Quotes
// come from home.js's MARKET_TICKERS fetch (homeState.marketTickers) —
// this file doesn't fetch anything itself, just reads what home.js
// already pulled.
// `boxX`/`boxY` — absolute callout-box CENTER position (viewBox units),
// hand-placed in open ocean space near each cluster and cascaded
// vertically where exchanges sit too close together in real lon/lat for
// their boxes not to collide (precise real dot positions were computed
// once via a one-off script, then boxes placed by hand from there — see
// git history around 2026-08-08 if these ever need re-deriving).
const EXCHANGES = [
  { code: "NYSE", name: "NYSE / Nasdaq", ticker: "SPY", flag: "🇺🇸", city: "New York", country: "US", tz: "America/New_York", open: "09:30", close: "16:00", lat: 40.71, lon: -74.01, boxX: 1060, boxY: 460 },
  { code: "TSX", name: "Toronto Stock Exchange", ticker: "EWC", flag: "🇨🇦", city: "Toronto", country: "CA", tz: "America/Toronto", open: "09:30", close: "16:00", lat: 43.65, lon: -79.38, boxX: 1060, boxY: 300 },
  { code: "B3", name: "B3", ticker: "EWZ", flag: "🇧🇷", city: "São Paulo", country: "BR", tz: "America/Sao_Paulo", open: "10:00", close: "17:00", lat: -23.55, lon: -46.63, boxX: 1300, boxY: 1010 },
  { code: "LSE", name: "London Stock Exchange", ticker: "EWU", flag: "🇬🇧", city: "London", country: "GB", tz: "Europe/London", open: "08:00", close: "16:30", lat: 51.51, lon: -0.13, boxX: 1080, boxY: 140 },
  { code: "EPA", name: "Euronext Paris", ticker: "EWQ", flag: "🇫🇷", city: "Paris", country: "FR", tz: "Europe/Paris", open: "09:00", close: "17:30", lat: 48.86, lon: 2.35, boxX: 1690, boxY: 175 },
  { code: "FRA", name: "Deutsche Börse (Xetra)", ticker: "EWG", flag: "🇩🇪", city: "Frankfurt", country: "DE", tz: "Europe/Berlin", open: "09:00", close: "17:30", lat: 50.11, lon: 8.68, boxX: 1690, boxY: 320 },
  { code: "JSE", name: "Johannesburg Stock Exchange", ticker: "EZA", flag: "🇿🇦", city: "Johannesburg", country: "ZA", tz: "Africa/Johannesburg", open: "09:00", close: "17:00", lat: -26.20, lon: 28.05, boxX: 1860, boxY: 1060 },
  { code: "NSE", name: "National Stock Exchange", ticker: "INDA", flag: "🇮🇳", city: "Mumbai", country: "IN", tz: "Asia/Kolkata", open: "09:15", close: "15:30", lat: 19.08, lon: 72.88, boxX: 2470, boxY: 870 },
  { code: "SGX", name: "Singapore Exchange", ticker: "EWS", flag: "🇸🇬", city: "Singapore", country: "SG", tz: "Asia/Singapore", open: "09:00", close: "17:00", lat: 1.35, lon: 103.82, boxX: 2470, boxY: 720 },
  { code: "SSE", name: "Shanghai Stock Exchange", ticker: "MCHI", flag: "🇨🇳", city: "Shanghai", country: "CN", tz: "Asia/Shanghai", open: "09:30", close: "15:00", lat: 31.23, lon: 121.47, boxX: 2470, boxY: 420 },
  { code: "HKEX", name: "Hong Kong Exchange", ticker: "EWH", flag: "🇭🇰", city: "Hong Kong", country: "HK", mapCountry: "cn", tz: "Asia/Hong_Kong", open: "09:30", close: "16:00", lat: 22.32, lon: 114.17, boxX: 2470, boxY: 570 },
  { code: "TSE", name: "Tokyo Stock Exchange", ticker: "EWJ", flag: "🇯🇵", city: "Tokyo", country: "JP", tz: "Asia/Tokyo", open: "09:00", close: "15:00", lat: 35.68, lon: 139.65, boxX: 2470, boxY: 270 },
  { code: "ASX", name: "Australian Securities Exchange", ticker: "EWA", flag: "🇦🇺", city: "Sydney", country: "AU", tz: "Australia/Sydney", open: "10:00", close: "16:00", lat: -33.87, lon: 151.21, boxX: 2540, boxY: 1160 },
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
  const r = vb.width * 0.0028;

  let openCount = 0;
  // Callout box size, shared by every marker — viewBox-relative like
  // everything else here so it scales with the SVG's rendered size.
  const bw = vb.width * 0.155, bh = vb.width * 0.048;

  EXCHANGES.forEach(ex => {
    const { isOpen, hhmm } = getExchangeStatus(ex);
    if (isOpen) { openCount++; highlightCountry(ex.mapCountry || ex.country); }
    const x = lonToX(ex.lon), y = latToY(ex.lat);
    const tickerQuote = (typeof homeState !== "undefined" && homeState.marketTickers) ? homeState.marketTickers[ex.ticker] : null;
    const dp = tickerQuote ? (tickerQuote.dp ?? 0) : null;

    const g = document.createElementNS(svgNS, "g");
    g.setAttribute("class", "exchange-marker");

    // Small dot at the real geographic position (plus a pulse ring when
    // that market's open) — the callout box below is the pinned label,
    // this dot is what it's actually pointing at.
    const dotGroup = document.createElementNS(svgNS, "g");
    dotGroup.setAttribute("transform", `translate(${x}, ${y})`);
    if (isOpen) {
      const pulse = document.createElementNS(svgNS, "circle");
      pulse.setAttribute("r", r * 1.6);
      pulse.setAttribute("class", "exchange-pulse");
      dotGroup.appendChild(pulse);
    }
    const dot = document.createElementNS(svgNS, "circle");
    dot.setAttribute("r", r);
    dot.setAttribute("class", isOpen ? "exchange-dot exchange-dot-open" : "exchange-dot exchange-dot-closed");
    dotGroup.appendChild(dot);
    g.appendChild(dotGroup);

    // Leader line from the real position to the callout box.
    const leader = document.createElementNS(svgNS, "line");
    leader.setAttribute("class", "exchange-leader");
    leader.setAttribute("x1", x); leader.setAttribute("y1", y);
    leader.setAttribute("x2", ex.boxX); leader.setAttribute("y2", ex.boxY);
    g.appendChild(leader);

    // Callout box — flag + city + ticker code on top, price/%/local time
    // below. Always visible (not hover-only), same visual language as
    // the reference: a dark card pinned to each market via a leader line.
    const boxLeft = ex.boxX - bw / 2, boxTop = ex.boxY - bh / 2;
    const boxGroup = document.createElementNS(svgNS, "g");
    boxGroup.setAttribute("class", "exchange-box");
    boxGroup.setAttribute("transform", `translate(${boxLeft}, ${boxTop})`);

    const rect = document.createElementNS(svgNS, "rect");
    rect.setAttribute("width", bw); rect.setAttribute("height", bh);
    rect.setAttribute("rx", vb.width * 0.006);
    rect.setAttribute("class", "exchange-box-rect");
    boxGroup.appendChild(rect);

    const titleText = document.createElementNS(svgNS, "text");
    titleText.setAttribute("x", bw * 0.05); titleText.setAttribute("y", bh * 0.36);
    titleText.setAttribute("class", "exchange-box-title");
    titleText.textContent = `${ex.flag} ${ex.city}`;
    boxGroup.appendChild(titleText);

    const timeText = document.createElementNS(svgNS, "text");
    timeText.setAttribute("x", bw * 0.95); timeText.setAttribute("y", bh * 0.36);
    timeText.setAttribute("text-anchor", "end");
    timeText.setAttribute("class", "exchange-box-time");
    timeText.textContent = hhmm;
    boxGroup.appendChild(timeText);

    const priceText = document.createElementNS(svgNS, "text");
    priceText.setAttribute("x", bw * 0.05); priceText.setAttribute("y", bh * 0.78);
    priceText.setAttribute("class", "exchange-box-price");
    priceText.textContent = tickerQuote ? `${ex.ticker} ${chartFormatCurrency ? chartFormatCurrency(tickerQuote.c) : `$${tickerQuote.c.toFixed(2)}`}` : `${ex.ticker} ···`;
    boxGroup.appendChild(priceText);

    if (dp !== null) {
      const pctText = document.createElementNS(svgNS, "text");
      pctText.setAttribute("x", bw * 0.95); pctText.setAttribute("y", bh * 0.78);
      pctText.setAttribute("text-anchor", "end");
      pctText.setAttribute("class", `exchange-box-pct ${dp >= 0 ? "positive" : "negative"}`);
      pctText.textContent = `${dp >= 0 ? "+" : ""}${dp.toFixed(2)}%`;
      boxGroup.appendChild(pctText);
    }

    g.appendChild(boxGroup);
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
