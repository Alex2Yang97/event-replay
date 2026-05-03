import { fetchReplayData, type Bar, type Headline } from "@/lib/replay-data";
import { analyzeReplay, type ReplayAnalysis } from "@/lib/llm";
import { kvGet, kvSetNx } from "@/lib/kv";
import { checkReplayRateLimit } from "@/lib/rate-limit";

export type CachedReplay = {
  ticker: string;
  eventTime: number;
  bars: Bar[];
  headlines: Headline[];
  pctMove: number | null;
  firstOpen: number | null;
  lastClose: number | null;
  analysis: ReplayAnalysis | null;
  analysisError: string | null;
};

export type LoadReplayResult =
  | { ok: true; data: CachedReplay; fromCache: boolean }
  | { ok: false; error: string; reason?: "rate_limited" | "fetch_failed"; resetAt?: number };

const CACHE_TTL_SECONDS = 60 * 60 * 24 * 90;

function cacheKey(id: string): string {
  return `replay:v2:${id}`;
}

function computeMove(bars: Bar[]): {
  pctMove: number | null;
  firstOpen: number | null;
  lastClose: number | null;
} {
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

export async function loadReplay(
  id: string,
  ticker: string,
  timestamp: string,
  opts: { clientIp?: string | null } = {}
): Promise<LoadReplayResult> {
  const key = cacheKey(id);

  const cached = await kvGet<CachedReplay>(key);
  if (cached) {
    return { ok: true, data: cached, fromCache: true };
  }

  // Cache miss → this request will spend an LLM call. Gate it.
  if (opts.clientIp) {
    const rl = await checkReplayRateLimit(opts.clientIp);
    if (!rl.allowed) {
      return {
        ok: false,
        reason: "rate_limited",
        resetAt: rl.resetAt,
        error: "Rate limit reached (10 new replays per hour per IP). Try an existing permalink, or try again later.",
      };
    }
  }

  let data;
  try {
    data = await fetchReplayData(ticker, timestamp);
  } catch (err) {
    return {
      ok: false,
      reason: "fetch_failed",
      error: err instanceof Error ? err.message : "Unknown error.",
    };
  }

  const { pctMove, firstOpen, lastClose } = computeMove(data.bars);

  let analysis: ReplayAnalysis | null = null;
  let analysisError: string | null = null;
  try {
    analysis = await analyzeReplay({
      ticker,
      eventTime: data.eventTime,
      pctMove,
      firstOpen,
      lastClose,
      headlines: data.headlines,
    });
  } catch (err) {
    analysisError = err instanceof Error ? err.message : "LLM call failed.";
    console.warn("analyzeReplay failed:", err);
  }

  const payload: CachedReplay = {
    ticker,
    eventTime: data.eventTime,
    bars: data.bars,
    headlines: data.headlines,
    pctMove,
    firstOpen,
    lastClose,
    analysis,
    analysisError,
  };

  // First-write-wins: only the first request for this id pays the LLM cost.
  // Concurrent requests that lose the race just don't cache — their render is
  // correct, the next request hits the winning cache.
  await kvSetNx(key, payload, CACHE_TTL_SECONDS);

  return { ok: true, data: payload, fromCache: false };
}
