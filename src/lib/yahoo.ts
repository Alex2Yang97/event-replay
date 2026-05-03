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
};

export type ReplayData = {
  ticker: string;
  eventTime: number;
  bars: Bar[];
  headlines: Headline[];
};

const WINDOW_HOURS = 2;
const NEWS_WINDOW_HOURS = 4;

export async function fetchReplayData(
  ticker: string,
  eventTimestampIso: string
): Promise<ReplayData> {
  const eventTime = new Date(eventTimestampIso).getTime();
  const period1 = new Date(eventTime - WINDOW_HOURS * MS_PER_HOUR);
  const period2 = new Date(eventTime + WINDOW_HOURS * MS_PER_HOUR);

  const [chartResult, searchResult] = await Promise.allSettled([
    yahooFinance.chart(ticker, {
      period1,
      period2,
      interval: "1m",
      includePrePost: false,
    }),
    yahooFinance.search(
      ticker,
      { newsCount: 10, quotesCount: 0 },
      { validateResult: false }
    ),
  ]);

  if (chartResult.status === "rejected") {
    throw chartResult.reason;
  }
  const chart = chartResult.value;
  const search = searchResult.status === "fulfilled" ? searchResult.value : null;
  if (searchResult.status === "rejected") {
    console.warn("yahoo-finance2 search failed:", searchResult.reason);
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

  const newsWindowStart = eventTime - NEWS_WINDOW_HOURS * MS_PER_HOUR;
  const newsWindowEnd = eventTime + NEWS_WINDOW_HOURS * MS_PER_HOUR;

  type RawNews = {
    title?: string;
    publisher?: string;
    providerPublishTime?: Date | string | number;
    link?: string;
  };
  const rawNews = ((search as { news?: RawNews[] } | undefined)?.news ?? []) as RawNews[];
  const headlines: Headline[] = rawNews
    .map((n) => {
      const rawTime = n.providerPublishTime;
      const publishedAt =
        rawTime instanceof Date
          ? rawTime.getTime()
          : typeof rawTime === "string"
          ? new Date(rawTime).getTime()
          : typeof rawTime === "number"
          ? rawTime * (rawTime < 10_000_000_000 ? 1000 : 1)
          : NaN;
      return {
        title: n.title ?? "",
        publisher: n.publisher ?? "",
        publishedAt,
        url: n.link ?? "",
      };
    })
    .filter((h) => h.title && h.url && Number.isFinite(h.publishedAt))
    .filter((h) => h.publishedAt >= newsWindowStart && h.publishedAt <= newsWindowEnd);

  return { ticker, eventTime, bars, headlines };
}
