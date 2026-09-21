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

function state(overrides: Partial<SimulatorBarState> = {}): SimulatorBarState {
  return {
    pendingOrder: null,
    position: null,
    closeRequested: false,
    ...overrides,
  };
}

describe("processBar -- idle (nothing pending, nothing open)", () => {
  it("does nothing", () => {
    const result = processBar(state(), bar({}), TEST_CONFIG);
    expect(result).toEqual({
      pendingOrder: null,
      position: null,
      closeRequested: false,
      closedTrade: null,
      error: null,
    });
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

    const result = processBar(state({ pendingOrder }), revealedBar, TEST_CONFIG);

    // fillPrice = open $100.00 + $0.50 slippage = $100.50
    expect(result.pendingOrder).toBeNull();
    expect(result.closeRequested).toBe(false);
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

    const result = processBar(state({ pendingOrder }), revealedBar, TEST_CONFIG);

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

    const result = processBar(state({ pendingOrder }), revealedBar, TEST_CONFIG);

    expect(result).toEqual({
      pendingOrder,
      position: null,
      closeRequested: false,
      closedTrade: null,
      error: null,
    });
  });

  it("touched -- fills at EXACTLY the limit price, no slippage", () => {
    const pendingOrder: OrderTicketSubmission = {
      direction: "long",
      orderType: "limit",
      quantity: toQuantityUnits(1),
      limitPrice: toPriceUnits(95),
    };
    const revealedBar = bar({ low: toPriceUnits(94) });

    const result = processBar(state({ pendingOrder }), revealedBar, TEST_CONFIG);

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

    const result = processBar(state({ pendingOrder }), revealedBar, TEST_CONFIG);

    expect(result).toEqual({
      pendingOrder,
      position: null,
      closeRequested: false,
      closedTrade: null,
      error: null,
    });
  });

  it("touched -- fills like a triggered market order (stop price PLUS slippage)", () => {
    const pendingOrder: OrderTicketSubmission = {
      direction: "long",
      orderType: "stop",
      quantity: toQuantityUnits(1),
      stopPrice: toPriceUnits(110),
    };
    const revealedBar = bar({ high: toPriceUnits(111) });

    const result = processBar(state({ pendingOrder }), revealedBar, TEST_CONFIG);

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

    const result = processBar(state({ pendingOrder }), bar({}), TEST_CONFIG);

    expect(result).toEqual({
      pendingOrder: null,
      position: null,
      closeRequested: false,
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

    const result = processBar(state({ pendingOrder }), revealedBar, TEST_CONFIG);

    expect(result).toEqual({
      pendingOrder: null,
      position: null,
      closeRequested: false,
      closedTrade: null,
      error: { code: "INVALID_STOP", message: expect.any(String) },
    });
  });
});

describe("processBar -- a position with NEITHER stop nor target just stays open", () => {
  it("untouched no matter what the bar does -- nothing to check it against", () => {
    const position: OpenPosition = {
      direction: "long",
      entryPrice: toPriceUnits(100),
      quantity: toQuantityUnits(1),
      entryCommission: toMoneyUnits(1),
      entryEngineVersion: ENGINE_VERSION,
    };
    const revealedBar = bar({ low: toPriceUnits(50), high: toPriceUnits(200) });

    const result = processBar(state({ position }), revealedBar, TEST_CONFIG);

    expect(result).toEqual({
      pendingOrder: null,
      position,
      closeRequested: false,
      closedTrade: null,
      error: null,
    });
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

    const result = processBar(state({ position: OPEN_LONG }), revealedBar, TEST_CONFIG);

    expect(result).toEqual({
      pendingOrder: null,
      position: OPEN_LONG,
      closeRequested: false,
      closedTrade: null,
      error: null,
    });
  });

  it("target touched -- fills at EXACTLY $110 (no slippage), full close", () => {
    const revealedBar = bar({ high: toPriceUnits(112), low: toPriceUnits(104) });

    const result = processBar(state({ position: OPEN_LONG }), revealedBar, TEST_CONFIG);

    // priceDelta = exit $110.00 - entry $100.00 = $10.00 x 10 sh = $100.00 gross
    // fees = $1.00 entry + $1.00 exit = $2.00
    // net = $100.00 - $2.00 = $98.00
    // risk = entry $100.00 - stop $95.00 = $5.00 x 10 sh = $50.00
    // R = $98.00 / $50.00 = 1.96
    expect(result.position).toBeNull();
    expect(result.pendingOrder).toBeNull();
    expect(result.closeRequested).toBe(false);
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

    const result = processBar(state({ position: OPEN_LONG }), revealedBar, TEST_CONFIG);

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

describe("processBar -- TD-10: single-leg exit, stop only (no target)", () => {
  it("not touched -- stays open, unchanged", () => {
    const position: OpenPosition = {
      direction: "long",
      entryPrice: toPriceUnits(100),
      quantity: toQuantityUnits(1),
      entryCommission: toMoneyUnits(1),
      entryEngineVersion: ENGINE_VERSION,
      plannedStopPrice: toPriceUnits(95),
    };
    const revealedBar = bar({ low: toPriceUnits(99) }); // 99 > 95, not touched

    const result = processBar(state({ position }), revealedBar, TEST_CONFIG);

    expect(result).toEqual({
      pendingOrder: null,
      position,
      closeRequested: false,
      closedTrade: null,
      error: null,
    });
  });

  it("long, touched -- fills like a triggered stop order (stop price MINUS slippage), full close", () => {
    const position: OpenPosition = {
      direction: "long",
      entryPrice: toPriceUnits(50),
      quantity: toQuantityUnits(20),
      entryCommission: toMoneyUnits(1),
      entryEngineVersion: ENGINE_VERSION,
      plannedStopPrice: toPriceUnits(45),
    };
    const revealedBar = bar({ low: toPriceUnits(44) }); // touches $45

    const result = processBar(state({ position }), revealedBar, TEST_CONFIG);

    // Closing a long is a SELL -- fillStopOrder: fillPrice = stop $45.00 - $0.50 slippage = $44.50
    // priceDelta = exit $44.50 - entry $50.00 = -$5.50 x 20 sh = -$110.00 gross
    // fees = $1.00 + $1.00 = $2.00 -> net = -$112.00
    // risk = entry $50.00 - stop $45.00 = $5.00 x 20 sh = $100.00 -> R = -$112.00 / $100.00 = -1.12
    expect(result.position).toBeNull();
    expect(result.closeRequested).toBe(false);
    expect(result.closedTrade).toEqual({
      ok: true,
      grossPnl: toMoneyUnits(-110),
      fees: toMoneyUnits(2),
      netPnl: toMoneyUnits(-112),
      rMultiple: -1.12,
      engineVersion: ENGINE_VERSION,
    });
  });

  it("short, touched -- fills like a triggered stop order (stop price PLUS slippage), full close", () => {
    const position: OpenPosition = {
      direction: "short",
      entryPrice: toPriceUnits(50),
      quantity: toQuantityUnits(20),
      entryCommission: toMoneyUnits(1),
      entryEngineVersion: ENGINE_VERSION,
      plannedStopPrice: toPriceUnits(55),
    };
    const revealedBar = bar({ high: toPriceUnits(56) }); // touches $55

    const result = processBar(state({ position }), revealedBar, TEST_CONFIG);

    // Closing a short is a BUY -- fillStopOrder: fillPrice = stop $55.00 + $0.50 slippage = $55.50
    // priceDelta (short) = entry $50.00 - exit $55.50 = -$5.50 x 20 sh = -$110.00 gross
    // fees = $2.00 -> net = -$112.00
    // risk = stop $55.00 - entry $50.00 = $5.00 x 20 sh = $100.00 -> R = -1.12
    expect(result.closedTrade).toEqual({
      ok: true,
      grossPnl: toMoneyUnits(-110),
      fees: toMoneyUnits(2),
      netPnl: toMoneyUnits(-112),
      rMultiple: -1.12,
      engineVersion: ENGINE_VERSION,
    });
  });

  it("a zero-quantity position surfaces the engine's own rejection instead of a crash", () => {
    const position: OpenPosition = {
      direction: "long",
      entryPrice: toPriceUnits(100),
      quantity: toQuantityUnits(0),
      entryCommission: toMoneyUnits(0),
      entryEngineVersion: ENGINE_VERSION,
      plannedStopPrice: toPriceUnits(95),
    };
    const revealedBar = bar({ low: toPriceUnits(90) });

    const result = processBar(state({ position }), revealedBar, TEST_CONFIG);

    expect(result).toEqual({
      pendingOrder: null,
      position,
      closeRequested: false,
      closedTrade: null,
      error: { code: "INVALID_QUANTITY", message: expect.any(String) },
    });
  });
});

describe("processBar -- TD-10: single-leg exit, target only (no stop)", () => {
  it("not touched -- stays open, unchanged", () => {
    const position: OpenPosition = {
      direction: "long",
      entryPrice: toPriceUnits(100),
      quantity: toQuantityUnits(1),
      entryCommission: toMoneyUnits(1),
      entryEngineVersion: ENGINE_VERSION,
      plannedTargetPrice: toPriceUnits(110),
    };
    const revealedBar = bar({ high: toPriceUnits(105) }); // 105 < 110, not touched

    const result = processBar(state({ position }), revealedBar, TEST_CONFIG);

    expect(result).toEqual({
      pendingOrder: null,
      position,
      closeRequested: false,
      closedTrade: null,
      error: null,
    });
  });

  it("long, touched -- fills at EXACTLY the target price, no slippage; R is null (no stop to measure against)", () => {
    const position: OpenPosition = {
      direction: "long",
      entryPrice: toPriceUnits(100),
      quantity: toQuantityUnits(10),
      entryCommission: toMoneyUnits(1),
      entryEngineVersion: ENGINE_VERSION,
      plannedTargetPrice: toPriceUnits(110),
    };
    const revealedBar = bar({ high: toPriceUnits(112) }); // touches $110

    const result = processBar(state({ position }), revealedBar, TEST_CONFIG);

    // priceDelta = exit $110.00 - entry $100.00 = $10.00 x 10 sh = $100.00 gross
    // fees = $1.00 + $1.00 = $2.00 -> net = $98.00; no plannedStopPrice -> rMultiple null
    expect(result.position).toBeNull();
    expect(result.closedTrade).toEqual({
      ok: true,
      grossPnl: toMoneyUnits(100),
      fees: toMoneyUnits(2),
      netPnl: toMoneyUnits(98),
      rMultiple: null,
      engineVersion: ENGINE_VERSION,
    });
  });

  it("short, touched -- fills at EXACTLY the target price, no slippage", () => {
    const position: OpenPosition = {
      direction: "short",
      entryPrice: toPriceUnits(50),
      quantity: toQuantityUnits(20),
      entryCommission: toMoneyUnits(1),
      entryEngineVersion: ENGINE_VERSION,
      plannedTargetPrice: toPriceUnits(45),
    };
    const revealedBar = bar({ low: toPriceUnits(44) }); // touches $45

    const result = processBar(state({ position }), revealedBar, TEST_CONFIG);

    // priceDelta (short) = entry $50.00 - exit $45.00 = $5.00 x 20 sh = $100.00 gross
    // fees = $2.00 -> net = $98.00; no plannedStopPrice -> rMultiple null
    expect(result.closedTrade).toEqual({
      ok: true,
      grossPnl: toMoneyUnits(100),
      fees: toMoneyUnits(2),
      netPnl: toMoneyUnits(98),
      rMultiple: null,
      engineVersion: ENGINE_VERSION,
    });
  });

  it("a zero-quantity position surfaces the engine's own rejection instead of a crash", () => {
    const position: OpenPosition = {
      direction: "long",
      entryPrice: toPriceUnits(100),
      quantity: toQuantityUnits(0),
      entryCommission: toMoneyUnits(0),
      entryEngineVersion: ENGINE_VERSION,
      plannedTargetPrice: toPriceUnits(110),
    };
    const revealedBar = bar({ high: toPriceUnits(112) });

    const result = processBar(state({ position }), revealedBar, TEST_CONFIG);

    expect(result).toEqual({
      pendingOrder: null,
      position,
      closeRequested: false,
      closedTrade: null,
      error: { code: "INVALID_QUANTITY", message: expect.any(String) },
    });
  });
});

describe("processBar -- TD-10: manual close", () => {
  it("closes at THIS bar's open (market fill), clearing closeRequested", () => {
    const position: OpenPosition = {
      direction: "long",
      entryPrice: toPriceUnits(100),
      quantity: toQuantityUnits(10),
      entryCommission: toMoneyUnits(1),
      entryEngineVersion: ENGINE_VERSION,
      plannedStopPrice: toPriceUnits(95),
    };
    const revealedBar = bar({ open: toPriceUnits(105) });

    const result = processBar(
      state({ position, closeRequested: true }),
      revealedBar,
      TEST_CONFIG,
    );

    // Closing a long is a SELL -- fillMarketOrder: fillPrice = open $105.00 - $0.50 slippage = $104.50
    // priceDelta = exit $104.50 - entry $100.00 = $4.50 x 10 sh = $45.00 gross
    // fees = $1.00 + $1.00 = $2.00 -> net = $43.00
    // risk = entry $100.00 - stop $95.00 = $5.00 x 10 sh = $50.00 -> R = $43.00 / $50.00 = 0.86
    expect(result.position).toBeNull();
    expect(result.pendingOrder).toBeNull();
    expect(result.closeRequested).toBe(false);
    expect(result.error).toBeNull();
    expect(result.closedTrade).toEqual({
      ok: true,
      grossPnl: toMoneyUnits(45),
      fees: toMoneyUnits(2),
      netPnl: toMoneyUnits(43),
      rMultiple: 0.86,
      engineVersion: ENGINE_VERSION,
    });
  });

  it("takes PRIORITY over a complete bracket that would also trigger on the same bar", () => {
    // A bracket target at $110 that this bar's high ($112) would touch --
    // if the bracket were checked instead, it would fill at EXACTLY $110
    // with no slippage. The manual close must ignore that and use the
    // bar's OPEN via a market fill instead, proving the ordering in
    // processBar (closeRequested checked before any bracket/single-leg
    // logic).
    const position: OpenPosition = {
      direction: "long",
      entryPrice: toPriceUnits(100),
      quantity: toQuantityUnits(10),
      entryCommission: toMoneyUnits(1),
      entryEngineVersion: ENGINE_VERSION,
      plannedStopPrice: toPriceUnits(95),
      plannedTargetPrice: toPriceUnits(110),
    };
    const revealedBar = bar({ open: toPriceUnits(105), high: toPriceUnits(112), low: toPriceUnits(104) });

    const result = processBar(
      state({ position, closeRequested: true }),
      revealedBar,
      TEST_CONFIG,
    );

    // Same $104.50 market-fill math as the previous test -- NOT the
    // bracket's exact-$110 target fill.
    expect(result.closedTrade?.grossPnl).toBe(toMoneyUnits(45));
  });

  it("a zero-quantity position surfaces the engine's own rejection, closeRequested still clears", () => {
    const position: OpenPosition = {
      direction: "long",
      entryPrice: toPriceUnits(100),
      quantity: toQuantityUnits(0),
      entryCommission: toMoneyUnits(0),
      entryEngineVersion: ENGINE_VERSION,
    };
    const revealedBar = bar({ open: toPriceUnits(105) });

    const result = processBar(
      state({ position, closeRequested: true }),
      revealedBar,
      TEST_CONFIG,
    );

    expect(result).toEqual({
      pendingOrder: null,
      position,
      closeRequested: false,
      closedTrade: null,
      error: { code: "INVALID_QUANTITY", message: expect.any(String) },
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

    const result = processBar(state({ position: malformedPosition }), bar({}), TEST_CONFIG);

    expect(result).toEqual({
      pendingOrder: null,
      position: malformedPosition,
      closeRequested: false,
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
      state({ position: zeroQuantityPosition }),
      revealedBar,
      TEST_CONFIG,
    );

    expect(result).toEqual({
      pendingOrder: null,
      position: zeroQuantityPosition,
      closeRequested: false,
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
      state({ position: invalidStopPosition }),
      revealedBar,
      TEST_CONFIG,
    );

    expect(result).toEqual({
      pendingOrder: null,
      position: invalidStopPosition,
      closeRequested: false,
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

    const firstPass = processBar(state({ pendingOrder }), revealedBar, TEST_CONFIG);
    expect(firstPass.position).not.toBeNull();

    // Simulate stepping back and forward to the same bar again: the store
    // would call processBar with whatever state resulted from the first
    // pass -- pendingOrder is already null, so nothing re-fills.
    const secondPass = processBar(
      state({ pendingOrder: firstPass.pendingOrder, position: firstPass.position }),
      revealedBar,
      TEST_CONFIG,
    );

    expect(secondPass).toEqual({
      pendingOrder: null,
      position: firstPass.position,
      closeRequested: false,
      closedTrade: null,
      error: null,
    });
  });

  it("re-processing the SAME bar after a manual close already closed is a no-op (closeRequested already cleared)", () => {
    const position: OpenPosition = {
      direction: "long",
      entryPrice: toPriceUnits(100),
      quantity: toQuantityUnits(10),
      entryCommission: toMoneyUnits(1),
      entryEngineVersion: ENGINE_VERSION,
    };
    const revealedBar = bar({ open: toPriceUnits(105) });

    const firstPass = processBar(state({ position, closeRequested: true }), revealedBar, TEST_CONFIG);
    expect(firstPass.position).toBeNull();
    expect(firstPass.closedTrade).not.toBeNull();

    // Step back and forward again: closeRequested is already false, and
    // there's no position left to close -- nothing happens twice.
    const secondPass = processBar(
      state({ position: firstPass.position, closeRequested: firstPass.closeRequested }),
      revealedBar,
      TEST_CONFIG,
    );

    expect(secondPass).toEqual({
      pendingOrder: null,
      position: null,
      closeRequested: false,
      closedTrade: null,
      error: null,
    });
  });
});
