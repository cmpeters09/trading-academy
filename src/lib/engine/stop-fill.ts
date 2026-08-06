import { computeCommission } from "./commission";
import { computeSlippageOffset } from "./slippage";
import {
  ENGINE_VERSION,
  type EngineBar,
  type EngineConfig,
  type EngineOrder,
  type PriceUnits,
  type StopFillResult,
} from "./types";

/**
 * ADR-007: once a stop is triggered, it behaves exactly like a market
 * order — that's the definition of a stop, not a price guarantee like a
 * limit — so it fills at the stop price adjusted by slippage, same
 * direction/logic as fillMarketOrder. Stops often trigger during fast-
 * moving conditions (breakouts, panics), which is exactly when real-world
 * slippage tends to be worst, so giving a stop a clean exact fill would be
 * modeling something that isn't really a stop order.
 *
 * "Touch" is inclusive, same as limit orders.
 *
 * - Buy stop: triggers when price rises TO OR ABOVE the stop (a breakout
 *   entry, or covering a short) — checked against the bar's HIGH.
 * - Sell stop: triggers when price falls TO OR BELOW the stop (a stop-loss
 *   on a long, or a breakdown entry short) — checked against the bar's LOW.
 */
export function fillStopOrder(
  order: EngineOrder,
  bar: EngineBar,
  config: EngineConfig,
): StopFillResult {
  if (order.type !== "stop") {
    return {
      ok: false,
      error: {
        code: "INVALID_ORDER_TYPE",
        message: `fillStopOrder only accepts stop orders, received "${order.type}".`,
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

  if (order.stopPrice === undefined) {
    return {
      ok: false,
      error: {
        code: "MISSING_STOP_PRICE",
        message: "A stop order requires a stopPrice.",
      },
      engineVersion: ENGINE_VERSION,
    };
  }

  const stopPrice = order.stopPrice;
  const touched =
    order.side === "buy" ? bar.high >= stopPrice : bar.low <= stopPrice;

  if (!touched) {
    return {
      ok: true,
      status: "unfilled",
      reason: "stop_not_touched",
      engineVersion: ENGINE_VERSION,
    };
  }

  const slippage = computeSlippageOffset(stopPrice, config.slippage);
  const fillPrice = (
    order.side === "buy" ? stopPrice + slippage : stopPrice - slippage
  ) as PriceUnits;
  const commission = computeCommission(order.quantity, config.commission);

  return {
    ok: true,
    status: "filled",
    fillPrice,
    slippage,
    commission,
    engineVersion: ENGINE_VERSION,
  };
}
