import { describe, expect, it } from "vitest";

import { ENGINE_VERSION, type EngineBar, type EngineConfig } from "@/lib/engine/types";
import { toMoneyUnits, toPriceUnits, toQuantityUnits } from "@/lib/engine/units";

import { processBar, type SimulatorBarState } from "./process-bar";
import type { OrderTicketSubmission } from "./order-ticket-schema";
import type { OpenPosition } from "./types";

// Round, easy-to-hand-check numbers: $0.50 flat slippage magnitude, $1.00
// flat commission per fill -- not the app's real DEFAULT_ENGINE_CONFIG
// (bps-based), deliberately, so every fill price below is exact decimal
// arithmetic instead of a basis-points calculation.
const TEST_CONFIG: EngineConfig = {
  slippage: { model: "fixed_amount", value: toPriceUnits(0.5) },
  commission: { model: "flat", value: toMoneyUnits(1) },
};

function bar(overrides: Partial<EngineBar>): EngineBar {
  return {
    ts: "2026-01-02T00:00:00Z",
    open: toPriceUnits(100),
    high: toPriceUnits(101),
    low: toPriceUnits(99),
    close: toPriceUnits(100),
    ...overrides,
  };
}

const FLAT: SimulatorBarState = { pendingOrder: null, position: null };

describe("processBar -- idle (nothing pending, nothing open)", () => {
  it("does nothing", () => {
    const result = processBar(FLAT, bar({}), TEST_CONFIG);
    expect(result).toEqual({ pendingOrder: null, position: null, closedTrade: null, error: null });
  });
});

describe("processBar -- filling a pending market order", () => {
  it("long market order fills at the bar's open PLUS slippage (a buy pays more)", () => {
    const pendingOrder: OrderTicketSubmission = {
      direction: "long",
      orderType: "market",
      quantity: toQuantityUnits(10),
    };
    const revealedBar = bar({ open: toPriceUnits(100) });

    const result = processBar({ pendingOrder, position: null }, revealedBar, TEST_CONFIG);

    // fillPrice = open $100.00 + $0.50 slippage = $100.50
    expect(result.pendingOrder).toBeNull();
    expect(result.closedTrade).toBeNull();
    expect(result.error).toBeNull();
    expect(result.position).toEqual<OpenPosition>({
      direction: "long",
      entryPrice: toPriceUnits(100.5),
      quantity: toQuantityUnits(10),
      entryCommission: toMoneyUnits(1),
      entryEngineVersion: ENGINE_VERSION,
    });
  });

  it("short market order fills at the bar's open MINUS slippage, with a valid bracket carried onto the position", () => {
    const pendingOrder: OrderTicketSubmission = {
      direction: "short",
      orderType: "market",
      quantity: toQuantityUnits(4),
      plannedStopPrice: toPriceUnits(51), // above entry -- correct side for a short
      plannedTargetPrice: toPriceUnits(47), // below entry -- correct side for a short
    };
    const revealedBar = bar({ open: toPriceUnits(50) });

    const result = processBar({ pendingOrder, position: null }, revealedBar, TEST_CONFIG);

    // fillPrice = open $50.00 - $0.50 slippage = $49.50 (a sell receives less)
    expect(result.position).toEqual<OpenPosition>({
      direction: "short",
      entryPrice: toPriceUnits(49.5),
      quantity: toQuantityUnits(4),
      entryCommission: toMoneyUnits(1),
      entryEngineVersion: ENGINE_VERSION,
      plannedStopPrice: toPriceUnits(51),
      plannedTargetPrice: toPriceUnits(47),
    });
  });
});

