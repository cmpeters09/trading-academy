import { describe, expect, it } from "vitest";

import { toMoneyUnits, toPriceUnits, toQuantityUnits } from "@/lib/engine/units";

import { prorateMoney, weightedAverageEntryPrice } from "./position-math";

describe("weightedAverageEntryPrice", () => {
  it("100 sh @ $150.00 + 100 sh @ $154.00 -> $152.00 exactly (equal weights, clean average)", () => {
    // existing notional = 1,500,000 PriceUnits x 10,000,000,000 QuantityUnits = 15,000,000,000,000,000
    // incoming notional = 1,540,000 x 10,000,000,000               = 15,400,000,000,000,000
    // total notional     = 30,400,000,000,000,000
    // total quantity      = 20,000,000,000
    // avg = 30,400,000,000,000,000 / 20,000,000,000 = 1,520,000 PriceUnits = $152.00
    const result = weightedAverageEntryPrice(
      { price: toPriceUnits(150), quantity: toQuantityUnits(100) },
      { price: toPriceUnits(154), quantity: toQuantityUnits(100) },
    );

    expect(result).toBe(1_520_000);
  });

  it("100 sh @ $150.00 + 50 sh @ $160.00 -> $153.3333 (uneven weights, rounds down)", () => {
    // By hand in dollars: (150 x 100 + 160 x 50) / 150 = (15,000 + 8,000) / 150
    //   = 23,000 / 150 = 153.3333... -- true 5th decimal digit is 3, rounds DOWN.
    //
    // In units: existing notional = 1,500,000 x 10,000,000,000 = 15,000,000,000,000,000
    //           incoming notional = 1,600,000 x 5,000,000,000  =  8,000,000,000,000,000
    //           total notional     = 23,000,000,000,000,000
    //           total quantity      = 15,000,000,000
    //           (total + half) / totalQty = (23,000,000,000,000,000 + 7,500,000,000) / 15,000,000,000
    //             = 1,533,333.8333... -> BigInt division truncates -> 1,533,333
    const result = weightedAverageEntryPrice(
      { price: toPriceUnits(150), quantity: toQuantityUnits(100) },
      { price: toPriceUnits(160), quantity: toQuantityUnits(50) },
    );

    expect(result).toBe(1_533_333);
  });
});

describe("prorateMoney", () => {
  it("$10.00 entry commission, closing 40 of 100 shares -> $4.00 (exact, divides evenly)", () => {
    // 40/100 = 40% of $10.00 = $4.00 exactly.
    // product = 100,000 MoneyUnits x 4,000,000,000 QuantityUnits = 400,000,000,000,000
    // (product + half) / denominator = (400,000,000,000,000 + 5,000,000,000) / 10,000,000,000
    //   = 40,000.0005 -> truncated -> 40,000 MoneyUnits = $4.00
    const closedShareCommission = prorateMoney(
      toMoneyUnits(10),
      toQuantityUnits(40),
      toQuantityUnits(100),
    );

    expect(closedShareCommission).toBe(40_000);
  });

  it("$1.00 entry commission, closing 1 of 3 shares -> $0.3333 (rounds down)", () => {
    // True value: $1.00 x (1/3) = $0.333333... -- 5th decimal digit is 3, rounds DOWN.
    // product = 10,000 MoneyUnits x 100,000,000 QuantityUnits = 1,000,000,000,000
    // (product + half) / denominator = (1,000,000,000,000 + 150,000,000) / 300,000,000
    //   = 3,333.8333... -> truncated -> 3,333 MoneyUnits = $0.3333
    const closedShareCommission = prorateMoney(
      toMoneyUnits(1),
      toQuantityUnits(1),
      toQuantityUnits(3),
    );

    expect(closedShareCommission).toBe(3_333);

    // The reducer computes the REMAINING commission by subtraction, not by a
    // second prorateMoney call -- this asserts why: an independently-rounded
    // complementary fraction would drop the tie-breaking unit here.
    // 10,000 - 3,333 = 6,667 (what position.ts actually does).
    const remainingBySubtraction = toMoneyUnits(1) - closedShareCommission;
    expect(remainingBySubtraction).toBe(6_667);
  });
});
