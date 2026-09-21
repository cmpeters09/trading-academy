import { resolveBracket } from "@/lib/engine/bracket";
import { fillLimitOrder } from "@/lib/engine/limit-fill";
import { fillMarketOrder } from "@/lib/engine/market-fill";
import { fillStopOrder } from "@/lib/engine/stop-fill";
import type {
  BracketOrder,
  ClosedPositionResult,
  EngineBar,
  EngineConfig,
  EngineError,
  EngineOrder,
  LimitFillResult,
  MarketFillResult,
  MoneyUnits,
  PriceUnits,
  StopFillResult,
} from "@/lib/engine/types";

import { fullyClosePosition, openPosition } from "./position";
import { toEngineOrder } from "./to-engine-order";
import type { OpenPosition, PositionFill } from "./types";
import type { OrderTicketSubmission } from "./order-ticket-schema";

export type SimulatorBarState = {
  pendingOrder: OrderTicketSubmission | null;
  position: OpenPosition | null;
  /**
   * TD-10's manual close, queued the same way an entry order is: set by a
   * store action when the user clicks "Close position," consumed on the
   * NEXT revealed bar as a market fill at that bar's open -- never the
   * bar showing when the button was clicked, same lookahead-bias
   * reasoning as every other fill in this module. `processBar` is the
   * only thing that ever turns this back to `false`; it never sets it
   * `true` itself.
   */
  closeRequested: boolean;
};

/** A completed round-trip that priced successfully — never the `ok: false` half of `ClosedPositionResult`. */
export type ClosedTrade = Extract<ClosedPositionResult, { ok: true }>;

export type ProcessBarResult = SimulatorBarState & {
  /** The trade that closed on THIS bar, or `null` if nothing closed. */
  closedTrade: ClosedTrade | null;
  /** A domain rejection surfaced from the engine/reducer (§7), or `null`. */
  error: EngineError | null;
};

type NormalizedFill =
  | { filled: false }
  | {
      filled: true;
      fillPrice: PriceUnits;
      commission: MoneyUnits;
      engineVersion: string;
    };

/**
 * `MarketFillResult` has no `status` field (a market order always fills —
 * that IS the definition); `LimitFillResult`/`StopFillResult` do
 * (`"filled" | "unfilled"`). This is the one place that difference gets
 * collapsed into a single filled/not-filled question. Carries
 * `engineVersion` along on a fill so the caller never needs to re-run the
 * fill function just to read it back off.
 */
function normalizeFillResult(
  result: MarketFillResult | LimitFillResult | StopFillResult,
): { ok: true; fill: NormalizedFill } | { ok: false; error: EngineError } {
  if (!result.ok) return { ok: false, error: result.error };
  if (!("status" in result) || result.status === "filled") {
    return {
      ok: true,
      fill: {
        filled: true,
        fillPrice: result.fillPrice,
        commission: result.commission,
        engineVersion: result.engineVersion,
      },
    };
  }
  return { ok: true, fill: { filled: false } };
}

function fillPendingOrder(
  order: EngineOrder,
  bar: EngineBar,
  config: EngineConfig,
): MarketFillResult | LimitFillResult | StopFillResult {
  switch (order.type) {
    case "market":
      return fillMarketOrder(order, bar, config);
    case "limit":
      return fillLimitOrder(order, bar, config);
    case "stop":
      return fillStopOrder(order, bar, config);
    // orderTicketSchema's z.enum(["market","limit","stop"]) makes this
    // default case provably unreachable today -- required only so a
    // future order type added to EngineOrder's union fails to compile
    // here (§9) instead of silently falling through to `undefined`.
    /* v8 ignore start */
    default: {
      const exhaustive: never = order.type;
      throw new Error(`Unhandled order type: ${String(exhaustive)}`);
    }
    /* v8 ignore stop */
  }
}

function unchanged(state: SimulatorBarState): ProcessBarResult {
  return { ...state, closedTrade: null, error: null };
}

