import { ReplayForm } from "@/components/replay-form";

export default function Home() {
  return (
    <div className="flex flex-col flex-1 items-center px-6 py-16 sm:py-24">
      <div className="w-full max-w-xl space-y-10">
        <header className="space-y-3 text-center sm:text-left">
          <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight">
            Event Replay
          </h1>
          <p className="text-muted-foreground text-base leading-7">
            Paste a ticker and a moment in time. Get the intraday price chart,
            nearby headlines, and a bull vs. bear take — as a shareable
            permalink.
          </p>
        </header>

        <ReplayForm />

        <p className="text-xs text-muted-foreground text-center sm:text-left">
          US equities only · regular hours (09:30–16:00 ET) · last 30 days only
        </p>
      </div>
    </div>
  );
}
