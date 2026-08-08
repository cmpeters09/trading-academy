import { describe, expect, it } from "vitest";

import { closePosition } from "./close-position";
import type { ClosedPosition } from "./types";
import {
  fromMoneyUnits,
  toMoneyUnits,
  toPriceUnits,
  toQuantityUnits,
} from "./units";

describe("closePosition — long, profitable, with a planned stop (the full R-multiple walkthrough)", () => {
  it("entry $150.00, stop $149.00 (risking $100 total), exit $153.00, $1 commission each way -> net $298.00, R = 2.98", () => {
    // Entry $150.00, 100 shares -> 1,500,000 PriceUnits / 10,000,000,000 QuantityUnits
    // Exit $153.00 -> 1,530,000 PriceUnits
    // Planned stop $149.00 -> 1,490,000 PriceUnits (risking $1.00/share = $100 total, before fees)
    const position: ClosedPosition = {
      direction: "long",
      quantity: toQuantityUnits(100),
      entryFillPrice: toPriceUnits(150),
      entryCommission: toMoneyUnits(1),
      exitFillPrice: toPriceUnits(153),
      exitCommission: toMoneyUnits(1),
      plannedStopPrice: toPriceUnits(149),
    };
    const result = closePosition(position);

    if (!result.ok) throw new Error("expected a closed position");

    // Gross PnL: price moved up $3.00/share x 100 shares = $300.00
    //   priceDelta = 1,530,000 - 1,500,000 = 30,000 PriceUnits
    //   grossPnl = 30,000 x 10,000,000,000 / 100,000,000 = 3,000,000 MoneyUnits (divides exactly)
    expect(fromMoneyUnits(result.grossPnl)).toBe(300);

    // Fees: $1.00 entry + $1.00 exit = $2.00
    expect(fromMoneyUnits(result.fees)).toBe(2);

    // Net PnL: $300.00 - $2.00 = $298.00
    expect(fromMoneyUnits(result.netPnl)).toBe(298);

    // Planned risk: entry $150.00 - stop $149.00 = $1.00/share x 100 shares = $100.00
    //   riskPriceDelta = 1,500,000 - 1,490,000 = 10,000 PriceUnits
    //   plannedRisk = 10,000 x 10,000,000,000 / 100,000,000 = 1,000,000 MoneyUnits ($100.00)
    //
    // R-multiple = netPnl / plannedRisk = 298,000 (2,980,000 MoneyUnits) / 100,000 (1,000,000 MoneyUnits)
    //   = 2,980,000 / 1,000,000 = 2.98
    //
    // By hand, in dollars: $298.00 net / $100.00 planned risk = 2.98R.
    // (Not a clean 3.00R -- the $2.00 in commission ate a small slice of it,
    // exactly the gross-vs-net distinction this session is about.)
    expect(result.rMultiple).toBe(2.98);
  });
});

describe("closePosition — short, profitable, with a planned stop", () => {
  it("entry $150.00, stop $151.00 (short, stop ABOVE entry), exit $146.00, $0.50 commission each way", () => {
    const position: ClosedPosition = {
      direction: "short",
      quantity: toQuantityUnits(50),
      entryFillPrice: toPriceUnits(150),
      entryCommission: toMoneyUnits(0.5),
      exitFillPrice: toPriceUnits(146),
      exitCommission: toMoneyUnits(0.5),
      plannedStopPrice: toPriceUnits(151),
    };
    const result = closePosition(position);

    if (!result.ok) throw new Error("expected a closed position");

    // A short profits when price FALLS: entry $150 - exit $146 = $4.00/share x 50 = $200.00
    expect(fromMoneyUnits(result.grossPnl)).toBe(200);
    // fees: $0.50 + $0.50 = $1.00
    expect(fromMoneyUnits(result.fees)).toBe(1);
    // net: $200.00 - $1.00 = $199.00
    expect(fromMoneyUnits(result.netPnl)).toBe(199);

    // planned risk (short): stop $151 - entry $150 = $1.00/share x 50 = $50.00
    // R = $199.00 / $50.00 = 3.98
    expect(result.rMultiple).toBe(3.98);
  });
});

