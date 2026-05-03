import OpenAI from "openai";
import { formatEtIso } from "@/lib/time";
import type { Headline } from "@/lib/replay-data";

export type Relevance = "relevant" | "tangential" | "off_topic";

export type HeadlineClassification = {
  index: number;
  relevance: Relevance;
  reason: string;
};

export type Evidence = {
  marker_id: string;
  quote: string;
  source_url: string;
};

export type Take = {
  claim: string;
  reasoning: string;
  evidence: Evidence[];
};

export type ReplayAnalysis = {
  event_summary: string;
  has_sufficient_context: boolean;
  headline_classifications: HeadlineClassification[];
  bull_take: Take;
  bear_take: Take;
};

const TAKE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["claim", "reasoning", "evidence"],
  properties: {
    claim: {
      type: "string",
      description:
        "1-2 sentence bullish/bearish claim. MUST embed inline markers like [B1], [B2] (bull) or [X1], [X2] (bear) that reference items in this take's evidence array. Write exactly 'insufficient evidence' with no markers when this take has no genuine support (either has_sufficient_context is false, or the relevant headlines don't support THIS side).",
    },
    reasoning: {
      type: "string",
      description:
        "One sentence explaining the logical bridge from the cited headlines to the price move. Do not restate the claim. Empty string when claim is 'insufficient evidence'.",
    },
    evidence: {
      type: "array",
      description:
        "2-3 items when this take has genuine support from relevant headlines; empty array when claim is 'insufficient evidence'. Only pull from headlines classified 'relevant'. marker_id must be B1/B2/B3 for bull_take and X1/X2/X3 for bear_take, matching the inline markers in `claim`.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["marker_id", "quote", "source_url"],
        properties: {
          marker_id: { type: "string" },
          quote: {
            type: "string",
            description:
              "Verbatim excerpt from the headline or its summary. Never invent text.",
          },
          source_url: {
            type: "string",
            description: "The exact url from the supplied headline. Never invent.",
          },
        },
      },
    },
  },
} as const;

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
    event_summary: {
      type: "string",
      description:
        "One or two neutral sentences on what the relevant headlines say about the move. If no headline is 'relevant', say exactly: 'insufficient news context, showing chart only'.",
    },
    has_sufficient_context: {
      type: "boolean",
      description: "True iff at least one headline was classified 'relevant'.",
    },
    headline_classifications: {
      type: "array",
      description:
        "One entry per supplied headline, in the same order as input. relevance = 'relevant' only if the headline directly addresses the named ticker's price-moving news in this time window; 'tangential' if it mentions the ticker only in passing; 'off_topic' otherwise. reason = one short phrase justifying the label.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["index", "relevance", "reason"],
        properties: {
          index: { type: "integer" },
          relevance: {
            type: "string",
            enum: ["relevant", "tangential", "off_topic"],
          },
          reason: { type: "string" },
        },
      },
    },
    bull_take: TAKE_SCHEMA,
    bear_take: TAKE_SCHEMA,
  },
} as const;

const SYSTEM_PROMPT = `You explain short-window US equity price moves for retail investors.

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

type BuildUserPromptArgs = {
  ticker: string;
  eventTime: number;
  pctMove: number | null;
  firstOpen: number | null;
  lastClose: number | null;
  headlines: Headline[];
};

function buildUserPrompt(args: BuildUserPromptArgs): string {
  const { ticker, eventTime, pctMove, firstOpen, lastClose, headlines } = args;
  const headlineLines = headlines.length
    ? headlines
        .map((h, i) => {
          const when = formatEtIso(new Date(h.publishedAt));
          const summary = h.summary ? `\n    summary: ${h.summary}` : "";
          return `[${i}] ${when} · ${h.publisher}
    title: ${h.title}
    url: ${h.url}${summary}`;
        })
        .join("\n\n")
    : "(none)";

  const priceLine =
    firstOpen != null && lastClose != null && pctMove != null
      ? `Price: open ${firstOpen.toFixed(2)} → close ${lastClose.toFixed(2)} (${pctMove >= 0 ? "+" : ""}${pctMove.toFixed(2)}% across ±2h)`
      : "Price: (no intraday bars available)";

  return `Ticker: ${ticker}
Event time: ${formatEtIso(new Date(eventTime))}
Window: ±2 hours around event, regular US market hours
${priceLine}

Headlines within ±4h of the event (index shown in brackets):
${headlineLines}

Return the JSON analysis.`;
}

export async function analyzeReplay(args: BuildUserPromptArgs): Promise<ReplayAnalysis | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.warn("OPENAI_API_KEY not set; skipping LLM analysis");
    return null;
  }

  const client = new OpenAI({ apiKey });
  const userPrompt = buildUserPrompt(args);

  const completion = await client.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.2,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userPrompt },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "replay_analysis",
        strict: true,
        schema: SCHEMA,
      },
    },
  });

  const raw = completion.choices[0]?.message?.content;
  if (!raw) return null;
  return JSON.parse(raw) as ReplayAnalysis;
}
