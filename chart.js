// Interactive price chart: axes, range switching, session shading,
// synced hover crosshair across all panels, SMA/EMA overlays, and simple
// technical-analysis panels (volume, RSI, MACD, support/resistance).
//
// Data comes from Twelve Data (see config.js / README.md — Finnhub's free
// plan blocks historical candles). Each range button maps to a Twelve Data
// interval chosen to give a sensible number of bars for that window.
//
// Twelve Data's free tier does NOT return pre-market/after-hours bars even
// with `extended_hours=true` (confirmed directly — identical output with
// or without the parameter). So the session shading marks WHEN pre-market/
// after-hours occur (useful context, e.g. explaining the gap in the line
// overnight) even though there's no price data to show inside those bands.
//
// RSI/MACD/SMA/EMA computed client-side with standard formulas;
// support/resistance is a simple local-extrema clustering heuristic,
// explicitly labeled as such, not authoritative.

// Each range means what its label says — the *last N of actual time*,
// not "bars at N granularity" (that was the original bug: "1H" used to
// mean 100 hourly bars, ~3 weeks of data, not the last hour — which is
// why it looked chaotic). Bar size is chosen so a window is covered by a
// sensible number of points, not so it becomes literally "1 bar per
// label," which is why 1D/1W/3M use finer bars than their name.
const RANGE_CONFIGS = {
  "1H": { interval: "1min", outputsize: 60 },   // last 60 one-minute bars
  "4H": { interval: "5min", outputsize: 48 },   // last 48 five-minute bars
  "1D": { interval: "5min", outputsize: 78 },   // one full trading session (6.5h)
  "1W": { interval: "30min", outputsize: 65 },  // ~5 trading days
  "3M": { interval: "1day", outputsize: 63 },   // ~3 months of trading days
  "6M": { interval: "1day", outputsize: 130 },  // ~6 months of trading days
  "1Y": { interval: "1day", outputsize: 252 },  // ~1 year of trading days
  "5Y": { interval: "1week", outputsize: 260 }, // ~5 years of weekly bars — daily would be 1250+ points for little visual benefit at this zoom level, same reasoning real charting platforms use weekly/monthly bars for multi-year views
};

// Daily/weekly bars use index-based x-axis spacing (see getXMapper) same
// as any other non-intraday range — no session gaps to worry about.
const DAILY_OR_LONGER_INTERVALS = ["1day", "1week"];

const PAD_LEFT = 56;
const PAD_RIGHT = 10;

const INTERVAL_MS = {
  "1min": 1 * 60000,
  "5min": 5 * 60000,
  "30min": 30 * 60000,
  "1h": 60 * 60000,
  "4h": 4 * 60 * 60000,
  "1day": 24 * 60 * 60000,
  "1week": 7 * 24 * 60 * 60000,
};

// Overnight/weekend gaps between trading sessions shouldn't be drawn as a
// straight diagonal line connecting yesterday's close to today's open —
// that reads as a dramatic move that never happened. Anything more than
// 3x the normal bar spacing is treated as a session break, and lines are
// split into separate segments there instead of connected through it.
function isSessionGap(series, i) {
  if (!series.intraday || i === 0 || !series.intervalMs) return false;
  return (series.timesMs[i] - series.timesMs[i - 1]) > series.intervalMs * 3;
}

function getSegments(series) {
  const segments = [];
  let start = 0;
  for (let i = 1; i < series.closes.length; i++) {
    if (isSessionGap(series, i)) {
      segments.push([start, i - 1]);
      start = i;
    }
  }
  segments.push([start, series.closes.length - 1]);
  return segments;
}

// Clamps each [start, end] segment to a visible window, dropping any
// segment that falls entirely outside it — used when zoomed in so trend
// color, area fill, and overlay lines only reflect what's on screen.
function clipSegments(segments, visStart, visEnd) {
  return segments
    .map(([s, e]) => [Math.max(s, visStart), Math.min(e, visEnd)])
    .filter(([s, e]) => s <= e);
}

const chartState = {
  symbol: null,
  range: "6M",
  cache: {},
  series: null,
  sr: null,
  overlays: { sma20: true, sma50: false, ema20: true },
  chartType: "line",
  // [startIdx, endIdx] into the current series, inclusive — null means
  // "fully zoomed out" (show everything). Set via mouse wheel (zoom) or
  // drag (pan) on the price panel; reset on every range/symbol change.
  zoomRange: null,
};

// The visible index window for the current zoom level — [0, length-1]
// when not zoomed. Every panel renders only this slice and rescales its
// own y-axis to it, same as TradingView/Webull: zooming in reveals more
// price/indicator detail, not just a stretched-out view of the same range.
function getVisibleIndices(series) {
  const maxIdx = series.closes.length - 1;
  if (!chartState.zoomRange) return [0, maxIdx];
  return [Math.max(0, chartState.zoomRange[0]), Math.min(maxIdx, chartState.zoomRange[1])];
}

function chartIsNum(v) {
  return typeof v === "number" && !Number.isNaN(v);
}

