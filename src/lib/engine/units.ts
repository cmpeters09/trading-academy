import {
  PRICE_SCALE,
  QUANTITY_SCALE,
  type MoneyUnits,
  type PriceUnits,
  type QuantityUnits,
} from "./types";

/**
 * The only place a decimal dollar amount is allowed to touch a rounding
 * operation. `Math.round` absorbs the float noise inherent in any decimal
 * literal (150.10 * 10_000 is not always exactly 1_501_000 in IEEE 754) —
 * this is the single, intentional boundary conversion ADR-014 describes,
 * not a violation of "no floats in the engine": everything past this point
 * is a whole number.
 */
export function toPriceUnits(decimal: number): PriceUnits {
  return Math.round(decimal * PRICE_SCALE) as PriceUnits;
}

export function fromPriceUnits(units: PriceUnits): number {
  return units / PRICE_SCALE;
}

export function toQuantityUnits(decimal: number): QuantityUnits {
  return Math.round(decimal * QUANTITY_SCALE) as QuantityUnits;
}

export function fromQuantityUnits(units: QuantityUnits): number {
  return units / QUANTITY_SCALE;
}

export function toMoneyUnits(decimal: number): MoneyUnits {
  return Math.round(decimal * PRICE_SCALE) as MoneyUnits;
}

export function fromMoneyUnits(units: MoneyUnits): number {
  return units / PRICE_SCALE;
}

/**
 * price (PriceUnits) × quantity (QuantityUnits) → money (MoneyUnits) — the
 * core of every PnL calculation.
 *
 * Done in BigInt, not plain `number` arithmetic: the intermediate product
 * (price scaled by 10,000, times quantity scaled by 100,000,000) can exceed
 * Number.MAX_SAFE_INTEGER even when neither the inputs nor the final,
 * rescaled answer do (ADR-014's worked example: a $1,000 price times a
 * 10,000-share quantity produces a 20-digit intermediate product).
 *
 * `price` may be negative (e.g. a signed price *delta* like
 * `exitPrice - entryPrice` when computing gross PnL) — the rounding below
 * is round-half-away-from-zero in both directions, not a truncation
 * biased toward zero, so a loss doesn't get systematically under-counted.
 */
export function priceQuantityToMoney(
  price: PriceUnits,
  quantity: QuantityUnits,
): MoneyUnits {
  const divisor = BigInt(QUANTITY_SCALE);
  const half = divisor / BigInt(2);
  const product = BigInt(price) * BigInt(quantity);
  const zero = BigInt(0);

  const rounded =
    product >= zero ? (product + half) / divisor : (product - half) / divisor;

  if (
    rounded > BigInt(Number.MAX_SAFE_INTEGER) ||
    rounded < BigInt(-Number.MAX_SAFE_INTEGER)
  ) {
    // Programmer/impossible-state error (§7 class 3) — this app's realistic
    // position sizes never approach this. MUST throw, not return a typed
    // result: there's no sensible "domain" meaning for a position this
    // large, only a broken invariant somewhere upstream.
    throw new Error(
      `priceQuantityToMoney overflow: ${price} * ${quantity} exceeds Number.MAX_SAFE_INTEGER after rescaling`,
    );
  }

  return Number(rounded) as MoneyUnits;
}
