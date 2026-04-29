# Session Handoff — 2026-04-27 office hours

A new Claude session reading this should also read `CLAUDE.md` and `DESIGN.md` in this folder.

This file captures **the conversation that produced the design doc** — pivots, decisions, and what was settled vs still open. The reasoning is here; the spec is in `DESIGN.md`.

## Starting point

User opened with: design an investment copilot for beginners. Functions: track news, interpret financial reports, decode K-line + technical indicators. Chinese fintech context — user mentioned 雪球 and 同花顺 as comparison points.

Mode declared: hackathon/learning + don't-rule-out-startup ("如果做得好不排除创业"). Started in Builder mode but with vibe-shift radar on.

## Pivot 1 — from "small white user education" to "bull/bear debate view"

When asked the wow-moment question (4 options), user picked **"争论区视角"** — show the strongest bull and strongest bear takes on the same event, with evidence. Most builders pick "one-line summary" here. The user picked the non-obvious option. **This was the first product-taste signal.**

The framing shifted: not "tell me the answer," but "show me the disagreement." Markets feel less like noise when you see smart people disagreeing on legible terms.

## Pivot 2 — user proposed Trump Twitter tracker as the wedge

User pushed back on "pick one wedge — can't I have all four?" — this is the platform-builder fallacy. After explaining why a weekend ship requires picking one moment-of-use, user proposed: "what if I drop the attribution model and just do a Trump Twitter tracker?"

This was the strongest product-instinct moment. **Simplification (drop attribution) + concretization (Trump, not generic events) = a sharper wedge.**

Vibe officially shifted to startup-curious here.

## Pivot 3 — landscape check killed the Trump-specific framing

WebSearch surfaced:
- TipRanks already runs a free Trump dashboard with Trumpy/Grumpy/Neutral sentiment scoring
- Bloomberg made a Trump Tweets feature + the Volfefe Index in his first term
- Multiple academic papers, an open-source `trump2cash` bot (2.7k stars, unmaintained)
- **Seeking Alpha April 2026: "Truth Social posts are losing their impact"** — markets desensitizing

Three-layer synthesis arrived at the eureka: **Trump is the demo, not the moat**. The real product is "any market-moving event → visualized price reaction + multi-perspective interpretation," with Trump being the most viral launch demo. Generalize to FOMC, CPI, central banker speeches, Elon, geopolitics.

## The 5 premises (as agreed)

1. Wedge is "event → visualized price reaction + multi-view interpretation," not Trump-specific
2. User = "interested-but-undertooled retail investors" — not pure beginners, not day traders. The user themselves + 5 specific friends/coworkers
3. Weekend ship: no model training, no accounts, no report parsing, no attribution AI
4. (Revised after cold read) Differentiation = shareable artifact as growth loop + editorial judgment of which events matter. Visualization is table stakes, not moat.
5. Bull/bear ships in V1 (~50 lines of prompt — cold read corrected the previous "save for V2" call)

## Cold read findings worth remembering

An independent Claude subagent (no transcript access) was dispatched after premises were locked. Highest-value findings:

- **Tell quote from the summary**: "Builds for self + 5 specific friends/coworkers in their orbit." → "This is a tool, not a startup. Build for those 6 people; let usage data answer the startup question."
- **Wrong premise**: original Premise 4 (visualization-as-moat) is wrong. Real moat = shareable artifact (distribution problem) + editorial curation (judgment problem). Evidence test: 30-day forward-rate from the 5 friends. **User accepted this revision.**
- **Unspoken risk**: the session optimized for competitive landscape, not for observed behavior of the 6 real users in the user's orbit. Pivot chain (copilot → tracker → generalized timeline) is classic scope drift. **Right next step is not writing code — it's 30-minute interviews with each of the 5 friends.**

User responded: parallel — ship MVP this week AND interview friends this week. Both tracks in `DESIGN.md`'s "Next Steps" section.

## Honest user moments

These are the things the user said that mattered most:

- "我老实讲：我不知道" — when asked who today actually does this workflow. Most people fabricate a user profile here. The user did not. This honesty is the single most valuable signal in the session.
- "我没有找到可以将多个信息源聚集在一起的，好用的产品" — the original gap observation. Specific platforms named (雪球, 同花顺), specific gap named (data without interpretation).
- "都同意，继续生成方案" — agreed to all 5 premises without negotiation. Could be conviction or could be agreement-bias; lean on the cold read evidence test (30-day forwards) to break the tie.
- "接受修正" — when cold read challenged Premise 4, user revised without defensive pushback. Founder trait, not engineer trait.

## Spec review iterations

Two rounds of adversarial review on the design doc:
- **Round 1**: 7/10. Found 15 issues. Most critical: Polygon free tier doesn't have 1-min intraday (would block entire project), URL-paste contradiction in spec, missing financial-advice disclaimer, Day 2 budget overstuffed.
- **Round 2 (after fixes)**: 8/10. Reviewer marked all 11 priority items resolved. Remaining nits: budget framing reconciliation ("无预算" vs "$50 cap"), news API source naming, daily-vs-monthly cap clarity. **All three were fixed before this handoff.**

Final verdict: ready for implementation.

## What was NOT decided in this session

These should be settled in the first hours of Day 1 (or before):

1. **Names of the 5 friends** — user agreed to write them down but did not in this session. Day-0 task.
2. **Which 3-5 demo replays to seed at launch** — candidates listed in DESIGN.md (NVDA earnings, FOMC, DeepSeek selloff, Trump tariffs). Final choice deferred.
3. **Domain name** — not chosen.
4. **Whether yfinance scraping is acceptable** vs paying for Polygon Starter — Day 1 first-30-min Feasibility check decides.
5. **The first interview script** — DESIGN.md gives the one-line question; full script TBD.

## Things a fresh session should NOT redo

- Don't re-explore alternatives — A/B/C were considered, A is locked in. B is the natural follow-on if A validates.
- Don't pivot back to "investment beginner education." That framing was rejected — TipRanks owns it for free, and beginners aren't the actual user.
- Don't add user accounts, financial-report parsing, or attribution AI to V1. Each was explicitly out-of-scope after weighing weekend feasibility.
- Don't drop the bull/bear card to "save it for later." Cold read corrected this; it IS the differentiator.

## Files in this folder

- `CLAUDE.md` — auto-loaded summary for any Claude session
- `DESIGN.md` — full design doc, the source of truth
- `HANDOFF.md` — this file, conversation context
