import { describe, expect, it } from "vitest";

import { computePositionSize } from "./position-sizing";
import type { MoneyUnits, PriceUnits } from "./types";
import { toMoneyUnits, toPriceUnits, toQuantityUnits, fromQuantityUnits } from "./units";

describe("computePositionSize", () => {
  it("$100,000 balance, 1% risk, $150.00 entry / $148.00 stop -> 500 sh exactly", () => {
    // riskAmount = $100,000 x 1% = $1,000.00
    // stop distance = $150.00 - $148.00 = $2.00
    // quantity = $1,000.00 / $2.00 = 500 sh exactly
    const result = computePositionSize({
      accountBalance: toMoneyUnits(100_000),
      riskPct: 1,
      entryPrice: toPriceUnits(150),
      stopPrice: toPriceUnits(148),
    });

    if (!result.ok) throw new Error("expected a sized position");
    expect(result.riskAmount).toBe(toMoneyUnits(1000));
    expect(result.quantity).toBe(toQuantityUnits(500));
    expect(result.appliedRiskPct).toBe(1);
    expect(result.clamped).toBe(false);
  });

  it("$50,000 balance, 2% risk, $3.00 stop distance -> rounds DOWN at QuantityUnits' 8-decimal precision", () => {
    // riskAmount = $50,000 x 2% = $1,000.00
    // stop distance = $100.00 - $97.00 = $3.00
    // true quantity = $1,000.00 / $3.00 = 333.3333333... sh (repeating)
    // QuantityUnits holds 8 decimal places (ADR-014) -- truncated (never
    // rounded up) to 333.33333333 sh, i.e. 33,333,333,333 QuantityUnits.
    // This is NOT rounding to a whole share -- fractional quantities are
    // valid throughout this engine (BTC-USD).
    const result = computePositionSize({
      accountBalance: toMoneyUnits(50_000),
      riskPct: 2,
      entryPrice: toPriceUnits(100),
      stopPrice: toPriceUnits(97),
    });

    if (!result.ok) throw new Error("expected a sized position");
    expect(result.quantity).toBe(33_333_333_333);
    expect(fromQuantityUnits(result.quantity)).toBeCloseTo(333.33333333, 8);
  });

  it("a short's stop ABOVE entry is handled identically -- only the unsigned distance matters", () => {
    // stop distance = |$50.00 - $52.00| = $2.00, same math as a long with
    // the same $2.00 distance -- computePositionSize never needs direction.
    const result = computePositionSize({
      accountBalance: toMoneyUnits(100_000),
      riskPct: 1,
      entryPrice: toPriceUnits(50),
      stopPrice: toPriceUnits(52),
    });

    if (!result.ok) throw new Error("expected a sized position");
    expect(result.quantity).toBe(toQuantityUnits(500));
  });

  it("requested risk % above the 5% cap is CLAMPED, not rejected", () => {
    // appliedRiskPct clamps 10% -> 5%. riskAmount = $100,000 x 5% = $5,000.00
    // stop distance = $50.00 - $49.00 = $1.00 -> quantity = 5,000 sh exactly
    const result = computePositionSize({
      accountBalance: toMoneyUnits(100_000),
      riskPct: 10,
      entryPrice: toPriceUnits(50),
      stopPrice: toPriceUnits(49),
    });

    if (!result.ok) throw new Error("expected a sized position");
    expect(result.appliedRiskPct).toBe(5);
    expect(result.clamped).toBe(true);
    expect(result.riskAmount).toBe(toMoneyUnits(5000));
    expect(result.quantity).toBe(toQuantityUnits(5000));
  });

  it("requested risk % AT EXACTLY the 5% cap is not flagged as clamped", () => {
    // riskAmount = $20,000 x 5% = $1,000.00; stop distance $2.00 -> 500 sh
    const result = computePositionSize({
      accountBalance: toMoneyUnits(20_000),
      riskPct: 5,
      entryPrice: toPriceUnits(40),
      stopPrice: toPriceUnits(38),
    });

    if (!result.ok) throw new Error("expected a sized position");
    expect(result.clamped).toBe(false);
    expect(result.appliedRiskPct).toBe(5);
    expect(result.quantity).toBe(toQuantityUnits(500));
  });

  it("a very tight risk budget against a wide stop can size down to a small fractional share -- honest, not an error", () => {
    // riskAmount = $1,000 x 0.1% = $1.00; stop distance $50.00 -> 0.02 sh
    const result = computePositionSize({
      accountBalance: toMoneyUnits(1000),
      riskPct: 0.1,
      entryPrice: toPriceUnits(100),
      stopPrice: toPriceUnits(50),
    });

    if (!result.ok) throw new Error("expected a sized position");
    expect(result.riskAmount).toBe(toMoneyUnits(1));
    expect(fromQuantityUnits(result.quantity)).toBe(0.02);
  });

  it("rejects a zero account balance", () => {
    const result = computePositionSize({
      accountBalance: toMoneyUnits(0),
      riskPct: 1,
      entryPrice: toPriceUnits(100),
      stopPrice: toPriceUnits(99),
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected a rejection");
    expect(result.error.code).toBe("INVALID_ACCOUNT_BALANCE");
  });

  it("rejects a negative account balance", () => {
    const result = computePositionSize({
      accountBalance: toMoneyUnits(-100),
      riskPct: 1,
      entryPrice: toPriceUnits(100),
      stopPrice: toPriceUnits(99),
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected a rejection");
    expect(result.error.code).toBe("INVALID_ACCOUNT_BALANCE");
  });

  it("rejects a zero risk %", () => {
    const result = computePositionSize({
      accountBalance: toMoneyUnits(100_000),
      riskPct: 0,
      entryPrice: toPriceUnits(100),
      stopPrice: toPriceUnits(99),
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected a rejection");
    expect(result.error.code).toBe("INVALID_RISK_PCT");
  });

  it("rejects a negative risk %", () => {
    const result = computePositionSize({
      accountBalance: toMoneyUnits(100_000),
      riskPct: -1,
      entryPrice: toPriceUnits(100),
      stopPrice: toPriceUnits(99),
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected a rejection");
    expect(result.error.code).toBe("INVALID_RISK_PCT");
  });

  it("rejects an entry price equal to the stop price (zero risk distance)", () => {
    const result = computePositionSize({
      accountBalance: toMoneyUnits(100_000),
      riskPct: 1,
      entryPrice: toPriceUnits(100),
      stopPrice: toPriceUnits(100),
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected a rejection");
    expect(result.error.code).toBe("INVALID_STOP_DISTANCE");
  });

  it("throws (programmer error, §7) when the scaled quantity exceeds Number.MAX_SAFE_INTEGER", () => {
    // An account balance AT Number.MAX_SAFE_INTEGER MoneyUnits (no
    // realistic paper-trading balance gets remotely close), 5% risk, and
    // the smallest possible non-zero stop distance (1 raw PriceUnit,
    // $0.0001) -- riskAmount alone is ~4.5e14, and multiplying by
    // QUANTITY_SCALE (1e8) before dividing by a distance of 1 pushes the
    // scaled quantity to ~4.5e22, far past MAX_SAFE_INTEGER. A broken
    // invariant, not a domain outcome -- this MUST throw.
    expect(() =>
      computePositionSize({
        accountBalance: Number.MAX_SAFE_INTEGER as MoneyUnits,
        riskPct: 5,
        entryPrice: 1 as PriceUnits,
        stopPrice: 0 as PriceUnits,
      }),
    ).toThrow(/overflow/);
  });
});
