// "What If You'd Invested?" — a draggable-years calculator using real
// historical daily closes (Twelve Data, same source/helper as chart.js).
// One years-ago slider drives two numbers built from the SAME historical
// window: a real backward-looking result (what a past investment actually
// did) and an illustrative forward projection (what a new investment
// COULD do if that same historical annual growth rate continued). A
// separate returns table shows the same math across fixed common windows
// (1M/3M/6M/1Y/3Y/5Y), same pattern most brokerage sites use.
//
// Confirmed directly (2026-08-06) that dividend history isn't available
// on the free plan for either data source used here (Finnhub's
// /stock/dividend and Twelve Data's /dividends both reject the free key).
// So every number below is PRICE RETURN ONLY, and the UI says so — don't
// quietly add a dividend assumption without a real data source backing it,
// per this project's no-fabricated-numbers rule (see CLAUDE.md).

const MS_PER_YEAR = 365.25 * 24 * 60 * 60 * 1000;

const RETURNS_TABLE_WINDOWS = [
  { label: "1M", days: 30 },
  { label: "3M", days: 91 },
  { label: "6M", days: 182 },
  { label: "1Y", days: 365 },
  { label: "3Y", days: 3 * 365.25 },
  { label: "5Y", days: 5 * 365.25 },
];

const investState = {
  symbol: null,
  dailyCloses: null, // [{ dateMs, close }], ascending, ~10 years via Twelve Data
  years: 3,
  amount: 1000,
};

const investContentEl = document.getElementById("investContent");

async function initInvestCalc(symbol) {
  investState.symbol = symbol;
  investState.dailyCloses = null;
  investContentEl.innerHTML = '<p class="muted">Loading price history...</p>';

  if (symbol.includes(":")) {
    investContentEl.innerHTML = '<p class="muted">Not available for this symbol format yet.</p>';
    return;
  }
  if (IS_LOCAL_DEV && (typeof TWELVE_DATA_API_KEY === "undefined" || !TWELVE_DATA_API_KEY || TWELVE_DATA_API_KEY === "YOUR_TWELVE_DATA_KEY_HERE")) {
    investContentEl.innerHTML = '<p class="muted">Add a free Twelve Data API key to config.js to enable this (see README.md).</p>';
    return;
  }

  try {
    // ~10 years of daily bars in one call — plenty for a 1-10yr slider
    // and the 5Y row in the returns table, and cheap: this is the only
    // extra request the whole feature needs.
    const url = twelveDataUrl("/time_series", { symbol, interval: "1day", outputsize: 2600 });
    const res = await fetch(url);
    const data = await res.json();
    if (investState.symbol !== symbol) return; // user navigated away while this was in flight
    if (!data || data.status === "error" || !Array.isArray(data.values) || data.values.length < 30) {
      investContentEl.innerHTML = '<p class="muted">Not enough price history available for this symbol.</p>';
      return;
    }
    const values = [...data.values].reverse();
    investState.dailyCloses = values.map(v => ({
      dateMs: parseNaiveTime(`${v.datetime} 00:00:00`),
      close: parseFloat(v.close),
    }));
    renderInvestCalc();
  } catch {
    investContentEl.innerHTML = '<p class="muted">Something went wrong loading price history.</p>';
  }
}

// Finds the closing price on (or the nearest trading day before) a target date.
function closestCloseOnOrBefore(targetMs) {
  const arr = investState.dailyCloses;
  let result = arr[0];
  for (const point of arr) {
    if (point.dateMs > targetMs) break;
    result = point;
  }
  return result;
}

function renderInvestCalc() {
  const closes = investState.dailyCloses;
  const latest = closes[closes.length - 1];
  const symbol = displaySymbol(investState.symbol);

  investContentEl.innerHTML = "";

  const controls = document.createElement("div");
  controls.className = "invest-controls";
  controls.innerHTML = `
    <label class="invest-amount-row">
      Invest
      <span class="invest-amount-prefix">$</span>
      <input type="number" id="investAmountInput" min="1" max="10000000" step="1" value="${investState.amount}">
    </label>
    <div class="invest-years-row">
      <span id="investYearsLabel">${investState.years} year${investState.years === 1 ? "" : "s"} ago</span>
      <div class="invest-years-slider-row">
        <button type="button" id="investYearsMinus" class="invest-years-step" aria-label="One year less">−</button>
        <input type="range" id="investYearsSlider" min="1" max="10" step="1" value="${investState.years}">
        <button type="button" id="investYearsPlus" class="invest-years-step" aria-label="One year more">+</button>
      </div>
    </div>
  `;
  investContentEl.appendChild(controls);

  const resultsEl = document.createElement("div");
  resultsEl.id = "investResults";
  investContentEl.appendChild(resultsEl);

  const tableWrap = document.createElement("div");
  tableWrap.id = "investReturnsTableWrap";
  investContentEl.appendChild(tableWrap);
  renderReturnsTable(tableWrap, symbol, latest);

  const note = document.createElement("p");
  note.className = "muted small invest-note";
  note.textContent = "Based on real historical closing prices (Twelve Data). Price return only — historical dividend payouts aren't available on the free data plan this app uses, so they're not included here.";
  investContentEl.appendChild(note);

  const amountInput = document.getElementById("investAmountInput");
  const yearsSlider = document.getElementById("investYearsSlider");
  const yearsLabel = document.getElementById("investYearsLabel");
  const yearsMinus = document.getElementById("investYearsMinus");
  const yearsPlus = document.getElementById("investYearsPlus");

  const update = () => {
    const amount = Math.max(1, Number(amountInput.value) || 0);
    const years = Number(yearsSlider.value);
    investState.amount = amount;
    investState.years = years;
    yearsLabel.textContent = `${years} year${years === 1 ? "" : "s"} ago`;
    renderInvestResults(resultsEl, symbol, amount, years, latest);
  };

  amountInput.addEventListener("input", update);
  yearsSlider.addEventListener("input", update);
  yearsMinus.addEventListener("click", () => {
    yearsSlider.value = Math.max(Number(yearsSlider.min), Number(yearsSlider.value) - 1);
    update();
  });
  yearsPlus.addEventListener("click", () => {
    yearsSlider.value = Math.min(Number(yearsSlider.max), Number(yearsSlider.value) + 1);
    update();
  });
  update();
}

