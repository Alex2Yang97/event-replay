"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { encodeReplayId } from "@/lib/replay-id";
import {
  MS_PER_DAY,
  MS_PER_MINUTE,
  isRegularHoursET,
  isWithinLast30Days,
  toEtParts,
} from "@/lib/time";

function localDatetimeValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}

export function ReplayForm() {
  const router = useRouter();
  const [ticker, setTicker] = useState("");
  const [datetime, setDatetime] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { minInput, maxInput } = useMemo(() => {
    const now = new Date();
    const earliest = new Date(now.getTime() - 30 * MS_PER_DAY);
    return {
      minInput: localDatetimeValue(earliest),
      maxInput: localDatetimeValue(now),
    };
  }, []);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const normalizedTicker = ticker.trim().toUpperCase();
    if (!/^[A-Z]{1,5}$/.test(normalizedTicker)) {
      setError("Ticker must be 1–5 letters (US equities only).");
      return;
    }
    if (!datetime) {
      setError("Pick a date and time.");
      return;
    }

    const parsed = new Date(datetime);
    if (Number.isNaN(parsed.getTime())) {
      setError("Invalid datetime.");
      return;
    }
    if (!isWithinLast30Days(parsed)) {
      setError("Datetime must be within the last 30 days.");
      return;
    }
    if (!isRegularHoursET(parsed)) {
      const { weekday } = toEtParts(parsed);
      setError(
        weekday === "Sat" || weekday === "Sun"
          ? "Markets are closed on weekends. Pick a weekday."
          : "Pick a time during regular hours (09:30–16:00 ET)."
      );
      return;
    }

    const rounded = new Date(
      parsed.getTime() - (parsed.getTime() % MS_PER_MINUTE)
    );

    setSubmitting(true);
    const id = encodeReplayId({
      ticker: normalizedTicker,
      timestamp: rounded.toISOString(),
    });
    router.push(`/replay/${id}`);
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="ticker">Ticker</Label>
        <Input
          id="ticker"
          placeholder="NVDA"
          autoComplete="off"
          spellCheck={false}
          value={ticker}
          onChange={(e) => setTicker(e.target.value.toUpperCase())}
          maxLength={5}
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="datetime">Datetime</Label>
        <Input
          id="datetime"
          type="datetime-local"
          min={minInput}
          max={maxInput}
          value={datetime}
          onChange={(e) => setDatetime(e.target.value)}
          required
        />
      </div>

      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}

      <Button type="submit" size="lg" disabled={submitting} className="w-full">
        {submitting ? "Loading replay…" : "Replay this moment"}
      </Button>
    </form>
  );
}
