"""Feasibility check: can yfinance deliver ±2h of 1-min OHLC bars for arbitrary
historical timestamps within the use cases promised by DESIGN.md?

Pass = 1-min bars available for >=30-day-old timestamps in <2s.
Partial = works only for recent (within 7 days) -> restrict UI scope.
Fail = unreliable or unavailable -> pay Polygon Starter ($30/mo).
"""

from __future__ import annotations

import time
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

import yfinance as yf

ET = ZoneInfo("America/New_York")


@dataclass
class TestCase:
    ticker: str
    target_dt_et: datetime
    label: str


@dataclass
class Result:
    case: TestCase
    bars_returned: int
    elapsed_s: float
    first_bar_ts: datetime | None
    last_bar_ts: datetime | None
    error: str | None
    columns: list[str]

    @property
    def passed(self) -> bool:
        return self.error is None and self.bars_returned >= 100

    def summary(self) -> str:
        if self.error:
            return f"FAIL: {self.error}"
        coverage = f"{self.bars_returned} bars"
        window = ""
        if self.first_bar_ts and self.last_bar_ts:
            window = f" [{self.first_bar_ts.strftime('%H:%M')} -> {self.last_bar_ts.strftime('%H:%M')} ET]"
        return f"{coverage}{window} in {self.elapsed_s:.2f}s"


def most_recent_weekday_at(hour: int, minute: int, days_ago: int) -> datetime:
    """Return a datetime in ET that is `days_ago` days back, snapped to a weekday."""
    base = datetime.now(ET) - timedelta(days=days_ago)
    while base.weekday() >= 5:
        base -= timedelta(days=1)
    return base.replace(hour=hour, minute=minute, second=0, microsecond=0)


def fetch_window(ticker: str, target_dt_et: datetime, hours_each_side: int = 2) -> Result:
    """Fetch +/- hours_each_side of 1-min bars around target_dt_et."""
    case = TestCase(ticker, target_dt_et, label=f"{ticker} @ {target_dt_et.isoformat()}")
    start = (target_dt_et - timedelta(hours=hours_each_side)).astimezone(timezone.utc)
    end = (target_dt_et + timedelta(hours=hours_each_side)).astimezone(timezone.utc)

    t0 = time.perf_counter()
    try:
        df = yf.download(
            tickers=ticker,
            start=start,
            end=end,
            interval="1m",
            progress=False,
            auto_adjust=False,
            prepost=False,
            threads=False,
        )
    except Exception as e:
        return Result(case, 0, time.perf_counter() - t0, None, None, str(e), [])

    elapsed = time.perf_counter() - t0

    if df is None or df.empty:
        return Result(case, 0, elapsed, None, None, "empty dataframe", [])

    first_ts = df.index[0].to_pydatetime() if len(df.index) else None
    last_ts = df.index[-1].to_pydatetime() if len(df.index) else None
    if first_ts and first_ts.tzinfo:
        first_ts = first_ts.astimezone(ET)
    if last_ts and last_ts.tzinfo:
        last_ts = last_ts.astimezone(ET)

    columns = [str(c) for c in df.columns.tolist()]
    return Result(case, len(df.index), elapsed, first_ts, last_ts, None, columns)


def main() -> int:
    cases = [
        TestCase("NVDA", most_recent_weekday_at(10, 30, days_ago=2), "Recent: 2 days ago"),
        TestCase("NVDA", most_recent_weekday_at(10, 30, days_ago=7), "Boundary: 7 days ago"),
        TestCase("NVDA", most_recent_weekday_at(10, 30, days_ago=14), "Past 1d limit: 14 days ago"),
        TestCase("NVDA", most_recent_weekday_at(10, 30, days_ago=30), "30 days ago (most demos)"),
        TestCase("AAPL", most_recent_weekday_at(14, 0, days_ago=60), "AAPL 60 days ago, afternoon"),
        TestCase("TSLA", most_recent_weekday_at(11, 15, days_ago=90), "TSLA 90 days ago"),
        TestCase("NVDA", most_recent_weekday_at(10, 0, days_ago=180), "NVDA 180 days ago (deep)"),
    ]

    print("=" * 78)
    print("yfinance feasibility check for Event Replay")
    print(f"Run time: {datetime.now(ET).isoformat()}")
    print(f"yfinance version: {yf.__version__}")
    print("=" * 78)

    results: list[Result] = []
    for case in cases:
        print(f"\n[{case.label}]")
        print(f"  Target: {case.ticker} @ {case.target_dt_et.isoformat()}")
        result = fetch_window(case.ticker, case.target_dt_et)
        results.append(result)
        verdict = "PASS" if result.passed else "FAIL"
        print(f"  {verdict}: {result.summary()}")
        if result.columns and result.passed:
            print(f"  Columns: {result.columns}")

    print("\n" + "=" * 78)
    print("VERDICT")
    print("=" * 78)
    passed_recent = any(r.passed and (datetime.now(ET) - r.case.target_dt_et).days <= 7 for r in results)
    passed_old = any(r.passed and (datetime.now(ET) - r.case.target_dt_et).days >= 30 for r in results)

    if passed_recent and passed_old:
        print("PASS: yfinance covers both recent and 30+ day historical timestamps.")
        print("Recommendation: use yfinance for V1, accept ToS risk for the weekend.")
        return 0
    if passed_recent and not passed_old:
        print("PARTIAL: yfinance covers recent but not historical.")
        print("Recommendation: use yfinance + restrict UI to last 7 days, OR pay Polygon Starter.")
        return 1
    print("FAIL: yfinance does not reliably cover the use cases.")
    print("Recommendation: pay Polygon Starter ($30/mo). Update DESIGN.md budget framing.")
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
