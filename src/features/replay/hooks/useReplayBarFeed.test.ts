import { describe, expect, it } from "vitest";

import type { Candle } from "@/types/market.types";

import { candleToEngineBar } from "./useReplayBarFeed";

describe("candleToEngineBar", () => {
  it("converts decimal OHLC to integer PriceUnits (ADR-014: price × 10,000)", () => {
    const candle: Candle = {
      ts: "2026-01-01T00:00:00Z",
      open: 150.1,
      high: 151.25,
      low: 149.8,
      close: 150.75,
      volume: 12345,
    };

    // 150.10 * 10,000 = 1,501,000 · 151.25 * 10,000 = 1,512,500
    // 149.80 * 10,000 = 1,498,000 · 150.75 * 10,000 = 1,507,500
    expect(candleToEngineBar(candle)).toEqual({
      ts: "2026-01-01T00:00:00Z",
      open: 1_501_000,
      high: 1_512_500,
      low: 1_498_000,
      close: 1_507_500,
    });
  });

  it("drops volume — EngineBar has no volume field, fills don't need it", () => {
    const candle: Candle = {
      ts: "2026-01-02T00:00:00Z",
      open: 100,
      high: 100,
      low: 100,
      close: 100,
      volume: 999_999,
    };

    expect(candleToEngineBar(candle)).not.toHaveProperty("volume");
  });
});
