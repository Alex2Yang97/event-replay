import { encodeReplayId } from "@/lib/replay-id";

export type Demo = {
  ticker: string;
  timestamp: string;
  label: string;
  note: string;
};

// All timestamps are stored as UTC; ET equivalents shown in the notes.
// April 2026 is EDT (UTC-4). 10:00 ET = 14:00 UTC. 14:05 ET = 18:05 UTC.
export const DEMOS: Demo[] = [
  {
    ticker: "NVDA",
    timestamp: "2026-04-28T14:00:00.000Z",
    label: "NVDA",
    note: "Apr 28, 10:00 ET",
  },
  {
    ticker: "SPY",
    timestamp: "2026-04-29T18:05:00.000Z",
    label: "SPY",
    note: "Apr 29, 14:05 ET · Fed day",
  },
  {
    ticker: "TSLA",
    timestamp: "2026-04-23T14:00:00.000Z",
    label: "TSLA",
    note: "Apr 23, 10:00 ET · Q1 earnings window",
  },
  {
    ticker: "META",
    timestamp: "2026-04-30T14:00:00.000Z",
    label: "META",
    note: "Apr 30, 10:00 ET · Q1 earnings window",
  },
  {
    ticker: "AAPL",
    timestamp: "2026-05-01T14:00:00.000Z",
    label: "AAPL",
    note: "May 1, 10:00 ET · fiscal Q2 window",
  },
];

export function demoHref(demo: Demo): string {
  const id = encodeReplayId({
    ticker: demo.ticker,
    timestamp: demo.timestamp,
  });
  return `/replay/${id}`;
}
