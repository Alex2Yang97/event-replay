"""Follow-up checks after the main feasibility script:

1. Stability: 5 sequential fetches to detect rate-limit / scrape breakage.
2. News coverage: can yfinance's .news attribute replace Polygon's news endpoint?
3. Pre-market exclusion: confirm the 09:30 ET cutoff so we know how to size +/-2h.
"""

from __future__ import annotations

import time
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

import yfinance as yf

ET = ZoneInfo("America/New_York")


def stability_test(ticker: str = "NVDA", n: int = 5) -> None:
    print("=" * 78)
    print(f"Stability test: {n} sequential 1-min fetches for {ticker}")
    print("=" * 78)
    base = datetime.now(ET) - timedelta(days=3)
    while base.weekday() >= 5:
        base -= timedelta(days=1)
    target = base.replace(hour=10, minute=30, second=0, microsecond=0)

    latencies: list[float] = []
    for i in range(n):
        t0 = time.perf_counter()
        df = yf.download(
            tickers=ticker,
            start=target - timedelta(hours=2),
            end=target + timedelta(hours=2),
            interval="1m",
            progress=False,
            auto_adjust=False,
            prepost=False,
            threads=False,
        )
        elapsed = time.perf_counter() - t0
        latencies.append(elapsed)
        bars = 0 if df is None or df.empty else len(df.index)
        print(f"  Attempt {i+1}: {bars} bars in {elapsed:.2f}s")
        time.sleep(0.5)

    avg = sum(latencies) / len(latencies)
    print(f"  avg={avg:.2f}s  min={min(latencies):.2f}s  max={max(latencies):.2f}s")


def news_test(ticker: str = "NVDA") -> None:
    print("\n" + "=" * 78)
    print(f"News coverage test: yfinance .news for {ticker}")
    print("=" * 78)
    t0 = time.perf_counter()
    try:
        ticker_obj = yf.Ticker(ticker)
        news = ticker_obj.news or []
    except Exception as e:
        print(f"  ERROR: {e}")
        return
    elapsed = time.perf_counter() - t0
    print(f"  Returned {len(news)} headlines in {elapsed:.2f}s")
    if not news:
        return
    print(f"  Schema (first item keys): {list(news[0].keys())}")
    for i, item in enumerate(news[:3]):
        title = item.get("title") or item.get("content", {}).get("title", "?")
        pub = item.get("providerPublishTime") or item.get("content", {}).get("pubDate", "?")
        publisher = item.get("publisher") or item.get("content", {}).get("provider", {}).get("displayName", "?")
        link = item.get("link") or item.get("content", {}).get("canonicalUrl", {}).get("url", "?")
        print(f"\n  [{i+1}] {title}")
        print(f"      Published: {pub}  by: {publisher}")
        print(f"      URL: {link}")


def premarket_test(ticker: str = "NVDA") -> None:
    print("\n" + "=" * 78)
    print(f"Pre-market behavior test: {ticker} with prepost=False vs True")
    print("=" * 78)
    base = datetime.now(ET) - timedelta(days=3)
    while base.weekday() >= 5:
        base -= timedelta(days=1)
    target = base.replace(hour=10, minute=0, second=0, microsecond=0)

    for prepost in (False, True):
        df = yf.download(
            tickers=ticker,
            start=target - timedelta(hours=2),
            end=target + timedelta(hours=2),
            interval="1m",
            progress=False,
            auto_adjust=False,
            prepost=prepost,
            threads=False,
        )
        bars = 0 if df is None or df.empty else len(df.index)
        first = df.index[0].to_pydatetime() if bars else None
        last = df.index[-1].to_pydatetime() if bars else None
        if first and first.tzinfo:
            first = first.astimezone(ET)
        if last and last.tzinfo:
            last = last.astimezone(ET)
        window = f"{first.strftime('%H:%M')} -> {last.strftime('%H:%M')}" if first else "?"
        print(f"  prepost={prepost}: {bars} bars [{window} ET]")


if __name__ == "__main__":
    stability_test()
    news_test()
    premarket_test()
