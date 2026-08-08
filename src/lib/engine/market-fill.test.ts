import { describe, expect, it } from "vitest";

import { fillMarketOrder } from "./market-fill";
import type { EngineBar, EngineOrder } from "./types";
import {
  fromMoneyUnits,
  fromPriceUnits,
  toMoneyUnits,
  toPriceUnits,
  toQuantityUnits,
} from "./units";

function bar(open: number): EngineBar {
  return {
    ts: "2026-01-02T00:00:00Z",
    open: toPriceUnits(open),
    high: toPriceUnits(open),
    low: toPriceUnits(open),
    close: toPriceUnits(open),
  };
}

describe("fillMarketOrder", () => {
  it("buy, fixed-amount slippage, flat commission: fills ABOVE the open (slippage costs the buyer)", () => {
    // bar opens at $150.00 -> 1,500,000 PriceUnits
    // slippage: a flat $0.02 -> 200 PriceUnits, added because buying always
    // costs slippage, never saves it (ADR-007)
    // fill price = 1,500,000 + 200 = 1,500,200 -> $150.02
    const order: EngineOrder = {
      side: "buy",
      type: "market",
      quantity: toQuantityUnits(10),
    };
    const result = fillMarketOrder(order, bar(150), {
      slippage: { model: "fixed_amount", value: toPriceUnits(0.02) },
      commission: { model: "flat", value: toMoneyUnits(1) },
    });

    if (!result.ok) throw new Error("expected a fill");
    expect(fromPriceUnits(result.fillPrice)).toBe(150.02);
    expect(fromPriceUnits(result.slippage)).toBe(0.02);
    // flat commission is $1.00 regardless of quantity or side
    expect(fromMoneyUnits(result.commission)).toBe(1);
  });

  it("sell, fixed-amount slippage, flat commission: fills BELOW the open (slippage costs the seller)", () => {
    // Same bar and config as above, but selling -> slippage is SUBTRACTED:
    // 1,500,000 - 200 = 1,499,800 -> $149.98
    const order: EngineOrder = {
      side: "sell",
      type: "market",
      quantity: toQuantityUnits(10),
    };
    const result = fillMarketOrder(order, bar(150), {
      slippage: { model: "fixed_amount", value: toPriceUnits(0.02) },
      commission: { model: "flat", value: toMoneyUnits(1) },
    });

    if (!result.ok) throw new Error("expected a fill");
    expect(fromPriceUnits(result.fillPrice)).toBe(149.98);
    expect(fromMoneyUnits(result.commission)).toBe(1);
  });

  it("buy, bps slippage, per-unit commission: 10 bps = 0.10% of price, commission = rate x quantity", () => {
    // bar opens at $200.00 -> 2,000,000 PriceUnits
    // slippage: 10 bps of 2,000,000 = 2,000,000 * 10 / 10,000 = 2,000 PriceUnits -> $0.20
    //   (sanity check: 0.10% of $200.00 is $0.20 -- matches)
    // fill price (buy, added) = 2,000,000 + 2,000 = 2,002,000 -> $200.20
    //
    // commission: $0.005/share rate -> 50 PriceUnits, x 137 shares
    //   (137 shares -> 13,700,000,000 QuantityUnits)
    //   product = 50 * 13,700,000,000 = 685,000,000,000
    //   this divides EXACTLY by 100,000,000 (no remainder): 685,000,000,000 / 100,000,000 = 6,850
    //   -> commission = 6,850 MoneyUnits = $0.6850
    //   (sanity check: $0.005 x 137 = $0.685 -- matches)
    const order: EngineOrder = {
      side: "buy",
      type: "market",
      quantity: toQuantityUnits(137),
    };
    const result = fillMarketOrder(order, bar(200), {
      slippage: { model: "fixed_bps", bps: 10 },
      commission: { model: "per_unit", ratePerUnit: toPriceUnits(0.005) },
    });

    if (!result.ok) throw new Error("expected a fill");
    expect(fromPriceUnits(result.slippage)).toBe(0.2);
    expect(fromPriceUnits(result.fillPrice)).toBe(200.2);
    expect(fromMoneyUnits(result.commission)).toBe(0.685);
  });

  it("sell, bps slippage: same offset, subtracted instead of added", () => {
    // Same bar/config as above, but selling: 2,000,000 - 2,000 = 1,998,000 -> $199.80
    const order: EngineOrder = {
      side: "sell",
      type: "market",
      quantity: toQuantityUnits(137),
    };
    const result = fillMarketOrder(order, bar(200), {
      slippage: { model: "fixed_bps", bps: 10 },
      commission: { model: "per_unit", ratePerUnit: toPriceUnits(0.005) },
    });

    if (!result.ok) throw new Error("expected a fill");
    expect(fromPriceUnits(result.fillPrice)).toBe(199.8);
    expect(fromMoneyUnits(result.commission)).toBe(0.685);
  });

  it("rejects a zero/negative quantity as a domain error, not a thrown exception", () => {
    const order: EngineOrder = {
      side: "buy",
      type: "market",
      quantity: toQuantityUnits(0),
    };
    const result = fillMarketOrder(order, bar(150), {
      slippage: { model: "fixed_amount", value: toPriceUnits(0) },
      commission: { model: "flat", value: toMoneyUnits(1) },
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected a rejection");
    expect(result.error.code).toBe("INVALID_QUANTITY");
  });

  it("rejects a non-market order type — this function only fills market orders", () => {
    const order: EngineOrder = {
      side: "buy",
      type: "limit",
      limitPrice: toPriceUnits(150),
      quantity: toQuantityUnits(10),
    };
    const result = fillMarketOrder(order, bar(150), {
      slippage: { model: "fixed_amount", value: toPriceUnits(0) },
      commission: { model: "flat", value: toMoneyUnits(1) },
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected a rejection");
    expect(result.error.code).toBe("INVALID_ORDER_TYPE");
  });

  it("every result — success or rejection — carries the engine version", () => {
    const filled = fillMarketOrder(
      { side: "buy", type: "market", quantity: toQuantityUnits(1) },
      bar(150),
      {
        slippage: { model: "fixed_amount", value: toPriceUnits(0) },
        commission: { model: "flat", value: toMoneyUnits(0) },
      },
    );
    const rejected = fillMarketOrder(
      { side: "buy", type: "market", quantity: toQuantityUnits(0) },
      bar(150),
      {
        slippage: { model: "fixed_amount", value: toPriceUnits(0) },
        commission: { model: "flat", value: toMoneyUnits(0) },
      },
    );

    expect(filled.engineVersion).toBe("1.0.0");
    expect(rejected.engineVersion).toBe("1.0.0");
  });
});
