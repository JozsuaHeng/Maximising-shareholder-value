// "Global Markets" homepage panel — a stylized world map showing major
// stock exchanges and whether each is currently open, computed entirely
// from real timezone data via the browser's built-in Intl API (same
// zero-network-call technique clock.js already uses for the header
// clock). No API calls, no external map image — positions are rough,
// hand-placed percentages on a decorative graticule background, not a
// precise geographic projection.
//
// Trading hours are each exchange's normal weekday regular session in
// local time — doesn't account for local public holidays (no free data
// source for that used elsewhere in this app either), so "open" here
// means "within normal hours on a weekday," not a guarantee it's not a
// holiday closure today.

// `country` = the 2-letter code Finnhub's /stock/profile2 returns in its
// `country` field — lets script.js look up "is THIS stock's home market
// open right now" for the deep-dive page's right column, reusing this
// same exchange/hours data (see getHomeMarketStatus below) instead of
// fetching anything new.
const EXCHANGES = [
  { code: "NYSE", name: "NYSE / Nasdaq", city: "New York", country: "US", tz: "America/New_York", open: "09:30", close: "16:00", x: 25, y: 34 },
  { code: "TSX", name: "Toronto Stock Exchange", city: "Toronto", country: "CA", tz: "America/Toronto", open: "09:30", close: "16:00", x: 24, y: 28 },
  { code: "B3", name: "B3", city: "São Paulo", country: "BR", tz: "America/Sao_Paulo", open: "10:00", close: "17:00", x: 36, y: 64 },
  { code: "LSE", name: "London Stock Exchange", city: "London", country: "GB", tz: "Europe/London", open: "08:00", close: "16:30", x: 45, y: 21 },
  { code: "EPA", name: "Euronext Paris", city: "Paris", country: "FR", tz: "Europe/Paris", open: "09:00", close: "17:30", x: 49, y: 30 },
  { code: "FRA", name: "Deutsche Börse (Xetra)", city: "Frankfurt", country: "DE", tz: "Europe/Berlin", open: "09:00", close: "17:30", x: 55, y: 22 },
  { code: "JSE", name: "Johannesburg Stock Exchange", city: "Johannesburg", country: "ZA", tz: "Africa/Johannesburg", open: "09:00", close: "17:00", x: 55, y: 66 },
  { code: "NSE", name: "National Stock Exchange", city: "Mumbai", country: "IN", tz: "Asia/Kolkata", open: "09:15", close: "15:30", x: 68, y: 46 },
  { code: "SGX", name: "Singapore Exchange", city: "Singapore", country: "SG", tz: "Asia/Singapore", open: "09:00", close: "17:00", x: 76, y: 56 },
  { code: "SSE", name: "Shanghai Stock Exchange", city: "Shanghai", country: "CN", tz: "Asia/Shanghai", open: "09:30", close: "15:00", x: 81, y: 37 },
  { code: "HKEX", name: "Hong Kong Exchange", city: "Hong Kong", country: "HK", tz: "Asia/Hong_Kong", open: "09:30", close: "16:00", x: 80, y: 43 },
  { code: "TSE", name: "Tokyo Stock Exchange", city: "Tokyo", country: "JP", tz: "Asia/Tokyo", open: "09:00", close: "15:00", x: 87, y: 33 },
  { code: "ASX", name: "Australian Securities Exchange", city: "Sydney", country: "AU", tz: "Australia/Sydney", open: "10:00", close: "16:00", x: 90, y: 68 },
];

// Used by script.js's ticker deep-dive page (right column) — looks up
// this stock's own listing exchange by country and returns its live
// open/closed status, or null if it's not one of the 13 exchanges above.
function getHomeMarketStatus(countryCode) {
  const ex = EXCHANGES.find(e => e.country === countryCode);
  if (!ex) return null;
  return { ex, ...getExchangeStatus(ex) };
}

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

