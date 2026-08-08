import type { PriceUnits, SlippageConfig } from "./types";

/**
 * Returns the UNSIGNED magnitude of the price offset slippage causes.
 * Callers apply the direction — add for a buy (you pay more), subtract for
 * a sell (you receive less) — always against the trader, never in their
 * favor (ADR-007), the same conservative philosophy as the bar-path
 * ambiguity rule (RISKS R-3).
 *
 * `fixed_bps` math stays in plain `number`, not BigInt: even at a generous
 * $1,000,000 price (10,000,000,000 PriceUnits) and 10,000 bps (100%
 * slippage — unrealistically large), the intermediate product is ~1e14,
 * far below Number.MAX_SAFE_INTEGER (~9.007e15). The overflow risk in
 * priceQuantityToMoney comes from QuantityUnits' 100,000,000 scale; `bps`
 * has no such large multiplier.
 */
export function computeSlippageOffset(
  basePrice: PriceUnits,
  config: SlippageConfig,
): PriceUnits {
  if (config.model === "fixed_amount") {
    return config.value;
  }

  // 1 bps = 1/10,000 of the price, e.g. 10 bps = 0.10%.
  return Math.round((basePrice * config.bps) / 10_000) as PriceUnits;
}