describe("closePosition — long, losing trade, stopped out worse than planned (slippage on the exit)", () => {
  it("entry $150.00, stop $149.00, but the stop fill slipped to $148.80 -> loses MORE than a clean 1R", () => {
    const position: ClosedPosition = {
      direction: "long",
      quantity: toQuantityUnits(100),
      entryFillPrice: toPriceUnits(150),
      entryCommission: toMoneyUnits(1),
      exitFillPrice: toPriceUnits(148.8),
      exitCommission: toMoneyUnits(1),
      plannedStopPrice: toPriceUnits(149),
    };
    const result = closePosition(position);

    if (!result.ok) throw new Error("expected a closed position");

    // Price fell $1.20/share x 100 shares = -$120.00 gross (a loss)
    expect(fromMoneyUnits(result.grossPnl)).toBe(-120);
    // fees: $1.00 + $1.00 = $2.00
    expect(fromMoneyUnits(result.fees)).toBe(2);
    // net: -$120.00 - $2.00 = -$122.00
    expect(fromMoneyUnits(result.netPnl)).toBe(-122);

    // planned risk is still exactly $100.00 (entry $150 - stop $149, x 100) --
    // the PLAN didn't change just because the fill was worse than expected.
    // R = -$122.00 / $100.00 = -1.22 -- worse than a "clean" -1R, because
    // the stop's own slippage plus commission ate further into the loss.
    expect(result.rMultiple).toBe(-1.22);
  });
});

describe("closePosition — no planned stop was ever set", () => {
  it("rMultiple is null, not 0 -- there is no risk to measure a multiple against", () => {
    const position: ClosedPosition = {
      direction: "long",
      quantity: toQuantityUnits(10),
      entryFillPrice: toPriceUnits(150),
      entryCommission: toMoneyUnits(1),
      exitFillPrice: toPriceUnits(155),
      exitCommission: toMoneyUnits(1),
      // plannedStopPrice omitted entirely
    };
    const result = closePosition(position);

    if (!result.ok) throw new Error("expected a closed position");
    // Gross/net PnL are still computed normally: $5.00 x 10 = $50.00, - $2.00 fees = $48.00
    expect(fromMoneyUnits(result.grossPnl)).toBe(50);
    expect(fromMoneyUnits(result.netPnl)).toBe(48);
    expect(result.rMultiple).toBeNull();
  });
});

describe("closePosition — validation", () => {
  it("rejects a stop on the wrong side of entry for a long position", () => {
    // Long position but the stop ($151) is ABOVE entry ($150) -- backwards.
    const position: ClosedPosition = {
      direction: "long",
      quantity: toQuantityUnits(10),
      entryFillPrice: toPriceUnits(150),
      entryCommission: toMoneyUnits(1),
      exitFillPrice: toPriceUnits(155),
      exitCommission: toMoneyUnits(1),
      plannedStopPrice: toPriceUnits(151),
    };
    const result = closePosition(position);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected a rejection");
    expect(result.error.code).toBe("INVALID_STOP");
  });

  it("rejects a stop on the wrong side of entry for a short position", () => {
    // Short position but the stop ($149) is BELOW entry ($150) -- backwards.
    const position: ClosedPosition = {
      direction: "short",
      quantity: toQuantityUnits(10),
      entryFillPrice: toPriceUnits(150),
      entryCommission: toMoneyUnits(1),
      exitFillPrice: toPriceUnits(145),
      exitCommission: toMoneyUnits(1),
      plannedStopPrice: toPriceUnits(149),
    };
    const result = closePosition(position);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected a rejection");
    expect(result.error.code).toBe("INVALID_STOP");
  });

  it("rejects a zero/negative quantity", () => {
    const position: ClosedPosition = {
      direction: "long",
      quantity: toQuantityUnits(0),
      entryFillPrice: toPriceUnits(150),
      entryCommission: toMoneyUnits(1),
      exitFillPrice: toPriceUnits(155),
      exitCommission: toMoneyUnits(1),
    };
    const result = closePosition(position);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected a rejection");
    expect(result.error.code).toBe("INVALID_QUANTITY");
  });
});
