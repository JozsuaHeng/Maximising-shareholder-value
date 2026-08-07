// A personal "how close am I to Finnhub's 60/min limit" gauge — for the
// user's own awareness while clicking around, not a precise live quota.
//
// It can only count requests THIS browser tab has sent (via the log in
// script.js's finnhubUrl()) — it has no way to see calls from other tabs,
// other visitors, or the background edge cache. Finnhub's real 60/min
// limit is enforced server-side across everything hitting that API key,
// so a fully accurate number isn't something the client can ever show.
// This is deliberately framed as an estimate (see the (est.) label and
// tooltip in index.html) rather than a precise countdown, to avoid
// implying more certainty than the data actually supports.

const API_USAGE_WINDOW_MS = 60 * 1000;

const apiUsageFillEl = document.getElementById("apiUsageFill");
const apiUsageTextEl = document.getElementById("apiUsageText");

function renderApiUsage() {
  const now = Date.now();
  // Prune anything older than the trailing 60s window — keeps the log
  // array small and the count accurate without needing a separate timer
  // to remove old entries.
  while (finnhubCallLog.length && now - finnhubCallLog[0] > API_USAGE_WINDOW_MS) {
    finnhubCallLog.shift();
  }

  const count = finnhubCallLog.length;
  const pct = Math.min(100, (count / 60) * 100);
  apiUsageFillEl.style.width = `${pct}%`;
  apiUsageFillEl.classList.toggle("api-usage-fill-warn", count >= 45 && count < 60);
  apiUsageFillEl.classList.toggle("api-usage-fill-danger", count >= 60);

  if (count === 0) {
    apiUsageTextEl.textContent = "0 / 60 this min";
  } else {
    const oldest = finnhubCallLog[0];
    const resetInSec = Math.max(0, Math.ceil((API_USAGE_WINDOW_MS - (now - oldest)) / 1000));
    apiUsageTextEl.textContent = `${count} / 60 this min · resets in ${resetInSec}s`;
  }
}

setInterval(renderApiUsage, 1000);
renderApiUsage();
