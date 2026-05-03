import OpenAI from "openai";
import { formatEtIso } from "@/lib/time";
import type { Headline } from "@/lib/replay-data";

export type Evidence = {
  quote: string;
  source_url: string;
};

export type Take = {
  claim: string;
  evidence: Evidence[];
};

export type ReplayAnalysis = {
  event_summary: string;
  has_sufficient_context: boolean;
  bull_take: Take;
  bear_take: Take;
};

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["event_summary", "has_sufficient_context", "bull_take", "bear_take"],
  properties: {
    event_summary: {
      type: "string",
      description:
        "One or two neutral sentences describing what likely moved the stock during the window. If no real headlines were provided, say exactly: 'insufficient news context, showing chart only'.",
    },
    has_sufficient_context: {
      type: "boolean",
      description:
        "True only if at least one supplied headline is directly relevant to the price move. False otherwise.",
    },
    bull_take: {
      type: "object",
      additionalProperties: false,
      required: ["claim", "evidence"],
      properties: {
        claim: {
          type: "string",
          description:
            "The bullish interpretation in 1-2 sentences. If has_sufficient_context is false, write 'insufficient evidence'.",
        },
        evidence: {
          type: "array",
          description:
            "Each item must quote the supplied headline verbatim and reuse its exact url. Empty array when has_sufficient_context is false.",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["quote", "source_url"],
            properties: {
              quote: { type: "string" },
              source_url: { type: "string" },
            },
          },
        },
      },
    },
    bear_take: {
      type: "object",
      additionalProperties: false,
      required: ["claim", "evidence"],
      properties: {
        claim: {
          type: "string",
          description:
            "The bearish interpretation in 1-2 sentences. If has_sufficient_context is false, write 'insufficient evidence'.",
        },
        evidence: {
          type: "array",
          description:
            "Each item must quote the supplied headline verbatim and reuse its exact url. Empty array when has_sufficient_context is false.",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["quote", "source_url"],
            properties: {
              quote: { type: "string" },
              source_url: { type: "string" },
            },
          },
        },
      },
    },
  },
} as const;

const SYSTEM_PROMPT = `You explain short-window US equity price moves for retail investors.

Hard rules:
- Every evidence item MUST quote a headline (or headline summary) from the supplied list verbatim and reuse its exact source_url. Never invent a quote, url, publisher, or fact.
- If no supplied headline plausibly explains the move, set has_sufficient_context=false, set both claims to "insufficient evidence", and return empty evidence arrays.
- Do not give financial advice. Do not predict future price direction. Explain competing interpretations of what already happened.
- Keep each claim to 1-2 sentences. Plain English. No hedging filler.`;

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
          return `[${i + 1}] ${when} · ${h.publisher}
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

Headlines within ±4h of the event:
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
