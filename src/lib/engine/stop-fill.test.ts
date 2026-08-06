import { describe, expect, it } from "vitest";

import { fillStopOrder } from "./stop-fill";
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
const THREE_CENT_SLIPPAGE = {
  model: "fixed_amount" as const,
  value: toPriceUnits(0.03),
};

describe("fillStopOrder", () => {
  it("buy stop triggers and fills ABOVE the stop price (slippage costs the buyer) when the bar's high reaches it", () => {
    // stop = $155.00 -> 1,550,000 PriceUnits; bar high = $156.00 -> 156.00 >= 155.00, triggered
    // once triggered, a stop fills like a market order: stop price + slippage
    // slippage = $0.03 -> 300 PriceUnits; fill = 1,550,000 + 300 = 1,550,300 -> $155.03
    const order: EngineOrder = {
      side: "buy",
      type: "stop",
      stopPrice: toPriceUnits(155),
      quantity: toQuantityUnits(10),
    };
    const result = fillStopOrder(order, bar(154, 156, 153.5, 155.5), {
      slippage: THREE_CENT_SLIPPAGE,
      commission: FLAT_DOLLAR_COMMISSION,
    });

    expect(result.ok).toBe(true);
    if (!result.ok || result.status !== "filled")
      throw new Error("expected a fill");
    expect(fromPriceUnits(result.slippage)).toBe(0.03);
    expect(fromPriceUnits(result.fillPrice)).toBe(155.03);
    expect(fromMoneyUnits(result.commission)).toBe(1);
  });

  it("buy stop triggers when the bar's high touches the stop EXACTLY (inclusive boundary)", () => {
    // bar high = $155.00, exactly equal to the stop -> 155.00 >= 155.00 is true
    const order: EngineOrder = {
      side: "buy",
      type: "stop",
      stopPrice: toPriceUnits(155),
      quantity: toQuantityUnits(10),
    };
    const result = fillStopOrder(order, bar(154, 155, 153.8, 154.8), {
      slippage: THREE_CENT_SLIPPAGE,
      commission: FLAT_DOLLAR_COMMISSION,
    });

    expect(result.ok).toBe(true);
    if (!result.ok || result.status !== "filled")
      throw new Error("expected a fill");
    // Same fill math as the clear-trigger case: 1,550,000 + 300 = 1,550,300 -> $155.03
    expect(fromPriceUnits(result.fillPrice)).toBe(155.03);
  });

  it("buy stop does NOT trigger when the bar's high never reaches the stop", () => {
    // bar high = $154.50 -> 154.50 >= 155.00 is false
    const order: EngineOrder = {
      side: "buy",
      type: "stop",
      stopPrice: toPriceUnits(155),
      quantity: toQuantityUnits(10),
    };
    const result = fillStopOrder(order, bar(154, 154.5, 153.5, 154.2), {
      slippage: THREE_CENT_SLIPPAGE,
      commission: FLAT_DOLLAR_COMMISSION,
    });

    expect(result.ok).toBe(true);
    if (!result.ok)
      throw new Error("expected ok:true (unfilled is a normal outcome)");
    expect(result.status).toBe("unfilled");
    if (result.status !== "unfilled") throw new Error("expected unfilled");
    expect(result.reason).toBe("stop_not_touched");
  });

  it("sell stop triggers and fills BELOW the stop price (slippage costs the seller) when the bar's low reaches it", () => {
    // stop = $145.00 -> 1,450,000 PriceUnits; bar low = $144.50 -> 144.50 <= 145.00, triggered
    // slippage = $0.03 -> 300 PriceUnits; fill = 1,450,000 - 300 = 1,449,700 -> $144.97
    const order: EngineOrder = {
      side: "sell",
      type: "stop",
      stopPrice: toPriceUnits(145),
      quantity: toQuantityUnits(10),
    };
    const result = fillStopOrder(order, bar(146, 146.5, 144.5, 145.2), {
      slippage: THREE_CENT_SLIPPAGE,
      commission: FLAT_DOLLAR_COMMISSION,
    });

    expect(result.ok).toBe(true);
    if (!result.ok || result.status !== "filled")
      throw new Error("expected a fill");
    expect(fromPriceUnits(result.fillPrice)).toBe(144.97);
  });

  it("sell stop does NOT trigger when the bar's low never reaches the stop", () => {
    // bar low = $145.50 -> 145.50 <= 145.00 is false
    const order: EngineOrder = {
      side: "sell",
      type: "stop",
      stopPrice: toPriceUnits(145),
      quantity: toQuantityUnits(10),
    };
    const result = fillStopOrder(order, bar(146, 146.5, 145.5, 146.2), {
      slippage: THREE_CENT_SLIPPAGE,
      commission: FLAT_DOLLAR_COMMISSION,
    });

    expect(result.ok).toBe(true);
    if (!result.ok)
      throw new Error("expected ok:true (unfilled is a normal outcome)");
    expect(result.status).toBe("unfilled");
  });

  it("rejects a stop order with no stopPrice set", () => {
    const order: EngineOrder = {
      side: "buy",
      type: "stop",
      quantity: toQuantityUnits(10),
    };
    const result = fillStopOrder(order, bar(154, 156, 153.5, 155), {
      slippage: THREE_CENT_SLIPPAGE,
      commission: FLAT_DOLLAR_COMMISSION,
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected a rejection");
    expect(result.error.code).toBe("MISSING_STOP_PRICE");
  });

  it("rejects a non-stop order type", () => {
    const order: EngineOrder = {
      side: "buy",
      type: "market",
      quantity: toQuantityUnits(10),
    };
    const result = fillStopOrder(order, bar(154, 156, 153.5, 155), {
      slippage: THREE_CENT_SLIPPAGE,
      commission: FLAT_DOLLAR_COMMISSION,
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected a rejection");
    expect(result.error.code).toBe("INVALID_ORDER_TYPE");
  });

  it("rejects a zero/negative quantity", () => {
    const order: EngineOrder = {
      side: "buy",
      type: "stop",
      stopPrice: toPriceUnits(155),
      quantity: toQuantityUnits(0),
    };
    const result = fillStopOrder(order, bar(154, 156, 153.5, 155), {
      slippage: THREE_CENT_SLIPPAGE,
      commission: FLAT_DOLLAR_COMMISSION,
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected a rejection");
    expect(result.error.code).toBe("INVALID_QUANTITY");
  });
});
