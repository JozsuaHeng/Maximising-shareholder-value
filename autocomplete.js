// Ticker search autocomplete. Debounced Finnhub symbol search
// (confirmed free tier — /search?q=...), rendered as a dropdown under the
// search input. Depends on finnhubUrl()/fetchJSON()/loadTicker()/
// displaySymbol() from script.js, so this file must load after it.

const suggestionsBox = document.getElementById("searchSuggestions");

let suggestionResults = [];
let highlightedIndex = -1;
let debounceTimer = null;

function debounceSearch(fn, wait) {
  return (...args) => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => fn(...args), wait);
  };
}

const runSearch = debounceSearch(async query => {
  if (!query || query.trim().length === 0) {
    hideSuggestions();
    return;
  }
  try {
    const data = await fetchJSON(finnhubUrl("/search", { q: query.trim() }));
    suggestionResults = (data && data.result ? data.result : []).slice(0, 8);
    renderSuggestions();
  } catch {
    hideSuggestions();
  }
}, 300);

function renderSuggestions() {
  highlightedIndex = -1;
  if (suggestionResults.length === 0) {
    hideSuggestions();
    return;
  }
  suggestionsBox.innerHTML = "";
  suggestionResults.forEach((item, i) => {
    const row = document.createElement("button");
    row.type = "button";
    row.className = "suggestion-row";
    row.dataset.index = i;

    const name = document.createElement("span");
    name.className = "suggestion-name";
    name.textContent = item.description || item.symbol;

    const symbol = document.createElement("span");
    symbol.className = "suggestion-symbol";
    symbol.textContent = displaySymbol(item.symbol);

    row.appendChild(name);
    row.appendChild(symbol);
    row.addEventListener("click", () => selectSuggestion(i));
    suggestionsBox.appendChild(row);
  });
  suggestionsBox.classList.remove("hidden");
}

function selectSuggestion(i) {
  const item = suggestionResults[i];
  if (!item) return;
  hideSuggestions();
  tickerInput.value = "";
  loadTicker(item.symbol);
}

function hideSuggestions() {
  suggestionsBox.classList.add("hidden");
  suggestionsBox.innerHTML = "";
  suggestionResults = [];
  highlightedIndex = -1;
}

function updateHighlight() {
  Array.from(suggestionsBox.children).forEach((row, i) => {
    row.classList.toggle("highlighted", i === highlightedIndex);
  });
  if (highlightedIndex >= 0) {
    suggestionsBox.children[highlightedIndex].scrollIntoView({ block: "nearest" });
  }
}

tickerInput.addEventListener("input", () => runSearch(tickerInput.value));

// Registered on the CAPTURE phase (the `true` at the end) so this runs
// before script.js's plain "Enter -> search" listener, which was added
// first and listens on the default bubble phase. Calling stopPropagation()
// here during capture stops that later bubble-phase listener from firing
// at all when a suggestion is highlighted.
tickerInput.addEventListener("keydown", e => {
  if (suggestionResults.length === 0) return;

  if (e.key === "ArrowDown") {
    e.preventDefault();
    highlightedIndex = Math.min(highlightedIndex + 1, suggestionResults.length - 1);
    updateHighlight();
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    highlightedIndex = Math.max(highlightedIndex - 1, 0);
    updateHighlight();
  } else if (e.key === "Enter" && highlightedIndex >= 0) {
    e.preventDefault();
    e.stopPropagation();
    selectSuggestion(highlightedIndex);
  } else if (e.key === "Escape") {
    hideSuggestions();
  }
}, true);

document.addEventListener("click", e => {
  if (!suggestionsBox.contains(e.target) && e.target !== tickerInput) {
    hideSuggestions();
  }
});
