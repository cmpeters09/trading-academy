import { describe, expect, it } from "vitest";

import { PRICE_SCALE, QUANTITY_SCALE, type MoneyUnits, type PriceUnits, type QuantityUnits } from "./types";
import {
  fromMoneyUnits,
  fromPriceUnits,
  fromQuantityUnits,
  priceQuantityToMoney,
  toMoneyUnits,
  toPriceUnits,
  toQuantityUnits,
} from "./units";

describe("toPriceUnits / fromPriceUnits", () => {
  it("converts $150.10 to 1,501,000 units and back", () => {
    // 150.10 * 10,000 = 1,501,000.0 -> round -> 1,501,000
    expect(toPriceUnits(150.1)).toBe(1_501_000);
    // 1,501,000 / 10,000 = 150.1
    expect(fromPriceUnits(1_501_000 as PriceUnits)).toBe(150.1);
  });
});

describe("toQuantityUnits / fromQuantityUnits", () => {
  it("converts a fractional (crypto-style) quantity to 8-decimal units and back", () => {
    // 0.12345678 * 100,000,000 = 12,345,678.0 -> round -> 12,345,678
    expect(toQuantityUnits(0.12345678)).toBe(12_345_678);
    // 12,345,678 / 100,000,000 = 0.12345678
    expect(fromQuantityUnits(12_345_678 as QuantityUnits)).toBe(0.12345678);
  });
});

describe("toMoneyUnits / fromMoneyUnits", () => {
  it("converts $99.99 to 999,900 units and back", () => {
    // 99.99 * 10,000 = 999,900.0 -> round -> 999,900
    expect(toMoneyUnits(99.99)).toBe(999_900);
    // 999,900 / 10,000 = 99.99
    expect(fromMoneyUnits(999_900 as MoneyUnits)).toBe(99.99);
  });
});

