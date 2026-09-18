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
    return { pendingOrder: null, position: null, closedTrade: null, error: normalized.error };
  }
  if (!normalized.fill.filled) {
    return unchanged({ pendingOrder, position: null });
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
    return { pendingOrder: null, position: null, closedTrade: null, error: opened.error };
  }
  return { pendingOrder: null, position: opened.position, closedTrade: null, error: null };
}

/**
 * Checks an open position's COMPLETE bracket (both a planned stop-loss AND
 * target — `resolveBracket` has no meaning for just one leg) against the
 * revealed bar, including the bar-path ambiguity rule (RISKS R-3). A hit
 * fully closes the position via Session 1's `fullyClosePosition`. A
 * position with no bracket, or only one leg of one, is untouched here —
 * there's nothing to check it against (README: known limitation).
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
    return { pendingOrder: null, position, closedTrade: null, error: bracketResult.error };
  }
  if (bracketResult.outcome === "none") {
    return unchanged({ pendingOrder: null, position });
  }

  const fill: PositionFill = {
    fillPrice: bracketResult.fillPrice,
    quantity: position.quantity,
    commission: bracketResult.commission,
  };
  const closeResult = fullyClosePosition({ position, fill });

  if (!closeResult.ok) {
    // Covers both fullyClosePosition's own quantity checks AND a bubbled
    // INVALID_STOP from Session 1's closePosition (position.ts flattens
    // closePosition's own `ok: false` into fullyClosePosition's outer
    // `ok: false` -- see its final few lines) -- e.g. a position whose
    // plannedStopPrice ended up on the wrong side of entry (TD-08 is the
    // real-world way that happens: an add-to that doesn't re-validate a
    // carried-over stop).
    return { pendingOrder: null, position, closedTrade: null, error: closeResult.error };
  }
  // `closeResult.closed`'s TYPE is still the full ClosedPositionResult
  // union (ok: true | ok: false) -- TypeScript has no way to know
  // fullyClosePosition's own implementation already guarantees `ok: true`
  // here (it flattens any closePosition failure into the outer `ok: false`
  // checked above). Provably unreachable at runtime, required only to
  // satisfy the type checker -- same category as cursor.ts's
  // noUncheckedIndexedAccess-driven checks.
  /* v8 ignore next 3 */
  if (!closeResult.closed.ok) {
    return { pendingOrder: null, position, closedTrade: null, error: closeResult.closed.error };
  }
  return { pendingOrder: null, position: null, closedTrade: closeResult.closed, error: null };
}

/**
 * Runs one revealed bar against the simulator's current pending order /
 * open position (M-9 Session 3, ADR-007). Exactly one of two things can
 * happen per bar, never both:
 *
 * - A pending order attempts to fill (reuses `/lib/engine`'s fill
 *   functions — never re-derives fill math). A freshly-filled order
 *   becomes an open position; that position's bracket is NOT checked
 *   against the same bar it just opened on. A daily bar's OHLC has no
 *   sub-bar ordering information, so there is no honest way to say
 *   whether the entry happened before or after a stop/target level was
 *   touched within that same bar — checking it would be inventing
 *   precision the data doesn't have, the same reasoning RISKS R-3 already
 *   applies to bar-path ambiguity. Bracket-checking starts on the NEXT
 *   revealed bar.
 * - An already-open position with a complete bracket is checked against
 *   `resolveBracket`. A hit fully closes it.
 *
 * Re-visited bars (stepping back then forward again) don't double-fill or
 * double-close: a fill clears `pendingOrder`, so re-processing the same
 * bar with nothing pending is a no-op; an unfilled/no-outcome check is
 * idempotent (pure function, same bar in -> same "nothing happened" out).
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
  if (
    position &&
    position.plannedStopPrice !== undefined &&
    position.plannedTargetPrice !== undefined
  ) {
    return tryResolveBracket(
      { ...position, plannedStopPrice: position.plannedStopPrice, plannedTargetPrice: position.plannedTargetPrice },
      bar,
      config,
    );
  }

  return unchanged(state);
}
