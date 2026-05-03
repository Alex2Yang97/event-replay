// Generates frozen snapshots for the homepage demo permalinks so clicking them
// hits a checked-in JSON file instead of Yahoo + Finnhub + OpenAI on every
// cold cache miss. Run once when curating / refreshing demos:
//   npm run snapshot-demos
//
// Requires .env with OPENAI_API_KEY and FINNHUB_API_KEY.

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { config as loadEnv } from "dotenv";

loadEnv();

import { DEMOS, type Demo } from "@/lib/demos";
import { encodeReplayId } from "@/lib/replay-id";
import { fetchReplayData, type Bar, type Headline } from "@/lib/replay-data";
import { analyzeReplay, type ReplayAnalysis } from "@/lib/llm";

type Snapshot = {
  id: string;
  ticker: string;
  timestamp: string;
  eventTime: number;
  bars: Bar[];
  headlines: Headline[];
  pctMove: number | null;
  firstOpen: number | null;
  lastClose: number | null;
  analysis: ReplayAnalysis | null;
  analysisError: string | null;
  snapshottedAt: string;
};

function computeMove(bars: Bar[]) {
  const first = bars[0];
  const last = bars[bars.length - 1];
  if (!first || !last) {
    return { pctMove: null, firstOpen: null, lastClose: null };
  }
  return {
    pctMove: ((last.close - first.open) / first.open) * 100,
    firstOpen: first.open,
    lastClose: last.close,
  };
}

async function snapshotOne(d: Demo): Promise<Snapshot> {
  const id = encodeReplayId({ ticker: d.ticker, timestamp: d.timestamp });
  console.log(`\n[${d.ticker} ${d.note}] fetching bars + headlines...`);
  const data = await fetchReplayData(d.ticker, d.timestamp);
  console.log(
    `  bars=${data.bars.length} headlines=${data.headlines.length}`
  );

  const { pctMove, firstOpen, lastClose } = computeMove(data.bars);

  console.log(`  calling OpenAI...`);
  let analysis: ReplayAnalysis | null = null;
  let analysisError: string | null = null;
  try {
    analysis = await analyzeReplay({
      ticker: d.ticker,
      eventTime: data.eventTime,
      pctMove,
      firstOpen,
      lastClose,
      headlines: data.headlines,
    });
  } catch (err) {
    analysisError = err instanceof Error ? err.message : String(err);
    console.warn(`  OpenAI failed: ${analysisError}`);
  }

  return {
    id,
    ticker: d.ticker,
    timestamp: d.timestamp,
    eventTime: data.eventTime,
    bars: data.bars,
    headlines: data.headlines,
    pctMove,
    firstOpen,
    lastClose,
    analysis,
    analysisError,
    snapshottedAt: new Date().toISOString(),
  };
}

async function main() {
  const out: Record<string, Snapshot> = {};
  for (const d of DEMOS) {
    try {
      const snap = await snapshotOne(d);
      out[snap.id] = snap;
    } catch (err) {
      console.error(`  FAILED ${d.ticker} ${d.note}:`, err);
    }
  }

  const outPath = "src/lib/demo-snapshots/snapshots.json";
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(out, null, 2) + "\n");
  console.log(
    `\nwrote ${Object.keys(out).length} snapshots → ${outPath}`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