describe("priceQuantityToMoney", () => {
  it("computes an exact case with no rounding: $150.10 x 100 shares = $15,010.00", () => {
    // price = 150.10 -> 1,501,000 PriceUnits
    // quantity = 100 shares -> 100 * 100,000,000 = 10,000,000,000 QuantityUnits
    const price = toPriceUnits(150.1);
    const quantity = toQuantityUnits(100);

    // product = 1,501,000 * 10,000,000,000 = 15,010,000,000,000,000
    // half = 100,000,000 / 2 = 50,000,000 (product is >= 0, so we add half before dividing)
    // (15,010,000,000,000,000 + 50,000,000) / 100,000,000 = 150,100,000.5 -> truncated (BigInt) -> 150,100,000
    // (the "+half, then truncate" trick recovers the exact quotient here because the
    // true division has no remainder: 15,010,000,000,000,000 / 100,000,000 = 150,100,000 exactly)
    const money = priceQuantityToMoney(price, quantity);
    expect(money).toBe(150_100_000);

    // 150,100,000 / 10,000 = $15,010.00 -- matches $150.10 x 100 by hand
    expect(fromMoneyUnits(money)).toBe(15_010);
  });

  it("rounds DOWN when the true remainder is less than half: $100.00 x 0.33333333", () => {
    // price = 100.00 -> 1,000,000 PriceUnits
    // quantity = 0.33333333 -> 33,333,333 QuantityUnits
    const price = toPriceUnits(100);
    const quantity = toQuantityUnits(0.33333333);

    // product = 1,000,000 * 33,333,333 = 33,333,333,000,000
    // + half (50,000,000) = 33,333,383,000,000
    // / 100,000,000 = 333,333.83 -> truncated -> 333,333
    //
    // Sanity check against the true (un-rounded) value: $100 x 0.33333333 = $33.333333.
    // Rounded to the nearest 1/10,000th of a dollar (MoneyUnits' own precision floor),
    // the 5th decimal digit is 3 (33.3333|33), which rounds DOWN to $33.3333 -- matches.
    const money = priceQuantityToMoney(price, quantity);
    expect(money).toBe(333_333);
    expect(fromMoneyUnits(money)).toBe(33.3333);
  });

  it("rounds UP when the true remainder is at least half: $100.00 x 0.66666667", () => {
    // price = 100.00 -> 1,000,000 PriceUnits
    // quantity = 0.66666667 -> 66,666,667 QuantityUnits
    const price = toPriceUnits(100);
    const quantity = toQuantityUnits(0.66666667);

    // product = 1,000,000 * 66,666,667 = 66,666,667,000,000
    // + half (50,000,000) = 66,666,717,000,000
    // / 100,000,000 = 666,667.17 -> truncated -> 666,667
    //
    // True value: $100 x 0.66666667 = $66.666667. The 5th decimal digit is 6
    // (66.6666|67), which rounds UP to $66.6667 -- matches.
    const money = priceQuantityToMoney(price, quantity);
    expect(money).toBe(666_667);
    expect(fromMoneyUnits(money)).toBe(66.6667);
  });

  it("rounds a negative price (a loss) correctly, not biased toward zero", () => {
    // price = -50.00 (an adverse $50 move) -> -500,000 PriceUnits
    // quantity = 0.12345678 -> 12,345,678 QuantityUnits
    const price = toPriceUnits(-50);
    const quantity = toQuantityUnits(0.12345678);

    // product = -500,000 * 12,345,678 = -6,172,839,000,000
    // product < 0, so we SUBTRACT half before dividing (round-half-away-from-zero):
    // (-6,172,839,000,000 - 50,000,000) / 100,000,000 = -6,172,889,000,000 / 100,000,000
    //   = -61,728.89 -> truncated toward zero -> -61,728
    //
    // True value: -50 x 0.12345678 = -$6.172839. The 5th decimal digit is 3
    // (6.1728|39), rounds toward zero to -$6.1728 -- matches.
    const money = priceQuantityToMoney(price, quantity);
    expect(money).toBe(-61_728);
    expect(fromMoneyUnits(money)).toBe(-6.1728);
  });

  it("throws (programmer error, §7) when the rescaled result exceeds Number.MAX_SAFE_INTEGER", () => {
    // Number.MAX_SAFE_INTEGER PriceUnits times a real quantity of 2.0:
    // the rescaled money value is ~2x MAX_SAFE_INTEGER, which no realistic
    // position in this app could ever reach -- this is a broken invariant,
    // not a domain outcome, so it MUST throw rather than return a result.
    const price = Number.MAX_SAFE_INTEGER as PriceUnits;
    const quantity = (2 * QUANTITY_SCALE) as QuantityUnits;

    expect(() => priceQuantityToMoney(price, quantity)).toThrow(/overflow/);
  });
});

describe("why integer minor units instead of floats (ADR-014)", () => {
  it("demonstrates the float bug this design avoids", () => {
    // The classic IEEE 754 proof: adding two already-imprecise floats
    // compounds their rounding error.
    expect(0.1 + 0.2).not.toBe(0.3);
    expect(0.1 + 0.2).toBeCloseTo(0.3, 15); // it's off by ~1e-17, not visibly wrong, but not exact
  });

  it("adding two MoneyUnits amounts does not have that error", () => {
    // toMoneyUnits(0.1) = round(0.1 * 10,000) = round(1,000.000...) = 1,000
    // toMoneyUnits(0.2) = round(0.2 * 10,000) = round(2,000.000...) = 2,000
    // 1,000 + 2,000 = 3,000 -- plain integer addition, exact, no float error possible
    const sum = (toMoneyUnits(0.1) + toMoneyUnits(0.2)) as MoneyUnits;
    expect(sum).toBe(3_000);
    // 3,000 / 10,000 = 0.3 -- a single division step (same as parsing the literal
    // 0.3 itself), not two compounded roundings, so this comes out exact.
    expect(fromMoneyUnits(sum)).toBe(0.3);
  });
});

describe("scale constants", () => {
  it("documents the precision each scale buys, by construction", () => {
    // 10,000 units per currency unit = 4 decimal digits of price/money precision
    expect(PRICE_SCALE).toBe(10_000);
    // 100,000,000 units per share = 8 decimal digits of quantity precision,
    // matching candles/instruments' numeric(18,8) columns exactly
    expect(QUANTITY_SCALE).toBe(100_000_000);
  });
});
