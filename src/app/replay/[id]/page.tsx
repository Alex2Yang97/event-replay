import Link from "next/link";
import { notFound } from "next/navigation";
import { ReplayChart } from "@/components/replay-chart";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { decodeReplayId } from "@/lib/replay-id";
import { formatEtIso } from "@/lib/time";
import { fetchReplayData } from "@/lib/replay-data";
import { analyzeReplay, type ReplayAnalysis } from "@/lib/llm";

export const dynamic = "force-dynamic";

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

  let data;
  try {
    data = await fetchReplayData(ticker, timestamp);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error.";
    return (
      <div className="max-w-3xl mx-auto px-6 py-16 space-y-6">
        <Link href="/" className="text-sm text-muted-foreground underline">
          ← new replay
        </Link>
        <Card>
          <CardHeader>
            <CardTitle>Couldn&apos;t fetch data</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            <p>{ticker} at {formatEtIso(eventDate)}</p>
            <p className="mt-2">{message}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const firstBar = data.bars[0];
  const lastBar = data.bars[data.bars.length - 1];
  const pctMove =
    firstBar && lastBar
      ? ((lastBar.close - firstBar.open) / firstBar.open) * 100
      : null;

  let analysis: ReplayAnalysis | null = null;
  let analysisError: string | null = null;
  try {
    analysis = await analyzeReplay({
      ticker,
      eventTime: data.eventTime,
      pctMove,
      firstOpen: firstBar?.open ?? null,
      lastClose: lastBar?.close ?? null,
      headlines: data.headlines,
    });
  } catch (err) {
    analysisError = err instanceof Error ? err.message : "LLM call failed.";
    console.warn("analyzeReplay failed:", err);
  }

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
          <ReplayChart bars={data.bars} eventTime={data.eventTime} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Nearby headlines</CardTitle>
        </CardHeader>
        <CardContent>
          {data.headlines.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No headlines found within ±4h of the event.
            </p>
          ) : (
            <ul className="space-y-3">
              {data.headlines.map((h) => (
                <li key={h.url} className="text-sm">
                  <a
                    href={h.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium underline underline-offset-4"
                  >
                    {h.title}
                  </a>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {h.publisher} · {formatEtIso(new Date(h.publishedAt))}
                  </p>
                </li>
              ))}
            </ul>
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
            <TakeCard label="Bull" tone="bull" take={analysis.bull_take} />
            <TakeCard label="Bear" tone="bear" take={analysis.bear_take} />
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

function TakeCard({
  label,
  tone,
  take,
}: {
  label: string;
  tone: "bull" | "bear";
  take: ReplayAnalysis["bull_take"];
}) {
  const toneClass = tone === "bull" ? "text-green-700" : "text-red-700";
  return (
    <Card>
      <CardHeader>
        <CardTitle className={`text-base ${toneClass}`}>{label}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <p>{take.claim}</p>
        {take.evidence.length > 0 && (
          <ul className="space-y-2 border-l-2 border-muted pl-3">
            {take.evidence.map((e, i) => (
              <li key={i} className="text-xs text-muted-foreground">
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
