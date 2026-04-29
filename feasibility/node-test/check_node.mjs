// Mirrors check_yfinance.py for the Node port. We only need to confirm:
//   1. 1-min OHLC bars work for ~30-day-old timestamps
//   2. News endpoint returns title + url + publish time
//   3. Latency is comparable
// If yes, the whole stack stays in TypeScript and we can drop Python.

import YahooFinance from "yahoo-finance2";

const yahooFinance = new YahooFinance();
if (typeof yahooFinance.suppressNotices === "function") {
  yahooFinance.suppressNotices(["yahooSurvey", "ripHistorical"]);
}

function mostRecentWeekdayDaysAgo(daysAgo, hour, minute) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - daysAgo);
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) {
    d.setUTCDate(d.getUTCDate() - 1);
  }
  // Set to ET hour:minute by computing the UTC equivalent.
  // ET in late April 2026 is EDT = UTC-4.
  d.setUTCHours(hour + 4, minute, 0, 0);
  return d;
}

async function fetchWindow(ticker, target, hoursEachSide = 2) {
  const period1 = new Date(target.getTime() - hoursEachSide * 3600 * 1000);
  const period2 = new Date(target.getTime() + hoursEachSide * 3600 * 1000);
  const t0 = performance.now();
  try {
    const result = await yahooFinance.chart(ticker, {
      period1,
      period2,
      interval: "1m",
      includePrePost: false,
    });
    const elapsed = performance.now() - t0;
    const quotes = result?.quotes || [];
    return {
      ok: true,
      bars: quotes.length,
      elapsedMs: elapsed,
      first: quotes[0]?.date,
      last: quotes[quotes.length - 1]?.date,
      sampleKeys: quotes[0] ? Object.keys(quotes[0]) : [],
    };
  } catch (e) {
    return { ok: false, error: e.message, elapsedMs: performance.now() - t0 };
  }
}

async function newsTest(ticker) {
  const t0 = performance.now();
  try {
    const news = await yahooFinance.search(ticker, { newsCount: 10, quotesCount: 0 });
    const elapsed = performance.now() - t0;
    return { ok: true, count: news.news?.length || 0, elapsedMs: elapsed, sample: news.news?.slice(0, 3) };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

const cases = [
  { ticker: "NVDA", target: mostRecentWeekdayDaysAgo(2, 10, 30), label: "Recent: 2 days ago" },
  { ticker: "NVDA", target: mostRecentWeekdayDaysAgo(7, 10, 30), label: "Boundary: 7 days ago" },
  { ticker: "NVDA", target: mostRecentWeekdayDaysAgo(14, 10, 30), label: "14 days ago" },
  { ticker: "NVDA", target: mostRecentWeekdayDaysAgo(30, 10, 30), label: "30 days ago (cliff)" },
  { ticker: "AAPL", target: mostRecentWeekdayDaysAgo(60, 14, 0), label: "AAPL 60 days (should fail)" },
];

console.log("=".repeat(78));
console.log("yahoo-finance2 (Node) feasibility check");
console.log("Run time:", new Date().toISOString());
console.log("=".repeat(78));

for (const c of cases) {
  console.log(`\n[${c.label}]`);
  console.log(`  Target: ${c.ticker} @ ${c.target.toISOString()}`);
  const r = await fetchWindow(c.ticker, c.target);
  if (r.ok) {
    console.log(`  ${r.bars >= 100 ? "PASS" : "WEAK"}: ${r.bars} bars in ${r.elapsedMs.toFixed(0)}ms`);
    if (r.first) console.log(`  First: ${r.first.toISOString()}  Last: ${r.last.toISOString()}`);
    if (r.sampleKeys.length) console.log(`  Bar fields: ${r.sampleKeys.join(", ")}`);
  } else {
    console.log(`  FAIL: ${r.error}`);
  }
}

console.log("\n" + "=".repeat(78));
console.log("News endpoint test (yahooFinance.search)");
console.log("=".repeat(78));
const news = await newsTest("NVDA");
if (news.ok) {
  console.log(`  Returned ${news.count} headlines in ${news.elapsedMs.toFixed(0)}ms`);
  if (news.sample) {
    for (const item of news.sample) {
      console.log(`  - ${item.title}`);
      console.log(`    publisher=${item.publisher}  publishedAt=${item.providerPublishTime}`);
      console.log(`    url=${item.link}`);
    }
  }
} else {
  console.log(`  FAIL: ${news.error}`);
}