/**
 * Attempts to fill `state.pendingOrder` against the just-revealed `bar`.
 * Only reachable when there's a pending order and no open position yet
 * (`processBar` below is what enforces that) — a filled order becomes an
 * open position via Session 1's `openPosition`; an unfilled limit/stop
 * order stays pending, unchanged, for the next bar. No same-bar bracket
 * check happens on the bar a position just opened on (see this module's
 * top-level doc comment for why).
 */
function tryFillPendingOrder(
  pendingOrder: OrderTicketSubmission,
  bar: EngineBar,
  config: EngineConfig,
): ProcessBarResult {
  const engineOrder = toEngineOrder(pendingOrder);
  const normalized = normalizeFillResult(fillPendingOrder(engineOrder, bar, config));

  if (!normalized.ok) {
    // A structurally invalid order (shouldn't happen given orderTicketSchema's
    // own validation, but the engine is the authority, not the client form) —
    // drop it rather than leave a dead order pending forever; surface why.
    return {
      pendingOrder: null,
      position: null,
      closeRequested: false,
      closedTrade: null,
      error: normalized.error,
    };
  }
  if (!normalized.fill.filled) {
    return unchanged({ pendingOrder, position: null, closeRequested: false });
  }

  const fill: PositionFill = {
    fillPrice: normalized.fill.fillPrice,
    quantity: engineOrder.quantity,
    commission: normalized.fill.commission,
  };
  const opened = openPosition({
    direction: pendingOrder.direction,
    fill,
    engineVersion: normalized.fill.engineVersion,
    ...(pendingOrder.plannedStopPrice !== undefined
      ? { plannedStopPrice: pendingOrder.plannedStopPrice }
      : {}),
    ...(pendingOrder.plannedTargetPrice !== undefined
      ? { plannedTargetPrice: pendingOrder.plannedTargetPrice }
      : {}),
  });

  if (!opened.ok) {
    return {
      pendingOrder: null,
      position: null,
      closeRequested: false,
      closedTrade: null,
      error: opened.error,
    };
  }
  return {
    pendingOrder: null,
    position: opened.position,
    closeRequested: false,
    closedTrade: null,
    error: null,
  };
}

/**
 * Finishes closing `position` against an already-computed exit `fill` --
 * shared by every way a position can close (complete bracket, single-leg
 * exit, manual close). Never called with a fill the caller hasn't already
 * decided is real; this function's only job is applying Session 1's
 * `fullyClosePosition` and unwrapping its double-nested result correctly.
 */
function finishClose(position: OpenPosition, fill: PositionFill): ProcessBarResult {
  const closeResult = fullyClosePosition({ position, fill });

  if (!closeResult.ok) {
    // Covers both fullyClosePosition's own quantity checks AND a bubbled
    // INVALID_STOP from Session 1's closePosition (position.ts flattens
    // closePosition's own `ok: false` into fullyClosePosition's outer
    // `ok: false` -- see its final few lines) -- e.g. a position whose
    // plannedStopPrice ended up on the wrong side of entry (TD-08 is the
    // real-world way that happens: an add-to that doesn't re-validate a
    // carried-over stop).
    return {
      pendingOrder: null,
      position,
      closeRequested: false,
      closedTrade: null,
      error: closeResult.error,
    };
  }
  // `closeResult.closed`'s TYPE is still the full ClosedPositionResult
  // union (ok: true | ok: false) -- TypeScript has no way to know
  // fullyClosePosition's own implementation already guarantees `ok: true`
  // here (it flattens any closePosition failure into the outer `ok: false`
  // checked above). Provably unreachable at runtime, required only to
  // satisfy the type checker -- same category as cursor.ts's
  // noUncheckedIndexedAccess-driven checks.
  /* v8 ignore next 8 */
  if (!closeResult.closed.ok) {
    return {
      pendingOrder: null,
      position,
      closeRequested: false,
      closedTrade: null,
      error: closeResult.closed.error,
    };
  }
  return {
    pendingOrder: null,
    position: null,
    closeRequested: false,
    closedTrade: closeResult.closed,
    error: null,
  };
}

/**
 * The side that CLOSES a position -- always the opposite of the side that
 * opened it. Opening a long is a buy, so closing one is a sell; opening a
 * short is a sell, so closing one is a buy. Every exit path below
 * (bracket, single-leg, manual) uses this.
 */
