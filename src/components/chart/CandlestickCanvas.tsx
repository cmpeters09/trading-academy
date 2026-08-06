"use client";

import {
  CandlestickSeries,
  ColorType,
  createChart,
  type CandlestickData,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from "lightweight-charts";
import { useTheme } from "next-themes";
import { useEffect, useRef } from "react";

import { getChartPalette } from "@/lib/chart-palette";
import type { Candle } from "@/types/market.types";

type CandlestickCanvasProps = {
  candles: Candle[];
  height: number;
};

function toSeriesData(candles: Candle[]): CandlestickData<UTCTimestamp>[] {
  return candles.map((candle) => ({
    time: (new Date(candle.ts).getTime() / 1000) as UTCTimestamp,
    open: candle.open,
    high: candle.high,
    low: candle.low,
    close: candle.close,
  }));
}

/**
 * The only module that imports `lightweight-charts` — everything else goes
 * through <PriceChart>, which lazy-loads this via next/dynamic (ssr:false,
 * ADR-004 / ENGINEERING_PRINCIPLES §12) so the library never lands in the
 * shared bundle.
 */
export function CandlestickCanvas({ candles, height }: CandlestickCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  // Mirrors the `candles` prop so the chart-creation effect can reseed a
  // freshly rebuilt series (theme change) with the latest data, without
  // depending on `candles` itself — that would defeat the point of the
  // separate incremental-update effect below (ADR-004: feed the chart via
  // setData/update, not a full rebuild per data change).
  const candlesRef = useRef(candles);

  const { resolvedTheme } = useTheme();

  useEffect(() => {
    candlesRef.current = candles;
    seriesRef.current?.setData(toSeriesData(candles));
  }, [candles]);

  // useEffect is unavoidable here (§17): the chart is an imperative canvas
  // library living outside React's render cycle. Rebuilt on theme change so
  // colors are always re-read fresh from the palette module rather than
  // patched piecemeal.
  //
  // The palette read is deferred to requestAnimationFrame rather than done
  // synchronously in the effect body: next-themes flips
  // document.documentElement's class in its *own* useEffect, and React
  // gives no ordering guarantee that an ancestor's effect runs before a
  // descendant's just because it's higher in the tree — confirmed by
  // instrumenting both in a real theme toggle, this effect was firing
  // (with the new resolvedTheme value) before next-themes had mutated the
  // class, so getComputedStyle still returned the old theme's colors. rAF
  // runs after every effect in the commit has flushed, so the class swap
  // is always done by the time the palette is read.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let chart: IChartApi | null = null;
    let resizeObserver: ResizeObserver | null = null;

    const frame = requestAnimationFrame(() => {
      const palette = getChartPalette();
      chart = createChart(container, {
        width: container.clientWidth,
        height,
        layout: {
          background: { type: ColorType.Solid, color: palette.surface },
          textColor: palette.muted,
        },
        grid: {
          vertLines: { color: palette.border },
          horzLines: { color: palette.border },
        },
        rightPriceScale: { borderColor: palette.border },
        timeScale: { borderColor: palette.border },
      });

      const series = chart.addSeries(CandlestickSeries, {
        upColor: palette.up,
        downColor: palette.down,
        borderUpColor: palette.up,
        borderDownColor: palette.down,
        wickUpColor: palette.up,
        wickDownColor: palette.down,
      });
      series.setData(toSeriesData(candlesRef.current));
      seriesRef.current = series;

      resizeObserver = new ResizeObserver((entries) => {
        const entry = entries[0];
        if (!entry) return;
        chart?.resize(entry.contentRect.width, height);
      });
      resizeObserver.observe(container);
    });

    return () => {
      cancelAnimationFrame(frame);
      resizeObserver?.disconnect();
      chart?.remove();
      seriesRef.current = null;
    };
  }, [resolvedTheme, height]);

  return <div ref={containerRef} style={{ height }} />;
}
