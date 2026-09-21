import {
  ENGINE_VERSION,
  MAX_RISK_PCT,
  QUANTITY_SCALE,
  type MoneyUnits,
  type PositionSizeInput,
  type PositionSizeResult,
  type PriceUnits,
  type QuantityUnits,
} from "./types";

/**
 * GLOSSARY.md "Position sizing" — how many shares to trade, computed from
 * how much you're willing to lose (a risk %, capped at
 * DATABASE_SCHEMA.md's 5% `default_risk_pct`), not from how much you want
 * to make:
 *
 *   riskAmount = accountBalance x appliedRiskPct
 *   quantity   = riskAmount / |entryPrice - stopPrice|
 *
 * `quantity` is always rounded DOWN (never up) — sizing a position UP to
 * fit a rounding error would mean risking more than the trader asked for,
 * the same "never in the trader's favor when genuinely uncertain"
 * philosophy as slippage (ADR-007). Rounding happens at QuantityUnits'
 * own precision (1/100,000,000 of a share, ADR-014) — this engine already
 * treats quantity as fractional-capable (BTC-USD is a real seeded
 * instrument), so "round down" does not mean "round down to a whole
 * share."
 *
 * Both intermediate products (`accountBalance x riskPct` and
 * `riskAmount x QUANTITY_SCALE`) are computed in BigInt, same discipline
 * as `units.ts`'s `priceQuantityToMoney` — the second one in particular
 * can exceed `Number.MAX_SAFE_INTEGER` even for realistic inputs (a
 * $1,000 risk amount scaled by QUANTITY_SCALE alone is 1e11).
 */
export function computePositionSize(input: PositionSizeInput): PositionSizeResult {
  const { accountBalance, riskPct, entryPrice, stopPrice } = input;

  if (accountBalance <= 0) {
    return {
      ok: false,
      error: {
        code: "INVALID_ACCOUNT_BALANCE",
        message: "Account balance must be greater than zero.",
      },
      engineVersion: ENGINE_VERSION,
    };
  }
  if (riskPct <= 0) {
    return {
      ok: false,
      error: {
        code: "INVALID_RISK_PCT",
        message: "Risk % must be greater than zero.",
      },
      engineVersion: ENGINE_VERSION,
    };
  }
  if (entryPrice === stopPrice) {
    return {
      ok: false,
      error: {
        code: "INVALID_STOP_DISTANCE",
        message: "Entry price and stop price must differ -- there is no risk to size against.",
      },
      engineVersion: ENGINE_VERSION,
    };
  }

  const clamped = riskPct > MAX_RISK_PCT;
  const appliedRiskPct = clamped ? MAX_RISK_PCT : riskPct;
  const stopDistance = Math.abs(entryPrice - stopPrice) as PriceUnits;

  const riskAmount = computeRiskAmount(accountBalance, appliedRiskPct);
  const quantity = computeQuantity(riskAmount, stopDistance);

  return {
    ok: true,
    quantity,
    riskAmount,
    appliedRiskPct,
    clamped,
    engineVersion: ENGINE_VERSION,
  };
}

/**
 * `riskPct` is a plain decimal (e.g. `1.5`) -- scaled by 100 here (matching
 * DATABASE_SCHEMA.md's `numeric(5,2)` precision for the same value, so no
 * precision is lost) to get an integer BigInt can multiply exactly, then
 * divided by 10,000 in the same expression: /100 converts percent to a
 * fraction, /100 undoes the x100 scaling. Rounded half-away-from-zero, same
 * convention as `priceQuantityToMoney` -- this is a DISPLAYED dollar
 * amount, not itself further divided, so it gets the nearest-cent
 * treatment rather than `computeQuantity`'s round-down.
 *
 * No overflow guard needed: `appliedRiskPct` is capped at `MAX_RISK_PCT`
 * (5), so `riskAmount` can never exceed 5% of `accountBalance` -- if the
 * balance was already a safe integer, 5% of it trivially is too (same
 * "can't exceed the whole amount" reasoning as `position-math.ts`'s
 * `prorateMoney`).
 */
function computeRiskAmount(accountBalance: MoneyUnits, appliedRiskPct: number): MoneyUnits {
  const riskPctScaled = BigInt(Math.round(appliedRiskPct * 100));
  const denominator = BigInt(10_000);
  const half = denominator / BigInt(2);
  const numerator = BigInt(accountBalance) * riskPctScaled;

  return Number((numerator + half) / denominator) as MoneyUnits;
}

/**
 * The division `priceQuantityToMoney` never has to do: risk dollars over a
 * per-share price, back into a quantity. BigInt division truncates toward
 * zero, and every input here is non-negative by construction (validated in
 * `computePositionSize`), so truncation IS floor -- "round down," exactly
 * as required, with no separate rounding step.
 */
function computeQuantity(riskAmount: MoneyUnits, stopDistance: PriceUnits): QuantityUnits {
  const numerator = BigInt(riskAmount) * BigInt(QUANTITY_SCALE);
  const denominator = BigInt(stopDistance);
  const quantity = numerator / denominator;

  if (quantity > BigInt(Number.MAX_SAFE_INTEGER)) {
    // Programmer/impossible-state error (§7 class 3) -- this app's
    // realistic account sizes and stop distances never approach this.
    throw new Error(
      `computePositionSize overflow: ${riskAmount} risk / ${stopDistance} stop distance exceeds Number.MAX_SAFE_INTEGER after scaling`,
    );
  }

  return Number(quantity) as QuantityUnits;
}