describe("processBar -- filling a pending limit order", () => {
  it("not touched -- stays pending, unchanged", () => {
    const pendingOrder: OrderTicketSubmission = {
      direction: "long",
      orderType: "limit",
      quantity: toQuantityUnits(1),
      limitPrice: toPriceUnits(95),
    };
    // A buy limit at $95 needs the bar's LOW to reach down to $95; this
    // bar's low is $99, so it isn't touched.
    const revealedBar = bar({ low: toPriceUnits(99) });

    const result = processBar({ pendingOrder, position: null }, revealedBar, TEST_CONFIG);

    expect(result).toEqual({ pendingOrder, position: null, closedTrade: null, error: null });
  });

  it("touched -- fills at EXACTLY the limit price, no slippage", () => {
    const pendingOrder: OrderTicketSubmission = {
      direction: "long",
      orderType: "limit",
      quantity: toQuantityUnits(1),
      limitPrice: toPriceUnits(95),
    };
    const revealedBar = bar({ low: toPriceUnits(94) });

    const result = processBar({ pendingOrder, position: null }, revealedBar, TEST_CONFIG);

    expect(result.position?.entryPrice).toBe(toPriceUnits(95));
    expect(result.position?.entryCommission).toBe(toMoneyUnits(1));
  });
});

describe("processBar -- filling a pending stop (entry) order", () => {
  it("not touched -- stays pending, unchanged", () => {
    const pendingOrder: OrderTicketSubmission = {
      direction: "long",
      orderType: "stop",
      quantity: toQuantityUnits(1),
      stopPrice: toPriceUnits(110),
    };
    // A buy stop at $110 triggers on the bar's HIGH reaching $110; this
    // bar's high is $101, so it isn't touched.
    const revealedBar = bar({ high: toPriceUnits(101) });

    const result = processBar({ pendingOrder, position: null }, revealedBar, TEST_CONFIG);

    expect(result).toEqual({ pendingOrder, position: null, closedTrade: null, error: null });
  });

  it("touched -- fills like a triggered market order (stop price PLUS slippage)", () => {
    const pendingOrder: OrderTicketSubmission = {
      direction: "long",
      orderType: "stop",
      quantity: toQuantityUnits(1),
      stopPrice: toPriceUnits(110),
    };
    const revealedBar = bar({ high: toPriceUnits(111) });

    const result = processBar({ pendingOrder, position: null }, revealedBar, TEST_CONFIG);

    // fillPrice = stop $110.00 + $0.50 slippage = $110.50
    expect(result.position?.entryPrice).toBe(toPriceUnits(110.5));
  });
});

describe("processBar -- a structurally invalid order is dropped, not left pending forever", () => {
  it("zero quantity -> engine's own INVALID_QUANTITY rejection surfaces, order cleared", () => {
    const pendingOrder: OrderTicketSubmission = {
      direction: "long",
      orderType: "market",
      quantity: toQuantityUnits(0),
    };

    const result = processBar({ pendingOrder, position: null }, bar({}), TEST_CONFIG);

    expect(result).toEqual({
      pendingOrder: null,
      position: null,
      closedTrade: null,
      error: { code: "INVALID_QUANTITY", message: expect.any(String) },
    });
  });
});

describe("processBar -- a fill that would open an invalid position is rejected, not silently opened", () => {
  it("a market order's planned stop can end up on the wrong side once the REAL (slipped) fill price is known", () => {
    // orderTicketSchema only checks a market order's stop/target relative
    // to EACH OTHER (no known entry price at submit time) -- 101 < 105 is a
    // valid ORDERING, but $100.50 is where this order actually fills, and
    // $101 stop-loss is ABOVE that: invalid for a long. This is exactly the
    // gap the feature README documents.
    const pendingOrder: OrderTicketSubmission = {
      direction: "long",
      orderType: "market",
      quantity: toQuantityUnits(1),
      plannedStopPrice: toPriceUnits(101),
      plannedTargetPrice: toPriceUnits(105),
    };
    const revealedBar = bar({ open: toPriceUnits(100) }); // fills at $100.50

    const result = processBar({ pendingOrder, position: null }, revealedBar, TEST_CONFIG);

    expect(result).toEqual({
      pendingOrder: null,
      position: null,
      closedTrade: null,
      error: { code: "INVALID_STOP", message: expect.any(String) },
    });
  });
});

