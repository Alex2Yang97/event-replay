// Smoke test for the v2 LLM schema: classify every headline, then produce
// bull/bear with 2-3 evidence items, inline [B1]/[X1] markers, and a reasoning
// bridge. Runs standalone so we don't need Next.js up.

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
    .slice(0, 10)
    .map((n) => ({
      title: n.headline,
      publisher: n.source,
      publishedAt: n.datetime * 1000,
      url: n.url,
      summary: n.summary,
    }));
}

const TAKE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["claim", "reasoning", "evidence"],
  properties: {
    claim: { type: "string" },
    reasoning: { type: "string" },
    evidence: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["marker_id", "quote", "source_url"],
        properties: {
          marker_id: { type: "string" },
          quote: { type: "string" },
          source_url: { type: "string" },
        },
      },
    },
  },
};

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "event_summary",
    "has_sufficient_context",
    "headline_classifications",
    "bull_take",
    "bear_take",
  ],
  properties: {
    event_summary: { type: "string" },
    has_sufficient_context: { type: "boolean" },
    headline_classifications: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["index", "relevance", "reason"],
        properties: {
          index: { type: "integer" },
          relevance: { type: "string", enum: ["relevant", "tangential", "off_topic"] },
          reason: { type: "string" },
        },
      },
    },
    bull_take: TAKE_SCHEMA,
    bear_take: TAKE_SCHEMA,
  },
};

const SYSTEM = `You explain short-window US equity price moves for retail investors.

You must do two jobs in one response:

Job 1 — CLASSIFY every supplied headline:
- "relevant": directly discusses the named ticker's price-moving news during this window (earnings, guidance, product news, regulatory, analyst action, sector-wide event clearly driving this name).
- "tangential": mentions the ticker in passing but is not the driver (e.g. ticker appears in a market-recap list, or an unrelated story mentions the company as one of many).
- "off_topic": does not substantively concern the ticker (market commentary, unrelated names, crypto/macro noise with the ticker only in metadata).
Return one classification per headline, in input order.

Job 2 — WRITE bull_take and bear_take:
- Use ONLY headlines you classified "relevant". If zero headlines are relevant, set has_sufficient_context=false, both claims = "insufficient evidence", empty evidence arrays, empty reasoning strings.
- Otherwise set has_sufficient_context=true. Aim for 2 evidence items per take (up to 3 if genuinely distinct); 1 is acceptable if only one relevant headline supports that side. If the relevant headlines don't genuinely support a side, set THAT take's claim = "insufficient evidence", empty evidence array, empty reasoning — NEVER invent bearish framing from bullish headlines (or vice versa). A one-sided outcome is honest and acceptable.
- Each evidence item's source_url must be the EXACT verbatim url from the supplied headline list — do not truncate, re-encode, or edit it. Each quote must be a verbatim excerpt from that headline's title or summary.
- marker_id scheme: markers are PER-TAKE SEQUENTIAL starting at 1, UNRELATED to the input headline index.
  - bull_take.evidence markers: first = "B1", second = "B2", third = "B3".
  - bear_take.evidence markers: first = "X1", second = "X2", third = "X3".
  The letter prefix is determined by WHICH TAKE the evidence lives in, not by anything else. Bear evidence NEVER uses B-prefix, bull evidence NEVER uses X-prefix.
- The "claim" field MUST embed EVERY evidence item's marker exactly once, and MUST NOT contain markers without a matching evidence item. Marker count in claim === evidence array length. Example with both sides:
  bull_take.claim: "Nvidia's rally [B1] reflects accelerating AI capex [B2]."
  bear_take.claim: "Earnings estimates are being cut [X1] amid margin pressure [X2]."
  (If you can only cite two distinct points, return exactly 2 evidence items — do not add a 3rd that you don't reference in the claim.)
- "reasoning" explains the bridge from the cited headlines to the observed price move in one sentence. Do not restate the claim.

Hard rules across both jobs:
- Never invent quotes, urls, publishers, or facts not present in the supplied headlines.
- Do not give financial advice. Do not predict future direction. Explain competing reads of what already happened.
- Plain English. No hedging filler.`;