function chartFormatCurrency(v) {
  return chartIsNum(v) ? `$${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "N/A";
}

function parseNaiveTime(dateTimeStr) {
  return new Date(dateTimeStr.replace(" ", "T")).getTime();
}

// Same dual-mode pattern as finnhubUrl() in script.js: direct call locally
// (using config.js's key), proxied through Cloudflare Pages Functions when
// deployed (IS_LOCAL_DEV is declared in script.js, loaded before this file).
function twelveDataUrl(path, params) {
  const search = new URLSearchParams(params || {});
  if (IS_LOCAL_DEV) {
    search.set("apikey", TWELVE_DATA_API_KEY);
    return `https://api.twelvedata.com${path}?${search.toString()}`;
  }
  search.set("path", path);
  return `/api/twelvedata?${search.toString()}`;
}

// ---- DOM refs ----
const chartRangeRow = document.getElementById("chartRangeRow");
const chartOverlayRow = document.getElementById("chartOverlayRow");
const chartWrap = document.getElementById("chartWrap");
const priceChartEl = document.getElementById("priceChart");
const chartTooltipEl = document.getElementById("chartTooltip");
const volumeChartEl = document.getElementById("volumeChart");
const rsiChartEl = document.getElementById("rsiChart");
const macdChartEl = document.getElementById("macdChart");
const chartNoteEl = document.getElementById("chartNote");
const srNoteEl = document.getElementById("srNote");
const resetZoomBtn = document.getElementById("resetZoomBtn");

Array.from(chartRangeRow.querySelectorAll("button")).forEach(btn => {
  btn.addEventListener("click", () => {
    Array.from(chartRangeRow.querySelectorAll("button")).forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    chartState.range = btn.dataset.range;
    loadChartRange();
  });
});

Array.from(chartOverlayRow.querySelectorAll("button[data-overlay]")).forEach(btn => {
  const key = btn.dataset.overlay;
  btn.classList.toggle("active", chartState.overlays[key]);
  btn.addEventListener("click", () => {
    chartState.overlays[key] = !chartState.overlays[key];
    btn.classList.toggle("active", chartState.overlays[key]);
    if (chartState.series) renderAllPanels(chartState.series);
  });
});

const candleToggleBtn = document.getElementById("candleToggleBtn");
candleToggleBtn.addEventListener("click", () => {
  chartState.chartType = chartState.chartType === "candles" ? "line" : "candles";
  candleToggleBtn.classList.toggle("active", chartState.chartType === "candles");
  if (chartState.series) renderAllPanels(chartState.series);
});

resetZoomBtn.addEventListener("click", () => {
  chartState.zoomRange = null;
  if (chartState.series) renderAllPanels(chartState.series);
});

// ---- Zoom (wheel) and pan (drag) — same interaction model as TradingView/
// Webull: scroll to zoom in/out around the cursor, drag to pan once
// zoomed. Both act on the price panel; every sub-panel picks up the same
// chartState.zoomRange on its own next render since they all read it via
// getVisibleIndices().
function handleChartWheel(e) {
  const series = chartState.series;
  if (!series) return;
  e.preventDefault();

  const rect = priceChartEl.getBoundingClientRect();
  const plotW = rect.width - PAD_LEFT - PAD_RIGHT;
  const [visStart, visEnd] = getVisibleIndices(series);
  const xmap = getXMapper(series, plotW, visStart, visEnd);
  const mouseX = e.clientX - rect.left;
  const centerIdx = Math.min(visEnd, Math.max(visStart, xmap.indexForX(mouseX)));

  const maxIdx = series.closes.length - 1;
  const zoomFactor = e.deltaY > 0 ? 1.15 : 1 / 1.15; // scroll down = zoom out, up = zoom in
  const currentSpan = visEnd - visStart;
  const minSpan = Math.min(10, maxIdx); // don't zoom in past ~10 visible bars
  let newSpan = Math.max(minSpan, Math.min(maxIdx, Math.round(currentSpan * zoomFactor)));

  const ratio = currentSpan > 0 ? (centerIdx - visStart) / currentSpan : 0.5;
  let newStart = Math.round(centerIdx - ratio * newSpan);
  let newEnd = newStart + newSpan;
  if (newStart < 0) { newEnd -= newStart; newStart = 0; }
  if (newEnd > maxIdx) { newStart -= (newEnd - maxIdx); newEnd = maxIdx; }
  newStart = Math.max(0, newStart);

  chartState.zoomRange = newSpan >= maxIdx ? null : [newStart, newEnd];
  renderAllPanels(series);
}
priceChartEl.addEventListener("wheel", handleChartWheel, { passive: false });

let isPanningChart = false;
let panStartX = 0;
let panStartRange = null;

