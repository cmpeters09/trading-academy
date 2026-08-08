import { computeCommission } from "./commission";
import {
  ENGINE_VERSION,
  type EngineBar,
  type EngineConfig,
  type EngineOrder,
  type LimitFillResult,
} from "./types";

/**
 * ADR-007: a limit order fills at EXACTLY its limit price — never better —
 * when the bar's range touches that price. Real markets sometimes give
 * "price improvement" (a buy limit at $150 filled at $148 because the
 * market gapped down), but knowing whether that would have happened needs
 * intra-bar detail a daily candle doesn't have (the same information gap
 * behind bar-path ambiguity, RISKS R-3). Rather than optimistically assume
 * improvement the data can't prove, v1 assumes none — the same "resolve
 * against the trader when genuinely uncertain" rule as everywhere else in
 * this engine. No slippage: a limit order's whole purpose is a price
 * guarantee, so unlike a market or triggered-stop fill, none applies.
 *
 * "Touch" is inclusive: a bar that reaches exactly the limit price counts.
 *
 * - Buy limit: you're trying to buy AT OR BELOW your price, so it
 *   triggers when the bar's LOW reaches down to (or through) that level.
 * - Sell limit: trying to sell AT OR ABOVE your price, triggers when the
 *   bar's HIGH reaches up to (or through) that level.
 */
export function fillLimitOrder(
  order: EngineOrder,
  bar: EngineBar,
  config: EngineConfig,
): LimitFillResult {
  if (order.type !== "limit") {
    return {
      ok: false,
      error: {
        code: "INVALID_ORDER_TYPE",
        message: `fillLimitOrder only accepts limit orders, received "${order.type}".`,
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

  if (order.limitPrice === undefined) {
    return {
      ok: false,
      error: {
        code: "MISSING_LIMIT_PRICE",
        message: "A limit order requires a limitPrice.",
      },
      engineVersion: ENGINE_VERSION,
    };
  }

  const limitPrice = order.limitPrice;
  const touched =
    order.side === "buy" ? bar.low <= limitPrice : bar.high >= limitPrice;

  if (!touched) {
    return {
      ok: true,
      status: "unfilled",
      reason: "limit_not_touched",
      engineVersion: ENGINE_VERSION,
    };
  }

  const commission = computeCommission(order.quantity, config.commission);
  return {
    ok: true,
    status: "filled",
    fillPrice: limitPrice,
    commission,
    engineVersion: ENGINE_VERSION,
  };
}
