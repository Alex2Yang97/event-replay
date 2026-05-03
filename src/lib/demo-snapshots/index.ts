import snapshots from "./snapshots.json";
import type { Bar, Headline } from "@/lib/replay-data";
import type { ReplayAnalysis } from "@/lib/llm";

export type DemoSnapshot = {
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

const snapshotMap = snapshots as Record<string, DemoSnapshot>;

export function getDemoSnapshot(id: string): DemoSnapshot | null {
  return snapshotMap[id] ?? null;
}
