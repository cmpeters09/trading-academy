import { describe, expect, it } from "vitest";

import { fillLimitOrder } from "./limit-fill";
import type { EngineBar, EngineOrder } from "./types";
import {
  fromMoneyUnits,
  fromPriceUnits,
  toMoneyUnits,
  toPriceUnits,
  toQuantityUnits,
} from "./units";

function bar(
  open: number,
  high: number,
  low: number,
  close: number,
): EngineBar {
  return {
    ts: "2026-01-02T00:00:00Z",
    open: toPriceUnits(open),
    high: toPriceUnits(high),
    low: toPriceUnits(low),
    close: toPriceUnits(close),
  };
}

const FLAT_DOLLAR_COMMISSION = {
  model: "flat" as const,
  value: toMoneyUnits(1),
};

describe("fillLimitOrder", () => {
  it("buy limit fills at the limit price when the bar's low reaches down to it", () => {
    // limit = $149.00 -> 1,490,000 PriceUnits
    // bar low = $148.50 -> 148.50 <= 149.00, so the bar's range touched the limit
    const order: EngineOrder = {
      side: "buy",
      type: "limit",
      limitPrice: toPriceUnits(149),
      quantity: toQuantityUnits(10),
    };
    const result = fillLimitOrder(order, bar(150, 150.5, 148.5, 149.2), {
      slippage: { model: "fixed_amount", value: toPriceUnits(0) },
      commission: FLAT_DOLLAR_COMMISSION,
    });

    expect(result.ok).toBe(true);
    if (!result.ok || result.status !== "filled")
      throw new Error("expected a fill");
    // Fills AT the limit price exactly, never better -- not the bar's low.
    expect(fromPriceUnits(result.fillPrice)).toBe(149);
    expect(fromMoneyUnits(result.commission)).toBe(1);
  });

  it("buy limit fills when the bar's low touches the limit EXACTLY (inclusive boundary)", () => {
    // bar low = $149.00, exactly equal to the limit -> 149.00 <= 149.00 is true
    const order: EngineOrder = {
      side: "buy",
      type: "limit",
      limitPrice: toPriceUnits(149),
      quantity: toQuantityUnits(10),
    };
    const result = fillLimitOrder(order, bar(150, 150.5, 149, 149.5), {
      slippage: { model: "fixed_amount", value: toPriceUnits(0) },
      commission: FLAT_DOLLAR_COMMISSION,
    });

    expect(result.ok).toBe(true);
    if (!result.ok || result.status !== "filled")
      throw new Error("expected a fill");
    expect(fromPriceUnits(result.fillPrice)).toBe(149);
  });

  it("buy limit does NOT fill when the bar's low never reaches the limit", () => {
    // bar low = $149.50 -> 149.50 <= 149.00 is false, the price never came down far enough
    const order: EngineOrder = {
      side: "buy",
      type: "limit",
      limitPrice: toPriceUnits(149),
      quantity: toQuantityUnits(10),
    };
    const result = fillLimitOrder(order, bar(150, 151, 149.5, 150.2), {
      slippage: { model: "fixed_amount", value: toPriceUnits(0) },
      commission: FLAT_DOLLAR_COMMISSION,
    });

    expect(result.ok).toBe(true);
    if (!result.ok)
      throw new Error("expected ok:true (unfilled is a normal outcome)");
    expect(result.status).toBe("unfilled");
    if (result.status !== "unfilled") throw new Error("expected unfilled");
    expect(result.reason).toBe("limit_not_touched");
  });

  it("sell limit fills at the limit price when the bar's high reaches up to it", () => {
    // limit = $151.00 -> bar high = $151.50 -> 151.50 >= 151.00, touched
    const order: EngineOrder = {
      side: "sell",
      type: "limit",
      limitPrice: toPriceUnits(151),
      quantity: toQuantityUnits(10),
    };
    const result = fillLimitOrder(order, bar(150, 151.5, 149.5, 150.8), {
      slippage: { model: "fixed_amount", value: toPriceUnits(0) },
      commission: FLAT_DOLLAR_COMMISSION,
    });

    expect(result.ok).toBe(true);
    if (!result.ok || result.status !== "filled")
      throw new Error("expected a fill");
    expect(fromPriceUnits(result.fillPrice)).toBe(151);
  });

  it("sell limit does NOT fill when the bar's high never reaches the limit", () => {
    // bar high = $150.80 -> 150.80 >= 151.00 is false
    const order: EngineOrder = {
      side: "sell",
      type: "limit",
      limitPrice: toPriceUnits(151),
      quantity: toQuantityUnits(10),
    };
    const result = fillLimitOrder(order, bar(150, 150.8, 149.5, 150.3), {
      slippage: { model: "fixed_amount", value: toPriceUnits(0) },
      commission: FLAT_DOLLAR_COMMISSION,
    });

    expect(result.ok).toBe(true);
    if (!result.ok)
      throw new Error("expected ok:true (unfilled is a normal outcome)");
    expect(result.status).toBe("unfilled");
  });

  it("rejects a limit order with no limitPrice set", () => {
    const order: EngineOrder = {
      side: "buy",
      type: "limit",
      quantity: toQuantityUnits(10),
    };
    const result = fillLimitOrder(order, bar(150, 151, 149, 150), {
      slippage: { model: "fixed_amount", value: toPriceUnits(0) },
      commission: FLAT_DOLLAR_COMMISSION,
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected a rejection");
    expect(result.error.code).toBe("MISSING_LIMIT_PRICE");
  });

  it("rejects a non-limit order type", () => {
    const order: EngineOrder = {
      side: "buy",
      type: "market",
      quantity: toQuantityUnits(10),
    };
    const result = fillLimitOrder(order, bar(150, 151, 149, 150), {
      slippage: { model: "fixed_amount", value: toPriceUnits(0) },
      commission: FLAT_DOLLAR_COMMISSION,
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected a rejection");
    expect(result.error.code).toBe("INVALID_ORDER_TYPE");
  });

  it("rejects a zero/negative quantity", () => {
    const order: EngineOrder = {
      side: "buy",
      type: "limit",
      limitPrice: toPriceUnits(149),
      quantity: toQuantityUnits(0),
    };
    const result = fillLimitOrder(order, bar(150, 151, 149, 150), {
      slippage: { model: "fixed_amount", value: toPriceUnits(0) },
      commission: FLAT_DOLLAR_COMMISSION,
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected a rejection");
    expect(result.error.code).toBe("INVALID_QUANTITY");
  });
});
