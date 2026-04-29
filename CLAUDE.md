# Event Replay — context for fresh Claude sessions

This file is auto-loaded by Claude Code. It exists so a new session can pick up where the last left off.

## What this project is

A weekend-shippable web app: **paste ticker + datetime → get a shareable permalink showing the intraday price chart + a bull-vs-bear LLM card explaining the move**. Think: "what just happened to $X" as a viral artifact, not a dashboard.

The core insight: TipRanks/Bloomberg/TradingView already win on dashboards. Nobody owns the **shareable permalink with OG image preview** as the growth loop. Each replay is a screenshot-ready link a friend can drop in a group chat.

## Source of truth

**`DESIGN.md`** is the full design doc. Read it first. It includes:
- Problem statement + target user
- 5 agreed premises (Premise 4 was revised after a cold-read challenge)
- Approaches A/B/C considered, **Approach A selected**
- Full tech stack + data flow + UI decisions for V1
- Open questions, success criteria, distribution plan, weekend timeline
- A "What I noticed about how you think" section with founder-signal observations

**`HANDOFF.md`** has the conversation summary + key pivots + the hard-won decisions (why this and not that). Read it second.

## What's in scope for V1 (the weekend MVP)

- Single input: ticker (US equities only) + datetime picker (regular hours only)
- Pull ±2h of 1-min bars + nearby news headlines
- One Anthropic call → `{event_summary, bull_take, bear_take}` with required source citations
- Render annotated chart + 3 cards + financial-advice disclaimer
- Generate `sha1(ticker + rounded_minute_ET)` permalink, store in Vercel KV
- Static OG image (no chart in OG — Lightweight Charts is canvas-runtime, not SSR)
- Hardcoded array of 5 demo replays in footer

## What's explicitly out of V1

- URL-paste input (V2)
- Chart inside OG image (V2)
- A-shares / 港股 / crypto / pre-market / halted tickers (V2+)
- User accounts, watchlists, alerts, portfolio tracking (later or never)
- Fact-check pass on LLM output (V1 risk accepted, mitigated by disclaimer)
- Curated event feed (Approach B — for next iteration if A validates)

## Stack (committed)

- Next.js 15 App Router on Vercel
- Tailwind v4 + shadcn/ui
- Lightweight Charts (TradingView OSS) for K-line rendering
- Polygon.io Starter ($30/mo, includes news endpoint)
- Anthropic SDK, Claude Sonnet 4.7
- Vercel KV for permalink storage (no price caching in V1)
- `@vercel/og` for static OG images

Budget cap: **≤$50 first month total**. Anthropic monthly hard cap = $20.

## The user (project owner)

Solo developer. Builds for self + 5 specific friends/coworkers. Mode is "side project, possibly startup if validated." Already invests in stocks.

The 5 friends haven't been named yet — that's a Day-0 task.

## The two-track assignment for the first week

1. **Ship Approach A V1** — Day 1 starts with a 30-minute Feasibility check on the data source (yfinance vs Polygon Starter). Plan B is paying $30/mo. Don't write anything else until you've validated 1-min intraday data is available.
2. **Interview ≥3 of the 5 friends** — 30 minutes each. One open question: "Last time you wanted to understand a market move — what was it, and what did you actually do?" Write down their words verbatim, not summaries. May slip to next Mon-Wed.

## 30-day kill criteria

Hard yes: ≥2 of the 5 friends *externally forward* a permalink (to a group/platform the user is not in — user's own demo posts don't count).

Edge case: friends use it but no external shares → consider Approach C (Twitter reply bot) as Plan B for distribution.

Hard fail: ≥3 friends never come back → event-replay hypothesis is wrong, restart from user interview transcripts.

## The key decisions you should NOT casually overturn

These were hard-won in the previous session. If a fresh session wants to change one, re-read HANDOFF.md to see why it was settled this way.

1. **Trump tracker is just demo content, not the moat** — TipRanks already does Trump-specific. Don't pivot back.
2. **Visualization is table stakes, not differentiation** — moat is the share artifact + editorial curation. Don't slide back into "just make pretty charts."
3. **Bull/bear ships in V1, not V2** — cold read corrected the previous "save it for V2" call. ~50 lines of prompt. It IS the differentiator.
4. **No URL paste in V1** — every additional input parser is a tax on shipping. Ticker + datetime only.
5. **Disclaimer is non-negotiable** — financial-advice exposure on a viral product is real risk.

## Development reminder

When implementing, follow the user's global CLAUDE.md preferences:
- Use /browse skill from gstack for any web testing (never `mcp__claude-in-chrome__*`)
- Default to no comments unless WHY is non-obvious
- Don't add unnecessary error handling for impossible scenarios
- Match scope to the task — no premature abstraction