function buildUser({ ticker, eventTime, pctMove, firstOpen, lastClose, headlines }) {
  const hl = headlines.length
    ? headlines
        .map(
          (h, i) =>
            `[${i}] ${new Date(h.publishedAt).toISOString()} · ${h.publisher}
    title: ${h.title}
    url: ${h.url}${h.summary ? `\n    summary: ${h.summary.slice(0, 600)}` : ""}`
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

Headlines within ±4h (index in brackets):
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

function validate(parsed, headlines, tag) {
  const issues = [];
  const n = headlines.length;

  // Classifications: one per headline, index in range, in order
  const cls = parsed.headline_classifications;
  if (cls.length !== n) issues.push(`classifications count ${cls.length} != headlines ${n}`);
  cls.forEach((c, i) => {
    if (c.index !== i) issues.push(`classification[${i}].index=${c.index}`);
    if (!["relevant", "tangential", "off_topic"].includes(c.relevance))
      issues.push(`classification[${i}] bad relevance`);
  });

  const relevantUrls = new Set(
    cls.filter((c) => c.relevance === "relevant").map((c) => headlines[c.index]?.url)
  );

  // has_sufficient_context must match
  const expected = relevantUrls.size > 0;
  if (parsed.has_sufficient_context !== expected) {
    issues.push(`has_sufficient_context=${parsed.has_sufficient_context} but relevant count=${relevantUrls.size}`);
  }

  const suppliedUrls = new Set(headlines.map((h) => h.url));

  function checkTake(take, prefix, label) {
    // One-sided outcome is acceptable: an individual take can opt out even
    // when has_sufficient_context=true, signaled by claim="insufficient evidence"
    // + empty evidence + empty reasoning.
    const abstained =
      take.claim.trim().toLowerCase() === "insufficient evidence" &&
      take.evidence.length === 0 &&
      take.reasoning.trim() === "";
    if (!expected) {
      if (!abstained) issues.push(`${label} not abstaining despite no relevant`);
      return;
    }
    if (abstained) return;
    if (take.evidence.length < 1 || take.evidence.length > 3) {
      issues.push(`${label} evidence count=${take.evidence.length} (want 1–3)`);
    }
    take.evidence.forEach((e, i) => {
      if (!suppliedUrls.has(e.source_url))
        issues.push(`${label}.ev[${i}] url=${e.source_url.slice(0, 80)} not in supplied`);
      if (!relevantUrls.has(e.source_url)) issues.push(`${label}.ev[${i}] url not in RELEVANT set`);
      if (e.marker_id !== `${prefix}${i + 1}`) issues.push(`${label}.ev[${i}] marker=${e.marker_id}`);
    });
    take.evidence.forEach((e) => {
      const count = (take.claim.match(new RegExp(`\\[${e.marker_id}\\]`, "g")) ?? []).length;
      if (count === 0) issues.push(`${label} claim missing [${e.marker_id}]`);
    });
    if (!take.reasoning || take.reasoning.length < 5) issues.push(`${label} reasoning empty/short`);
  }

  checkTake(parsed.bull_take, "B", `${tag}.bull`);
  checkTake(parsed.bear_take, "X", `${tag}.bear`);

  return issues;
}

const cases = [
  { label: "NVDA ~7d (mixed noise + real news)", ticker: "NVDA", daysAgo: 7, pctMove: 1.8, firstOpen: 950, lastClose: 967 },
  { label: "AAPL ~3d (broad coverage)", ticker: "AAPL", daysAgo: 3, pctMove: -0.6, firstOpen: 210, lastClose: 208.7 },
  { label: "XOM ~7d (oil-flavored)", ticker: "XOM", daysAgo: 7, pctMove: -0.4, firstOpen: 110, lastClose: 109.6 },
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
  const parsed = JSON.parse(completion.choices[0].message.content);

  console.log(`latency=${ms.toFixed(0)}ms tokens=${completion.usage?.total_tokens}`);

  const tally = { relevant: 0, tangential: 0, off_topic: 0 };
  parsed.headline_classifications.forEach((c) => (tally[c.relevance] += 1));
  console.log(`classifications: relevant=${tally.relevant} tangential=${tally.tangential} off_topic=${tally.off_topic}`);
  parsed.headline_classifications.forEach((c) => {
    const h = headlines[c.index];
    console.log(`  [${c.index}] ${c.relevance.padEnd(10)} — ${h?.title.slice(0, 70)} (${c.reason})`);
  });

  console.log(`\nevent_summary: ${parsed.event_summary}`);
  console.log(`\nbull.claim:    ${parsed.bull_take.claim}`);
  console.log(`bull.reason:   ${parsed.bull_take.reasoning}`);
  parsed.bull_take.evidence.forEach((e) => console.log(`  [${e.marker_id}] "${e.quote.slice(0, 90)}"`));

  console.log(`\nbear.claim:    ${parsed.bear_take.claim}`);
  console.log(`bear.reason:   ${parsed.bear_take.reasoning}`);
  parsed.bear_take.evidence.forEach((e) => console.log(`  [${e.marker_id}] "${e.quote.slice(0, 90)}"`));

  const issues = validate(parsed, headlines, c.label);
  if (issues.length === 0) {
    console.log("\n✓ validation passed");
  } else {
    console.log(`\n✗ validation FAILED (${issues.length}):`);
    issues.forEach((i) => console.log(`  - ${i}`));
  }
}
