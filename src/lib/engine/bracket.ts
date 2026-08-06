import { computeCommission } from "./commission";
import { computeSlippageOffset } from "./slippage";
import {
  ENGINE_VERSION,
  type BracketOrder,
  type BracketResult,
  type EngineBar,
  type EngineConfig,
  type PriceUnits,
} from "./types";

function isStopTouched(
  direction: "long" | "short",
  stopPrice: PriceUnits,
  bar: EngineBar,
): boolean {
  // Long: stop sits below entry, protecting against a fall -> touched if
  // the bar's low reaches down to it. Short: stop sits above entry,
  // protecting against a rise -> touched if the bar's high reaches up.
  return direction === "long" ? bar.low <= stopPrice : bar.high >= stopPrice;
}

function isTargetTouched(
  direction: "long" | "short",
  targetPrice: PriceUnits,
  bar: EngineBar,
): boolean {
  // Long: target sits above entry -> touched if the bar's high reaches it.
  // Short: target sits below entry -> touched if the bar's low reaches it.
  return direction === "long"
    ? bar.high >= targetPrice
    : bar.low <= targetPrice;
}

/**
 * RISKS R-3 / ADR-007: resolves one bar against an open bracket (stop-loss
 * + take-profit). Three possible outcomes:
 *
 * - `none` — neither level touched this bar, the position stays open.
 * - `target` — only the target touched. Fills at EXACTLY the target price,
 *   no slippage — a take-profit is functionally a limit order (see
 *   limit-fill.ts for why that means no price improvement either).
 * - `stop` — the stop touched (whether or not the target ALSO touched).
 *   Fills like a triggered market order: stop price adjusted by slippage,
 *   against the trader, same as stop-fill.ts.
 *
 * The bar-path ambiguity case is exactly "both touched in the same bar" —
 * genuinely undecidable from OHLC data (see this module's caller-facing
 * docs / the plain-language walkthrough). Resolving it as `stop` isn't a
 * separate code path from a clean stop-out; it's the same `stop` outcome,
 * just with `resolutionAmbiguous` set to true so the uncertainty is
 * recorded, never hidden.
 */
export function resolveBracket(
  order: BracketOrder,
  bar: EngineBar,
  config: EngineConfig,
): BracketResult {
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

  const validBracket =
    order.direction === "long"
      ? order.stopPrice < order.targetPrice
      : order.stopPrice > order.targetPrice;
  if (!validBracket) {
    return {
      ok: false,
      error: {
        code: "INVALID_BRACKET",
        message: `For a ${order.direction} position, stopPrice must be ${order.direction === "long" ? "below" : "above"} targetPrice.`,
      },
      engineVersion: ENGINE_VERSION,
    };
  }

  const stopTouched = isStopTouched(order.direction, order.stopPrice, bar);
  const targetTouched = isTargetTouched(
    order.direction,
    order.targetPrice,
    bar,
  );

  if (!stopTouched && !targetTouched) {
    return { ok: true, outcome: "none", engineVersion: ENGINE_VERSION };
  }

  const commission = computeCommission(order.quantity, config.commission);

  if (stopTouched) {
    // Covers both the clean stop-out (targetTouched === false) and the
    // ambiguous case (targetTouched === true) — identical fill math
    // either way, only the flag differs.
    const slippage = computeSlippageOffset(order.stopPrice, config.slippage);
    // Closing a long = selling (adverse = price pushed down). Closing a
    // short = buying back (adverse = price pushed up).
    const fillPrice = (
      order.direction === "long"
        ? order.stopPrice - slippage
        : order.stopPrice + slippage
    ) as PriceUnits;

    return {
      ok: true,
      outcome: "stop",
      fillPrice,
      commission,
      slippage,
      resolutionAmbiguous: targetTouched,
      engineVersion: ENGINE_VERSION,
    };
  }

  // Only the target touched.
  return {
    ok: true,
    outcome: "target",
    fillPrice: order.targetPrice,
    commission,
    engineVersion: ENGINE_VERSION,
  };
}
