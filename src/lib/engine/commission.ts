import type { CommissionConfig, MoneyUnits, QuantityUnits } from "./types";
import { priceQuantityToMoney } from "./units";

/**
 * `per_unit` reuses `priceQuantityToMoney` directly — a commission rate
 * ("$0.005 per share") is mathematically identical to a price ("$0.005"),
 * multiplied by the same quantity every PnL calculation uses. No second,
 * separately-tested multiply helper.
 */
export function computeCommission(
  quantity: QuantityUnits,
  config: CommissionConfig,
): MoneyUnits {
  if (config.model === "flat") {
    return config.value;
  }
  return priceQuantityToMoney(config.ratePerUnit, quantity);
}
