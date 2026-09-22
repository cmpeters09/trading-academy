import { describe, expect, it } from "vitest";

import { ENGINE_VERSION } from "@/lib/engine/types";
import {
  toMoneyUnits,
  toPriceUnits,
  toQuantityUnits,
} from "@/lib/engine/units";

import { computeUnrealizedPnl } from "./unrealized-pnl";
import type { OpenPosition } from "./types";

describe("computeUnrealizedPnl", () => {
  it("long, in profit, valid stop -> R = 1.0 exactly", () => {
    // Long 10 sh @ $100.00, stop $95.00, marked at $105.00.
    // priceDelta = $105.00 - $100.00 = $5.00 -> grossPnl = $5.00 x 10 = $50.00
    // risk = $100.00 - $95.00 = $5.00 -> plannedRisk = $5.00 x 10 = $50.00
    // R = $50.00 / $50.00 = 1.0
    const position: OpenPosition = {
      direction: "long",
      entryPrice: toPriceUnits(100),
      quantity: toQuantityUnits(10),
      entryCommission: toMoneyUnits(1),
      entryEngineVersion: ENGINE_VERSION,
      entryTs: "2026-01-01T00:00:00Z",
      plannedStopPrice: toPriceUnits(95),
    };

    const result = computeUnrealizedPnl(position, toPriceUnits(105));

    expect(result.grossPnl).toBe(toMoneyUnits(50));
    expect(result.rMultiple).toBe(1.0);
  });

  it("long, in loss -> negative gross PnL and negative R", () => {
    // Marked at $97.00: priceDelta = $97.00 - $100.00 = -$3.00 -> grossPnl = -$30.00
    // risk (same position as above) = $50.00 -> R = -$30.00 / $50.00 = -0.6
    const position: OpenPosition = {
      direction: "long",
      entryPrice: toPriceUnits(100),
      quantity: toQuantityUnits(10),
      entryCommission: toMoneyUnits(1),
      entryEngineVersion: ENGINE_VERSION,
      entryTs: "2026-01-01T00:00:00Z",
      plannedStopPrice: toPriceUnits(95),
    };

    const result = computeUnrealizedPnl(position, toPriceUnits(97));

    expect(result.grossPnl).toBe(toMoneyUnits(-30));
    expect(result.rMultiple).toBe(-0.6);
  });

  it("short, in profit -> R = 1.5", () => {
    // Short 20 sh @ $50.00, stop $52.00 (above entry -- correct for a
    // short), marked at $47.00.
    // priceDelta (short) = entry - current = $50.00 - $47.00 = $3.00 -> grossPnl = $3.00 x 20 = $60.00
    // risk (short) = stop - entry = $52.00 - $50.00 = $2.00 -> plannedRisk = $2.00 x 20 = $40.00
    // R = $60.00 / $40.00 = 1.5
    const position: OpenPosition = {
      direction: "short",
      entryPrice: toPriceUnits(50),
      quantity: toQuantityUnits(20),
      entryCommission: toMoneyUnits(1),
      entryEngineVersion: ENGINE_VERSION,
      entryTs: "2026-01-01T00:00:00Z",
      plannedStopPrice: toPriceUnits(52),
    };

    const result = computeUnrealizedPnl(position, toPriceUnits(47));

    expect(result.grossPnl).toBe(toMoneyUnits(60));
    expect(result.rMultiple).toBe(1.5);
  });

  it("no planned stop -> rMultiple is null, gross PnL still computed", () => {
    // 5 sh @ $100.00, marked at $110.00 -> grossPnl = $10.00 x 5 = $50.00
    const position: OpenPosition = {
      direction: "long",
      entryPrice: toPriceUnits(100),
      quantity: toQuantityUnits(5),
      entryCommission: toMoneyUnits(1),
      entryEngineVersion: ENGINE_VERSION,
      entryTs: "2026-01-01T00:00:00Z",
    };

    const result = computeUnrealizedPnl(position, toPriceUnits(110));

    expect(result.grossPnl).toBe(toMoneyUnits(50));
    expect(result.rMultiple).toBeNull();
  });

  it("a planned stop on the WRONG side of entry (defensive, TD-08 paid) -> rMultiple null, not a bad ratio", () => {
    // Long, stop $105.00 is ABOVE the $100.00 entry -- invalid for a long.
    // No longer reachable through normal use (openPosition/addToPosition
    // both reject this now), but this is display math, not a validator,
    // so it must stay honest (null) for whatever position it's handed
    // rather than divide by a non-positive "risk."
    const position: OpenPosition = {
      direction: "long",
      entryPrice: toPriceUnits(100),
      quantity: toQuantityUnits(10),
      entryCommission: toMoneyUnits(1),
      entryEngineVersion: ENGINE_VERSION,
      entryTs: "2026-01-01T00:00:00Z",
      plannedStopPrice: toPriceUnits(105),
    };

    const result = computeUnrealizedPnl(position, toPriceUnits(102));

    // priceDelta = $102.00 - $100.00 = $2.00 -> grossPnl = $2.00 x 10 = $20.00
    expect(result.grossPnl).toBe(toMoneyUnits(20));
    expect(result.rMultiple).toBeNull();
  });

  it("marked at exactly the entry price -> zero gross PnL, R = 0", () => {
    const position: OpenPosition = {
      direction: "long",
      entryPrice: toPriceUnits(100),
      quantity: toQuantityUnits(10),
      entryCommission: toMoneyUnits(1),
      entryEngineVersion: ENGINE_VERSION,
      entryTs: "2026-01-01T00:00:00Z",
      plannedStopPrice: toPriceUnits(95),
    };

    const result = computeUnrealizedPnl(position, toPriceUnits(100));

    expect(result.grossPnl).toBe(toMoneyUnits(0));
    expect(result.rMultiple).toBe(0);
  });
});
