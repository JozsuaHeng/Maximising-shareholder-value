// Rule-based "AI Outlook" engine.
//
// This is NOT a live AI/LLM call — it's a fixed set of if/else thresholds
// applied to the numbers we already fetched from Finnhub. It costs nothing
// and needs no extra API key. See CLAUDE.md for why this approach was
// chosen over a live Claude API call for v1.
//
// Every threshold here is a general rule of thumb, not sector-adjusted —
// e.g. "high" P/E means something different for a bank vs. a software
// company. Treat the output as a starting point, not a verdict.

function isNum(v) {
  return typeof v === "number" && !Number.isNaN(v);
}

function generateOutlook({ symbol, quote, metric, recommendation }) {
  const bullets = [];
  let score = 0;

  const pe = metric.peTTM;
  if (isNum(pe)) {
    if (pe > 30) {
      bullets.push(`P/E of ${pe.toFixed(1)} is on the higher side — the market is pricing in meaningful growth expectations, or the stock may simply be richly valued relative to current earnings.`);
      score -= 0.5;
    } else if (pe < 10) {
      bullets.push(`P/E of ${pe.toFixed(1)} is on the lower side — this can point to undervaluation, or reflect market caution about future earnings.`);
    } else {
      bullets.push(`P/E of ${pe.toFixed(1)} sits in a fairly typical range, not signaling extreme optimism or pessimism on its own.`);
      score += 0.5;
    }
  }

  const de = metric["totalDebt/totalEquityAnnual"];
  if (isNum(de)) {
    if (de > 1.5) {
      bullets.push(`Debt-to-Equity of ${de.toFixed(2)} indicates fairly high leverage — more financial risk if earnings soften or borrowing costs rise.`);
      score -= 0.5;
    } else if (de < 0.5) {
      bullets.push(`Debt-to-Equity of ${de.toFixed(2)} is conservative — the company relies mostly on its own capital rather than borrowing.`);
      score += 0.5;
    } else {
      bullets.push(`Debt-to-Equity of ${de.toFixed(2)} is a moderate, fairly typical level of leverage.`);
      score += 0.25;
    }
  }

  const roe = metric.roeTTM;
  if (isNum(roe)) {
    if (roe > 15) {
      bullets.push(`Return on Equity of ${roe.toFixed(1)}% is strong — shareholder capital is being turned into profit efficiently.`);
      score += 0.5;
    } else if (roe < 5) {
      bullets.push(`Return on Equity of ${roe.toFixed(1)}% is on the weak side.`);
      score -= 0.5;
    }
  }

  const netMargin = metric.netProfitMarginTTM;
  if (isNum(netMargin)) {
    if (netMargin > 15) {
      bullets.push(`Net margin of ${netMargin.toFixed(1)}% is healthy — a good share of revenue converts into actual profit.`);
      score += 0.5;
    } else if (netMargin < 5) {
      bullets.push(`Net margin of ${netMargin.toFixed(1)}% is thin — most revenue is being absorbed by costs.`);
      score -= 0.5;
    }
  }

  const revGrowth = metric.revenueGrowthTTMYoy;
  if (isNum(revGrowth)) {
    if (revGrowth > 15) {
      bullets.push(`Revenue grew ${revGrowth.toFixed(1)}% year-over-year — strong top-line momentum.`);
      score += 0.5;
    } else if (revGrowth < 0) {
      bullets.push(`Revenue shrank ${Math.abs(revGrowth).toFixed(1)}% year-over-year — worth understanding whether that's company-specific or an industry-wide slowdown.`);
      score -= 0.5;
    }
  }

  const vsMarket = metric["priceRelativeToS&P50013Week"];
  if (isNum(vsMarket)) {
    if (vsMarket > 5) {
      bullets.push(`Outperforming the S&P 500 by ${vsMarket.toFixed(1)} points over the last 13 weeks — recent relative strength.`);
      score += 0.25;
    } else if (vsMarket < -5) {
      bullets.push(`Underperforming the S&P 500 by ${Math.abs(vsMarket).toFixed(1)} points over the last 13 weeks — recent relative weakness.`);
      score -= 0.25;
    }
  }

  const beta = metric.beta;
  if (isNum(beta)) {
    if (beta > 1.3) {
      bullets.push(`Beta of ${beta.toFixed(2)} means this stock tends to swing more than the overall market — bigger moves in both directions.`);
    } else if (beta < 0.7) {
      bullets.push(`Beta of ${beta.toFixed(2)} means this stock has historically been more stable than the overall market.`);
    }
  }

  const dividend = metric.dividendYieldIndicatedAnnual;
  if (isNum(dividend) && dividend > 0) {
    bullets.push(`Pays a dividend yield of ${dividend.toFixed(2)}% — part of the return here comes as cash income, not just price appreciation.`);
  } else {
    bullets.push(`Pays no meaningful dividend — typical of a company reinvesting profits into growth rather than paying them out.`);
  }

  const high = metric["52WeekHigh"];
  const low = metric["52WeekLow"];
  if (isNum(high) && isNum(low) && isNum(quote.c) && high > low) {
    const pct = (quote.c - low) / (high - low);
    if (pct > 0.85) {
      bullets.push(`Trading near its 52-week high (${(pct * 100).toFixed(0)}% of the way up the range) — a sign of recent momentum, though it also means less room below before hitting new highs.`);
      score += 0.25;
    } else if (pct < 0.15) {
      bullets.push(`Trading near its 52-week low (${(pct * 100).toFixed(0)}% of the way up the range) — worth understanding whether that reflects a temporary setback or a deeper problem.`);
      score -= 0.25;
    } else {
      bullets.push(`Trading roughly in the middle of its 52-week range.`);
    }
  }

  if (recommendation) {
    const { strongBuy = 0, buy = 0, hold = 0, sell = 0, strongSell = 0 } = recommendation;
    const total = strongBuy + buy + hold + sell + strongSell;
    if (total > 0) {
      const buyShare = (strongBuy + buy) / total;
      const sellShare = (strongSell + sell) / total;
      const tilt = buyShare > 0.5 ? "bullish" : sellShare > 0.5 ? "bearish" : "mixed";
      bullets.push(`Analysts covering ${symbol} lean ${tilt} — ${strongBuy + buy} Buy/Strong Buy vs. ${strongSell + sell} Sell/Strong Sell out of ${total} ratings.`);
      if (buyShare > 0.5) score += 0.5;
      else if (sellShare > 0.5) score -= 0.5;
    }
  }

  let headline;
  if (bullets.length === 0) {
    headline = "Not enough data was returned to form a read on this stock.";
  } else if (score > 1.5) {
    headline = "Taken together, today's numbers lean encouraging.";
  } else if (score < -1) {
    headline = "Taken together, today's numbers show some caution flags worth digging into.";
  } else {
    headline = "Taken together, today's numbers are mixed — some positives, some to watch.";
  }

  return {
    headline,
    bullets,
    caveat: "This is an automated read based only on today's numbers, generated with fixed rules — not a live AI analysis, and not financial advice. It doesn't know about recent news, competitive position, or industry context, so use it as a starting point alongside your own research.",
  };
}
