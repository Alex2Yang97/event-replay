import Link from "next/link";
import { notFound } from "next/navigation";
import { Fragment } from "react";
import type { Metadata } from "next";
import { ReplayChart } from "@/components/replay-chart";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { decodeReplayId } from "@/lib/replay-id";
import { formatEtIso } from "@/lib/time";
import { loadReplay } from "@/lib/replay-cache";
import { getClientIp } from "@/lib/client-ip";
import type { Headline } from "@/lib/replay-data";
import type { ReplayAnalysis, Relevance } from "@/lib/llm";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const decoded = decodeReplayId(id);
  if (!decoded) return { title: "Event Replay" };

  const { ticker, timestamp } = decoded;
  const eventDate = new Date(timestamp);
  const when = formatEtIso(eventDate);
  const result = await loadReplay(id, ticker, timestamp);

  const title = `${ticker} · ${when}`;
  let description = `Intraday price replay for ${ticker} at ${when}, with nearby headlines and a bull vs. bear take.`;

  if (result.ok) {
    const { pctMove, analysis } = result.data;
    if (pctMove != null) {
      const sign = pctMove >= 0 ? "+" : "";
      description = `${ticker} ${sign}${pctMove.toFixed(2)}% across ±2h at ${when}.`;
      if (analysis?.event_summary && analysis.has_sufficient_context) {
        description += ` ${analysis.event_summary}`;
      }
    }
  }

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "article",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  };
}

export default async function ReplayPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const decoded = decodeReplayId(id);
  if (!decoded) notFound();

  const { ticker, timestamp } = decoded;
  const eventDate = new Date(timestamp);

  const clientIp = await getClientIp();
  const result = await loadReplay(id, ticker, timestamp, { clientIp });

  if (!result.ok) {
    const isRateLimit = result.reason === "rate_limited";
    const resetLine =
      isRateLimit && result.resetAt
        ? `Try again after ${new Date(result.resetAt).toLocaleTimeString("en-US", { timeZone: "America/New_York", hour: "2-digit", minute: "2-digit" })} ET.`
        : null;
    return (
      <div className="max-w-3xl mx-auto px-6 py-16 space-y-6">
        <Link href="/" className="text-sm text-muted-foreground underline">
          ← new replay
        </Link>
        <Card>
          <CardHeader>
            <CardTitle>
              {isRateLimit ? "Too many new replays" : "Couldn’t fetch data"}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground space-y-2">
            <p>{ticker} at {formatEtIso(eventDate)}</p>
            <p>{result.error}</p>
            {resetLine && <p>{resetLine}</p>}
          </CardContent>
        </Card>
      </div>
    );
  }

  const { bars, eventTime, headlines, pctMove, analysis, analysisError } =
    result.data;

  const relevanceByUrl = new Map<string, Relevance>();
  if (analysis) {
    for (const c of analysis.headline_classifications) {
      const h = headlines[c.index];
      if (h) relevanceByUrl.set(h.url, c.relevance);
    }
  }
  const relevantHeadlines = analysis
    ? headlines.filter((h) => relevanceByUrl.get(h.url) === "relevant")
    : headlines;
  const otherHeadlines = analysis
    ? headlines.filter((h) => relevanceByUrl.get(h.url) !== "relevant")
    : [];

  return (
    <div className="max-w-4xl mx-auto px-6 py-12 space-y-8">
      <div className="flex items-center justify-between">
        <Link href="/" className="text-sm text-muted-foreground underline">
          ← new replay
        </Link>
      </div>

      <header className="space-y-1">
        <h1 className="text-3xl font-semibold tracking-tight">
          {ticker}{" "}
          <span className="text-muted-foreground text-xl font-normal">
            · {formatEtIso(eventDate)}
          </span>
        </h1>
        {pctMove != null && (
          <p
            className={`text-lg ${
              pctMove >= 0 ? "text-green-600" : "text-red-600"
            }`}
          >
            {pctMove >= 0 ? "+" : ""}
            {pctMove.toFixed(2)}% across the ±2h window
          </p>
        )}
      </header>

      <Card>
        <CardContent className="pt-6">
          <ReplayChart bars={bars} eventTime={eventTime} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Nearby headlines</CardTitle>
        </CardHeader>
        <CardContent>
          {headlines.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No headlines found within ±4h of the event.
            </p>
          ) : relevantHeadlines.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No headlines in this window appear directly related to {ticker}.
              {otherHeadlines.length > 0 && " See off-topic below."}
            </p>
          ) : (
            <HeadlineList items={relevantHeadlines} />
          )}
          {otherHeadlines.length > 0 && (
            <details className="mt-4 text-sm">
              <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
                + {otherHeadlines.length} off-topic{" "}
                {otherHeadlines.length === 1 ? "headline" : "headlines"} hidden
              </summary>
              <div className="mt-3">
                <HeadlineList items={otherHeadlines} muted />
              </div>
            </details>
          )}
        </CardContent>
      </Card>

      {analysis ? (
        <div className="space-y-4">
          {analysis.event_summary && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">What likely moved it</CardTitle>
              </CardHeader>
              <CardContent className="text-sm">
                {analysis.event_summary}
              </CardContent>
            </Card>
          )}

          <div className="grid gap-4 md:grid-cols-2">
            <TakeCard
              label="Bull"
              tone="bull"
              take={analysis.bull_take}
              anchorPrefix="bull"
            />
            <TakeCard
              label="Bear"
              tone="bear"
              take={analysis.bear_take}
              anchorPrefix="bear"
            />
          </div>
        </div>
      ) : (
        <Card className="bg-muted/30 border-dashed">
          <CardHeader>
            <CardTitle className="text-base">Bull vs. bear</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            {analysisError
              ? `Analysis unavailable: ${analysisError}`
              : "Analysis unavailable (OPENAI_API_KEY not set)."}
          </CardContent>
        </Card>
      )}

      <p className="text-xs text-muted-foreground text-center pt-4 border-t">
        This is not financial advice. AI-generated interpretation may be incorrect. Verify before trading.
      </p>
    </div>
  );
}