priceChartEl.addEventListener("mousedown", e => {
  if (!chartState.series || !chartState.zoomRange) return; // nothing to pan when fully zoomed out
  isPanningChart = true;
  panStartX = e.clientX;
  panStartRange = [...chartState.zoomRange];
  priceChartEl.classList.add("panning");
  chartTooltipEl.classList.add("hidden");
});
window.addEventListener("mousemove", e => {
  if (!isPanningChart || !chartState.series) return;
  const series = chartState.series;
  const rect = priceChartEl.getBoundingClientRect();
  const plotW = rect.width - PAD_LEFT - PAD_RIGHT;
  const span = panStartRange[1] - panStartRange[0];
  const deltaIdx = Math.round(-((e.clientX - panStartX) / plotW) * span);
  const maxIdx = series.closes.length - 1;
  let newStart = panStartRange[0] + deltaIdx;
  let newEnd = panStartRange[1] + deltaIdx;
  if (newStart < 0) { newEnd -= newStart; newStart = 0; }
  if (newEnd > maxIdx) { newStart -= (newEnd - maxIdx); newEnd = maxIdx; }
  chartState.zoomRange = [Math.max(0, newStart), Math.min(maxIdx, newEnd)];
  renderAllPanels(series);
});
window.addEventListener("mouseup", () => {
  if (isPanningChart) {
    isPanningChart = false;
    priceChartEl.classList.remove("panning");
  }
});

window.addEventListener("resize", debounce(() => {
  if (chartState.series) renderAllPanels(chartState.series);
}, 200));

function debounce(fn, wait) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}

// ---- Public entry point (called from script.js after a ticker loads) ----
function initChart(symbol) {
  chartState.symbol = symbol;
  chartState.cache = {};
  chartState.series = null;
  Array.from(chartRangeRow.querySelectorAll("button")).forEach(b => b.classList.toggle("active", b.dataset.range === chartState.range));

  const exotic = symbol.includes(":");
  chartRangeRow.classList.toggle("hidden", exotic);
  chartOverlayRow.classList.toggle("hidden", exotic);

  if (exotic) {
    showChartUnavailable("Charts currently only support plain ticker symbols (stocks/ETFs) — this symbol's format isn't supported yet.");
    return;
  }
  if (IS_LOCAL_DEV && (typeof TWELVE_DATA_API_KEY === "undefined" || !TWELVE_DATA_API_KEY || TWELVE_DATA_API_KEY === "YOUR_TWELVE_DATA_KEY_HERE")) {
    showChartUnavailable("Add a free Twelve Data API key to config.js to enable price charts (Finnhub's free plan doesn't include them). See README.md.");
    return;
  }

  loadChartRange();
}

async function loadChartRange() {
  const symbol = chartState.symbol;
  const range = chartState.range;
  const cacheKey = `${symbol}:${range}`;
  chartState.zoomRange = null; // a different range/bar-count invalidates any previous zoom window

  if (chartState.cache[cacheKey]) {
    chartState.series = chartState.cache[cacheKey];
    renderAllPanels(chartState.series);
    return;
  }

  const { interval, outputsize } = RANGE_CONFIGS[range];
  try {
    const url = twelveDataUrl("/time_series", { symbol, interval, outputsize });
    const res = await fetch(url);
    const data = await res.json();
    if (!data || data.status === "error" || !Array.isArray(data.values) || data.values.length < 2) {
      showChartUnavailable("Price data isn't available for this symbol/range right now.");
      return;
    }
    const values = [...data.values].reverse();
    const series = {
      times: values.map(v => v.datetime),
      timesMs: values.map(v => parseNaiveTime(v.datetime)),
      opens: values.map(v => parseFloat(v.open)),
      highs: values.map(v => parseFloat(v.high)),
      lows: values.map(v => parseFloat(v.low)),
      closes: values.map(v => parseFloat(v.close)),
      volumes: values.map(v => parseFloat(v.volume) || 0),
      intraday: !DAILY_OR_LONGER_INTERVALS.includes(interval),
      intervalMs: INTERVAL_MS[interval],
    };
    chartState.cache[cacheKey] = series;
    chartState.series = series;
    renderAllPanels(series);
  } catch {
    showChartUnavailable("Something went wrong loading chart data.");
  }
}

function showChartUnavailable(message) {
  chartState.series = null;
  chartNoteEl.textContent = message;
  chartNoteEl.classList.remove("hidden");
  chartWrap.classList.add("hidden");
  volumeChartEl.parentElement.classList.add("hidden");
  rsiChartEl.parentElement.classList.add("hidden");
  macdChartEl.parentElement.classList.add("hidden");
  srNoteEl.textContent = "";
}

