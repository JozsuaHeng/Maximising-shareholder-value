// Side-by-side stock comparison. Depends on finnhubUrl()/fetchJSON()/
// isNum()/formatCurrency()/formatCount()/displaySymbol()/getSectorBucket()/
// getTrafficLight()/TRAFFIC_LABELS/DEFINITIONS/showTooltip() from
// script.js/sectorRules.js, so this file must load after those.

const MAX_COMPARE = 4;

const compareView = document.getElementById("compareView");
const compareLink = document.getElementById("compareLink");
const compareInputRow = document.getElementById("compareInputRow");
const compareAddBtn = document.getElementById("compareAddBtn");
const compareRunBtn = document.getElementById("compareRunBtn");
const compareStatus = document.getElementById("compareStatus");
const compareResultsCard = document.getElementById("compareResultsCard");
const compareResults = document.getElementById("compareResults");

// Each row's value comes from the same metric object shape used
// elsewhere in the app (quote/profile2/stock-metric), so the numbers here
// match what you'd see on that stock's own deep-dive page.
const COMPARE_ROWS = [
  { label: "Price", defKey: null, isPercent: false, isCurrency: true, get: ({ quote }) => quote.c },
  { label: "Change Today", defKey: null, isPercent: true, get: ({ quote }) => quote.dp },
  { label: "Market Cap ($M)", defKey: "marketCap", isPercent: false, get: ({ profile }) => profile.marketCapitalization },
  { label: "P/E Ratio", defKey: "peRatio", isPercent: false, get: ({ metric }) => metric.peTTM },
  { label: "P/B Ratio", defKey: "pbRatio", isPercent: false, get: ({ metric }) => metric.pbAnnual },
  { label: "EV/EBITDA", defKey: "evEbitda", isPercent: false, get: ({ metric }) => metric.evEbitdaTTM },
  { label: "Revenue Growth (TTM)", defKey: "revenueGrowth", isPercent: true, get: ({ metric }) => metric.revenueGrowthTTMYoy },
  { label: "Net Margin", defKey: "netMargin", isPercent: true, get: ({ metric }) => metric.netProfitMarginTTM },
  { label: "Return on Equity", defKey: "roe", isPercent: true, get: ({ metric }) => metric.roeTTM },
  { label: "Dividend Yield", defKey: "dividendYield", isPercent: true, get: ({ metric }) => metric.dividendYieldIndicatedAnnual },
  { label: "Beta", defKey: "beta", isPercent: false, get: ({ metric }) => metric.beta },
  {
    label: "52-Week Range Position", defKey: "fiftyTwoWeekRangeContext", isPercent: true,
    get: ({ metric, quote }) => {
      const high = metric["52WeekHigh"], low = metric["52WeekLow"];
      if (!isNum(high) || !isNum(low) || high <= low) return undefined;
      return ((quote.c - low) / (high - low)) * 100;
    },
  },
];

compareLink.addEventListener("click", showCompareView);

function showCompareView() {
  dashboard.classList.add("hidden");
  homeView.classList.add("hidden");
  compareView.classList.remove("hidden");
  tickerInput.value = "";
  setStatus("");
  const firstInput = compareInputRow.querySelector(".compare-ticker-input");
  if (firstInput) firstInput.focus();
}

compareAddBtn.addEventListener("click", () => {
  const current = compareInputRow.querySelectorAll(".compare-ticker-input").length;
  if (current >= MAX_COMPARE) return;
  const input = document.createElement("input");
  input.type = "text";
  input.className = "compare-ticker-input";
  input.placeholder = "Ticker";
  compareInputRow.appendChild(input);
  input.focus();
  if (current + 1 >= MAX_COMPARE) compareAddBtn.classList.add("hidden");
});

compareRunBtn.addEventListener("click", runCompare);
compareInputRow.addEventListener("keydown", e => {
  if (e.key === "Enter") runCompare();
});

