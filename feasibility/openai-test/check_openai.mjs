// Smoke test: feed a real Finnhub pull through the OpenAI structured-output
// call and verify we get a well-formed {event_summary, bull_take, bear_take}.
// Mirrors src/lib/llm.ts but runs standalone so we don't need Next.js up.

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import OpenAI from "openai";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, "../../.env");
const envRaw = readFileSync(envPath, "utf8");
const env = Object.fromEntries(
  envRaw
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    })
);

const OPENAI_KEY = env.OPENAI_API_KEY;
const FINNHUB_KEY = env.FINNHUB_API_KEY;
if (!OPENAI_KEY || !FINNHUB_KEY) {
  console.error("missing keys in .env");
  process.exit(1);
}

function ymd(d) {
  return d.toISOString().slice(0, 10);
}

async function getHeadlines(symbol, eventTime) {
  const from = new Date(eventTime - 86_400_000);
  const to = new Date(eventTime + 86_400_000);
  const url = new URL("https://finnhub.io/api/v1/company-news");
  url.searchParams.set("symbol", symbol);
  url.searchParams.set("from", ymd(from));
  url.searchParams.set("to", ymd(to));
  url.searchParams.set("token", FINNHUB_KEY);
  const r = await fetch(url);
  if (!r.ok) throw new Error(`finnhub ${r.status}`);
  const items = await r.json();
  const winStart = eventTime - 4 * 3600 * 1000;
  const winEnd = eventTime + 4 * 3600 * 1000;
  return items
    .filter((n) => {
      const t = (n.datetime ?? 0) * 1000;
      return n.headline && n.url && t >= winStart && t <= winEnd;
    })
    .slice(0, 8)
    .map((n) => ({
      title: n.headline,
      publisher: n.source,
      publishedAt: n.datetime * 1000,
      url: n.url,
      summary: n.summary,
    }));
}

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["event_summary", "has_sufficient_context", "bull_take", "bear_take"],
  properties: {
    event_summary: { type: "string" },
    has_sufficient_context: { type: "boolean" },
    bull_take: {
      type: "object",
      additionalProperties: false,
      required: ["claim", "evidence"],
      properties: {
        claim: { type: "string" },
        evidence: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["quote", "source_url"],
            properties: { quote: { type: "string" }, source_url: { type: "string" } },
          },
        },
      },
    },
    bear_take: {
      type: "object",
      additionalProperties: false,
      required: ["claim", "evidence"],
      properties: {
        claim: { type: "string" },
        evidence: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["quote", "source_url"],
            properties: { quote: { type: "string" }, source_url: { type: "string" } },
          },
        },
      },
    },
  },
};

const SYSTEM = `You explain short-window US equity price moves for retail investors.

Hard rules:
- Every evidence item MUST quote a headline (or headline summary) from the supplied list verbatim and reuse its exact source_url. Never invent a quote, url, publisher, or fact.
- If no supplied headline plausibly explains the move, set has_sufficient_context=false, set both claims to "insufficient evidence", and return empty evidence arrays.
- Do not give financial advice. Do not predict future price direction. Explain competing interpretations of what already happened.
- Keep each claim to 1-2 sentences. Plain English. No hedging filler.`;

function buildUser({ ticker, eventTime, pctMove, firstOpen, lastClose, headlines }) {
  const hl = headlines.length
    ? headlines
        .map(
          (h, i) =>
            `[${i + 1}] ${new Date(h.publishedAt).toISOString()} · ${h.publisher}
    title: ${h.title}
    url: ${h.url}${h.summary ? `\n    summary: ${h.summary.slice(0, 400)}` : ""}`
        )
        .join("\n\n")
    : "(none)";
  const price =
    firstOpen != null
      ? `Price: open ${firstOpen} → close ${lastClose} (${pctMove >= 0 ? "+" : ""}${pctMove.toFixed(2)}% across ±2h)`
      : "Price: (no bars)";
  return `Ticker: ${ticker}
Event time: ${new Date(eventTime).toISOString()}
Window: ±2h, regular US hours
${price}

Headlines within ±4h:
${hl}

Return JSON.`;
}

function mostRecentWeekday(daysAgo) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - daysAgo);
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d.setUTCDate(d.getUTCDate() - 1);
  d.setUTCHours(14, 30, 0, 0);
  return d;
}

const cases = [
  { label: "NVDA ~7d ago (should have news)", ticker: "NVDA", daysAgo: 7, pctMove: 1.8, firstOpen: 950, lastClose: 967 },
  { label: "Obscure ticker ~7d (may trigger insufficient context)", ticker: "XOM", daysAgo: 7, pctMove: -0.4, firstOpen: 110, lastClose: 109.6 },
];

const client = new OpenAI({ apiKey: OPENAI_KEY });

for (const c of cases) {
  console.log(`\n═══ ${c.label} ═══`);
  const eventTime = mostRecentWeekday(c.daysAgo).getTime();
  const headlines = await getHeadlines(c.ticker, eventTime);
  console.log(`headlines fetched: ${headlines.length}`);

  const t0 = performance.now();
  const completion = await client.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.2,
    messages: [
      { role: "system", content: SYSTEM },
      { role: "user", content: buildUser({ ticker: c.ticker, eventTime, pctMove: c.pctMove, firstOpen: c.firstOpen, lastClose: c.lastClose, headlines }) },
    ],
    response_format: {
      type: "json_schema",
      json_schema: { name: "replay_analysis", strict: true, schema: SCHEMA },
    },
  });
  const ms = performance.now() - t0;
  const raw = completion.choices[0]?.message?.content;
  console.log(`latency=${ms.toFixed(0)}ms tokens=${completion.usage?.total_tokens}`);

  const parsed = JSON.parse(raw);
  console.log(`has_sufficient_context: ${parsed.has_sufficient_context}`);
  console.log(`event_summary: ${parsed.event_summary}`);
  console.log(`bull: ${parsed.bull_take.claim}`);
  parsed.bull_take.evidence.forEach((e, i) => {
    const supplied = headlines.some((h) => h.url === e.source_url);
    console.log(`  ev${i + 1} [url match: ${supplied ? "✓" : "✗"}] "${e.quote.slice(0, 80)}"`);
  });
  console.log(`bear: ${parsed.bear_take.claim}`);
  parsed.bear_take.evidence.forEach((e, i) => {
    const supplied = headlines.some((h) => h.url === e.source_url);
    console.log(`  ev${i + 1} [url match: ${supplied ? "✓" : "✗"}] "${e.quote.slice(0, 80)}"`);
  });
}
