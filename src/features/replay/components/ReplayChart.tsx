"use client";

import { useMemo, useState } from "react";

import { PriceChart } from "@/components/chart/PriceChart";
import type { EngineBar } from "@/lib/engine/types";
import type { Candle } from "@/types/market.types";

import { getRevealedCandles } from "../engine/cursor";
import { useReplayBarFeed } from "../hooks/useReplayBarFeed";
import { useReplayPlayback } from "../hooks/useReplayPlayback";
import { useReplayStore } from "../store";
import { ReplayControls } from "./ReplayControls";

type ReplayChartProps = {
  candles: Candle[];
  instrumentLabel: string;
  timeframeLabel: string;
  /** M-9's future hook into `/lib/engine` — see useReplayBarFeed. Unused today. */
  onBarRevealed?: (bar: EngineBar) => void;
};

/**
 * The feature's container component: owns the store subscription and hands
 * `<PriceChart>` only `getRevealedCandles(candles, cursor)` — never the raw
 * `candles` array. That's the whole enforcement of ADR-004's "hide the
 * future at the engine layer" guarantee at this layer: PriceChart cannot
 * show a bar past the cursor because it never receives one.
 */
export function ReplayChart({
  candles,
  instrumentLabel,
  timeframeLabel,
  onBarRevealed,
}: ReplayChartProps) {
  // The replay store (Session 2) is a module-level singleton (ADR-005: one
  // store per feature, not one per mount) — it survives a symbol/timeframe
  // change even though this component's props change. Without this, a
  // leftover cursor timestamp from the previous instrument would not exist
  // in the new `candles` array, and cursor.ts's cursorToIndex treats that
  // as a broken invariant and throws (by design — see its own doc comment).
  // Adjusting store state during render (rather than in an effect) avoids a
  // render with the mismatched cursor ever happening at all; this is the
  // pattern React's own docs sanction for "resetting state when a prop
  // changes" (https://react.dev/learn/you-might-not-need-an-effect) — using
  // useState's setter, not a ref, since refs must not be read/written
  // during render (react-hooks/refs).
  const [trackedCandles, setTrackedCandles] = useState(candles);
  if (trackedCandles !== candles) {
    setTrackedCandles(candles);
    useReplayStore.getState().reset();
  }

  const cursor = useReplayStore((state) => state.cursor);

  useReplayPlayback(candles);
  useReplayBarFeed(candles, onBarRevealed);

  const revealed = useMemo(
    () => getRevealedCandles(candles, cursor),
    [candles, cursor],
  );

  // `candles.length === 0` (a genuine empty fetch) and `cursor === null`
  // (a real fetch, but the session hasn't started — cursor.ts's documented
  // "zero bars revealed" state) both produce an empty `revealed` array.
  // PriceChart's own empty state ("No candle data for this range") is
  // correct for the first case but misleading for the second — it reads
  // as a data problem when there isn't one. Distinguish them here, in the
  // feature, rather than teaching PriceChart (feature-agnostic, §16) about
  // replay's cursor concept.
  const notStartedYet = candles.length > 0 && cursor === null;

  return (
    <div className="flex flex-col gap-4">
      {notStartedYet ? (
        <div
          className="bg-surface border-border text-muted-foreground flex h-[400px] w-full items-center justify-center rounded-md border text-sm"
          role="status"
        >
          Nothing revealed yet — press Play or step forward to begin.
        </div>
      ) : (
        <PriceChart
          candles={revealed}
          instrumentLabel={instrumentLabel}
          timeframeLabel={timeframeLabel}
        />
      )}
      <ReplayControls candles={candles} />
    </div>
  );
}