function renderInvestResults(el, symbol, amount, years, latest) {
  const targetMs = latest.dateMs - years * MS_PER_YEAR;
  const earliest = investState.dailyCloses[0];
  const notEnoughHistory = targetMs < earliest.dateMs;
  const past = closestCloseOnOrBefore(targetMs);

  if (notEnoughHistory || past.dateMs === latest.dateMs) {
    const availableYears = (latest.dateMs - earliest.dateMs) / MS_PER_YEAR;
    el.innerHTML = `<p class="muted">Only ${availableYears.toFixed(1)} years of price history available for ${symbol} — pick a shorter period.</p>`;
    return;
  }

  const shares = amount / past.close;
  const nowValue = shares * latest.close;
  const growthPct = ((nowValue - amount) / amount) * 100;
  const actualYears = (latest.dateMs - past.dateMs) / MS_PER_YEAR;
  const cagr = Math.pow(nowValue / amount, 1 / actualYears) - 1;

  const pastDateStr = new Date(past.dateMs).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  const sign = growthPct >= 0 ? "+" : "";
  const cagrSign = cagr >= 0 ? "+" : "";

  el.innerHTML = `
    <div class="invest-result-block">
      <p class="invest-result-lead">
        ${chartFormatCurrency(amount)} invested in ${symbol} on <strong>${pastDateStr}</strong>
        would be worth
      </p>
      <p class="invest-result-figure ${growthPct >= 0 ? "positive" : "negative"}">
        ${chartFormatCurrency(nowValue)}
        <span class="invest-result-pct">(${sign}${growthPct.toFixed(1)}% total)</span>
      </p>
      <p class="invest-yield-readout">
        Historical yield: <strong class="${cagr >= 0 ? "positive" : "negative"}">${cagrSign}${(cagr * 100).toFixed(1)}% / year</strong>
        <span class="muted small">(annualized, over ${actualYears.toFixed(1)} years)</span>
      </p>
    </div>
    <div class="invest-result-block invest-projection">
      <p class="invest-result-lead">
        If ${symbol}'s own ${actualYears.toFixed(1)}-year historical growth rate continued, ${chartFormatCurrency(amount)} invested <strong>today</strong> could grow to roughly
      </p>
      <p class="invest-result-figure invest-projection-figure">
        ${chartFormatCurrency(amount * Math.pow(1 + cagr, actualYears))}
        <span class="invest-result-pct">in ${actualYears.toFixed(1)} years</span>
      </p>
      <p class="muted small invest-projection-caveat">
        Illustrative only, not a prediction — this just extends ${symbol}'s own past growth rate forward assuming nothing changes.
        Real future returns depend on things no one can know in advance and will very likely differ, possibly by a lot.
      </p>
    </div>
  `;
}

// Fixed-window returns table (1M/3M/6M/1Y/3Y/5Y) — the same set most
// brokerage/finance sites show. Total return = simple price change over
// the window; annualized yield = that return expressed as a per-year
// rate, so a 1M and a 5Y number can be compared on the same basis (this
// is why a single strong month can show a very large annualized number —
// same convention other sites use, not a bug).
function renderReturnsTable(el, symbol, latest) {
  const earliest = investState.dailyCloses[0];

  const rows = RETURNS_TABLE_WINDOWS.map(({ label, days }) => {
    const targetMs = latest.dateMs - days * 24 * 60 * 60 * 1000;
    if (targetMs < earliest.dateMs) return { label, na: true };
    const past = closestCloseOnOrBefore(targetMs);
    if (past.dateMs === latest.dateMs) return { label, na: true };
    const totalPct = ((latest.close - past.close) / past.close) * 100;
    const actualYears = (latest.dateMs - past.dateMs) / MS_PER_YEAR;
    const annualPct = (Math.pow(latest.close / past.close, 1 / actualYears) - 1) * 100;
    return { label, na: false, totalPct, annualPct };
  });

  el.innerHTML = `
    <p class="invest-table-title">Historical returns &amp; yield, ${symbol}</p>
    <div class="invest-table-scroll">
      <table class="invest-returns-table">
        <thead>
          <tr><th></th>${rows.map(r => `<th>${r.label}</th>`).join("")}</tr>
        </thead>
        <tbody>
          <tr><th>Total return</th>${rows.map(r => `<td class="${r.na ? "muted" : (r.totalPct >= 0 ? "positive" : "negative")}">${r.na ? "N/A" : `${r.totalPct >= 0 ? "+" : ""}${r.totalPct.toFixed(1)}%`}</td>`).join("")}</tr>
          <tr><th>Annualized yield</th>${rows.map(r => `<td class="${r.na ? "muted" : (r.annualPct >= 0 ? "positive" : "negative")}">${r.na ? "N/A" : `${r.annualPct >= 0 ? "+" : ""}${r.annualPct.toFixed(1)}%`}</td>`).join("")}</tr>
        </tbody>
      </table>
    </div>
  `;
}
