import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Candle } from "@/types/market.types";

import { useReplayStore } from "../store";
import { intervalForSpeed, startPlaybackTicker } from "./useReplayPlayback";

function bars(count: number): Candle[] {
  return Array.from({ length: count }, (_, i) => ({
    ts: `2026-01-0${i + 1}T00:00:00Z`,
    open: 100 + i,
    high: 100 + i,
    low: 100 + i,
    close: 100 + i,
    volume: 1000,
  }));
}

const FIVE_BARS = bars(5);

// Fake timers make setInterval controllable and instant: vi.advanceTimersByTime
// simulates time passing without any real waiting, so these tests are both
// fast and deterministic (§18's "reproducible, nothing hidden" rule applied
// to a test that legitimately involves timing).
beforeEach(() => {
  useReplayStore.setState({ cursor: null, isPlaying: false, speed: 1 });
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("intervalForSpeed", () => {
  it("1x = 1000ms/bar, 2x = 500ms/bar, 4x = 250ms/bar", () => {
    expect(intervalForSpeed(1)).toBe(1000);
    expect(intervalForSpeed(2)).toBe(500);
    expect(intervalForSpeed(4)).toBe(250);
  });
});

describe("startPlaybackTicker", () => {
  it("steps the cursor forward once per interval tick, at the configured speed", () => {
    const stop = startPlaybackTicker(FIVE_BARS, 1); // 1000ms/bar

    expect(useReplayStore.getState().cursor).toBeNull(); // no time has passed yet

    vi.advanceTimersByTime(1000); // one tick
    expect(useReplayStore.getState().cursor).toEqual({
      ts: "2026-01-01T00:00:00Z",
    });

    vi.advanceTimersByTime(1000); // a second tick
    expect(useReplayStore.getState().cursor).toEqual({
      ts: "2026-01-02T00:00:00Z",
    });

    stop();
  });

  it("advancing several intervals' worth of time at once fires that many ticks", () => {
    const stop = startPlaybackTicker(FIVE_BARS, 1);

    vi.advanceTimersByTime(3000); // 3 whole ticks in one jump
    expect(useReplayStore.getState().cursor).toEqual({
      ts: "2026-01-03T00:00:00Z",
    }); // 3rd bar revealed

    stop();
  });

  it("plays faster at higher speed — 4x reaches the same bar in a quarter of the time", () => {
    const stop = startPlaybackTicker(FIVE_BARS, 4); // 250ms/bar

    vi.advanceTimersByTime(750); // 3 ticks at 250ms each
    expect(useReplayStore.getState().cursor).toEqual({
      ts: "2026-01-03T00:00:00Z",
    });

    stop();
  });

  it("auto-pauses once the last bar is revealed, via the store's isPlaying flag", () => {
    useReplayStore.getState().play();
    const stop = startPlaybackTicker(FIVE_BARS, 1);

    vi.advanceTimersByTime(5000); // exactly 5 ticks: bar 0 through bar 4 (the last bar)
    expect(useReplayStore.getState().cursor).toEqual({
      ts: "2026-01-05T00:00:00Z",
    });
    expect(useReplayStore.getState().isPlaying).toBe(false);

    // Note: the ticker itself does NOT clear its own interval on auto-pause
    // — it only flips isPlaying in the store. In the real hook, THAT flag
    // change is what the useEffect's dependency array reacts to, tearing
    // the interval down. Calling stepForward again past the end is a
    // harmless no-op (cursor.ts clamps at the last candle), which is why
    // this stays safe even before the hook's effect gets a chance to stop it:
    vi.advanceTimersByTime(1000);
    expect(useReplayStore.getState().cursor).toEqual({
      ts: "2026-01-05T00:00:00Z",
    }); // unchanged, clamped

    stop();
  });

  it("stopping the ticker (the returned cleanup) clears the interval — no further ticks", () => {
    const stop = startPlaybackTicker(FIVE_BARS, 1);
    vi.advanceTimersByTime(1000);
    expect(useReplayStore.getState().cursor).toEqual({
      ts: "2026-01-01T00:00:00Z",
    });

    stop();

    vi.advanceTimersByTime(5000); // would reveal several more bars if still running
    expect(useReplayStore.getState().cursor).toEqual({
      ts: "2026-01-01T00:00:00Z",
    }); // unchanged
  });
});