// ---- Shared x-axis mapping ----
// Single-session intraday (1H/4H/1D): time-proportional, so overnight/
// closed gaps show as a visual jump, like real trading charts. Daily bars
// AND 1W: index-proportional instead. 1W spans 5 trading sessions but only
// ~6.5 of every 24 hours is actual trading time (less on the weekend in
// between) — a time-proportional axis would give the 4 overnight/weekend
// gaps most of the width and squeeze each day's real data into a thin
// sliver, which is exactly what made the 1W chart look "really weird"
// (found 2026-08-06). Index-based spacing avoids that, same as 3M/6M.
// visStart/visEnd (inclusive indices) default to the full series — pass
// the current zoom window (getVisibleIndices) to map only that slice onto
// plotW, so zooming in spreads fewer points across the same pixel width.
function getXMapper(series, plotW, visStart, visEnd) {
  if (visStart === undefined) visStart = 0;
  if (visEnd === undefined) visEnd = series.closes.length - 1;

  if (series.intraday && chartState.range !== "1W") {
    let minT = series.timesMs[visStart];
    let maxT = series.timesMs[visEnd];

    // 1D/4H specifically: extend the axis to the full session window
    // (4am-8pm) so there's actual pixel space to shade pre-market/
    // after-hours into. Without this, the axis is tightly bounded to
    // just the real data points — and since Twelve Data's free tier only
    // returns bars for 9:30am-4pm, minT/maxT would already equal the
    // regular-hours boundary, leaving zero width for those bands
    // (drawSessionShading would compute from >= to and draw nothing).
    if (chartState.range === "1D" || chartState.range === "4H") {
      const firstDateStr = series.times[visStart].slice(0, 10);
      const lastDateStr = series.times[visEnd].slice(0, 10);
      minT = Math.min(minT, parseNaiveTime(`${firstDateStr} 04:00:00`));
      maxT = Math.max(maxT, parseNaiveTime(`${lastDateStr} 20:00:00`));
    }

    const span = maxT - minT || 1;
    return {
      xFor: i => PAD_LEFT + ((series.timesMs[i] - minT) / span) * plotW,
      xForTime: t => PAD_LEFT + ((t - minT) / span) * plotW,
      minT, maxT,
      indexForX: mouseX => {
        const targetT = minT + ((mouseX - PAD_LEFT) / plotW) * span;
        let closest = visStart, closestDist = Infinity;
        for (let i = visStart; i <= visEnd; i++) {
          const d = Math.abs(series.timesMs[i] - targetT);
          if (d < closestDist) { closestDist = d; closest = i; }
        }
        return closest;
      },
    };
  }
  const n = visEnd - visStart;
  return {
    xFor: i => PAD_LEFT + ((i - visStart) / (n || 1)) * plotW,
    xForTime: null,
    minT: null, maxT: null,
    indexForX: mouseX => Math.round(((mouseX - PAD_LEFT) / plotW) * (n || 1)) + visStart,
  };
}

// ---- Session shading (pre-market / regular / after-hours) ----
function drawSessionShading(ctx, series, xmap, padTop, plotH) {
  // Only 1D/4H: on multi-day intraday ranges (e.g. 1W), one shaded pair
  // per day turns into a wall of repeating stripes that swamps the actual
  // price line — this was the root cause of "1W chart looks really weird".
  if (!series.intraday || !xmap.xForTime) return;
  if (chartState.range !== "1D" && chartState.range !== "4H") return;

  const dateSet = new Set(series.times.map(t => t.slice(0, 10)));
  dateSet.forEach(dateStr => {
    const preStart = parseNaiveTime(`${dateStr} 04:00:00`);
    const regStart = parseNaiveTime(`${dateStr} 09:30:00`);
    const regEnd = parseNaiveTime(`${dateStr} 16:00:00`);
    const afterEnd = parseNaiveTime(`${dateStr} 20:00:00`);

    const drawBand = (t0, t1, color) => {
      const from = Math.max(t0, xmap.minT);
      const to = Math.min(t1, xmap.maxT);
      if (from >= to) return;
      const x0 = xmap.xForTime(from);
      const x1 = xmap.xForTime(to);
      ctx.fillStyle = color;
      ctx.fillRect(x0, padTop, Math.max(x1 - x0, 0), plotH);
    };

    drawBand(preStart, regStart, "rgba(224,171,46,0.12)"); // pre-market: soft amber
    drawBand(regEnd, afterEnd, "rgba(140,160,200,0.13)"); // after-hours: soft blue-grey
  });
}

// ---- Moving averages ----
function computeSMA(values, period) {
  const sma = new Array(values.length).fill(null);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    if (i >= period - 1) sma[i] = sum / period;
  }
  return sma;
}

function renderAllPanels(series, hoverIdx) {
  chartNoteEl.classList.add("hidden");
  chartWrap.classList.remove("hidden");
  volumeChartEl.parentElement.classList.remove("hidden");
  rsiChartEl.parentElement.classList.remove("hidden");
  macdChartEl.parentElement.classList.remove("hidden");

  const [visStart, visEnd] = getVisibleIndices(series);
  resetZoomBtn.classList.toggle("hidden", !chartState.zoomRange);

  // Support/resistance rescoped to what's actually visible when zoomed —
  // levels from far outside the current view aren't useful reference
  // points once you've zoomed into a narrower window.
  const sr = computeSupportResistance(series.closes.slice(visStart, visEnd + 1));
  chartState.sr = sr;
  renderPricePanel(series, sr, hoverIdx);
  renderVolumePanel(series, hoverIdx);
  renderRSIPanel(series, hoverIdx);
  renderMACDPanel(series, hoverIdx);

  if (sr.support.length === 0 && sr.resistance.length === 0) {
    srNoteEl.textContent = "Not enough swing points in this range to estimate support/resistance levels.";
  } else {
    const parts = [];
    if (sr.resistance.length) parts.push(`Resistance ~${sr.resistance.map(chartFormatCurrency).join(", ")}`);
    if (sr.support.length) parts.push(`Support ~${sr.support.map(chartFormatCurrency).join(", ")}`);
    srNoteEl.textContent = `${parts.join(" · ")} — simple levels based on where price has repeatedly turned in this range, not a guarantee it holds again.`;
  }
}

