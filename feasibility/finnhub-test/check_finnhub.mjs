// Feasibility probe for Finnhub `/company-news` as Yahoo news replacement.
//
// We need to confirm:
//   1. Can we pull news for a specific historical date (not just "latest")?
//   2. Does coverage exist for 7-day-old and 30-day-old US equity events?
//   3. Latency acceptable (<2s)?
//   4. What fields come back — do we get title, url, publisher, timestamp?
//
// Docs: https://finnhub.io/docs/api/company-news
// Endpoint: GET /company-news?symbol=AAPL&from=YYYY-MM-DD&to=YYYY-MM-DD
// Free tier: 60 req/min

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, "../../.env");
const envRaw = readFileSync(envPath, "utf8");
const envMap = Object.fromEntries(
  envRaw
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"))
    .map((l) => {
      const idx = l.indexOf("=");
      return [l.slice(0, idx).trim(), l.slice(idx + 1).trim().replace(/^["']|["']$/g, "")];
    })
);
const API_KEY = envMap.FINNHUB_API_KEY;
if (!API_KEY) {
  console.error("FINNHUB_API_KEY missing in .env");
  process.exit(1);
}

function ymd(date) {
  return date.toISOString().slice(0, 10);
}

function mostRecentWeekdayDaysAgo(daysAgo) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - daysAgo);
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) {
    d.setUTCDate(d.getUTCDate() - 1);
  }
  return d;
}

async function fetchCompanyNews(symbol, from, to) {
  const url = new URL("https://finnhub.io/api/v1/company-news");
  url.searchParams.set("symbol", symbol);
  url.searchParams.set("from", ymd(from));
  url.searchParams.set("to", ymd(to));
  url.searchParams.set("token", API_KEY);

  const t0 = performance.now();
  const res = await fetch(url);
  const ms = performance.now() - t0;
  if (!res.ok) {
    const body = await res.text();
    return { ok: false, status: res.status, body, ms };
  }
  const data = await res.json();
  return { ok: true, data, ms };
}

function summarize(items, eventTime) {
  const windowMs = 4 * 3600 * 1000;
  const inWindow = items.filter((n) => {
    const t = (n.datetime ?? 0) * 1000;
    return t >= eventTime - windowMs && t <= eventTime + windowMs;
  });
  return { total: items.length, inWindow: inWindow.length, sample: inWindow.slice(0, 3) };
}

const cases = [
  { label: "AAPL ~3 days ago (recent)", symbol: "AAPL", daysAgo: 3 },
  { label: "NVDA ~7 days ago", symbol: "NVDA", daysAgo: 7 },
  { label: "TSLA ~14 days ago", symbol: "TSLA", daysAgo: 14 },
  { label: "SPY ~30 days ago (boundary)", symbol: "SPY", daysAgo: 30 },
  { label: "MSFT ~60 days ago (beyond V1 cliff)", symbol: "MSFT", daysAgo: 60 },
];

console.log(`Finnhub company-news probe — ${new Date().toISOString()}`);
console.log("=".repeat(72));

for (const c of cases) {
  // Center on 14:30 UTC (~10:30 ET market open vicinity) of the target weekday,
  // then pull news for from=(day-1) to=(day+1) to mimic a ±4h window safely.
  const centerDay = mostRecentWeekdayDaysAgo(c.daysAgo);
  centerDay.setUTCHours(14, 30, 0, 0);
  const eventTime = centerDay.getTime();
  const from = new Date(eventTime - 24 * 3600 * 1000);
  const to = new Date(eventTime + 24 * 3600 * 1000);

  console.log(`\n[${c.label}]`);
  console.log(`  symbol=${c.symbol}  event=${centerDay.toISOString()}  from=${ymd(from)}  to=${ymd(to)}`);

  const r = await fetchCompanyNews(c.symbol, from, to);
  if (!r.ok) {
    console.log(`  FAIL status=${r.status} latency=${r.ms.toFixed(0)}ms body=${r.body.slice(0, 200)}`);
    continue;
  }
  const items = Array.isArray(r.data) ? r.data : [];
  const s = summarize(items, eventTime);
  console.log(`  OK   latency=${r.ms.toFixed(0)}ms returned=${s.total} inWindow(±4h)=${s.inWindow}`);
  if (items[0]) {
    console.log(`  fields: ${Object.keys(items[0]).sort().join(", ")}`);
  }
  for (const n of s.sample) {
    const when = new Date((n.datetime ?? 0) * 1000).toISOString();
    console.log(`   • [${when}] ${n.headline?.slice(0, 90) ?? "(no headline)"}`);
    console.log(`     src=${n.source ?? "?"}  url=${n.url?.slice(0, 90) ?? "?"}`);
  }
}

console.log("\n" + "=".repeat(72));
console.log("Done.");
