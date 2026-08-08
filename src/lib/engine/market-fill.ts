import { computeCommission } from "./commission";
import { computeSlippageOffset } from "./slippage";
import {
  ENGINE_VERSION,
  type EngineBar,
  type EngineConfig,
  type EngineOrder,
  type MarketFillResult,
  type PriceUnits,
} from "./types";

/**
 * ADR-007: market orders fill at the next bar's open, adjusted against the
 * trader by slippage. Market orders always fill (that's the definition —
 * unlike a limit/stop, there's no "wasn't touched" outcome), so the only
 * `ok: false` cases here are malformed input, never a market condition.
 *
 * Deliberately takes no `state` (current position) parameter, unlike the
 * engine's general (state, order, bar, config) → result shape: a market
 * fill's price/commission don't depend on what position you're already
 * holding. `state` starts mattering in the bracket-exit/PnL sessions.
 */
export function fillMarketOrder(
  order: EngineOrder,
  bar: EngineBar,
  config: EngineConfig,
): MarketFillResult {
  if (order.type !== "market") {
    return {
      ok: false,
      error: {
        code: "INVALID_ORDER_TYPE",
        message: `fillMarketOrder only accepts market orders, received "${order.type}".`,
      },
      engineVersion: ENGINE_VERSION,
    };
  }

  if (order.quantity <= 0) {
    return {
      ok: false,
      error: {
        code: "INVALID_QUANTITY",
        message: "Order quantity must be greater than zero.",
      },
      engineVersion: ENGINE_VERSION,
    };
  }

  const basePrice = bar.open;
  const slippage = computeSlippageOffset(basePrice, config.slippage);
  const fillPrice = (
    order.side === "buy" ? basePrice + slippage : basePrice - slippage
  ) as PriceUnits;
  const commission = computeCommission(order.quantity, config.commission);

  return {
    ok: true,
    fillPrice,
    commission,
    slippage,
    engineVersion: ENGINE_VERSION,
  };
}
