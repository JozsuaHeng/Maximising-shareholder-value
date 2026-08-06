// "What If You'd Invested?" — a draggable-years calculator using real
// historical daily closes (Twelve Data, same source/helper as chart.js).
// One years-ago slider drives two numbers built from the SAME historical
// window: a real backward-looking result (what a past investment actually
// did) and an illustrative forward projection (what a new investment
// COULD do if that same historical annual growth rate continued).
//
// Confirmed directly (2026-08-06) that dividend history isn't available
// on the free plan for either data source used here (Finnhub's
// /stock/dividend and Twelve Data's /dividends both reject the free key).
// So both numbers below are PRICE RETURN ONLY, and the UI says so — don't
// quietly add a dividend assumption without a real data source backing it,
// per this project's no-fabricated-numbers rule (see CLAUDE.md).

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
    // ~10 years of daily bars in one call — plenty for a 1-10yr slider,
    // and cheap: this is the only extra request the whole feature needs.
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
    <label class="invest-years-row">
      <span id="investYearsLabel">${investState.years} year${investState.years === 1 ? "" : "s"} ago</span>
      <input type="range" id="investYearsSlider" min="1" max="10" step="1" value="${investState.years}">
    </label>
  `;
  investContentEl.appendChild(controls);

  const resultsEl = document.createElement("div");
  resultsEl.id = "investResults";
  investContentEl.appendChild(resultsEl);

  const note = document.createElement("p");
  note.className = "muted small invest-note";
  note.textContent = "Based on real historical closing prices (Twelve Data). Price return only — historical dividend payouts aren't available on the free data plan this app uses, so they're not included here.";
  investContentEl.appendChild(note);

  const amountInput = document.getElementById("investAmountInput");
  const yearsSlider = document.getElementById("investYearsSlider");
  const yearsLabel = document.getElementById("investYearsLabel");

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
  update();
}

function renderInvestResults(el, symbol, amount, years, latest) {
  const targetMs = latest.dateMs - years * 365.25 * 24 * 60 * 60 * 1000;
  const earliest = investState.dailyCloses[0];
  const notEnoughHistory = targetMs < earliest.dateMs;
  const past = closestCloseOnOrBefore(targetMs);

  if (notEnoughHistory || past.dateMs === latest.dateMs) {
    const availableYears = (latest.dateMs - earliest.dateMs) / (365.25 * 24 * 60 * 60 * 1000);
    el.innerHTML = `<p class="muted">Only ${availableYears.toFixed(1)} years of price history available for ${symbol} — pick a shorter period.</p>`;
    return;
  }

  const shares = amount / past.close;
  const nowValue = shares * latest.close;
  const growthPct = ((nowValue - amount) / amount) * 100;
  const actualYears = (latest.dateMs - past.dateMs) / (365.25 * 24 * 60 * 60 * 1000);
  const cagr = Math.pow(nowValue / amount, 1 / actualYears) - 1;

  const pastDateStr = new Date(past.dateMs).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  const sign = growthPct >= 0 ? "+" : "";

  el.innerHTML = `
    <div class="invest-result-block">
      <p class="invest-result-lead">
        ${chartFormatCurrency(amount)} invested in ${symbol} on <strong>${pastDateStr}</strong>
        would be worth
      </p>
      <p class="invest-result-figure ${growthPct >= 0 ? "positive" : "negative"}">
        ${chartFormatCurrency(nowValue)}
        <span class="invest-result-pct">(${sign}${growthPct.toFixed(1)}%)</span>
      </p>
      <p class="muted small">That's an average of about ${sign}${(cagr * 100).toFixed(1)}% per year over ${actualYears.toFixed(1)} years.</p>
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
