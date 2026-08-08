import { describe, expect, it } from "vitest";

import { resolveBracket } from "./bracket";
import type { BracketOrder, EngineBar } from "./types";
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
const TWO_CENT_SLIPPAGE = {
  model: "fixed_amount" as const,
  value: toPriceUnits(0.02),
};

describe("resolveBracket — long position", () => {
  const stopPrice = toPriceUnits(145);
  const targetPrice = toPriceUnits(160);

  it("stays open when neither the stop nor the target is touched", () => {
    // bar low = $148 -> 148 <= 145 is false, stop NOT touched
    // bar high = $152 -> 152 >= 160 is false, target NOT touched
    const order: BracketOrder = {
      direction: "long",
      quantity: toQuantityUnits(10),
      stopPrice,
      targetPrice,
    };
    const result = resolveBracket(order, bar(150, 152, 148, 151), {
      slippage: TWO_CENT_SLIPPAGE,
      commission: FLAT_DOLLAR_COMMISSION,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok:true");
    expect(result.outcome).toBe("none");
  });

  it("exits at the stop (clean stop-out, not ambiguous) when only the stop is touched", () => {
    // bar low = $144 -> 144 <= 145, stop TOUCHED
    // bar high = $151 -> 151 >= 160 is false, target NOT touched
    // closing a long = selling, so slippage pushes the exit DOWN:
    // fill = 1,450,000 - 200 (2 cents) = 1,449,800 -> $144.98
    const order: BracketOrder = {
      direction: "long",
      quantity: toQuantityUnits(10),
      stopPrice,
      targetPrice,
    };
    const result = resolveBracket(order, bar(150, 151, 144, 145.5), {
      slippage: TWO_CENT_SLIPPAGE,
      commission: FLAT_DOLLAR_COMMISSION,
    });

    expect(result.ok).toBe(true);
    if (!result.ok || result.outcome !== "stop")
      throw new Error("expected a stop exit");
    expect(fromPriceUnits(result.fillPrice)).toBe(144.98);
    expect(fromMoneyUnits(result.commission)).toBe(1);
    expect(result.resolutionAmbiguous).toBe(false);
  });

  it("exits at the target EXACTLY (no slippage) when only the target is touched", () => {
    // bar low = $149 -> 149 <= 145 is false, stop NOT touched
    // bar high = $161 -> 161 >= 160, target TOUCHED
    // fills at exactly $160.00 -- no slippage, same as a limit fill
    const order: BracketOrder = {
      direction: "long",
      quantity: toQuantityUnits(10),
      stopPrice,
      targetPrice,
    };
    const result = resolveBracket(order, bar(150, 161, 149, 160.5), {
      slippage: TWO_CENT_SLIPPAGE,
      commission: FLAT_DOLLAR_COMMISSION,
    });

    expect(result.ok).toBe(true);
    if (!result.ok || result.outcome !== "target")
      throw new Error("expected a target exit");
    expect(fromPriceUnits(result.fillPrice)).toBe(160);
    expect(fromMoneyUnits(result.commission)).toBe(1);
  });

  it("THE R-3 CASE: both stop and target are touched in the same bar — resolves as the stop, flagged ambiguous", () => {
    // This is the heart of bar-path ambiguity. A long position: stop at
    // $145 (below entry), target at $160 (above entry).
    //
    // bar: open=$150, high=$161, low=$144, close=$155
    //   low  = $144 -> 144 <= 145, stop level WAS touched this bar
    //   high = $161 -> 161 >= 160, target level WAS ALSO touched this bar
    //
    // The candle proves price visited BOTH $145 and $160 at some point
    // during this bar -- but open/high/low/close give no way to know
    // which came first. "Dropped to $144 then rallied to $161" and
    // "rallied to $161 then dropped to $144" produce the IDENTICAL four
    // numbers. That is the ambiguity R-3 exists to name honestly instead
    // of silently guessing.
    //
    // The rule: resolve AGAINST the trader. Treat it exactly like the
    // clean stop-out above -- same fill math, same $144.98 -- but flag it:
    const order: BracketOrder = {
      direction: "long",
      quantity: toQuantityUnits(10),
      stopPrice,
      targetPrice,
    };
    const result = resolveBracket(order, bar(150, 161, 144, 155), {
      slippage: TWO_CENT_SLIPPAGE,
      commission: FLAT_DOLLAR_COMMISSION,
    });

    expect(result.ok).toBe(true);
    if (!result.ok || result.outcome !== "stop")
      throw new Error("expected a stop exit (resolved against the trader)");
    // Same fill price as the unambiguous stop-out test above: 1,450,000 - 200 = 1,449,800 -> $144.98
    expect(fromPriceUnits(result.fillPrice)).toBe(144.98);
    expect(fromMoneyUnits(result.commission)).toBe(1);
    // The only difference from a clean stop-out: this flag is now true.
    expect(result.resolutionAmbiguous).toBe(true);
  });
});

describe("resolveBracket — short position (mirrored: stop above, target below)", () => {
  const stopPrice = toPriceUnits(160);
  const targetPrice = toPriceUnits(145);

  it("exits at the stop when only the stop is touched — closing a short means buying, slippage pushes the price UP", () => {
    // bar high = $161 -> 161 >= 160, stop TOUCHED
    // bar low = $149 -> 149 <= 145 is false, target NOT touched
    // fill = 1,600,000 + 200 (2 cents) = 1,600,200 -> $160.02
    const order: BracketOrder = {
      direction: "short",
      quantity: toQuantityUnits(10),
      stopPrice,
      targetPrice,
    };
    const result = resolveBracket(order, bar(150, 161, 149, 152), {
      slippage: TWO_CENT_SLIPPAGE,
      commission: FLAT_DOLLAR_COMMISSION,
    });

    expect(result.ok).toBe(true);
    if (!result.ok || result.outcome !== "stop")
      throw new Error("expected a stop exit");
    expect(fromPriceUnits(result.fillPrice)).toBe(160.02);
    expect(result.resolutionAmbiguous).toBe(false);
  });

  it("exits at the target EXACTLY when only the target is touched", () => {
    // bar low = $144 -> 144 <= 145, target TOUCHED
    // bar high = $151 -> 151 >= 160 is false, stop NOT touched
    const order: BracketOrder = {
      direction: "short",
      quantity: toQuantityUnits(10),
      stopPrice,
      targetPrice,
    };
    const result = resolveBracket(order, bar(150, 151, 144, 145.5), {
      slippage: TWO_CENT_SLIPPAGE,
      commission: FLAT_DOLLAR_COMMISSION,
    });

    expect(result.ok).toBe(true);
    if (!result.ok || result.outcome !== "target")
      throw new Error("expected a target exit");
    expect(fromPriceUnits(result.fillPrice)).toBe(145);
  });

  it("THE R-3 CASE, mirrored for a short: both touched -> resolves as the stop, flagged ambiguous", () => {
    // bar: open=$150, high=$161, low=$144, close=$155
    //   high = $161 -> 161 >= 160, stop level touched
    //   low  = $144 -> 144 <= 145, target level ALSO touched
    // Same undecidable-order problem, mirrored. Resolves as the stop:
    // fill = 1,600,000 + 200 = 1,600,200 -> $160.02 (identical to the clean stop-out above)
    const order: BracketOrder = {
      direction: "short",
      quantity: toQuantityUnits(10),
      stopPrice,
      targetPrice,
    };
    const result = resolveBracket(order, bar(150, 161, 144, 155), {
      slippage: TWO_CENT_SLIPPAGE,
      commission: FLAT_DOLLAR_COMMISSION,
    });

    expect(result.ok).toBe(true);
    if (!result.ok || result.outcome !== "stop")
      throw new Error("expected a stop exit (resolved against the trader)");
    expect(fromPriceUnits(result.fillPrice)).toBe(160.02);
    expect(result.resolutionAmbiguous).toBe(true);
  });
});

describe("resolveBracket — validation", () => {
  it("rejects a bracket with the stop on the wrong side for a long position", () => {
    // Long position but stop ($160) is ABOVE target ($145) -- backwards.
    const order: BracketOrder = {
      direction: "long",
      quantity: toQuantityUnits(10),
      stopPrice: toPriceUnits(160),
      targetPrice: toPriceUnits(145),
    };
    const result = resolveBracket(order, bar(150, 151, 149, 150), {
      slippage: TWO_CENT_SLIPPAGE,
      commission: FLAT_DOLLAR_COMMISSION,
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected a rejection");
    expect(result.error.code).toBe("INVALID_BRACKET");
  });

  it("rejects a bracket with the stop on the wrong side for a short position", () => {
    // Short position but stop ($145) is BELOW target ($160) -- backwards
    // (a short's stop must be ABOVE its target).
    const order: BracketOrder = {
      direction: "short",
      quantity: toQuantityUnits(10),
      stopPrice: toPriceUnits(145),
      targetPrice: toPriceUnits(160),
    };
    const result = resolveBracket(order, bar(150, 151, 149, 150), {
      slippage: TWO_CENT_SLIPPAGE,
      commission: FLAT_DOLLAR_COMMISSION,
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected a rejection");
    expect(result.error.code).toBe("INVALID_BRACKET");
  });

  it("rejects a zero/negative quantity", () => {
    const order: BracketOrder = {
      direction: "long",
      quantity: toQuantityUnits(0),
      stopPrice: toPriceUnits(145),
      targetPrice: toPriceUnits(160),
    };
    const result = resolveBracket(order, bar(150, 151, 149, 150), {
      slippage: TWO_CENT_SLIPPAGE,
      commission: FLAT_DOLLAR_COMMISSION,
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected a rejection");
    expect(result.error.code).toBe("INVALID_QUANTITY");
  });
});
