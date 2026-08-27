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
  { code: "NYSE", name: "NYSE / Nasdaq", ticker: "SPY", flag: "🇺🇸", city: "New York", country: "US", tz: "America/New_York", open: "09:30", close: "16:00", lat: 40.71, lon: -74.01, boxX: 1030, boxY: 530 },
  { code: "TSX", name: "Toronto Stock Exchange", ticker: "EWC", flag: "🇨🇦", city: "Toronto", country: "CA", tz: "America/Toronto", open: "09:30", close: "16:00", lat: 43.65, lon: -79.38, boxX: 1030, boxY: 300 },
  { code: "B3", name: "B3", ticker: "EWZ", flag: "🇧🇷", city: "São Paulo", country: "BR", tz: "America/Sao_Paulo", open: "10:00", close: "17:00", lat: -23.55, lon: -46.63, boxX: 1300, boxY: 1030 },
  { code: "LSE", name: "London Stock Exchange", ticker: "EWU", flag: "🇬🇧", city: "London", country: "GB", tz: "Europe/London", open: "08:00", close: "16:30", lat: 51.51, lon: -0.13, boxX: 1050, boxY: 130 },
  { code: "EPA", name: "Euronext Paris", ticker: "EWQ", flag: "🇫🇷", city: "Paris", country: "FR", tz: "Europe/Paris", open: "09:00", close: "17:30", lat: 48.86, lon: 2.35, boxX: 1720, boxY: 165 },
  { code: "FRA", name: "Deutsche Börse (Xetra)", ticker: "EWG", flag: "🇩🇪", city: "Frankfurt", country: "DE", tz: "Europe/Berlin", open: "09:00", close: "17:30", lat: 50.11, lon: 8.68, boxX: 1720, boxY: 400 },
  { code: "JSE", name: "Johannesburg Stock Exchange", ticker: "EZA", flag: "🇿🇦", city: "Johannesburg", country: "ZA", tz: "Africa/Johannesburg", open: "09:00", close: "17:00", lat: -26.20, lon: 28.05, boxX: 1880, boxY: 1080 },
  { code: "NSE", name: "National Stock Exchange", ticker: "INDA", flag: "🇮🇳", city: "Mumbai", country: "IN", tz: "Asia/Kolkata", open: "09:15", close: "15:30", lat: 19.08, lon: 72.88, boxX: 2400, boxY: 1150 },
  { code: "SGX", name: "Singapore Exchange", ticker: "EWS", flag: "🇸🇬", city: "Singapore", country: "SG", tz: "Asia/Singapore", open: "09:00", close: "17:00", lat: 1.35, lon: 103.82, boxX: 2400, boxY: 930 },
  { code: "SSE", name: "Shanghai Stock Exchange", ticker: "MCHI", flag: "🇨🇳", city: "Shanghai", country: "CN", tz: "Asia/Shanghai", open: "09:30", close: "15:00", lat: 31.23, lon: 121.47, boxX: 2400, boxY: 270 },
  { code: "HKEX", name: "Hong Kong Exchange", ticker: "EWH", flag: "🇭🇰", city: "Hong Kong", country: "HK", tz: "Asia/Hong_Kong", open: "09:30", close: "16:00", lat: 22.32, lon: 114.17, boxX: 2400, boxY: 490 },
  { code: "TSE", name: "Tokyo Stock Exchange", ticker: "EWJ", flag: "🇯🇵", city: "Tokyo", country: "JP", tz: "Asia/Tokyo", open: "09:00", close: "15:00", lat: 35.68, lon: 139.65, boxX: 2400, boxY: 710 },
  { code: "ASX", name: "Australian Securities Exchange", ticker: "EWA", flag: "🇦🇺", city: "Sydney", country: "AU", tz: "Australia/Sydney", open: "10:00", close: "16:00", lat: -33.87, lon: 151.21, boxX: 2400, boxY: 1370 },
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

// "Which market opens/closes next?" — zero extra API cost, pure client-
// side arithmetic over the same trading-hours data the map markers
// already use. Used by home.js's market breadth strip.
const DAY_ORDER = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const minutesOfDay = hhmm => { const [h, m] = hhmm.split(":").map(Number); return h * 60 + m; };

function daysUntilNextWeekday(dayIdx) {
  let offset = 1, idx = (dayIdx + 1) % 7;
  while (idx === 0 || idx === 6) { offset++; idx = (idx + 1) % 7; }
  return offset;
}

