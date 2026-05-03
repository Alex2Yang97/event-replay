import YahooFinance from "yahoo-finance2";
import { MS_PER_HOUR } from "@/lib/time";

const yahooFinance = new YahooFinance({
  suppressNotices: ["yahooSurvey", "ripHistorical"],
});

export type Bar = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type Headline = {
  title: string;
  publisher: string;
  publishedAt: number;
  url: string;
  summary?: string;
};

export type ReplayData = {
  ticker: string;
  eventTime: number;
  bars: Bar[];
  headlines: Headline[];
};

const WINDOW_HOURS = 2;
const NEWS_WINDOW_HOURS = 4;
const MS_PER_DAY = 24 * MS_PER_HOUR;

function ymd(date: Date): string {
  return date.toISOString().slice(0, 10);
}

type FinnhubNewsItem = {
  category?: string;
  datetime?: number;
  headline?: string;
  id?: number;
  image?: string;
  related?: string;
  source?: string;
  summary?: string;
  url?: string;
};

async function fetchFinnhubHeadlines(
  ticker: string,
  eventTime: number
): Promise<Headline[]> {
  const apiKey = process.env.FINNHUB_API_KEY;
  if (!apiKey) {
    console.warn("FINNHUB_API_KEY not set; skipping news fetch");
    return [];
  }

  const from = new Date(eventTime - MS_PER_DAY);
  const to = new Date(eventTime + MS_PER_DAY);
  const url = new URL("https://finnhub.io/api/v1/company-news");
  url.searchParams.set("symbol", ticker);
  url.searchParams.set("from", ymd(from));
  url.searchParams.set("to", ymd(to));
  url.searchParams.set("token", apiKey);

  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    console.warn(`finnhub company-news ${res.status}:`, await res.text());
    return [];
  }

  const items = (await res.json()) as FinnhubNewsItem[];
  if (!Array.isArray(items)) return [];

  const windowStart = eventTime - NEWS_WINDOW_HOURS * MS_PER_HOUR;
  const windowEnd = eventTime + NEWS_WINDOW_HOURS * MS_PER_HOUR;

  return items
    .map((n): Headline | null => {
      const publishedAt = (n.datetime ?? 0) * 1000;
      if (!n.headline || !n.url || !Number.isFinite(publishedAt)) return null;
      return {
        title: n.headline,
        publisher: n.source ?? "",
        publishedAt,
        url: n.url,
        summary: n.summary,
      };
    })
    .filter((h): h is Headline => h !== null)
    .filter((h) => h.publishedAt >= windowStart && h.publishedAt <= windowEnd)
    .sort((a, b) => a.publishedAt - b.publishedAt);
}

export async function fetchReplayData(
  ticker: string,
  eventTimestampIso: string
): Promise<ReplayData> {
  const eventTime = new Date(eventTimestampIso).getTime();
  const period1 = new Date(eventTime - WINDOW_HOURS * MS_PER_HOUR);
  const period2 = new Date(eventTime + WINDOW_HOURS * MS_PER_HOUR);

  const [chartResult, headlinesResult] = await Promise.allSettled([
    yahooFinance.chart(ticker, {
      period1,
      period2,
      interval: "1m",
      includePrePost: false,
    }),
    fetchFinnhubHeadlines(ticker, eventTime),
  ]);

  if (chartResult.status === "rejected") {
    throw chartResult.reason;
  }
  const chart = chartResult.value;
  const headlines =
    headlinesResult.status === "fulfilled" ? headlinesResult.value : [];
  if (headlinesResult.status === "rejected") {
    console.warn("finnhub fetch failed:", headlinesResult.reason);
  }

  const windowStart = eventTime - WINDOW_HOURS * MS_PER_HOUR;
  const windowEnd = eventTime + WINDOW_HOURS * MS_PER_HOUR;

  const bars: Bar[] = (chart?.quotes ?? [])
    .filter((q) => q.date && q.open != null && q.high != null && q.low != null && q.close != null)
    .map((q) => ({
      time: new Date(q.date as Date).getTime(),
      open: q.open as number,
      high: q.high as number,
      low: q.low as number,
      close: q.close as number,
      volume: (q.volume as number) ?? 0,
    }))
    .filter((b) => b.time >= windowStart && b.time <= windowEnd);

  return { ticker, eventTime, bars, headlines };
}
