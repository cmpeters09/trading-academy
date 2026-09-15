"use client";

import { useEffect } from "react";

import type { Candle } from "@/types/market.types";

import { isAtEnd } from "../engine/cursor";
import { useReplayStore } from "../store";

/** 1 bar per second at 1x. 2x = 500ms/bar, 4x = 250ms/bar, etc. */
const BASE_INTERVAL_MS = 1000;

export function intervalForSpeed(speed: number): number {
  return BASE_INTERVAL_MS / speed;
}

/**
 * The one legitimate place a timer exists in the replay feature (§18: the
 * pure engine in engine/cursor.ts never reads a clock — this is the side
 * effect that paces it). Exported separately from the hook so it's
 * unit-testable with fake timers directly against the Zustand store, with
 * no React rendering involved: Zustand stores work outside React via
 * getState()/setState(), which is exactly what this function does.
 *
 * Reads the cursor via useReplayStore.getState() inside the interval
 * callback, never from a captured variable — the effect that owns this
 * interval must NOT depend on `cursor` (it would tear the interval down
 * and recreate it on every single tick, defeating a steady pace), so any
 * cursor value closed over at setup time would be stale by the time the
 * interval fires later. getState() always reads the current value.
 */
export function startPlaybackTicker(
  candles: Candle[],
  speed: number,
): () => void {
  const intervalId = setInterval(() => {
    const { stepForward, pause } = useReplayStore.getState();
    stepForward(candles, 1);
    if (isAtEnd(candles, useReplayStore.getState().cursor)) {
      pause();
    }
  }, intervalForSpeed(speed));

  return () => clearInterval(intervalId);
}

/**
 * Drives playback: while `isPlaying`, steps the cursor forward once per
 * tick at the configured `speed`, and pauses automatically on reaching the
 * last bar. `candles` is passed in, not read from the store (ADR-005 —
 * candle data is server state, fetched by whatever composes this hook).
 */
export function useReplayPlayback(candles: Candle[]): void {
  const isPlaying = useReplayStore((state) => state.isPlaying);
  const speed = useReplayStore((state) => state.speed);

  useEffect(() => {
    if (!isPlaying || candles.length === 0) return;
    return startPlaybackTicker(candles, speed);
  }, [isPlaying, speed, candles]);
}