function closingSide(direction: "long" | "short"): "buy" | "sell" {
  return direction === "long" ? "sell" : "buy";
}

/**
 * Checks an open position's COMPLETE bracket (both a planned stop-loss AND
 * target — `resolveBracket` has no meaning for just one leg) against the
 * revealed bar, including the bar-path ambiguity rule (RISKS R-3). A hit
 * fully closes the position via `finishClose`.
 */
function tryResolveBracket(
  position: OpenPosition & {
    plannedStopPrice: PriceUnits;
    plannedTargetPrice: PriceUnits;
  },
  bar: EngineBar,
  config: EngineConfig,
): ProcessBarResult {
  const bracketOrder: BracketOrder = {
    direction: position.direction,
    quantity: position.quantity,
    stopPrice: position.plannedStopPrice,
    targetPrice: position.plannedTargetPrice,
  };
  const bracketResult = resolveBracket(bracketOrder, bar, config);

  if (!bracketResult.ok) {
    return {
      pendingOrder: null,
      position,
      closeRequested: false,
      closedTrade: null,
      error: bracketResult.error,
    };
  }
  if (bracketResult.outcome === "none") {
    return unchanged({ pendingOrder: null, position, closeRequested: false });
  }

  return finishClose(position, {
    fillPrice: bracketResult.fillPrice,
    quantity: position.quantity,
    commission: bracketResult.commission,
  });
}

/**
 * TD-10: a position with ONLY a planned stop-loss (no target) never
 * reaches `resolveBracket` (it needs both legs) -- so it never auto-exits
 * unless checked directly. A stop-loss exit is, by definition, exactly
 * what a triggered stop order already is: `fillStopOrder` (the same
 * function a stop ENTRY order uses) does the identical touch-check and
 * fill-price-with-slippage math for a stop EXIT, given the closing side
 * (`closingSide`) instead of the entry side -- reusing the engine's real
 * primitive, not faking a second bracket leg to force `resolveBracket` to
 * accept it.
 */
function tryExitOnStopOnly(
  position: OpenPosition & { plannedStopPrice: PriceUnits },
  bar: EngineBar,
  config: EngineConfig,
): ProcessBarResult {
  const closingOrder: EngineOrder = {
    side: closingSide(position.direction),
    type: "stop",
    quantity: position.quantity,
    stopPrice: position.plannedStopPrice,
  };
  const fillResult = fillStopOrder(closingOrder, bar, config);

  if (!fillResult.ok) {
    return {
      pendingOrder: null,
      position,
      closeRequested: false,
      closedTrade: null,
      error: fillResult.error,
    };
  }
  if (fillResult.status === "unfilled") {
    return unchanged({ pendingOrder: null, position, closeRequested: false });
  }

  return finishClose(position, {
    fillPrice: fillResult.fillPrice,
    quantity: position.quantity,
    commission: fillResult.commission,
  });
}

/**
 * TD-10's other single-leg case: only a planned target (no stop). A
 * target exit is exactly what a limit order already is -- fills at
 * EXACTLY the target price on touch, no slippage (same reasoning
 * `fillLimitOrder` already documents for why a limit fill gets no price
 * improvement). Same `fillStopOrder`-reuse principle as
 * `tryExitOnStopOnly`, just the limit primitive instead of the stop one.
 */
function tryExitOnTargetOnly(
  position: OpenPosition & { plannedTargetPrice: PriceUnits },
  bar: EngineBar,
  config: EngineConfig,
): ProcessBarResult {
  const closingOrder: EngineOrder = {
    side: closingSide(position.direction),
    type: "limit",
    quantity: position.quantity,
    limitPrice: position.plannedTargetPrice,
  };
  const fillResult = fillLimitOrder(closingOrder, bar, config);

  if (!fillResult.ok) {
    return {
      pendingOrder: null,
      position,
      closeRequested: false,
      closedTrade: null,
      error: fillResult.error,
    };
  }
  if (fillResult.status === "unfilled") {
    return unchanged({ pendingOrder: null, position, closeRequested: false });
  }

  return finishClose(position, {
    fillPrice: fillResult.fillPrice,
    quantity: position.quantity,
    commission: fillResult.commission,
  });
}