function HeadlineList({
  items,
  muted = false,
}: {
  items: Headline[];
  muted?: boolean;
}) {
  return (
    <ul className="space-y-3">
      {items.map((h) => (
        <li key={h.url} className="text-sm">
          <a
            href={h.url}
            target="_blank"
            rel="noopener noreferrer"
            className={`${
              muted ? "text-muted-foreground" : "font-medium"
            } underline underline-offset-4`}
          >
            {h.title}
          </a>
          <p className="text-xs text-muted-foreground mt-0.5">
            {h.publisher} · {formatEtIso(new Date(h.publishedAt))}
          </p>
        </li>
      ))}
    </ul>
  );
}

function renderClaimWithMarkers(claim: string, tonePrefix: "B" | "X", anchorPrefix: string) {
  const pattern = new RegExp(`\\[(${tonePrefix}\\d+)\\]`, "g");
  const parts: Array<string | { marker: string }> = [];
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(claim)) !== null) {
    if (m.index > last) parts.push(claim.slice(last, m.index));
    parts.push({ marker: m[1] });
    last = m.index + m[0].length;
  }
  if (last < claim.length) parts.push(claim.slice(last));

  return parts.map((p, i) =>
    typeof p === "string" ? (
      <Fragment key={i}>{p}</Fragment>
    ) : (
      <a
        key={i}
        href={`#${anchorPrefix}-${p.marker}`}
        className="text-xs font-mono align-super text-primary underline decoration-dotted"
      >
        [{p.marker}]
      </a>
    )
  );
}

function TakeCard({
  label,
  tone,
  take,
  anchorPrefix,
}: {
  label: string;
  tone: "bull" | "bear";
  take: ReplayAnalysis["bull_take"];
  anchorPrefix: string;
}) {
  const toneClass = tone === "bull" ? "text-green-700" : "text-red-700";
  const markerPrefix = tone === "bull" ? "B" : "X";
  return (
    <Card>
      <CardHeader>
        <CardTitle className={`text-base ${toneClass}`}>{label}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <p>{renderClaimWithMarkers(take.claim, markerPrefix, anchorPrefix)}</p>
        {take.reasoning && (
          <p className="text-xs text-muted-foreground italic">
            {take.reasoning}
          </p>
        )}
        {take.evidence.length > 0 && (
          <ul className="space-y-2 border-l-2 border-muted pl-3">
            {take.evidence.map((e) => (
              <li
                key={e.marker_id}
                id={`${anchorPrefix}-${e.marker_id}`}
                className="text-xs text-muted-foreground scroll-mt-20"
              >
                <span className="font-mono text-[10px] mr-1 px-1 py-0.5 rounded bg-muted text-foreground">
                  {e.marker_id}
                </span>
                <span className="italic">“{e.quote}”</span>
                {" "}
                <a
                  href={e.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline underline-offset-2"
                >
                  source
                </a>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
