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

const EXCHANGES = [
  { code: "NYSE", name: "NYSE / Nasdaq", city: "New York", country: "US", tz: "America/New_York", open: "09:30", close: "16:00", lat: 40.71, lon: -74.01 },
  { code: "TSX", name: "Toronto Stock Exchange", city: "Toronto", country: "CA", tz: "America/Toronto", open: "09:30", close: "16:00", lat: 43.65, lon: -79.38 },
  { code: "B3", name: "B3", city: "São Paulo", country: "BR", tz: "America/Sao_Paulo", open: "10:00", close: "17:00", lat: -23.55, lon: -46.63 },
  { code: "LSE", name: "London Stock Exchange", city: "London", country: "GB", tz: "Europe/London", open: "08:00", close: "16:30", lat: 51.51, lon: -0.13 },
  { code: "EPA", name: "Euronext Paris", city: "Paris", country: "FR", tz: "Europe/Paris", open: "09:00", close: "17:30", lat: 48.86, lon: 2.35 },
  { code: "FRA", name: "Deutsche Börse (Xetra)", city: "Frankfurt", country: "DE", tz: "Europe/Berlin", open: "09:00", close: "17:30", lat: 50.11, lon: 8.68 },
  { code: "JSE", name: "Johannesburg Stock Exchange", city: "Johannesburg", country: "ZA", tz: "Africa/Johannesburg", open: "09:00", close: "17:00", lat: -26.20, lon: 28.05 },
  { code: "NSE", name: "National Stock Exchange", city: "Mumbai", country: "IN", tz: "Asia/Kolkata", open: "09:15", close: "15:30", lat: 19.08, lon: 72.88 },
  { code: "SGX", name: "Singapore Exchange", city: "Singapore", country: "SG", tz: "Asia/Singapore", open: "09:00", close: "17:00", lat: 1.35, lon: 103.82 },
  { code: "SSE", name: "Shanghai Stock Exchange", city: "Shanghai", country: "CN", tz: "Asia/Shanghai", open: "09:30", close: "15:00", lat: 31.23, lon: 121.47 },
  { code: "HKEX", name: "Hong Kong Exchange", city: "Hong Kong", country: "HK", tz: "Asia/Hong_Kong", open: "09:30", close: "16:00", lat: 22.32, lon: 114.17 },
  { code: "TSE", name: "Tokyo Stock Exchange", city: "Tokyo", country: "JP", tz: "Asia/Tokyo", open: "09:00", close: "15:00", lat: 35.68, lon: 139.65 },
  { code: "ASX", name: "Australian Securities Exchange", city: "Sydney", country: "AU", tz: "Australia/Sydney", open: "10:00", close: "16:00", lat: -33.87, lon: 151.21 },
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
    if (isOpen) openCount++;
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

    const label = document.createElementNS(svgNS, "text");
    label.setAttribute("class", "exchange-label");
    label.setAttribute("x", "0");
    label.setAttribute("y", `${-r * 2.2}`);
    label.textContent = ex.city;
    g.appendChild(label);

    // Hover tooltip — plain SVG, revealed via CSS :hover
    const tooltip = document.createElementNS(svgNS, "g");
    tooltip.setAttribute("class", "exchange-tooltip");
    const tw = vb.width * 0.11, th = vb.width * 0.05;
    const tx = ex.lon > 60 ? -tw - r * 2 : r * 2;
    const ty = ex.lat < -20 ? -th - r * 2 : r * 2;
    tooltip.setAttribute("transform", `translate(${tx}, ${ty})`);
    const box = document.createElementNS(svgNS, "rect");
    box.setAttribute("width", tw); box.setAttribute("height", th);
    box.setAttribute("rx", vb.width * 0.005);
    tooltip.appendChild(box);
    const nameText = document.createElementNS(svgNS, "text");
    nameText.setAttribute("x", tw * 0.06); nameText.setAttribute("y", th * 0.4);
    nameText.setAttribute("class", "exchange-tooltip-name");
    nameText.textContent = ex.name;
    tooltip.appendChild(nameText);
    const statusText = document.createElementNS(svgNS, "text");
    statusText.setAttribute("x", tw * 0.06); statusText.setAttribute("y", th * 0.78);
    statusText.setAttribute("class", `exchange-tooltip-status ${isOpen ? "positive" : ""}`);
    statusText.textContent = `${isOpen ? "Open" : "Closed"} · ${ex.city} ${hhmm}`;
    tooltip.appendChild(statusText);
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
