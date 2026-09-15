import { beforeEach, describe, expect, it } from "vitest";

import type { Candle } from "@/types/market.types";

import { DEFAULT_SPEED, useReplayStore } from "./store";

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

// Reset (merge, not replace — replacing would wipe out the action
// functions, which live in the same state object) before every test, so
// tests don't leak state through the shared singleton store.
beforeEach(() => {
  useReplayStore.setState({
    cursor: null,
    isPlaying: false,
    speed: DEFAULT_SPEED,
  });
});

describe("useReplayStore — initial state", () => {
  it("starts with nothing revealed, paused, at 1x speed", () => {
    const state = useReplayStore.getState();
    expect(state.cursor).toBeNull();
    expect(state.isPlaying).toBe(false);
    expect(state.speed).toBe(1);
  });
});

describe("useReplayStore — cursor actions delegate to the pure engine", () => {
  it("stepForward moves the cursor from null to bar 0", () => {
    useReplayStore.getState().stepForward(FIVE_BARS, 1);
    expect(useReplayStore.getState().cursor).toEqual({
      ts: "2026-01-01T00:00:00Z",
    });
  });

  it("stepBackward from bar 0 rewinds to null", () => {
    useReplayStore.setState({ cursor: { ts: "2026-01-01T00:00:00Z" } });
    useReplayStore.getState().stepBackward(FIVE_BARS, 1);
    expect(useReplayStore.getState().cursor).toBeNull();
  });

  it("jumpToStart / jumpToEnd move to the first / last bar", () => {
    useReplayStore.getState().jumpToEnd(FIVE_BARS);
    expect(useReplayStore.getState().cursor).toEqual({
      ts: "2026-01-05T00:00:00Z",
    });

    useReplayStore.getState().jumpToStart(FIVE_BARS);
    expect(useReplayStore.getState().cursor).toEqual({
      ts: "2026-01-01T00:00:00Z",
    });
  });
});

describe("useReplayStore — playback controls", () => {
  it("play/pause toggle isPlaying", () => {
    useReplayStore.getState().play();
    expect(useReplayStore.getState().isPlaying).toBe(true);

    useReplayStore.getState().pause();
    expect(useReplayStore.getState().isPlaying).toBe(false);
  });

  it("setSpeed updates speed", () => {
    useReplayStore.getState().setSpeed(4);
    expect(useReplayStore.getState().speed).toBe(4);
  });

  it("reset returns to the initial state after being mutated", () => {
    useReplayStore.getState().jumpToEnd(FIVE_BARS);
    useReplayStore.getState().play();
    useReplayStore.getState().setSpeed(8);

    useReplayStore.getState().reset();

    const state = useReplayStore.getState();
    expect(state.cursor).toBeNull();
    expect(state.isPlaying).toBe(false);
    expect(state.speed).toBe(DEFAULT_SPEED);
  });
});
