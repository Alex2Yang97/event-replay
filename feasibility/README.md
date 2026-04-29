# Feasibility Check — Day 1 first 30 minutes

Per `DESIGN.md` line 124, this is the load-bearing assumption for the entire project:

> Polygon.io free = 5 calls/min + EOD only, no 1-min intraday. Alpha Vantage free = 25 req/day. yfinance is unofficial scrape, violates Yahoo ToS, unstable.
>
> **Plan A**: try yfinance — if it works, accept ToS risk for the weekend.
> **Plan B**: pay Polygon Starter $30/month, accept budget.
>
> **If this check fails, the entire design gets rewritten.**

## What we need to validate

The use case (DESIGN.md "核心数据流" step 4): given any US equity ticker + any regular-hours historical timestamp, fetch ±2 hours of 1-minute OHLC bars in <2 seconds.

Demo replays mentioned in DESIGN.md (NVDA earnings, FOMC, DeepSeek selloff, Trump tariffs) suggest we may need timestamps from the last several months — not just the last 7 days.

## Test matrix

| Scenario | Why |
|---|---|
| Recent (within 7 days) | yfinance documented sweet spot |
| 30 days ago | Most demo replays will be in this window |
| 90 days ago | Stress test the 7-day limit claim |
| 180+ days ago | NVDA earnings / DeepSeek selloff are this old |
| Multiple tickers | Different data availability per ticker |

## Decision criteria

- **Pass**: 1-min bars available for ≥30-day-old timestamps with <2s latency → use yfinance for V1
- **Partial**: works for recent but not historical → still use yfinance, restrict input UI to last 7 days, defer historical demos to V2
- **Fail**: doesn't work or too unstable → pay Polygon Starter, document budget impact
