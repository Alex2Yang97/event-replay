"use client";

import { useEffect, useRef } from "react";
import {
  CandlestickSeries,
  ColorType,
  createChart,
  createSeriesMarkers,
  CrosshairMode,
  type IChartApi,
  type UTCTimestamp,
} from "lightweight-charts";
import type { Bar } from "@/lib/replay-data";

type Props = {
  bars: Bar[];
  eventTime: number;
};

export function ReplayChart({ bars, eventTime }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current || bars.length === 0) return;

    const chart: IChartApi = createChart(containerRef.current, {
      height: 400,
      layout: {
        background: { type: ColorType.Solid, color: "rgba(0,0,0,0)" },
        textColor: "#71717a",
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: "rgba(128,128,128,0.15)" },
        horzLines: { color: "rgba(128,128,128,0.15)" },
      },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderVisible: false },
      timeScale: {
        borderVisible: false,
        timeVisible: true,
        secondsVisible: false,
        fixLeftEdge: true,
        fixRightEdge: true,
        lockVisibleTimeRangeOnResize: true,
      },
      autoSize: true,
    });

    const series = chart.addSeries(CandlestickSeries, {
      upColor: "#16a34a",
      downColor: "#dc2626",
      borderVisible: false,
      wickUpColor: "#16a34a",
      wickDownColor: "#dc2626",
    });

    const candleData = bars.map((b) => ({
      time: (Math.floor(b.time / 1000) as UTCTimestamp),
      open: b.open,
      high: b.high,
      low: b.low,
      close: b.close,
    }));
    series.setData(candleData);

    const eventSec = Math.floor(eventTime / 1000);
    const nearest = candleData.reduce<(typeof candleData)[number] | null>(
      (best, b) => {
        if (!best) return b;
        return Math.abs(b.time - eventSec) < Math.abs(best.time - eventSec)
          ? b
          : best;
      },
      null
    );

    if (nearest) {
      const eventLabel = new Date(eventTime).toLocaleTimeString("en-US", {
        timeZone: "America/New_York",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });
      createSeriesMarkers(series, [
        {
          time: nearest.time,
          position: "aboveBar",
          color: "#2563eb",
          shape: "arrowDown",
          text: `event · ${eventLabel} ET`,
          size: 2,
        },
      ]);
      series.createPriceLine({
        price: nearest.close,
        color: "#2563eb",
        lineWidth: 1,
        lineStyle: 2,
        axisLabelVisible: false,
        title: "event",
      });
    }

    chart.timeScale().fitContent();

    return () => {
      chart.remove();
    };
  }, [bars, eventTime]);

  if (bars.length === 0) {
    return (
      <div className="h-[400px] flex items-center justify-center text-sm text-muted-foreground border rounded-md">
        No intraday bars available for this window.
      </div>
    );
  }

  return <div ref={containerRef} className="h-[400px] w-full" />;
}