function renderWorldMarkets() {
  const container = document.getElementById("worldMarketsMap");
  if (!container) return;

  const svgNS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(svgNS, "svg");
  svg.setAttribute("viewBox", "0 0 100 80");
  svg.setAttribute("class", "world-markets-svg");
  svg.setAttribute("preserveAspectRatio", "xMidYMid meet");

  // Decorative graticule background (lat/long-style grid lines) — not a
  // real map projection, just a "globe-ish" visual backdrop for the dots.
  const grid = document.createElementNS(svgNS, "g");
  grid.setAttribute("class", "world-markets-grid");
  for (let x = 0; x <= 100; x += 10) {
    const line = document.createElementNS(svgNS, "line");
    line.setAttribute("x1", x); line.setAttribute("x2", x);
    line.setAttribute("y1", 0); line.setAttribute("y2", 80);
    grid.appendChild(line);
  }
  for (let y = 0; y <= 80; y += 10) {
    const line = document.createElementNS(svgNS, "line");
    line.setAttribute("x1", 0); line.setAttribute("x2", 100);
    line.setAttribute("y1", y); line.setAttribute("y2", y);
    grid.appendChild(line);
  }
  svg.appendChild(grid);

  let openCount = 0;
  EXCHANGES.forEach(ex => {
    const { isOpen, hhmm } = getExchangeStatus(ex);
    if (isOpen) openCount++;

    const g = document.createElementNS(svgNS, "g");
    g.setAttribute("class", "exchange-marker");
    g.setAttribute("transform", `translate(${ex.x}, ${ex.y})`);

    if (isOpen) {
      const pulse = document.createElementNS(svgNS, "circle");
      pulse.setAttribute("r", "1.8");
      pulse.setAttribute("class", "exchange-pulse");
      g.appendChild(pulse);
    }

    const dot = document.createElementNS(svgNS, "circle");
    dot.setAttribute("r", "1.1");
    dot.setAttribute("class", isOpen ? "exchange-dot exchange-dot-open" : "exchange-dot exchange-dot-closed");
    g.appendChild(dot);

    const label = document.createElementNS(svgNS, "text");
    label.setAttribute("class", "exchange-label");
    label.setAttribute("x", "0");
    label.setAttribute("y", "-2.2");
    label.textContent = ex.code;
    g.appendChild(label);

    // Hover tooltip — plain SVG, revealed via CSS :hover (see .exchange-marker:hover .exchange-tooltip)
    const tooltip = document.createElementNS(svgNS, "g");
    tooltip.setAttribute("class", "exchange-tooltip");
    const tw = 26, th = 12;
    const tx = ex.x > 70 ? -tw - 2 : 2.5;
    const ty = ex.y > 55 ? -th - 2 : 2.5;
    tooltip.setAttribute("transform", `translate(${tx}, ${ty})`);
    const box = document.createElementNS(svgNS, "rect");
    box.setAttribute("width", tw); box.setAttribute("height", th);
    box.setAttribute("rx", "1.2");
    tooltip.appendChild(box);
    const nameText = document.createElementNS(svgNS, "text");
    nameText.setAttribute("x", 1.5); nameText.setAttribute("y", 4.2);
    nameText.setAttribute("class", "exchange-tooltip-name");
    nameText.textContent = ex.name;
    tooltip.appendChild(nameText);
    const statusText = document.createElementNS(svgNS, "text");
    statusText.setAttribute("x", 1.5); statusText.setAttribute("y", 9);
    statusText.setAttribute("class", `exchange-tooltip-status ${isOpen ? "positive" : ""}`);
    statusText.textContent = `${isOpen ? "Open" : "Closed"} · ${ex.city} ${hhmm}`;
    tooltip.appendChild(statusText);
    g.appendChild(tooltip);

    svg.appendChild(g);
  });

  container.innerHTML = "";
  container.appendChild(svg);

  const summaryEl = document.getElementById("worldMarketsSummary");
  if (summaryEl) {
    summaryEl.textContent = `${openCount} of ${EXCHANGES.length} major exchanges currently open`;
  }
}

renderWorldMarkets();
setInterval(renderWorldMarkets, 30000);
