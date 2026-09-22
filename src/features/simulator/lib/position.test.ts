import { describe, expect, it } from "vitest";

import { ENGINE_VERSION } from "@/lib/engine/types";
import {
  fromMoneyUnits,
  fromPriceUnits,
  toMoneyUnits,
  toPriceUnits,
  toQuantityUnits,
} from "@/lib/engine/units";

import {
  addToPosition,
  fullyClosePosition,
  openPosition,
  partiallyClosePosition,
} from "./position";
import type { OpenPosition, PositionFill } from "./types";

// Exact value is arbitrary -- these tests care about entryTs being CARRIED
// correctly (openPosition -> addToPosition -> the closed-trade shape in
// process-bar.test.ts), not about a specific market timestamp.
const TEST_ENTRY_TS = "2026-01-01T00:00:00Z";

describe("openPosition", () => {
  it("long, 100 sh @ $150.00, $1.00 commission, stop $149.00, target $154.00", () => {
    const fill: PositionFill = {
      fillPrice: toPriceUnits(150),
      quantity: toQuantityUnits(100),
      commission: toMoneyUnits(1),
    };
    const result = openPosition({
      direction: "long",
      fill,
      engineVersion: ENGINE_VERSION,
      entryTs: TEST_ENTRY_TS,
      plannedStopPrice: toPriceUnits(149),
      plannedTargetPrice: toPriceUnits(154),
    });

    if (!result.ok) throw new Error("expected an opened position");
    expect(result.position).toEqual<OpenPosition>({
      direction: "long",
      entryPrice: toPriceUnits(150),
      quantity: toQuantityUnits(100),
      entryCommission: toMoneyUnits(1),
      entryEngineVersion: ENGINE_VERSION,
      entryTs: TEST_ENTRY_TS,
      plannedStopPrice: toPriceUnits(149),
      plannedTargetPrice: toPriceUnits(154),
    });
  });

  it("short, no planned stop/target -- both are independently optional", () => {
    const fill: PositionFill = {
      fillPrice: toPriceUnits(50),
      quantity: toQuantityUnits(10),
      commission: toMoneyUnits(0.5),
    };
    const result = openPosition({
      direction: "short",
      fill,
      engineVersion: ENGINE_VERSION,
      entryTs: TEST_ENTRY_TS,
    });

    if (!result.ok) throw new Error("expected an opened position");
    expect(result.position.plannedStopPrice).toBeUndefined();
    expect(result.position.plannedTargetPrice).toBeUndefined();
  });

  it("rejects a zero quantity fill", () => {
    const result = openPosition({
      direction: "long",
      fill: {
        fillPrice: toPriceUnits(150),
        quantity: toQuantityUnits(0),
        commission: toMoneyUnits(0),
      },
      engineVersion: ENGINE_VERSION,
      entryTs: TEST_ENTRY_TS,
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected a rejection");
    expect(result.error.code).toBe("INVALID_QUANTITY");
  });

  it("rejects a long stop ABOVE entry ($151 stop, $150 entry)", () => {
    const result = openPosition({
      direction: "long",
      fill: {
        fillPrice: toPriceUnits(150),
        quantity: toQuantityUnits(10),
        commission: toMoneyUnits(0),
      },
      engineVersion: ENGINE_VERSION,
      entryTs: TEST_ENTRY_TS,
      plannedStopPrice: toPriceUnits(151),
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected a rejection");
    expect(result.error.code).toBe("INVALID_STOP");
  });

  it("rejects a long target BELOW entry ($149 target, $150 entry)", () => {
    const result = openPosition({
      direction: "long",
      fill: {
        fillPrice: toPriceUnits(150),
        quantity: toQuantityUnits(10),
        commission: toMoneyUnits(0),
      },
      engineVersion: ENGINE_VERSION,
      entryTs: TEST_ENTRY_TS,
      plannedTargetPrice: toPriceUnits(149),
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected a rejection");
    expect(result.error.code).toBe("INVALID_TARGET");
  });

  it("rejects a short stop BELOW entry ($149 stop, $150 entry)", () => {
    const result = openPosition({
      direction: "short",
      fill: {
        fillPrice: toPriceUnits(150),
        quantity: toQuantityUnits(10),
        commission: toMoneyUnits(0),
      },
      engineVersion: ENGINE_VERSION,
      entryTs: TEST_ENTRY_TS,
      plannedStopPrice: toPriceUnits(149),
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected a rejection");
    expect(result.error.code).toBe("INVALID_STOP");
  });

  it("rejects a short target ABOVE entry ($151 target, $150 entry)", () => {
    const result = openPosition({
      direction: "short",
      fill: {
        fillPrice: toPriceUnits(150),
        quantity: toQuantityUnits(10),
        commission: toMoneyUnits(0),
      },
      engineVersion: ENGINE_VERSION,
      entryTs: TEST_ENTRY_TS,
      plannedTargetPrice: toPriceUnits(151),
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected a rejection");
    expect(result.error.code).toBe("INVALID_TARGET");
  });
});

describe("addToPosition", () => {
  it("100 sh @ $150.00 (+$1.00) + 100 sh @ $154.00 (+$1.00) -> 200 sh @ $152.00, $2.00 commission", () => {
    // By hand: weighted avg = (150 x 100 + 154 x 100) / 200 = (15,000 + 15,400) / 200
    //   = 30,400 / 200 = $152.00 exactly (same numbers as position-math.test.ts).
    const opened = openPosition({
      direction: "long",
      fill: {
        fillPrice: toPriceUnits(150),
        quantity: toQuantityUnits(100),
        commission: toMoneyUnits(1),
      },
      engineVersion: ENGINE_VERSION,
      entryTs: TEST_ENTRY_TS,
    });
    if (!opened.ok) throw new Error("expected an opened position");

    const result = addToPosition({
      position: opened.position,
      fill: {
        fillPrice: toPriceUnits(154),
        quantity: toQuantityUnits(100),
        commission: toMoneyUnits(1),
      },
    });

    if (!result.ok) throw new Error("expected an updated position");
    expect(fromPriceUnits(result.position.entryPrice)).toBe(152);
    expect(result.position.quantity).toBe(toQuantityUnits(200));
    expect(fromMoneyUnits(result.position.entryCommission)).toBe(2);
    // Direction, entry engine version, and entry timestamp are untouched by an add.
    expect(result.position.direction).toBe("long");
    expect(result.position.entryEngineVersion).toBe(ENGINE_VERSION);
    expect(result.position.entryTs).toBe(TEST_ENTRY_TS);
  });

  it("rejects a zero quantity fill", () => {
    const opened = openPosition({
      direction: "long",
      fill: {
        fillPrice: toPriceUnits(150),
        quantity: toQuantityUnits(100),
        commission: toMoneyUnits(1),
      },
      engineVersion: ENGINE_VERSION,
      entryTs: TEST_ENTRY_TS,
    });
    if (!opened.ok) throw new Error("expected an opened position");

    const result = addToPosition({
      position: opened.position,
      fill: {
        fillPrice: toPriceUnits(154),
        quantity: toQuantityUnits(0),
        commission: toMoneyUnits(0),
      },
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected a rejection");
    expect(result.error.code).toBe("INVALID_QUANTITY");
  });

  it("TD-08: re-validates a carried-over stop against the NEW weighted-average entry -- still valid, add succeeds", () => {
    // By hand: weighted avg = (150 x 100 + 152 x 100) / 200 = (15,000 + 15,200) / 200
    //   = 30,200 / 200 = $151.00 exactly. Stop $145.00 stays below the new
    //   $151.00 entry -- still valid for a long, so the add is unaffected.
    const opened = openPosition({
      direction: "long",
      fill: {
        fillPrice: toPriceUnits(150),
        quantity: toQuantityUnits(100),
        commission: toMoneyUnits(1),
      },
      engineVersion: ENGINE_VERSION,
      entryTs: TEST_ENTRY_TS,
      plannedStopPrice: toPriceUnits(145),
    });
    if (!opened.ok) throw new Error("expected an opened position");

    const result = addToPosition({
      position: opened.position,
      fill: {
        fillPrice: toPriceUnits(152),
        quantity: toQuantityUnits(100),
        commission: toMoneyUnits(1),
      },
    });

    if (!result.ok)
      throw new Error("expected an updated position -- stop is still valid");
    expect(fromPriceUnits(result.position.entryPrice)).toBe(151);
    expect(result.position.plannedStopPrice).toBe(toPriceUnits(145));
  });

  it("TD-08: rejects an add that would strand a LONG's stop above the new weighted-average entry", () => {
    // By hand: weighted avg = (150 x 100 + 145 x 100) / 200 = (15,000 + 14,500) / 200
    //   = 29,500 / 200 = $147.50. Stop $149.00 was valid against the OLD
    //   $150.00 entry (149 < 150) but is now ABOVE the new $147.50 entry --
    //   invalid for a long. The add must be rejected, not silently applied.
    const opened = openPosition({
      direction: "long",
      fill: {
        fillPrice: toPriceUnits(150),
        quantity: toQuantityUnits(100),
        commission: toMoneyUnits(1),
      },
      engineVersion: ENGINE_VERSION,
      entryTs: TEST_ENTRY_TS,
      plannedStopPrice: toPriceUnits(149),
    });
    if (!opened.ok) throw new Error("expected an opened position");

    const result = addToPosition({
      position: opened.position,
      fill: {
        fillPrice: toPriceUnits(145),
        quantity: toQuantityUnits(100),
        commission: toMoneyUnits(1),
      },
    });

    expect(result.ok).toBe(false);
    if (result.ok)
      throw new Error("expected the add to be rejected -- stop is now invalid");
    expect(result.error.code).toBe("INVALID_STOP");
    // The position itself is untouched by a rejected add -- AddToPositionResult
    // carries no `position` on the `ok: false` branch, so the caller is left
    // holding whatever position it already had (opened.position), unchanged.
  });

  it("TD-08: rejects an add that would strand a SHORT's stop below the new weighted-average entry", () => {
    // By hand: weighted avg = (150 x 100 + 156 x 100) / 200 = (15,000 + 15,600) / 200
    //   = 30,600 / 200 = $153.00. Stop $151.00 was valid against the OLD
    //   $150.00 entry (151 > 150) but is now BELOW the new $153.00 entry --
    //   invalid for a short (a short's stop must stay ABOVE entry).
    const opened = openPosition({
      direction: "short",
      fill: {
        fillPrice: toPriceUnits(150),
        quantity: toQuantityUnits(100),
        commission: toMoneyUnits(1),
      },
      engineVersion: ENGINE_VERSION,
      entryTs: TEST_ENTRY_TS,
      plannedStopPrice: toPriceUnits(151),
    });
    if (!opened.ok) throw new Error("expected an opened position");

    const result = addToPosition({
      position: opened.position,
      fill: {
        fillPrice: toPriceUnits(156),
        quantity: toQuantityUnits(100),
        commission: toMoneyUnits(1),
      },
    });

    expect(result.ok).toBe(false);
    if (result.ok)
      throw new Error("expected the add to be rejected -- stop is now invalid");
    expect(result.error.code).toBe("INVALID_STOP");
  });
});

describe("partiallyClosePosition", () => {
  it("long 200 sh @ $150.00 ($2.00 entry commission), closes 80 of 200 @ $155.00 (+$0.80) -> $398.40 net, R = 2.49, 120 sh remain", () => {
    const opened = openPosition({
      direction: "long",
      fill: {
        fillPrice: toPriceUnits(150),
        quantity: toQuantityUnits(200),
        commission: toMoneyUnits(2),
      },
      engineVersion: ENGINE_VERSION,
      entryTs: TEST_ENTRY_TS,
      plannedStopPrice: toPriceUnits(148),
    });
    if (!opened.ok) throw new Error("expected an opened position");

    const result = partiallyClosePosition({
      position: opened.position,
      fill: {
        fillPrice: toPriceUnits(155),
        quantity: toQuantityUnits(80),
        commission: toMoneyUnits(0.8),
      },
    });
    if (!result.ok) throw new Error("expected a partial close");
    if (!result.closed.ok)
      throw new Error("expected the closed slice to price successfully");

    // Entry commission prorated to the closed 80/200 = 40% slice:
    // $2.00 x 80/200 = $0.80 exactly (divides evenly, see position-math.test.ts).
    // Gross PnL: price moved up $5.00/share x 80 shares = $400.00
    expect(fromMoneyUnits(result.closed.grossPnl)).toBe(400);
    // Fees: $0.80 (prorated entry) + $0.80 (exit) = $1.60
    expect(fromMoneyUnits(result.closed.fees)).toBe(1.6);
    // Net: $400.00 - $1.60 = $398.40
    expect(fromMoneyUnits(result.closed.netPnl)).toBe(398.4);
    // Planned risk: entry $150 - stop $148 = $2.00/share x 80 sh = $160.00
    // R = $398.40 / $160.00 = 2.49
    expect(result.closed.rMultiple).toBe(2.49);

    // Remaining position: 120 sh, same $150.00 entry price (unchanged by a
    // close), remaining commission = $2.00 - $0.80 = $1.20, stop untouched.
    expect(result.remainingPosition.quantity).toBe(toQuantityUnits(120));
    expect(fromPriceUnits(result.remainingPosition.entryPrice)).toBe(150);
    expect(fromMoneyUnits(result.remainingPosition.entryCommission)).toBe(1.2);
    expect(result.remainingPosition.plannedStopPrice).toBe(toPriceUnits(148));
  });

  it("long 100 sh @ $150.00 ($1.00 entry commission), NO planned stop, closes 40 of 100 @ $155.00 (+$0.40) -> $199.20 net, R = null", () => {
    const opened = openPosition({
      direction: "long",
      fill: {
        fillPrice: toPriceUnits(150),
        quantity: toQuantityUnits(100),
        commission: toMoneyUnits(1),
      },
      engineVersion: ENGINE_VERSION,
      entryTs: TEST_ENTRY_TS,
      // No plannedStopPrice -- exercises the branch where position.ts does
      // NOT forward a stop into the engine's closePosition (position.ts:220).
    });
    if (!opened.ok) throw new Error("expected an opened position");

    const result = partiallyClosePosition({
      position: opened.position,
      fill: {
        fillPrice: toPriceUnits(155),
        quantity: toQuantityUnits(40),
        commission: toMoneyUnits(0.4),
      },
    });
    if (!result.ok) throw new Error("expected a partial close");
    if (!result.closed.ok)
      throw new Error("expected the closed slice to price successfully");

    // Entry commission prorated to the closed 40/100 = 40% slice:
    // $1.00 x 40/100 = $0.40 exactly.
    // Gross PnL: price moved up $5.00/share x 40 shares = $200.00
    expect(fromMoneyUnits(result.closed.grossPnl)).toBe(200);
    // Fees: $0.40 (prorated entry) + $0.40 (exit) = $0.80
    expect(fromMoneyUnits(result.closed.fees)).toBe(0.8);
    // Net: $200.00 - $0.80 = $199.20
    expect(fromMoneyUnits(result.closed.netPnl)).toBe(199.2);
    // No plannedStopPrice was ever set -- there's no risk to measure a
    // multiple against, so the engine returns null, not 0 (close-position.ts).
    expect(result.closed.rMultiple).toBeNull();

    // Remaining position: 60 sh, remaining commission = $1.00 - $0.40 = $0.60,
    // still no stop.
    expect(result.remainingPosition.quantity).toBe(toQuantityUnits(60));
    expect(fromMoneyUnits(result.remainingPosition.entryCommission)).toBe(0.6);
    expect(result.remainingPosition.plannedStopPrice).toBeUndefined();
  });

  it("rejects a zero quantity fill", () => {
    const opened = openPosition({
      direction: "long",
      fill: {
        fillPrice: toPriceUnits(150),
        quantity: toQuantityUnits(200),
        commission: toMoneyUnits(2),
      },
      engineVersion: ENGINE_VERSION,
      entryTs: TEST_ENTRY_TS,
    });
    if (!opened.ok) throw new Error("expected an opened position");

    const result = partiallyClosePosition({
      position: opened.position,
      fill: {
        fillPrice: toPriceUnits(155),
        quantity: toQuantityUnits(0),
        commission: toMoneyUnits(0),
      },
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected a rejection");
    expect(result.error.code).toBe("INVALID_QUANTITY");
  });

  it("rejects a fill quantity equal to the full open quantity -- must use fullyClosePosition instead", () => {
    const opened = openPosition({
      direction: "long",
      fill: {
        fillPrice: toPriceUnits(150),
        quantity: toQuantityUnits(200),
        commission: toMoneyUnits(2),
      },
      engineVersion: ENGINE_VERSION,
      entryTs: TEST_ENTRY_TS,
    });
    if (!opened.ok) throw new Error("expected an opened position");

    const result = partiallyClosePosition({
      position: opened.position,
      fill: {
        fillPrice: toPriceUnits(155),
        quantity: toQuantityUnits(200),
        commission: toMoneyUnits(2),
      },
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected a rejection");
    expect(result.error.code).toBe("NOT_A_PARTIAL_CLOSE");
  });

  it("bubbles the engine's INVALID_STOP for a hand-built position whose stop is invalid for its entry", () => {
    // TD-08 (paid): addToPosition now re-validates and REJECTS an add that
    // would strand the stop like this (see its own describe block above) --
    // so this scenario is no longer reachable through openPosition ->
    // addToPosition. It's still a real state partiallyClosePosition/
    // fullyClosePosition must handle defensively (e.g. a hand-built
    // fixture, or a future "edit stop" action that skips validation), so
    // it's exercised directly here instead: a position whose stop ($149,
    // ABOVE its $147.50 entry) is invalid for a long from the start.
    const invalidStopPosition: OpenPosition = {
      direction: "long",
      entryPrice: toPriceUnits(147.5),
      quantity: toQuantityUnits(200),
      entryCommission: toMoneyUnits(2),
      entryEngineVersion: ENGINE_VERSION,
      entryTs: TEST_ENTRY_TS,
      plannedStopPrice: toPriceUnits(149),
    };

    const result = partiallyClosePosition({
      position: invalidStopPosition,
      fill: {
        fillPrice: toPriceUnits(150),
        quantity: toQuantityUnits(50),
        commission: toMoneyUnits(1),
      },
    });

    expect(result.ok).toBe(false);
    if (result.ok)
      throw new Error("expected the engine's stop validation to reject this");
    expect(result.error.code).toBe("INVALID_STOP");
  });
});

describe("fullyClosePosition", () => {
  it("long 100 sh @ $150.00, stop $149.00, exit $153.00, $1.00 commission each way -> net $298.00, R = 2.98 (cross-checks close-position.test.ts)", () => {
    const opened = openPosition({
      direction: "long",
      fill: {
        fillPrice: toPriceUnits(150),
        quantity: toQuantityUnits(100),
        commission: toMoneyUnits(1),
      },
      engineVersion: ENGINE_VERSION,
      entryTs: TEST_ENTRY_TS,
      plannedStopPrice: toPriceUnits(149),
    });
    if (!opened.ok) throw new Error("expected an opened position");

    const result = fullyClosePosition({
      position: opened.position,
      fill: {
        fillPrice: toPriceUnits(153),
        quantity: toQuantityUnits(100),
        commission: toMoneyUnits(1),
      },
    });
    if (!result.ok) throw new Error("expected a full close");
    if (!result.closed.ok)
      throw new Error("expected the closed position to price successfully");

    expect(fromMoneyUnits(result.closed.grossPnl)).toBe(300);
    expect(fromMoneyUnits(result.closed.fees)).toBe(2);
    expect(fromMoneyUnits(result.closed.netPnl)).toBe(298);
    expect(result.closed.rMultiple).toBe(2.98);
  });

  it("long 100 sh @ $150.00, NO planned stop, exit $153.00, $1.00 commission each way -> net $298.00, R = null", () => {
    const opened = openPosition({
      direction: "long",
      fill: {
        fillPrice: toPriceUnits(150),
        quantity: toQuantityUnits(100),
        commission: toMoneyUnits(1),
      },
      engineVersion: ENGINE_VERSION,
      entryTs: TEST_ENTRY_TS,
      // No plannedStopPrice -- exercises the branch where position.ts does
      // NOT forward a stop into the engine's closePosition (position.ts:285).
    });
    if (!opened.ok) throw new Error("expected an opened position");

    const result = fullyClosePosition({
      position: opened.position,
      fill: {
        fillPrice: toPriceUnits(153),
        quantity: toQuantityUnits(100),
        commission: toMoneyUnits(1),
      },
    });
    if (!result.ok) throw new Error("expected a full close");
    if (!result.closed.ok)
      throw new Error("expected the closed position to price successfully");

    expect(fromMoneyUnits(result.closed.grossPnl)).toBe(300);
    expect(fromMoneyUnits(result.closed.fees)).toBe(2);
    expect(fromMoneyUnits(result.closed.netPnl)).toBe(298);
    // No plannedStopPrice was ever set -- null, not 0 (close-position.ts).
    expect(result.closed.rMultiple).toBeNull();
  });

  it("rejects a zero quantity fill", () => {
    const opened = openPosition({
      direction: "long",
      fill: {
        fillPrice: toPriceUnits(150),
        quantity: toQuantityUnits(100),
        commission: toMoneyUnits(1),
      },
      engineVersion: ENGINE_VERSION,
      entryTs: TEST_ENTRY_TS,
    });
    if (!opened.ok) throw new Error("expected an opened position");

    const result = fullyClosePosition({
      position: opened.position,
      fill: {
        fillPrice: toPriceUnits(153),
        quantity: toQuantityUnits(0),
        commission: toMoneyUnits(0),
      },
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected a rejection");
    expect(result.error.code).toBe("INVALID_QUANTITY");
  });

  it("rejects a fill quantity SMALLER than the open quantity -- must use partiallyClosePosition instead", () => {
    const opened = openPosition({
      direction: "long",
      fill: {
        fillPrice: toPriceUnits(150),
        quantity: toQuantityUnits(100),
        commission: toMoneyUnits(1),
      },
      engineVersion: ENGINE_VERSION,
      entryTs: TEST_ENTRY_TS,
    });
    if (!opened.ok) throw new Error("expected an opened position");

    const result = fullyClosePosition({
      position: opened.position,
      fill: {
        fillPrice: toPriceUnits(153),
        quantity: toQuantityUnits(50),
        commission: toMoneyUnits(1),
      },
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected a rejection");
    expect(result.error.code).toBe("NOT_A_FULL_CLOSE");
  });

  it("rejects a fill quantity LARGER than the open quantity", () => {
    const opened = openPosition({
      direction: "long",
      fill: {
        fillPrice: toPriceUnits(150),
        quantity: toQuantityUnits(100),
        commission: toMoneyUnits(1),
      },
      engineVersion: ENGINE_VERSION,
      entryTs: TEST_ENTRY_TS,
    });
    if (!opened.ok) throw new Error("expected an opened position");

    const result = fullyClosePosition({
      position: opened.position,
      fill: {
        fillPrice: toPriceUnits(153),
        quantity: toQuantityUnits(150),
        commission: toMoneyUnits(1),
      },
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected a rejection");
    expect(result.error.code).toBe("QUANTITY_EXCEEDS_POSITION");
  });

  it("bubbles the engine's INVALID_STOP for a hand-built position whose stop is invalid for its entry", () => {
    // TD-08 (paid): same reasoning as partiallyClosePosition's equivalent
    // test above -- addToPosition can no longer produce this state, so a
    // hand-built fixture stands in for "some other path put the position
    // in an invalid-stop state" (still real for fullyClosePosition/the
    // engine to handle correctly, whatever produces it).
    const invalidStopPosition: OpenPosition = {
      direction: "long",
      entryPrice: toPriceUnits(147.5),
      quantity: toQuantityUnits(200),
      entryCommission: toMoneyUnits(2),
      entryEngineVersion: ENGINE_VERSION,
      entryTs: TEST_ENTRY_TS,
      plannedStopPrice: toPriceUnits(149),
    };

    const result = fullyClosePosition({
      position: invalidStopPosition,
      fill: {
        fillPrice: toPriceUnits(150),
        quantity: toQuantityUnits(200),
        commission: toMoneyUnits(2),
      },
    });

    expect(result.ok).toBe(false);
    if (result.ok)
      throw new Error("expected the engine's stop validation to reject this");
    expect(result.error.code).toBe("INVALID_STOP");
  });
});
