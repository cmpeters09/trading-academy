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
  /** M-11 Session 2 -- stamped onto any trade this session closes (`ClosedTrade.instrumentId`). */
  instrumentId: string;
  /** M-11 Session 2 -- the user's `sim_account` this session trades against (`ClosedTrade.simAccountId`), resolved server-side by `/replay/page.tsx` via `getOrCreateDefaultSimAccount`. */
  simAccountId: string;
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
 * page (`/replay/page.tsx`) is still a Server Component fetching candles
 * (and, M-11 Session 2, the sim account); only the interactive subtree
 * below it opts into the client.
 */
export function ReplaySimulator({
  candles,
  instrumentLabel,
  timeframeLabel,
  instrumentId,
  simAccountId,
}: ReplaySimulatorProps) {
  // Resets the simulator's pending order / open position whenever the
  // candle array changes identity (a new instrument, via the page's own
  // form), OR whenever instrumentId/simAccountId themselves change -- a
  // position tracked against SPY bars (or stamped with SPY's instrumentId)
  // is meaningless once the underlying data becomes AAPL's. Comparing
  // against the STORE's own instrumentId/simAccountId (not a separate
  // useState mirror) means this also fires correctly on first mount, when
  // the store still has its `INITIAL_STATE` `null`s and every prop is
  // "new" -- reset(context) always runs before any bar can be revealed,
  // which is what lets onBarRevealed below treat a null context as
  // unreachable. Same "adjust store state during render, not an effect"
  // pattern ReplayChart already uses for its own store, for the same
  // reason (avoids ever rendering one render with a mismatched cursor/
  // position/context).
  const [trackedCandles, setTrackedCandles] = useState(candles);
  const storeInstrumentId = useSimulatorStore((state) => state.instrumentId);
  const storeSimAccountId = useSimulatorStore((state) => state.simAccountId);
  if (
    trackedCandles !== candles ||
    storeInstrumentId !== instrumentId ||
    storeSimAccountId !== simAccountId
  ) {
    setTrackedCandles(candles);
    useSimulatorStore.getState().reset({ instrumentId, simAccountId });
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