describe("processBar -- an open position with no complete bracket just stays open", () => {
  it("only a stop set (no target) -- untouched even on a bar that would have hit it", () => {
    const position: OpenPosition = {
      direction: "long",
      entryPrice: toPriceUnits(100),
      quantity: toQuantityUnits(1),
      entryCommission: toMoneyUnits(1),
      entryEngineVersion: ENGINE_VERSION,
      plannedStopPrice: toPriceUnits(95),
    };
    const revealedBar = bar({ low: toPriceUnits(90) }); // would touch $95 if checked

    const result = processBar({ pendingOrder: null, position }, revealedBar, TEST_CONFIG);

    expect(result).toEqual({ pendingOrder: null, position, closedTrade: null, error: null });
  });
});

describe("processBar -- bracket resolution on an open position with a complete bracket", () => {
  const OPEN_LONG: OpenPosition = {
    direction: "long",
    entryPrice: toPriceUnits(100),
    quantity: toQuantityUnits(10),
    entryCommission: toMoneyUnits(1),
    entryEngineVersion: ENGINE_VERSION,
    plannedStopPrice: toPriceUnits(95),
    plannedTargetPrice: toPriceUnits(110),
  };

  it("neither level touched -- position stays open, unchanged", () => {
    const revealedBar = bar({ high: toPriceUnits(105), low: toPriceUnits(98) });

    const result = processBar({ pendingOrder: null, position: OPEN_LONG }, revealedBar, TEST_CONFIG);

    expect(result).toEqual({ pendingOrder: null, position: OPEN_LONG, closedTrade: null, error: null });
  });

  it("target touched -- fills at EXACTLY $110 (no slippage), full close", () => {
    const revealedBar = bar({ high: toPriceUnits(112), low: toPriceUnits(104) });

    const result = processBar({ pendingOrder: null, position: OPEN_LONG }, revealedBar, TEST_CONFIG);

    // priceDelta = exit $110.00 - entry $100.00 = $10.00 x 10 sh = $100.00 gross
    // fees = $1.00 entry + $1.00 exit = $2.00
    // net = $100.00 - $2.00 = $98.00
    // risk = entry $100.00 - stop $95.00 = $5.00 x 10 sh = $50.00
    // R = $98.00 / $50.00 = 1.96
    expect(result.position).toBeNull();
    expect(result.pendingOrder).toBeNull();
    expect(result.error).toBeNull();
    expect(result.closedTrade).toEqual({
      ok: true,
      grossPnl: toMoneyUnits(100),
      fees: toMoneyUnits(2),
      netPnl: toMoneyUnits(98),
      rMultiple: 1.96,
      engineVersion: ENGINE_VERSION,
    });
  });

  it("stop touched -- fills at stop price MINUS slippage (a sell receives less), full close", () => {
    const revealedBar = bar({ high: toPriceUnits(99), low: toPriceUnits(94) });

    const result = processBar({ pendingOrder: null, position: OPEN_LONG }, revealedBar, TEST_CONFIG);

    // fillPrice = stop $95.00 - $0.50 slippage = $94.50
    // priceDelta = exit $94.50 - entry $100.00 = -$5.50 x 10 sh = -$55.00 gross
    // fees = $1.00 + $1.00 = $2.00
    // net = -$55.00 - $2.00 = -$57.00
    // risk = $100.00 - $95.00 = $5.00 x 10 sh = $50.00
    // R = -$57.00 / $50.00 = -1.14
    expect(result.closedTrade).toEqual({
      ok: true,
      grossPnl: toMoneyUnits(-55),
      fees: toMoneyUnits(2),
      netPnl: toMoneyUnits(-57),
      rMultiple: -1.14,
      engineVersion: ENGINE_VERSION,
    });
  });
});

