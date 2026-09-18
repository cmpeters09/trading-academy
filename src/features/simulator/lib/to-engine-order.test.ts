import { describe, expect, it } from "vitest";

import { toPriceUnits, toQuantityUnits } from "@/lib/engine/units";

import type { OrderTicketSubmission } from "./order-ticket-schema";
import { toEngineOrder } from "./to-engine-order";

describe("toEngineOrder", () => {
  it("long -> buy, market order -> no limitPrice/stopPrice keys", () => {
    const order: OrderTicketSubmission = {
      direction: "long",
      orderType: "market",
      quantity: toQuantityUnits(100),
    };

    expect(toEngineOrder(order)).toEqual({
      side: "buy",
      type: "market",
      quantity: toQuantityUnits(100),
    });
  });

  it("short -> sell, limit order -> limitPrice carried, stopPrice absent", () => {
    const order: OrderTicketSubmission = {
      direction: "short",
      orderType: "limit",
      quantity: toQuantityUnits(10),
      limitPrice: toPriceUnits(150),
    };

    const result = toEngineOrder(order);
    expect(result).toEqual({
      side: "sell",
      type: "limit",
      quantity: toQuantityUnits(10),
      limitPrice: toPriceUnits(150),
    });
    expect("stopPrice" in result).toBe(false);
  });

  it("stop order -> stopPrice carried (the entry trigger, not a planned exit)", () => {
    const order: OrderTicketSubmission = {
      direction: "long",
      orderType: "stop",
      quantity: toQuantityUnits(5),
      stopPrice: toPriceUnits(200),
      plannedStopPrice: toPriceUnits(195),
      plannedTargetPrice: toPriceUnits(210),
    };

    const result = toEngineOrder(order);
    // plannedStopPrice/plannedTargetPrice are position-management concepts
    // (Session 1's OpenPosition), not part of an EngineOrder at all -- they
    // must NOT leak into the entry order.
    expect(result).toEqual({
      side: "buy",
      type: "stop",
      quantity: toQuantityUnits(5),
      stopPrice: toPriceUnits(200),
    });
  });
});
