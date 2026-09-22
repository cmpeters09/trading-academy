import type { MoneyUnits, PriceUnits } from "@/lib/engine/types";
import { priceQuantityToMoney } from "@/lib/engine/units";

import type { OpenPosition } from "./types";

export type UnrealizedPnl = {
  grossPnl: MoneyUnits;
  rMultiple: number | null;
};

/**
 * Mark-to-market PnL/R for a still-open position (Session 4, GLOSSARY.md
 * "R / R-multiple") -- same gross-PnL formula as Session 1's
 * `closePosition` (`priceQuantityToMoney` on the price delta, never a
 * second multiply helper), but against `currentPrice` (the latest
 * revealed bar's close) instead of a real exit fill, and with NO
 * commission subtracted -- nothing has actually been paid to exit yet.
 * This is deliberately GROSS, not an estimate of net (Q3): showing a
 * number that includes a guessed exit fee would be less honest than
 * showing the real number labeled for what it omits. Callers must label
 * it "before exit costs" (`PositionPanel` does).
 *
 * `rMultiple` is `null` when there's no planned stop to measure against
 * (same convention as `closePosition`), AND when a planned stop happens
 * to sit on the wrong side of entry -- no longer reachable through normal
 * use since TD-08 was paid (`openPosition`/`addToPosition` both now
 * reject a stop on the wrong side of entry before a position can hold
 * one), but this is display-only math, not a domain result that can
 * reject anything (§7 class 1), so the defensive branch stays: it reports
 * "no meaningful R" rather than a nonsensical or inverted ratio for
 * whatever position it's handed, instead of trusting the caller.
 */
export function computeUnrealizedPnl(
  position: OpenPosition,
  currentPrice: PriceUnits,
): UnrealizedPnl {
  const priceDelta = (
    position.direction === "long"
      ? currentPrice - position.entryPrice
      : position.entryPrice - currentPrice
  ) as PriceUnits;
  const grossPnl = priceQuantityToMoney(priceDelta, position.quantity);

  if (position.plannedStopPrice === undefined) {
    return { grossPnl, rMultiple: null };
  }

  const riskPriceDelta = (
    position.direction === "long"
      ? position.entryPrice - position.plannedStopPrice
      : position.plannedStopPrice - position.entryPrice
  ) as PriceUnits;

  if (riskPriceDelta <= 0) {
    return { grossPnl, rMultiple: null };
  }

  const plannedRisk = priceQuantityToMoney(riskPriceDelta, position.quantity);

  return { grossPnl, rMultiple: grossPnl / plannedRisk };
}
