"use client";

import { useState } from "react";

import { ReplayChart } from "@/features/replay";
import type { Candle } from "@/types/market.types";

import { PositionPanel } from "./PositionPanel";
import { useSimulatorStore } from "../store";

type ReplaySimulatorProps = {
  candles: Candle[];
  instrumentLabel: string;
  timeframeLabel: string;
};

/**
 * The M-9 Session 3 keystone: mounts the order ticket / position readout
 * next to the replay chart, and wires `onBarRevealed` (M-10's mechanism,
 * `useReplayBarFeed`) straight to `useSimulatorStore`. Lives in `simulator`,
 * not `replay` -- `replay` stays feature-agnostic to trading orders
 * (ENGINEERING_PRINCIPLES §16); this component is simulator consuming
 * replay's public surface (`ReplayChart`'s `onBarRevealed` prop), never a
 * deep import into replay's internals.
 *
 * `"use client"` stays at THIS leaf, not the page above it (§4) -- the
 * page (`/replay/page.tsx`) is still a Server Component fetching candles;
 * only the interactive subtree below it opts into the client.
 */
export function ReplaySimulator({
  candles,
  instrumentLabel,
  timeframeLabel,
}: ReplaySimulatorProps) {
  // Resets the simulator's pending order / open position whenever the
  // candle array changes identity (a new instrument, via the page's own
  // form) -- a position tracked against SPY bars is meaningless once the
  // underlying data becomes AAPL's. Same "adjust store state during
  // render, not an effect" pattern ReplayChart already uses for its own
  // store, for the same reason (avoids ever rendering one render with a
  // mismatched cursor/position).
  const [trackedCandles, setTrackedCandles] = useState(candles);
  if (trackedCandles !== candles) {
    setTrackedCandles(candles);
    useSimulatorStore.getState().reset();
  }

  const onBarRevealed = useSimulatorStore((state) => state.onBarRevealed);

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      <ReplayChart
        candles={candles}
        instrumentLabel={instrumentLabel}
        timeframeLabel={timeframeLabel}
        onBarRevealed={onBarRevealed}
      />
      <PositionPanel />
    </div>
  );
}
