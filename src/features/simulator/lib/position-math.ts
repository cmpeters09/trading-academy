import type { MoneyUnits, PriceUnits, QuantityUnits } from "@/lib/engine/types";

/**
 * The two integer-only calculations the position reducer (`position.ts`)
 * needs that don't exist in `/lib/engine` — the engine's README is explicit
 * that it has "no running position/order state," only single-fill math
 * (ADR-007/ADR-014). Both follow the same discipline as the engine's own
 * `priceQuantityToMoney` (units.ts): multiply in `BigInt` first, because the
 * intermediate product can exceed `Number.MAX_SAFE_INTEGER` even when the
 * inputs and the final answer don't, then round back to a plain (branded)
 * integer.
 *
 * Unlike `priceQuantityToMoney`, neither function here needs an overflow
 * guard on the final result: a weighted average can never exceed the larger
 * of its two inputs, and a prorated share of an amount (numerator <=
 * denominator by construction — see `position.ts`) can never exceed the
 * whole amount. If the inputs were already safe integers, so is the output
 * — by construction, not by luck — so there's no reachable overflow branch
 * to guard (and none to test).
 */

/**
 * Volume-weighted average entry price after adding a fill to an existing
 * position. Both fills' notional value (price x quantity) is summed in
 * BigInt, then divided by the combined quantity, rounded half-away-from-zero
 * — same rounding convention as `priceQuantityToMoney`, simplified to the
 * always-non-negative case (a price and a quantity are never negative, so
 * unlike `priceQuantityToMoney` there's no "round toward more negative"
 * branch to handle).
 */
export function weightedAverageEntryPrice(
  existing: { price: PriceUnits; quantity: QuantityUnits },
  incoming: { price: PriceUnits; quantity: QuantityUnits },
): PriceUnits {
  const totalNotional =
    BigInt(existing.price) * BigInt(existing.quantity) +
    BigInt(incoming.price) * BigInt(incoming.quantity);
  const totalQuantity = BigInt(existing.quantity) + BigInt(incoming.quantity);

  return roundDivide(totalNotional, totalQuantity) as PriceUnits;
}

/**
 * The `numerator/denominator` share of `amount`, rounded half-away-from-zero.
 * Used to split a position's accumulated entry commission between the slice
 * being closed and the slice staying open when a partial close happens.
 *
 * Callers MUST compute the *remaining* share by subtracting this result from
 * `amount`, never by calling `prorateMoney` a second time with the
 * complementary fraction — two independently-rounded fractions of the same
 * whole are not guaranteed to sum back to it (each rounds toward the nearest
 * unit on its own), and a subtraction can never leak or invent a unit of
 * commission.
 */
export function prorateMoney(
  amount: MoneyUnits,
  numerator: QuantityUnits,
  denominator: QuantityUnits,
): MoneyUnits {
  const product = BigInt(amount) * BigInt(numerator);

  return roundDivide(product, BigInt(denominator)) as MoneyUnits;
}

function roundDivide(numerator: bigint, denominator: bigint): number {
  const half = denominator / BigInt(2);
  return Number((numerator + half) / denominator);
}