// ---- Canvas setup (crisp on any screen size / device pixel ratio) ----
function setupCanvas(canvas) {
  const cssWidth = canvas.parentElement.clientWidth;
  const cssHeight = parseInt(canvas.dataset.cssHeight || canvas.getAttribute("height"), 10);
  const dpr = window.devicePixelRatio || 1;
  canvas.width = cssWidth * dpr;
  canvas.height = cssHeight * dpr;
  canvas.style.width = `${cssWidth}px`;
  canvas.style.height = `${cssHeight}px`;
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, w: cssWidth, h: cssHeight };
}

function niceTicks(min, max, count) {
  if (min === max) { min -= 1; max += 1; }
  const step = (max - min) / count;
  return Array.from({ length: count + 1 }, (_, i) => min + step * i);
}

function formatChartDate(iso, intraday) {
  const d = new Date(iso.replace(" ", "T"));
  if (intraday) return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function drawHoverLine(ctx, x, padTop, plotH) {
  ctx.save();
  ctx.beginPath();
  ctx.setLineDash([3, 3]);
  ctx.moveTo(x, padTop);
  ctx.lineTo(x, padTop + plotH);
  ctx.strokeStyle = "rgba(160,170,170,0.5)";
  ctx.stroke();
  ctx.restore();
}

function attachHover(canvas, series, plotW) {
  const [visStart, visEnd] = getVisibleIndices(series);
  const xmap = getXMapper(series, plotW, visStart, visEnd);
  canvas.onmousemove = e => {
    if (isPanningChart) return; // dragging takes priority over hover/tooltip
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const idx = xmap.indexForX(mouseX);
    if (idx < visStart || idx > visEnd) { chartTooltipEl.classList.add("hidden"); return; }
    renderAllPanels(series, idx);
  };
  canvas.onmouseleave = () => {
    chartTooltipEl.classList.add("hidden");
    renderAllPanels(series, null);
  };
}

// ---- Price panel (axes, gridlines, session shading, overlays, S/R, hover) ----
function renderPricePanel(series, sr, hoverIdx) {
  const { ctx, w, h } = setupCanvas(priceChartEl);
  ctx.clearRect(0, 0, w, h);

  const padTop = 10, padBottom = 24;
  const plotW = w - PAD_LEFT - PAD_RIGHT;
  const plotH = h - padTop - padBottom;
  const [visStart, visEnd] = getVisibleIndices(series);
  const xmap = getXMapper(series, plotW, visStart, visEnd);
  const { closes, times } = series;

  // SMA/EMA still computed over the FULL series (a 20-day average needs
  // real data from before the visible window to be correct) — only the
  // OUTPUT gets sliced to the visible range, both for y-axis scaling here
  // and for what actually gets drawn further down.
  const smaFull20 = computeSMA(closes, 20), smaFull50 = computeSMA(closes, 50), emaFull20 = computeEMA(closes, 20);
  const overlayValues = [];
  if (chartState.overlays.sma20) overlayValues.push(...smaFull20.slice(visStart, visEnd + 1).filter(chartIsNum));
  if (chartState.overlays.sma50) overlayValues.push(...smaFull50.slice(visStart, visEnd + 1).filter(chartIsNum));
  if (chartState.overlays.ema20) overlayValues.push(...emaFull20.slice(visStart, visEnd + 1).filter(chartIsNum));

  const visibleCloses = closes.slice(visStart, visEnd + 1);
  const allLevels = [...visibleCloses, ...sr.support, ...sr.resistance, ...overlayValues];
  const min = Math.min(...allLevels);
  const max = Math.max(...allLevels);
  const yFor = price => padTop + plotH - ((price - min) / (max - min || 1)) * plotH;

  // session shading (drawn first, underneath everything)
  drawSessionShading(ctx, series, xmap, padTop, plotH);

  // gridlines + y-axis labels
  const ticks = niceTicks(min, max, 4);
  ctx.strokeStyle = "rgba(140,160,160,0.15)";
  ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue("--text-muted").trim() || "#7d818d";
  ctx.font = "11px -apple-system, sans-serif";
  ctx.textBaseline = "middle";
  ticks.forEach(t => {
    const y = yFor(t);
    ctx.beginPath();
    ctx.moveTo(PAD_LEFT, y);
    ctx.lineTo(w - PAD_RIGHT, y);
    ctx.stroke();
    ctx.fillText(chartFormatCurrency(t), 4, y);
  });

  // x-axis labels — spread across the visible window only
  const visibleSpan = visEnd - visStart;
  const xLabelCount = Math.min(5, visibleSpan + 1);
  ctx.textBaseline = "top";
  for (let i = 0; i < xLabelCount; i++) {
    const idx = visStart + Math.round((i / (xLabelCount - 1 || 1)) * visibleSpan);
    ctx.fillText(formatChartDate(times[idx], series.intraday), xmap.xFor(idx) - 14, h - padBottom + 6);
  }

  // support/resistance lines
  const cssVar = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  sr.resistance.forEach(level => drawLevelLine(ctx, level, yFor, PAD_LEFT, w - PAD_RIGHT, cssVar("--status-critical")));
  sr.support.forEach(level => drawLevelLine(ctx, level, yFor, PAD_LEFT, w - PAD_RIGHT, cssVar("--status-good")));

  // price: either a line + area fill, or candlesticks — drawn per session
  // segment (see getSegments) so overnight/weekend gaps break the line
  // instead of connecting yesterday's close to today's open with a
  // straight diagonal. Candles don't need that treatment since each one
  // is drawn independently at its own x position; the gap just shows up
  // as extra horizontal spacing between bars, which is the desired look.
  // Segments are clipped to the visible window so trend color and the
  // area fill reflect what's actually zoomed into, not the whole series.
  const segments = clipSegments(getSegments(series), visStart, visEnd);
  const trendUp = closes[visEnd] >= closes[visStart];
  const lineColor = trendUp ? "#1baf7a" : "#d03b3b";

  if (chartState.chartType === "candles") {
    drawCandles(ctx, series, xmap, yFor, plotW, visStart, visEnd);
  } else {
    const gradient = ctx.createLinearGradient(0, padTop, 0, padTop + plotH);
    gradient.addColorStop(0, trendUp ? "rgba(27,175,122,0.18)" : "rgba(208,59,59,0.18)");
    gradient.addColorStop(1, "rgba(0,0,0,0)");

    segments.forEach(([segStart, segEnd]) => {
      ctx.beginPath();
      for (let i = segStart; i <= segEnd; i++) {
        const x = xmap.xFor(i), y = yFor(closes[i]);
        if (i === segStart) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = lineColor;
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.lineTo(xmap.xFor(segEnd), padTop + plotH);
      ctx.lineTo(xmap.xFor(segStart), padTop + plotH);
      ctx.closePath();
      ctx.fillStyle = gradient;
      ctx.fill();
    });
  }

  // overlays: SMA20 / SMA50 / EMA20 (also broken at session gaps)
  const drawOverlay = (values, color) => {
    segments.forEach(([segStart, segEnd]) => {
      ctx.beginPath();
      let started = false;
      for (let i = segStart; i <= segEnd; i++) {
        const v = values[i];
        if (!chartIsNum(v)) { started = false; continue; }
        const x = xmap.xFor(i), y = yFor(v);
        if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.4;
      ctx.stroke();
    });
  };
  if (chartState.overlays.sma20) drawOverlay(smaFull20, "#e0ab2e");
  if (chartState.overlays.sma50) drawOverlay(smaFull50, "#7ea0ff");
  if (chartState.overlays.ema20) drawOverlay(emaFull20, "#e66767");

  // hover crosshair + tooltip
  if (chartIsNum(hoverIdx)) {
    const x = xmap.xFor(hoverIdx), y = yFor(closes[hoverIdx]);
    drawHoverLine(ctx, x, padTop, plotH);
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, Math.PI * 2);
    ctx.fillStyle = lineColor;
    ctx.fill();

    chartTooltipEl.textContent = chartState.chartType === "candles"
      ? `${formatChartDate(times[hoverIdx], series.intraday)} · O ${chartFormatCurrency(series.opens[hoverIdx])} H ${chartFormatCurrency(series.highs[hoverIdx])} L ${chartFormatCurrency(series.lows[hoverIdx])} C ${chartFormatCurrency(closes[hoverIdx])}`
      : `${formatChartDate(times[hoverIdx], series.intraday)} · ${chartFormatCurrency(closes[hoverIdx])}`;
    chartTooltipEl.classList.remove("hidden");
    const tooltipW = chartState.chartType === "candles" ? 230 : 120;
    const left = Math.min(Math.max(x - 50, 0), w - tooltipW);
    chartTooltipEl.style.left = `${left}px`;
    chartTooltipEl.style.top = `${Math.max(y - 34, 0)}px`;
  } else {
    chartTooltipEl.classList.add("hidden");
  }

  attachHover(priceChartEl, series, plotW);
}

// ---- Candlestick rendering (alternative to the line+area price view) ----
// Each candle is drawn independently at its own x position (unlike the
// line, which needs session-gap-aware segmenting) — a gap between trading
// sessions just shows up as extra horizontal space between bars, which is
// the normal look for a candlestick chart.
function drawCandles(ctx, series, xmap, yFor, plotW, visStart, visEnd) {
  if (visStart === undefined) visStart = 0;
  if (visEnd === undefined) visEnd = series.closes.length - 1;
  const n = visEnd - visStart + 1;
  // Bar width from the REAL spacing between data points, not plotW/n.
  // 1D/4H extend the x-axis out to the full 4am-8pm session window (for
  // session shading), so the actual trading-hours bars only occupy part
  // of that width — plotW/n assumed they were spread evenly across the
  // whole thing, which made candles wider than their real spacing and
  // overlap each other. xFor(end) - xFor(start) measures the true span
  // the visible bars occupy, however the axis (and zoom level) is set up.
  const dataSpan = n > 1 ? xmap.xFor(visEnd) - xmap.xFor(visStart) : plotW;
  const candleW = Math.max(2, Math.min(14, (dataSpan / Math.max(n - 1, 1)) * 0.6));
  for (let i = visStart; i <= visEnd; i++) {
    const x = xmap.xFor(i);
    const open = series.opens[i], close = series.closes[i], high = series.highs[i], low = series.lows[i];
    if (![open, close, high, low].every(chartIsNum)) continue;
    const up = close >= open;
    const color = up ? "#1baf7a" : "#d03b3b";

    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, yFor(high));
    ctx.lineTo(x, yFor(low));
    ctx.stroke();

    const yOpen = yFor(open), yClose = yFor(close);
    const bodyTop = Math.min(yOpen, yClose);
    const bodyH = Math.max(1, Math.abs(yOpen - yClose));
    ctx.fillStyle = color;
    ctx.fillRect(x - candleW / 2, bodyTop, candleW, bodyH);
  }
}

function drawLevelLine(ctx, level, yFor, xStart, xEnd, color) {
  const y = yFor(level);
  ctx.save();
  ctx.setLineDash([5, 4]);
  ctx.strokeStyle = color;
  ctx.globalAlpha = 0.6;
  ctx.beginPath();
  ctx.moveTo(xStart, y);
  ctx.lineTo(xEnd, y);
  ctx.stroke();
  ctx.restore();
}

// ---- Volume panel ----
function renderVolumePanel(series, hoverIdx) {
  const { ctx, w, h } = setupCanvas(volumeChartEl);
  ctx.clearRect(0, 0, w, h);
  const { volumes, closes } = series;
  const plotW = w - PAD_LEFT - PAD_RIGHT;
  const [visStart, visEnd] = getVisibleIndices(series);
  const xmap = getXMapper(series, plotW, visStart, visEnd);
  const visibleVolumes = volumes.slice(visStart, visEnd + 1);
  const max = Math.max(...visibleVolumes, 1);
  const barW = Math.max(plotW / visibleVolumes.length, 1);

  for (let i = visStart; i <= visEnd; i++) {
    const v = volumes[i];
    const barH = (v / max) * (h - 4);
    const up = i === visStart || closes[i] >= closes[i - 1];
    ctx.fillStyle = up ? "rgba(27,175,122,0.55)" : "rgba(208,59,59,0.55)";
    ctx.fillRect(xmap.xFor(i) - barW / 2, h - barH, Math.max(barW - 1, 1), barH);
  }

  if (chartIsNum(hoverIdx)) {
    const x = xmap.xFor(hoverIdx);
    drawHoverLine(ctx, x, 0, h);
    drawPanelReadout(ctx, w, `Vol ${formatVolume(volumes[hoverIdx])}`);
  }

  attachHover(volumeChartEl, series, plotW);
}

function formatVolume(v) {
  if (v >= 1e9) return `${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(2)}M`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(1)}K`;
  return `${v}`;
}

function drawPanelReadout(ctx, w, text) {
  ctx.font = "11px -apple-system, sans-serif";
  ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue("--text-primary").trim() || "#fff";
  ctx.textAlign = "right";
  ctx.textBaseline = "top";
  ctx.fillText(text, w - 4, 2);
  ctx.textAlign = "left";
}

// ---- RSI panel ----
function computeRSI(closes, period = 14) {
  const rsi = new Array(closes.length).fill(null);
  if (closes.length <= period) return rsi;
  let gainSum = 0, lossSum = 0;
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) gainSum += diff; else lossSum -= diff;
  }
  let avgGain = gainSum / period, avgLoss = lossSum / period;
  rsi[period] = 100 - 100 / (1 + (avgLoss === 0 ? 100 : avgGain / avgLoss));
  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? -diff : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    rsi[i] = 100 - 100 / (1 + rs);
  }
  return rsi;
}

function renderRSIPanel(series, hoverIdx) {
  const { ctx, w, h } = setupCanvas(rsiChartEl);
  ctx.clearRect(0, 0, w, h);
  const rsi = computeRSI(series.closes, 14);
  const plotW = w - PAD_LEFT - PAD_RIGHT;
  const [visStart, visEnd] = getVisibleIndices(series);
  const xmap = getXMapper(series, plotW, visStart, visEnd);
  const padTop = 6, padBottom = 6;
  const plotH = h - padTop - padBottom;
  const yFor = v => padTop + plotH - (v / 100) * plotH;

  [30, 50, 70].forEach(level => {
    ctx.beginPath();
    ctx.strokeStyle = level === 50 ? "rgba(140,160,160,0.15)" : "rgba(140,160,160,0.25)";
    ctx.setLineDash(level === 50 ? [] : [3, 3]);
    ctx.moveTo(PAD_LEFT, yFor(level));
    ctx.lineTo(w - PAD_RIGHT, yFor(level));
    ctx.stroke();
    ctx.setLineDash([]);
  });

  clipSegments(getSegments(series), visStart, visEnd).forEach(([segStart, segEnd]) => {
    ctx.beginPath();
    let started = false;
    for (let i = segStart; i <= segEnd; i++) {
      const v = rsi[i];
      if (v === null) { started = false; continue; }
      const x = xmap.xFor(i), y = yFor(v);
      if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = "#1baf7a";
    ctx.lineWidth = 1.5;
    ctx.stroke();
  });

  if (chartIsNum(hoverIdx)) {
    drawHoverLine(ctx, xmap.xFor(hoverIdx), 0, h);
    const v = rsi[hoverIdx];
    drawPanelReadout(ctx, w, chartIsNum(v) ? `RSI ${v.toFixed(1)}` : "RSI --");
  }

  attachHover(rsiChartEl, series, plotW);
}

// ---- MACD panel ----
function computeEMA(values, period) {
  const k = 2 / (period + 1);
  const ema = new Array(values.length).fill(null);
  let prev = null;
  for (let i = 0; i < values.length; i++) {
    if (values[i] === null || values[i] === undefined) continue;
    prev = prev === null ? values[i] : values[i] * k + prev * (1 - k);
    ema[i] = prev;
  }
  return ema;
}

function computeMACD(closes) {
  const ema12 = computeEMA(closes, 12);
  const ema26 = computeEMA(closes, 26);
  const macdLine = closes.map((_, i) => (chartIsNum(ema12[i]) && chartIsNum(ema26[i])) ? ema12[i] - ema26[i] : null);
  const signalLine = computeEMA(macdLine, 9);
  const histogram = macdLine.map((v, i) => (chartIsNum(v) && chartIsNum(signalLine[i])) ? v - signalLine[i] : null);
  return { macdLine, signalLine, histogram };
}

function renderMACDPanel(series, hoverIdx) {
  const { ctx, w, h } = setupCanvas(macdChartEl);
  ctx.clearRect(0, 0, w, h);
  const { macdLine, signalLine, histogram } = computeMACD(series.closes);
  const plotW = w - PAD_LEFT - PAD_RIGHT;
  const [visStart, visEnd] = getVisibleIndices(series);
  const xmap = getXMapper(series, plotW, visStart, visEnd);

  const values = [macdLine, signalLine, histogram].flatMap(arr => arr.slice(visStart, visEnd + 1)).filter(chartIsNum);
  if (values.length === 0) return;
  const max = Math.max(...values.map(Math.abs), 0.01);
  const padTop = 6, padBottom = 6;
  const plotH = h - padTop - padBottom;
  const mid = padTop + plotH / 2;
  const yFor = v => mid - (v / max) * (plotH / 2);

  ctx.beginPath();
  ctx.strokeStyle = "rgba(140,160,160,0.2)";
  ctx.moveTo(PAD_LEFT, mid);
  ctx.lineTo(w - PAD_RIGHT, mid);
  ctx.stroke();

  const barW = Math.max(plotW / (visEnd - visStart + 1), 1);
  for (let i = visStart; i <= visEnd; i++) {
    const v = histogram[i];
    if (!chartIsNum(v)) continue;
    const y0 = yFor(0), y1 = yFor(v);
    ctx.fillStyle = v >= 0 ? "rgba(27,175,122,0.5)" : "rgba(208,59,59,0.5)";
    ctx.fillRect(xmap.xFor(i) - barW / 2, Math.min(y0, y1), Math.max(barW - 1, 1), Math.abs(y1 - y0));
  }

  const segments = clipSegments(getSegments(series), visStart, visEnd);
  const drawLine = (arr, color) => {
    segments.forEach(([segStart, segEnd]) => {
      ctx.beginPath();
      let started = false;
      for (let i = segStart; i <= segEnd; i++) {
        const v = arr[i];
        if (!chartIsNum(v)) { started = false; continue; }
        const x = xmap.xFor(i), y = yFor(v);
        if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    });
  };
  drawLine(macdLine, "#1baf7a");
  drawLine(signalLine, "#e0ab2e");

  if (chartIsNum(hoverIdx)) {
    drawHoverLine(ctx, xmap.xFor(hoverIdx), 0, h);
    const v = macdLine[hoverIdx];
    drawPanelReadout(ctx, w, chartIsNum(v) ? `MACD ${v.toFixed(2)}` : "MACD --");
  }

  attachHover(macdChartEl, series, plotW);
}

// ---- Simple support/resistance ----
function findPivots(closes, window = 4) {
  const highs = [], lows = [];
  for (let i = window; i < closes.length - window; i++) {
    const slice = closes.slice(i - window, i + window + 1);
    if (closes[i] === Math.max(...slice)) highs.push(closes[i]);
    if (closes[i] === Math.min(...slice)) lows.push(closes[i]);
  }
  return { highs, lows };
}

function clusterLevels(levels, tolerancePct = 0.02) {
  if (levels.length === 0) return [];
  const sorted = [...levels].sort((a, b) => a - b);
  const clusters = [];
  sorted.forEach(level => {
    const last = clusters[clusters.length - 1];
    if (last && Math.abs(level - last.avg) / last.avg < tolerancePct) {
      last.values.push(level);
      last.avg = last.values.reduce((a, b) => a + b, 0) / last.values.length;
    } else {
      clusters.push({ values: [level], avg: level });
    }
  });
  return clusters.sort((a, b) => b.values.length - a.values.length);
}

function computeSupportResistance(closes) {
  const { highs, lows } = findPivots(closes);
  const resistance = clusterLevels(highs).slice(0, 2).map(c => c.avg).sort((a, b) => b - a);
  const support = clusterLevels(lows).slice(0, 2).map(c => c.avg).sort((a, b) => b - a);
  return { support, resistance };
}
