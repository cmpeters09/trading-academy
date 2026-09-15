import { describe, expect, it } from "vitest";

import type { Candle } from "@/types/market.types";

import {
  findIndexForTimestamp,
  getCurrentBar,
  getRevealedCandles,
  isAtEnd,
  isAtStart,
  jumpToEnd,
  jumpToStart,
  stepBackward,
  stepForward,
} from "./cursor";

// 5 bars, indices 0-4, one per day. Trivial OHLCV -- these tests are about
// cursor/index logic, not price math.
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

const FIVE_BARS = bars(5); // indices 0..4, timestamps Jan 1 .. Jan 5

describe("findIndexForTimestamp", () => {
  it("finds the first, middle, and last bar by exact timestamp", () => {
    expect(findIndexForTimestamp(FIVE_BARS, "2026-01-01T00:00:00Z")).toBe(0);
    expect(findIndexForTimestamp(FIVE_BARS, "2026-01-03T00:00:00Z")).toBe(2);
    expect(findIndexForTimestamp(FIVE_BARS, "2026-01-05T00:00:00Z")).toBe(4);
  });

  it("returns -1 for a timestamp that isn't in the array", () => {
    expect(findIndexForTimestamp(FIVE_BARS, "2026-06-15T00:00:00Z")).toBe(-1);
    expect(findIndexForTimestamp([], "2026-01-01T00:00:00Z")).toBe(-1);
  });
});

describe("jumpToStart / jumpToEnd", () => {
  it("jumpToStart reveals bar 0 (Jan 1), jumpToEnd reveals bar 4 (Jan 5)", () => {
    expect(jumpToStart(FIVE_BARS)).toEqual({ ts: "2026-01-01T00:00:00Z" });
    expect(jumpToEnd(FIVE_BARS)).toEqual({ ts: "2026-01-05T00:00:00Z" });
  });

  it("both return null on an empty candle array — nothing to jump to", () => {
    expect(jumpToStart([])).toBeNull();
    expect(jumpToEnd([])).toBeNull();
  });
});

describe("stepForward", () => {
  it("from null (nothing revealed), one step reveals bar 0", () => {
    expect(stepForward(FIVE_BARS, null)).toEqual({
      ts: "2026-01-01T00:00:00Z",
    });
  });

  it("from bar 1 (Jan 2), stepping forward 2 lands on bar 3 (Jan 4) — index 1 + 2 = 3", () => {
    const cursor = { ts: "2026-01-02T00:00:00Z" }; // index 1
    expect(stepForward(FIVE_BARS, cursor, 2)).toEqual({
      ts: "2026-01-04T00:00:00Z",
    }); // index 3
  });

  it("clamps at the last bar — cannot reveal a bar that doesn't exist yet", () => {
    const cursor = { ts: "2026-01-04T00:00:00Z" }; // index 3, only 1 bar left (index 4)
    // Asking for 10 more steps still lands on index 4 (Jan 5), not "index 13"
    expect(stepForward(FIVE_BARS, cursor, 10)).toEqual({
      ts: "2026-01-05T00:00:00Z",
    });
  });
});

describe("stepBackward", () => {
  it("from bar 3 (Jan 4), stepping back 2 lands on bar 1 (Jan 2) — index 3 - 2 = 1", () => {
    const cursor = { ts: "2026-01-04T00:00:00Z" }; // index 3
    expect(stepBackward(FIVE_BARS, cursor, 2)).toEqual({
      ts: "2026-01-02T00:00:00Z",
    }); // index 1
  });

  it("from bar 0, stepping back rewinds to null — before the beginning", () => {
    const cursor = { ts: "2026-01-01T00:00:00Z" }; // index 0
    expect(stepBackward(FIVE_BARS, cursor, 1)).toBeNull();
  });

  it("stepping back further than the array is long still lands on null, not a negative index", () => {
    const cursor = { ts: "2026-01-03T00:00:00Z" }; // index 2
    expect(stepBackward(FIVE_BARS, cursor, 10)).toBeNull();
  });

  it("from null, stepping backward stays null — nowhere earlier than nothing revealed", () => {
    expect(stepBackward(FIVE_BARS, null, 1)).toBeNull();
  });
});

describe("getRevealedCandles — the hide-the-future guarantee", () => {
  it("with cursor at bar 2 (Jan 3), reveals exactly bars 0-2 (3 bars) — never bars 3 or 4", () => {
    const cursor = { ts: "2026-01-03T00:00:00Z" }; // index 2
    const revealed = getRevealedCandles(FIVE_BARS, cursor);

    expect(revealed).toHaveLength(3);
    expect(revealed.map((c) => c.ts)).toEqual([
      "2026-01-01T00:00:00Z",
      "2026-01-02T00:00:00Z",
      "2026-01-03T00:00:00Z",
    ]);
  });

  it("with cursor null, reveals nothing — an empty array, not the full dataset", () => {
    expect(getRevealedCandles(FIVE_BARS, null)).toEqual([]);
  });

  it("at the last bar, reveals the entire array", () => {
    const cursor = jumpToEnd(FIVE_BARS);
    expect(getRevealedCandles(FIVE_BARS, cursor)).toHaveLength(5);
  });
});

describe("getCurrentBar", () => {
  it("returns the single bar at the cursor", () => {
    const cursor = { ts: "2026-01-03T00:00:00Z" };
    expect(getCurrentBar(FIVE_BARS, cursor)?.ts).toBe("2026-01-03T00:00:00Z");
  });

  it("returns null when nothing is revealed yet", () => {
    expect(getCurrentBar(FIVE_BARS, null)).toBeNull();
  });
});

describe("isAtStart / isAtEnd", () => {
  it("isAtStart is true at null and at bar 0, false everywhere else", () => {
    expect(isAtStart(FIVE_BARS, null)).toBe(true);
    expect(isAtStart(FIVE_BARS, { ts: "2026-01-01T00:00:00Z" })).toBe(true);
    expect(isAtStart(FIVE_BARS, { ts: "2026-01-02T00:00:00Z" })).toBe(false);
  });

  it("isAtEnd is true at the last bar, false at null or any earlier bar", () => {
    expect(isAtEnd(FIVE_BARS, { ts: "2026-01-05T00:00:00Z" })).toBe(true);
    expect(isAtEnd(FIVE_BARS, { ts: "2026-01-04T00:00:00Z" })).toBe(false);
    expect(isAtEnd(FIVE_BARS, null)).toBe(false);
  });

  it("isAtEnd is trivially true on an empty candle array", () => {
    expect(isAtEnd([], null)).toBe(true);
  });
});

describe("broken invariant: a cursor timestamp that doesn't match the given candles", () => {
  it("throws rather than silently returning a wrong bar (§7 class 3 — programmer error)", () => {
    const cursorFromADifferentDataset = { ts: "1999-12-31T00:00:00Z" };
    expect(() =>
      getRevealedCandles(FIVE_BARS, cursorFromADifferentDataset),
    ).toThrow(/was not found/);
  });
});
