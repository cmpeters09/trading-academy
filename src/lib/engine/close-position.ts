import {
  ENGINE_VERSION,
  type ClosedPosition,
  type ClosedPositionResult,
  type MoneyUnits,
  type PriceUnits,
} from "./types";
import { priceQuantityToMoney } from "./units";

/**
 * Realized PnL and R-multiple for a completed round-trip.
 *
 * Gross PnL uses the ACTUAL fill prices (already slippage-adjusted by
 * whichever fill function produced them) — a long profits when the exit
 * price is above the entry, a short profits when it's below. Net PnL
 * subtracts both legs' commission. Both go through priceQuantityToMoney
 * (units.ts) for the one multiply each needs, never a second multiply
 * helper.
 *
 * R-multiple divides net PnL by the planned risk (entry-to-stop distance
 * x quantity, using the ACTUAL entry fill but the PLANNED stop — your risk
 * is measured from where you really got in to where you decided you'd get
 * out if wrong). This is the one place in the engine that produces a plain
 * float on purpose: R-multiple is a ratio, not a money amount, and
 * dividing two MoneyUnits integers of the same scale cancels the scale out
 * exactly. It's the same kind of single, non-compounding boundary
 * conversion as fromMoneyUnits — nothing downstream does further
 * arithmetic on it.
 */
export function closePosition(position: ClosedPosition): ClosedPositionResult {
  if (position.quantity <= 0) {
    return {
      ok: false,
      error: {
        code: "INVALID_QUANTITY",
        message: "Position quantity must be greater than zero.",
      },
      engineVersion: ENGINE_VERSION,
    };
  }

  const priceDelta = (
    position.direction === "long"
      ? position.exitFillPrice - position.entryFillPrice
      : position.entryFillPrice - position.exitFillPrice
  ) as PriceUnits;
  const grossPnl = priceQuantityToMoney(priceDelta, position.quantity);

  const fees = (position.entryCommission +
    position.exitCommission) as MoneyUnits;
  const netPnl = (grossPnl - fees) as MoneyUnits;

  if (position.plannedStopPrice === undefined) {
    return {
      ok: true,
      grossPnl,
      fees,
      netPnl,
      rMultiple: null,
      engineVersion: ENGINE_VERSION,
    };
  }

  const riskPriceDelta = (
    position.direction === "long"
      ? position.entryFillPrice - position.plannedStopPrice
      : position.plannedStopPrice - position.entryFillPrice
  ) as PriceUnits;

  if (riskPriceDelta <= 0) {
    return {
      ok: false,
      error: {
        code: "INVALID_STOP",
        message: `plannedStopPrice must be on the risk side of entryFillPrice for a ${position.direction} position.`,
      },
      engineVersion: ENGINE_VERSION,
    };
  }

  const plannedRisk = priceQuantityToMoney(riskPriceDelta, position.quantity);
  const rMultiple = netPnl / plannedRisk;

  return {
    ok: true,
    grossPnl,
    fees,
    netPnl,
    rMultiple,
    engineVersion: ENGINE_VERSION,
  };
}