function getNextMarketEvent() {
  const now = new Date();
  const events = EXCHANGES.map(ex => {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: ex.tz, hour: "2-digit", minute: "2-digit", hour12: false, weekday: "short",
    }).formatToParts(now);
    const map = {};
    parts.forEach(p => { map[p.type] = p.value; });
    const hhmm = `${map.hour === "24" ? "00" : map.hour}:${map.minute}`;
    const dayIdx = DAY_ORDER.indexOf(map.weekday);
    const isWeekday = dayIdx >= 1 && dayIdx <= 5;
    const nowMin = minutesOfDay(hhmm);
    const openMin = minutesOfDay(ex.open);
    const closeMin = minutesOfDay(ex.close);
    const isOpen = isWeekday && nowMin >= openMin && nowMin <= closeMin;

    let diffMin, label;
    if (isOpen) {
      diffMin = closeMin - nowMin;
      label = "closes";
    } else {
      label = "opens";
      diffMin = (isWeekday && nowMin < openMin)
        ? openMin - nowMin
        : daysUntilNextWeekday(dayIdx) * 1440 - nowMin + openMin;
    }
    return { ex, label, diffMin };
  });
  events.sort((a, b) => a.diffMin - b.diffMin);
  return events[0];
}

function formatDuration(mins) {
  const h = Math.floor(mins / 60), m = Math.round(mins % 60);
  return h === 0 ? `${m}m` : `${h}h ${m}m`;
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

  // Removed 2026-08-27: a lon/lat grid overlay and a whole-country-landmass
  // fill for open exchanges (both added 2026-08-08). With 7-8 of 13
  // exchanges open at once, the fills painted huge chunks of the map green
  // simultaneously, and combined with the grid lines, 13 dense callout
  // boxes, and dashed leader lines, the whole thing read as cluttered
  // rather than informative. The open-market pulse ring on each dot
  // already signals "this one's open" without painting the whole country
  // — keeping just that is enough signal with far less visual weight.
  worldMapSvgRoot.querySelectorAll(".country-market-open").forEach(el => el.classList.remove("country-market-open"));

  let markersLayer = worldMapSvgRoot.querySelector("#exchangeMarkersLayer");
  if (markersLayer) markersLayer.remove();
  markersLayer = document.createElementNS(svgNS, "g");
  markersLayer.setAttribute("id", "exchangeMarkersLayer");

  // Marker geometry is sized relative to the map's own viewBox units (not
  // fixed pixels), same idea as the rest of this map — so markers stay
  // correctly proportioned regardless of the SVG's rendered size.
  const r = vb.width * 0.0042;

  let openCount = 0;
  // Callout box size, shared by every marker — viewBox-relative like
  // everything else here so it scales with the SVG's rendered size.
  const bw = vb.width * 0.205, bh = vb.width * 0.066;

  EXCHANGES.forEach(ex => {
    const { isOpen } = getExchangeStatus(ex);
    if (isOpen) openCount++;
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

    // Floating label — no card/box background, border or shadow. Just two
    // lines of stroke-outlined text (same technique the compact city-only
    // labels already used successfully) so it reads clearly over whatever
    // land/ocean color happens to be underneath, without the visual weight
    // of 13 solid rectangles competing for attention at once. Replaced the
    // earlier dark-card design 2026-08-27 after it read as cluttered even
    // once the grid/country-fill were removed — the boxes themselves were
    // the remaining source of visual weight.
    const textLeft = ex.boxX - bw / 2;

    const titleText = document.createElementNS(svgNS, "text");
    titleText.setAttribute("x", textLeft); titleText.setAttribute("y", ex.boxY - bh * 0.12);
    titleText.setAttribute("class", "exchange-float-title");
    titleText.textContent = `${ex.flag} ${ex.city}`;
    g.appendChild(titleText);

    const priceText = document.createElementNS(svgNS, "text");
    priceText.setAttribute("x", textLeft); priceText.setAttribute("y", ex.boxY + bh * 0.3);
    priceText.setAttribute("class", `exchange-float-price ${dp === null ? "" : dp >= 0 ? "positive" : "negative"}`);
    const priceStr = tickerQuote ? (chartFormatCurrency ? chartFormatCurrency(tickerQuote.c) : `$${tickerQuote.c.toFixed(2)}`) : "···";
    priceText.textContent = dp !== null ? `${ex.ticker} ${priceStr} (${dp >= 0 ? "+" : ""}${dp.toFixed(1)}%)` : `${ex.ticker} ${priceStr}`;
    g.appendChild(priceText);

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
