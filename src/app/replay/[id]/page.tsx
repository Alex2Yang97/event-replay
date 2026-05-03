import Link from "next/link";
import { notFound } from "next/navigation";
import { ReplayChart } from "@/components/replay-chart";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { decodeReplayId } from "@/lib/replay-id";
import { formatEtIso } from "@/lib/time";
import { fetchReplayData } from "@/lib/yahoo";

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

      <Card className="bg-muted/30 border-dashed">
        <CardHeader>
          <CardTitle className="text-base">Bull vs. bear</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Bull/bear LLM card ships Day 2 (Anthropic API + source-cited prompt).
        </CardContent>
      </Card>
    </div>
  );
}