async function fetchCompareData(symbol) {
  const [quote, profile, metricRes] = await Promise.all([
    fetchJSON(finnhubUrl("/quote", { symbol })),
    fetchJSON(finnhubUrl("/stock/profile2", { symbol })),
    fetchJSON(finnhubUrl("/stock/metric", { symbol, metric: "all" })),
  ]);
  if (!quote || quote.c === 0) return null;
  return { symbol, quote, profile, metric: metricRes.metric || {} };
}

async function runCompare() {
  const symbols = Array.from(compareInputRow.querySelectorAll(".compare-ticker-input"))
    .map(el => el.value.trim().toUpperCase())
    .filter(Boolean);

  if (symbols.length < 2) {
    compareStatus.textContent = "Enter at least two tickers to compare.";
    return;
  }

  compareStatus.textContent = `Loading ${symbols.join(", ")}...`;
  compareResultsCard.classList.add("hidden");

  const results = await Promise.allSettled(symbols.map(fetchCompareData));
  const entries = [];
  const failed = [];
  results.forEach((r, i) => {
    if (r.status === "fulfilled" && r.value) entries.push(r.value);
    else failed.push(symbols[i]);
  });

  if (entries.length < 2) {
    compareStatus.textContent = `Couldn't load enough valid tickers to compare${failed.length ? ` (failed: ${failed.join(", ")})` : ""}.`;
    return;
  }

  compareStatus.textContent = failed.length ? `Couldn't load: ${failed.join(", ")}.` : "";
  renderCompareTable(entries);
  compareResultsCard.classList.remove("hidden");
}

function renderCompareTable(entries) {
  compareResults.innerHTML = "";
  const table = document.createElement("div");
  table.className = "compare-table";
  table.style.setProperty("--compare-cols", entries.length);

  // top-left blank corner
  table.appendChild(document.createElement("div")).className = "compare-cell compare-corner";

  entries.forEach(entry => {
    const header = document.createElement("button");
    header.type = "button";
    header.className = "compare-cell compare-col-header";
    const name = document.createElement("div");
    name.className = "compare-col-name";
    name.textContent = entry.profile.name || displaySymbol(entry.symbol);
    const ticker = document.createElement("div");
    ticker.className = "compare-col-ticker";
    ticker.textContent = displaySymbol(entry.symbol);
    header.appendChild(name);
    header.appendChild(ticker);
    header.title = "Open full deep-dive";
    header.addEventListener("click", () => loadTicker(entry.symbol));
    table.appendChild(header);
  });

  COMPARE_ROWS.forEach(row => {
    const labelCell = document.createElement("div");
    labelCell.className = "compare-cell compare-row-label";
    const labelText = document.createElement("span");
    labelText.textContent = row.label;
    labelCell.appendChild(labelText);
    if (row.defKey) {
      const helpBtn = document.createElement("button");
      helpBtn.className = "help-btn";
      helpBtn.textContent = "?";
      helpBtn.addEventListener("click", () => showTooltip(row.label, row.defKey, undefined));
      labelCell.appendChild(helpBtn);
    }
    table.appendChild(labelCell);

    entries.forEach(entry => {
      const cell = document.createElement("div");
      cell.className = "compare-cell";
      const value = row.get(entry);

      const valueEl = document.createElement("span");
      valueEl.className = "compare-value";
      if (!isNum(value)) {
        valueEl.textContent = "N/A";
      } else if (row.isCurrency) {
        valueEl.textContent = formatCurrency(value);
      } else if (row.isPercent) {
        valueEl.textContent = `${value.toFixed(2)}%`;
      } else {
        valueEl.textContent = value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      }
      cell.appendChild(valueEl);

      if (row.defKey && isNum(value)) {
        const bucket = getSectorBucket(entry.profile.finnhubIndustry);
        const light = getTrafficLight(row.defKey, value, bucket);
        if (light) {
          const dot = document.createElement("span");
          dot.className = `traffic-dot traffic-${light}`;
          dot.title = TRAFFIC_LABELS[light];
          cell.appendChild(dot);
        }
      }

      table.appendChild(cell);
    });
  });

  compareResults.appendChild(table);
}
