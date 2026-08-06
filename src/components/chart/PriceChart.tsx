"use client";

import dynamic from "next/dynamic";
import { useId, useMemo, useState } from "react";

import type { Candle } from "@/types/market.types";

const CandlestickCanvas = dynamic(
  () => import("./CandlestickCanvas").then((mod) => mod.CandlestickCanvas),
  { ssr: false, loading: () => <ChartSkeleton /> },
);

function ChartSkeleton() {
  return (
    <div
      className="bg-muted h-[400px] w-full animate-pulse rounded-md"
      aria-hidden="true"
    />
  );
}

const dateFormatter = new Intl.DateTimeFormat("en-US", { dateStyle: "medium" });

/**
 * ENGINEERING_PRINCIPLES §11 — canvas charts are inaccessible by nature, so
 * every chart needs a text alternative: this summary and the data table
 * toggle below it. Hand-computed from first/last candle, not derived from
 * the chart library.
 */
function buildSummary(
  candles: Candle[],
  instrumentLabel: string,
  timeframeLabel: string,
): string {
  const first = candles[0];
  const last = candles.at(-1);
  if (!first || !last) {
    return `${instrumentLabel} ${timeframeLabel} chart, no data available for this range.`;
  }

  const changePct = ((last.close - first.open) / first.open) * 100;
  const trend =
    Math.abs(changePct) < 0.05
      ? "roughly flat"
      : `${changePct > 0 ? "up" : "down"} ${Math.abs(changePct).toFixed(1)}%`;
  const range = `${dateFormatter.format(new Date(first.ts))} to ${dateFormatter.format(new Date(last.ts))}`;

  return `${instrumentLabel} candlestick chart, ${timeframeLabel} timeframe, ${range}. Price ${trend} over the period.`;
}

type PriceChartProps = {
  candles: Candle[];
  instrumentLabel: string;
  timeframeLabel: string;
  height?: number;
};

/**
 * Shared candlestick chart (ADR-004). Features compose this; nothing else
 * should import `lightweight-charts` or CandlestickCanvas directly.
 */
export function PriceChart({
  candles,
  instrumentLabel,
  timeframeLabel,
  height = 400,
}: PriceChartProps) {
  const [showTable, setShowTable] = useState(false);
  const tableId = useId();

  const summary = useMemo(
    () => buildSummary(candles, instrumentLabel, timeframeLabel),
    [candles, instrumentLabel, timeframeLabel],
  );

  return (
    <div className="flex flex-col gap-2">
      {/* role="img" treats the canvas as a single graphic for assistive
          tech, described by aria-label — the data table below is the
          actual accessible equivalent, not the canvas itself (§11). */}
      <div role="img" aria-label={summary}>
        {candles.length === 0 ? (
          <div
            className="bg-surface border-border text-muted-foreground flex w-full items-center justify-center rounded-md border text-sm"
            style={{ height }}
          >
            No candle data for this range.
          </div>
        ) : (
          <CandlestickCanvas candles={candles} height={height} />
        )}
      </div>

      <button
        type="button"
        onClick={() => setShowTable((prev) => !prev)}
        aria-expanded={showTable}
        aria-controls={tableId}
        className="text-muted-foreground hover:text-foreground self-start text-sm underline underline-offset-2"
      >
        {showTable ? "Hide data table" : "View as data table"}
      </button>

      {showTable && (
        <div id={tableId} className="overflow-x-auto">
          <table className="w-full text-sm">
            <caption className="sr-only">{summary}</caption>
            <thead>
              <tr className="border-border border-b text-left">
                <th scope="col" className="py-1 pr-4 font-medium">Date</th>
                <th scope="col" className="py-1 pr-4 font-medium">Open</th>
                <th scope="col" className="py-1 pr-4 font-medium">High</th>
                <th scope="col" className="py-1 pr-4 font-medium">Low</th>
                <th scope="col" className="py-1 pr-4 font-medium">Close</th>
                <th scope="col" className="py-1 font-medium">Volume</th>
              </tr>
            </thead>
            <tbody>
              {candles.map((candle) => (
                <tr key={candle.ts} className="border-border border-b last:border-0">
                  <td className="py-1 pr-4">{dateFormatter.format(new Date(candle.ts))}</td>
                  <td className="py-1 pr-4">{candle.open.toFixed(2)}</td>
                  <td className="py-1 pr-4">{candle.high.toFixed(2)}</td>
                  <td className="py-1 pr-4">{candle.low.toFixed(2)}</td>
                  <td className="py-1 pr-4">{candle.close.toFixed(2)}</td>
                  <td className="py-1">{candle.volume.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
