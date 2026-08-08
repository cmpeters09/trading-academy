import { create } from "zustand";

import type { Candle } from "@/types/market.types";

import {
  jumpToEnd as jumpCursorToEnd,
  jumpToStart as jumpCursorToStart,
  stepBackward as stepCursorBackward,
  stepForward as stepCursorForward,
} from "./engine/cursor";
import type { ReplayCursor } from "./engine/types";

export const DEFAULT_SPEED = 1;

type ReplayStoreState = {
  cursor: ReplayCursor;
  isPlaying: boolean;
  speed: number;
};

type ReplayStoreActions = {
  stepForward: (candles: Candle[], steps?: number) => void;
  stepBackward: (candles: Candle[], steps?: number) => void;
  jumpToStart: (candles: Candle[]) => void;
  jumpToEnd: (candles: Candle[]) => void;
  play: () => void;
  pause: () => void;
  setSpeed: (speed: number) => void;
  reset: () => void;
};

export type ReplayStore = ReplayStoreState & ReplayStoreActions;

const INITIAL_STATE: ReplayStoreState = {
  cursor: null,
  isPlaying: false,
  speed: DEFAULT_SPEED,
};

/**
 * ADR-005: Zustand owns ephemeral client state only (cursor, playing,
 * speed) — never the candle array itself, which is server state (M-3's
 * TanStack Query pattern, wired in Session 3). Every action that moves the
 * cursor takes `candles` as a PARAMETER rather than the store holding its
 * own copy, so there is exactly one source of candle data for the whole
 * feature and this store can never drift from it.
 *
 * One store per feature (this file), exported through the feature's
 * index.ts — no global app store.
 */
export const useReplayStore = create<ReplayStore>((set) => ({
  ...INITIAL_STATE,

  stepForward: (candles, steps = 1) =>
    set((state) => ({
      cursor: stepCursorForward(candles, state.cursor, steps),
    })),
  stepBackward: (candles, steps = 1) =>
    set((state) => ({
      cursor: stepCursorBackward(candles, state.cursor, steps),
    })),
  jumpToStart: (candles) => set({ cursor: jumpCursorToStart(candles) }),
  jumpToEnd: (candles) => set({ cursor: jumpCursorToEnd(candles) }),

  play: () => set({ isPlaying: true }),
  pause: () => set({ isPlaying: false }),
  setSpeed: (speed) => set({ speed }),

  reset: () => set(INITIAL_STATE),
}));
