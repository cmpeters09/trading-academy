import { beforeEach, describe, expect, it } from "vitest";

import { ENGINE_VERSION, type EngineBar } from "@/lib/engine/types";
import { toMoneyUnits, toPriceUnits, toQuantityUnits } from "@/lib/engine/units";

import type { OrderTicketSubmission } from "./lib/order-ticket-schema";
import { useSimulatorStore } from "./store";

function bar(overrides: Partial<EngineBar> = {}): EngineBar {
  return {
    ts: "2026-01-02T00:00:00Z",
    open: toPriceUnits(100),
    high: toPriceUnits(101),
    low: toPriceUnits(99),
    close: toPriceUnits(100),
    ...overrides,
  };
}

const MARKET_ORDER: OrderTicketSubmission = {
  direction: "long",
  orderType: "market",
  quantity: toQuantityUnits(1),
};

// Reset before every test so tests don't leak state through the shared
// singleton store (same convention as features/replay/store.test.ts).
beforeEach(() => {
  useSimulatorStore.setState({
    pendingOrder: null,
    position: null,
    lastClosedTrade: null,
    orderError: null,
  });
});

describe("useSimulatorStore -- initial state", () => {
  it("starts flat, with nothing pending and no history", () => {
    const state = useSimulatorStore.getState();
    expect(state.pendingOrder).toBeNull();
    expect(state.position).toBeNull();
    expect(state.lastClosedTrade).toBeNull();
    expect(state.orderError).toBeNull();
  });
});

describe("useSimulatorStore -- submitOrder", () => {
  it("sets pendingOrder while flat", () => {
    useSimulatorStore.getState().submitOrder(MARKET_ORDER);
    expect(useSimulatorStore.getState().pendingOrder).toEqual(MARKET_ORDER);
  });

  it("is a no-op while an order is already pending", () => {
    useSimulatorStore.getState().submitOrder(MARKET_ORDER);
    const otherOrder: OrderTicketSubmission = { ...MARKET_ORDER, quantity: toQuantityUnits(99) };
    useSimulatorStore.getState().submitOrder(otherOrder);

    expect(useSimulatorStore.getState().pendingOrder).toEqual(MARKET_ORDER);
  });

  it("is a no-op while a position is already open", () => {
    useSimulatorStore.setState({
      position: {
        direction: "long",
        entryPrice: toPriceUnits(100),
        quantity: toQuantityUnits(1),
        entryCommission: toMoneyUnits(0),
        entryEngineVersion: ENGINE_VERSION,
      },
    });

    useSimulatorStore.getState().submitOrder(MARKET_ORDER);

    expect(useSimulatorStore.getState().pendingOrder).toBeNull();
  });
});

describe("useSimulatorStore -- onBarRevealed delegates to the pure processBar", () => {
  it("a filled market order becomes an open position", () => {
    useSimulatorStore.getState().submitOrder(MARKET_ORDER);

    useSimulatorStore.getState().onBarRevealed(bar({ open: toPriceUnits(100) }));

    const state = useSimulatorStore.getState();
    expect(state.pendingOrder).toBeNull();
    expect(state.position?.direction).toBe("long");
    expect(state.position?.quantity).toBe(toQuantityUnits(1));
  });

  it("a rejected fill surfaces orderError and clears both pendingOrder and position", () => {
    useSimulatorStore.getState().submitOrder({ ...MARKET_ORDER, quantity: toQuantityUnits(0) });

    useSimulatorStore.getState().onBarRevealed(bar({}));

    const state = useSimulatorStore.getState();
    expect(state.pendingOrder).toBeNull();
    expect(state.position).toBeNull();
    expect(state.orderError?.code).toBe("INVALID_QUANTITY");
  });
});

describe("useSimulatorStore -- reset", () => {
  it("returns to the initial state after being mutated", () => {
    useSimulatorStore.getState().submitOrder(MARKET_ORDER);
    useSimulatorStore.getState().onBarRevealed(bar({ open: toPriceUnits(100) }));

    useSimulatorStore.getState().reset();

    const state = useSimulatorStore.getState();
    expect(state.pendingOrder).toBeNull();
    expect(state.position).toBeNull();
    expect(state.lastClosedTrade).toBeNull();
    expect(state.orderError).toBeNull();
  });
});
