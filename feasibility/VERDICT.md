# Feasibility Verdict — 2026-04-29

Status: **PASS with scope adjustment**

## Summary

yfinance can deliver everything V1 needs **for free**, with one constraint: the input UI must restrict timestamps to the last 30 days. The `.news` attribute also returns real headlines (title, publisher, timestamp, URL), which means we can drop Polygon from V1 entirely.

This is **better** than the path proposed in `DESIGN.md`:
- $30/mo budget freed up for more Anthropic headroom
- One load-bearing dependency instead of two (yfinance for both price + news)
- Faster Day 1: no Polygon API-key signup, no second SDK to learn

## Evidence

### Test 1 — Historical reach (the load-bearing question)

| Lookback | Result | Latency | Bars |
|---|---|---|---|
| 2 days | PASS | 0.72s | 180 |
| 7 days | PASS | 0.21s | 180 |
| 14 days | PASS | 0.21s | 180 |
| 30 days | PASS | 0.24s | 180 |
| 60 days | FAIL | — | empty (Yahoo: "must be within the last 30 days") |
| 90 days | FAIL | — | empty |
| 180 days | FAIL | — | empty |

**The hard cliff is 30 days, not 7 as the docs suggested.** Tested on NVDA, AAPL, TSLA — same behavior across tickers.

### Test 2 — Stability (5 sequential cold then warm fetches)

```
Attempt 1: 180 bars in 0.64s
Attempt 2-5: 180 bars in 0.01s each (yfinance request-caches by default)
```

No rate-limit failures. Cold queries finish well under the 2s budget.

### Test 3 — News endpoint (the surprise win)

```
Returned 10 headlines in 0.31s
Schema: id, content
[1] Big Tech: What this strategist is looking for on earnings calls
    Published: 2026-04-28T20:43:04Z  by: Yahoo Finance Video
    URL: https://finance.yahoo.com/video/...
[2] OpenAI miss sparks sell-off for Oracle, Nvidia, CoreWeave stocks
    Published: 2026-04-28T17:24:14Z  by: Yahoo Finance Video
[3] The only number that matters for 'Magnificent 7' earnings this week
    Published: 2026-04-28T10:00:00Z  by: Yahoo Finance
```

Has everything the bull/bear prompt needs: title, publisher, publish timestamp, canonical URL. Real Yahoo Finance headlines, not Polygon-curated, but that's fine — the LLM only needs cite-able sources.

**Note**: `.news` returns recent items globally for the ticker, not time-windowed around an event. We will need to filter client-side to "headlines published within ±N hours of the event timestamp" before passing to the LLM. Acceptable.

### Test 4 — Pre-market behavior

```
prepost=False: 150 bars [09:30 -> 11:59 ET]
prepost=True:  240 bars [08:00 -> 11:59 ET]
```

When the requested window straddles 09:30 ET (e.g., event at 10:00, ±2h = 08:00-12:00), yfinance with `prepost=False` truncates to RTH only. Two options:
- Accept truncation (V1 is RTH-only anyway per DESIGN.md)
- Set `prepost=True` and filter pre-market bars in the chart layer

Recommendation: accept truncation. The chart will just start at 09:30 for early-morning events. Document in copy.

## Risks acknowledged (unchanged or reduced from DESIGN.md)

1. **Yahoo ToS violation** — yfinance is an unofficial scrape. Risk: Yahoo blocks IPs or breaks endpoint with no warning. Mitigation: monitor for failures in production; Plan B (Polygon Starter, $30/mo) is a ~2-hour migration since the data shape is similar.
2. **30-day historical limit** — hard. Means demo replays must all be from the last 30 days (drops "DeepSeek selloff" from the candidate list — that was Jan 2025).
3. **News is global, not event-windowed** — must filter to ±N hours in app code. Trivial.

## Decisions to lock in (these update DESIGN.md)

1. **Data source for V1**: `yahoo-finance2` (Node) only. No Polygon, no Python sidecar.
2. **Input UI constraint**: datetime picker max = today, min = today minus 30 days. Reject older inputs at the form level with a clear message.
3. **News source for V1**: `yahooFinance.search(ticker, { newsCount: 10, quotesCount: 0 })` filtered to ±N hours of event timestamp. N defaults to 4.
4. **Demo replay candidates** (must all be within last 30 days):
   - NVDA recent post-earnings move (last quarterly earnings was within 30 days)
   - Most recent FOMC decision (FOMC meets ~8x/yr)
   - Most recent Trump tariff/tweet that moved markets
   - Drop DeepSeek selloff from candidates (>1 year old)
5. **Budget update**: $0 data + Anthropic ~$20 cap + domain ~$10/yr = **~$20-30 first month** (was $50). Anthropic monthly cap stays $20.
6. **Plan B documented**: if yahoo-finance2 breaks during the weekend, swap to Polygon Starter ($30/mo) is a ~2-hour port.

## What this unblocks

Day 1 can start immediately on:
- Next.js 15 skeleton + shadcn/ui
- Input form (ticker + datetime, with the 30-day constraint baked in)
- A `/api/replay` route that calls yfinance via a Python sidecar (or finds a Node equivalent — see Open Question below)
- Lightweight Charts rendering

## Bridge decision — RESOLVED

Tested `yahoo-finance2` (Node) immediately after the Python checks:

| Metric | Python (yfinance) | Node (yahoo-finance2) |
|---|---|---|
| 1-min OHLC fetch (cold) | 0.64s | 0.16s |
| 1-min OHLC fetch (warm) | 0.01s | 0.05s |
| Same 30-day cliff? | yes | yes |
| News endpoint? | `Ticker.news` (10 items) | `.search(symbol, {newsCount})` (10 items) |
| Bar shape | multi-index columns `(field, ticker)` | flat `{date, open, high, low, close, volume}` |
| Vercel deployability | needs Python runtime | native Node |

**Decision: use `yahoo-finance2` in the Next.js API route. No Python sidecar.** 4-15x faster, simpler data shape that maps directly to Lightweight Charts, single language across the whole stack.

One quirk to handle: `chart({period1, period2})` does not strictly honor `period2` (it appears to return all bars from `period1` to now). Trivial fix: filter to ±2h client-side after the fetch.

API surface to use:
- Bars: `yahooFinance.chart(ticker, { period1, period2, interval: "1m", includePrePost: false })`
- News: `yahooFinance.search(ticker, { newsCount: 10, quotesCount: 0 })` then filter by `providerPublishTime` to ±N hours of event timestamp.
