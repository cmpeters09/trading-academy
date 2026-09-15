import { useEffect, useRef } from "react";

import type { EngineBar } from "@/lib/engine/types";
import { toPriceUnits } from "@/lib/engine/units";
import type { Candle } from "@/types/market.types";

import { getCurrentBar } from "../engine/cursor";
import { useReplayStore } from "../store";

/**
 * The one place a revealed `Candle` (decimal OHLC) becomes an `EngineBar`
 * (integer PriceUnits, ADR-014) — the boundary conversion `/lib/engine`'s
 * own docs require happen in exactly one place per direction.
 */
export function candleToEngineBar(candle: Candle): EngineBar {
  return {
    ts: candle.ts,
    open: toPriceUnits(candle.open),
    high: toPriceUnits(candle.high),
    low: toPriceUnits(candle.low),
    close: toPriceUnits(candle.close),
  };
}

/**
 * The wiring point for handing bars to `/lib/engine` as replay advances —
 * not full order logic (that's M-9), just the mechanism M-9 will plug into:
 * every time the cursor settles on a new bar, `onBarRevealed` is called
 * once with that bar converted to `EngineBar`. Fires on ANY cursor change
 * (step forward, step back, jump, or a playback tick) — it does not try to
 * distinguish "genuinely new" from "revisited by stepping back," since
 * there is no order/position state yet to make that distinction meaningful.
 * Whoever builds the M-9 consumer decides how re-visited bars should behave
 * (e.g. an already-filled order shouldn't fill twice); this hook only
 * guarantees the callback sees the right bar for the current cursor.
 *
 * `useEffect` here is unavoidable (§17): this synchronizes with something
 * outside React — a caller-supplied callback into non-React engine state.
 */
export function useReplayBarFeed(
  candles: Candle[],
  onBarRevealed?: (bar: EngineBar) => void,
): void {
  const cursor = useReplayStore((state) => state.cursor);
  const lastNotifiedTs = useRef<string | null>(null);

  useEffect(() => {
    if (!onBarRevealed || cursor === null) return;
    if (cursor.ts === lastNotifiedTs.current) return;

    lastNotifiedTs.current = cursor.ts;
    const bar = getCurrentBar(candles, cursor);
    if (bar) onBarRevealed(candleToEngineBar(bar));
  }, [cursor, candles, onBarRevealed]);
}