/**
 * TD-10's manual close. Queued the same way an entry order is (see
 * `SimulatorBarState.closeRequested`'s doc comment): a market fill at
 * THIS revealed bar's open, using `fillMarketOrder` -- the exact same
 * function/math a market ENTRY order uses, just with the closing side.
 * Takes priority over any bracket/single-leg check on the same bar
 * (`processBar` enforces the ordering) -- the trader explicitly asked to
 * exit; a resting stop/target shouldn't silently override that.
 */
function tryCloseAtMarket(
  position: OpenPosition,
  bar: EngineBar,
  config: EngineConfig,
): ProcessBarResult {
  const closingOrder: EngineOrder = {
    side: closingSide(position.direction),
    type: "market",
    quantity: position.quantity,
  };
  const fillResult = fillMarketOrder(closingOrder, bar, config);

  if (!fillResult.ok) {
    return {
      pendingOrder: null,
      position,
      closeRequested: false,
      closedTrade: null,
      error: fillResult.error,
    };
  }

  return finishClose(position, {
    fillPrice: fillResult.fillPrice,
    quantity: position.quantity,
    commission: fillResult.commission,
  });
}

/**
 * Runs one revealed bar against the simulator's current pending order /
 * open position (M-9 Session 3, ADR-007; TD-10's manual close and
 * single-leg exits added Session 4). Exactly one thing can happen per
 * bar, never more than one:
 *
 * 1. A pending order attempts to fill (reuses `/lib/engine`'s fill
 *    functions — never re-derives fill math). A freshly-filled order
 *    becomes an open position; that position's exits are NOT checked
 *    against the same bar it just opened on. A daily bar's OHLC has no
 *    sub-bar ordering information, so there is no honest way to say
 *    whether the entry happened before or after an exit level was
 *    touched within that same bar — checking it would be inventing
 *    precision the data doesn't have, the same reasoning RISKS R-3
 *    already applies to bar-path ambiguity. Exit-checking starts on the
 *    NEXT revealed bar.
 * 2. A manual close request (TD-10) takes priority over anything else an
 *    open position might do this bar — fills at THIS bar's open, like an
 *    entry.
 * 3. Otherwise, an open position's planned stop/target (if any) are
 *    checked: both legs via `resolveBracket` (bar-path ambiguity, RISKS
 *    R-3), or just one leg (TD-10) via the matching single fill
 *    primitive (`fillStopOrder`/`fillLimitOrder`) when only one is set.
 *    A position with neither set simply stays open — nothing to check it
 *    against.
 *
 * Re-visited bars (stepping back then forward again) don't double-fill or
 * double-close: a fill/close clears `pendingOrder`/`closeRequested`, so
 * re-processing the same bar with nothing pending or requested is a
 * no-op; an unfilled/no-outcome check is idempotent (pure function, same
 * bar in -> same "nothing happened" out).
 */
export function processBar(
  state: SimulatorBarState,
  bar: EngineBar,
  config: EngineConfig,
): ProcessBarResult {
  if (state.pendingOrder && !state.position) {
    return tryFillPendingOrder(state.pendingOrder, bar, config);
  }

  const { position } = state;
  if (!position) {
    return unchanged(state);
  }

  if (state.closeRequested) {
    return tryCloseAtMarket(position, bar, config);
  }

  if (position.plannedStopPrice !== undefined && position.plannedTargetPrice !== undefined) {
    return tryResolveBracket(
      { ...position, plannedStopPrice: position.plannedStopPrice, plannedTargetPrice: position.plannedTargetPrice },
      bar,
      config,
    );
  }
  if (position.plannedStopPrice !== undefined) {
    return tryExitOnStopOnly(
      { ...position, plannedStopPrice: position.plannedStopPrice },
      bar,
      config,
    );
  }
  if (position.plannedTargetPrice !== undefined) {
    return tryExitOnTargetOnly(
      { ...position, plannedTargetPrice: position.plannedTargetPrice },
      bar,
      config,
    );
  }

  return unchanged(state);
}