describe("processBar -- defensive: malformed brackets/positions surface a typed error, position preserved", () => {
  it("resolveBracket's own INVALID_BRACKET (stop on the wrong side of target) is surfaced, position untouched", () => {
    const malformedPosition: OpenPosition = {
      direction: "long",
      entryPrice: toPriceUnits(100),
      quantity: toQuantityUnits(1),
      entryCommission: toMoneyUnits(1),
      entryEngineVersion: ENGINE_VERSION,
      plannedStopPrice: toPriceUnits(110), // above target -- invalid for a long
      plannedTargetPrice: toPriceUnits(105),
    };

    const result = processBar({ pendingOrder: null, position: malformedPosition }, bar({}), TEST_CONFIG);

    expect(result).toEqual({
      pendingOrder: null,
      position: malformedPosition,
      closedTrade: null,
      error: { code: "INVALID_BRACKET", message: expect.any(String) },
    });
  });

  it("fullyClosePosition's own quantity rejection is surfaced, position untouched", () => {
    const zeroQuantityPosition: OpenPosition = {
      direction: "long",
      entryPrice: toPriceUnits(100),
      quantity: toQuantityUnits(0),
      entryCommission: toMoneyUnits(0),
      entryEngineVersion: ENGINE_VERSION,
      plannedStopPrice: toPriceUnits(95),
      plannedTargetPrice: toPriceUnits(110),
    };
    const revealedBar = bar({ high: toPriceUnits(112) }); // touches target

    const result = processBar(
      { pendingOrder: null, position: zeroQuantityPosition },
      revealedBar,
      TEST_CONFIG,
    );

    expect(result).toEqual({
      pendingOrder: null,
      position: zeroQuantityPosition,
      closedTrade: null,
      error: { code: "INVALID_QUANTITY", message: expect.any(String) },
    });
  });

  it("a bubbled INVALID_STOP (stop on the wrong side of ENTRY, not of the bracket) is surfaced, position untouched", () => {
    // A valid bracket (stop $105 < target $110 -- resolveBracket accepts
    // it) but an invalid STOP relative to the $100 entry (must be BELOW
    // entry for a long) -- the exact "bubbles the engine's INVALID_STOP"
    // case Session 1's position.test.ts documents, reachable here via a
    // hand-built fixture the same way an addToPosition (TD-08) could
    // produce one for real. fullyClosePosition flattens this into its own
    // OUTER `ok: false` (position.ts) rather than an inner `closed.ok:
    // false` -- see process-bar.ts's comment on why the inner check is
    // unreachable.
    const invalidStopPosition: OpenPosition = {
      direction: "long",
      entryPrice: toPriceUnits(100),
      quantity: toQuantityUnits(1),
      entryCommission: toMoneyUnits(1),
      entryEngineVersion: ENGINE_VERSION,
      plannedStopPrice: toPriceUnits(105),
      plannedTargetPrice: toPriceUnits(110),
    };
    const revealedBar = bar({ high: toPriceUnits(112) }); // touches target

    const result = processBar(
      { pendingOrder: null, position: invalidStopPosition },
      revealedBar,
      TEST_CONFIG,
    );

    expect(result).toEqual({
      pendingOrder: null,
      position: invalidStopPosition,
      closedTrade: null,
      error: { code: "INVALID_STOP", message: expect.any(String) },
    });
  });
});

describe("processBar -- re-visiting a bar never double-fills or double-closes", () => {
  it("re-processing the SAME bar after a market order already filled is a no-op (pendingOrder already cleared)", () => {
    const pendingOrder: OrderTicketSubmission = {
      direction: "long",
      orderType: "market",
      quantity: toQuantityUnits(1),
    };
    const revealedBar = bar({ open: toPriceUnits(100) });

    const firstPass = processBar({ pendingOrder, position: null }, revealedBar, TEST_CONFIG);
    expect(firstPass.position).not.toBeNull();

    // Simulate stepping back and forward to the same bar again: the store
    // would call processBar with whatever state resulted from the first
    // pass -- pendingOrder is already null, so nothing re-fills.
    const secondPass = processBar(
      { pendingOrder: firstPass.pendingOrder, position: firstPass.position },
      revealedBar,
      TEST_CONFIG,
    );

    expect(secondPass).toEqual({
      pendingOrder: null,
      position: firstPass.position,
      closedTrade: null,
      error: null,
    });
  });
});
