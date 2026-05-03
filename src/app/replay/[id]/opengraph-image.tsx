import { ImageResponse } from "next/og";
import { decodeReplayId } from "@/lib/replay-id";
import { loadReplay, type CachedReplay } from "@/lib/replay-cache";
import { formatEtIso } from "@/lib/time";

export const runtime = "nodejs";
export const alt = "Event Replay preview";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max - 1).trimEnd() + "…";
}

function pickHeadlineText(data: CachedReplay): string {
  const { analysis, headlines } = data;
  if (analysis?.has_sufficient_context && analysis.event_summary) {
    return analysis.event_summary;
  }
  const relevantIndex =
    analysis?.headline_classifications.find((c) => c.relevance === "relevant")
      ?.index ?? -1;
  if (relevantIndex >= 0 && headlines[relevantIndex]) {
    return headlines[relevantIndex].title;
  }
  if (headlines[0]) return headlines[0].title;
  return "No headlines found in this window.";
}

export default async function OgImage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const decoded = decodeReplayId(id);

  if (!decoded) {
    return new ImageResponse(<FallbackCard title="Event Replay" />, { ...size });
  }

  const { ticker, timestamp } = decoded;
  const eventDate = new Date(timestamp);
  const result = await loadReplay(id, ticker, timestamp);

  if (!result.ok) {
    return new ImageResponse(
      <FallbackCard title={ticker} subtitle={formatEtIso(eventDate)} />,
      { ...size }
    );
  }

  const { pctMove } = result.data;
  const headlineText = truncate(pickHeadlineText(result.data), 180);
  const hasMove = pctMove != null;
  const isUp = hasMove && pctMove >= 0;
  const moveColor = hasMove ? (isUp ? "#16a34a" : "#dc2626") : "#71717a";
  const moveText = hasMove
    ? `${isUp ? "▲" : "▼"} ${Math.abs(pctMove).toFixed(2)}%`
    : "—";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 72,
          background: "white",
          fontFamily: "sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            fontSize: 24,
            color: "#71717a",
            letterSpacing: 1,
            textTransform: "uppercase",
          }}
        >
          <span>Event Replay</span>
          <span>{formatEtIso(eventDate)}</span>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              gap: 32,
            }}
          >
            <span
              style={{
                fontSize: 160,
                fontWeight: 700,
                letterSpacing: -4,
                color: "#09090b",
                lineHeight: 1,
              }}
            >
              {ticker}
            </span>
            <span
              style={{
                fontSize: 96,
                fontWeight: 700,
                color: moveColor,
                lineHeight: 1,
              }}
            >
              {moveText}
            </span>
          </div>
          <div
            style={{
              fontSize: 22,
              color: "#a1a1aa",
              letterSpacing: 0.5,
            }}
          >
            ±2h intraday window · US regular hours
          </div>
        </div>

        <div
          style={{
            display: "flex",
            fontSize: 32,
            color: "#27272a",
            lineHeight: 1.35,
            maxWidth: "100%",
            borderTop: "1px solid #e4e4e7",
            paddingTop: 32,
          }}
        >
          {headlineText}
        </div>
      </div>
    ),
    { ...size }
  );
}

function FallbackCard({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        gap: 16,
        background: "white",
        fontFamily: "sans-serif",
      }}
    >
      <div style={{ fontSize: 120, fontWeight: 700, color: "#09090b" }}>
        {title}
      </div>
      {subtitle && (
        <div style={{ fontSize: 32, color: "#71717a" }}>{subtitle}</div>
      )}
      <div
        style={{
          fontSize: 24,
          color: "#a1a1aa",
          letterSpacing: 1,
          textTransform: "uppercase",
          marginTop: 24,
        }}
      >
        Event Replay
      </div>
    </div>
  );
}
