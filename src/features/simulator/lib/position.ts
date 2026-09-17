import { closePosition } from "@/lib/engine/close-position";
import type { MoneyUnits, PriceUnits, QuantityUnits } from "@/lib/engine/types";

import { prorateMoney, weightedAverageEntryPrice } from "./position-math";
import type {
  AddToPositionInput,
  AddToPositionResult,
  ClosePositionInput,
  FullCloseResult,
  OpenPositionInput,
  OpenPositionResult,
  PartialCloseResult,
  PositionError,
} from "./types";

/**
 * Reducer-style state transitions for a single simulator position
 * (ENGINEERING_PRINCIPLES §5: Zustand-shaped ephemeral state until a later
 * session persists it — this module only computes the next state, it holds
 * none). Every function here is `(state, fill) -> result`, pure, and reuses
 * `/lib/engine`'s `closePosition` for the one thing it already does
 * correctly (realized PnL / R-multiple) rather than re-deriving it.
 *
 * Four transitions, matching the engine README's "known limitation" this
 * module exists to fill:
 * - `openPosition` — first fill establishes direction, entry price/
 *   commission, and (optionally) a planned stop/target.
 * - `addToPosition` — a same-direction fill increases size; entry price
 *   becomes the volume-weighted average of the old and new fills
 *   (`position-math.ts`), entry commission accumulates.
 * - `partiallyClosePosition` — an exit fill smaller than the open quantity.
 *   Realizes PnL/R for the closed slice only; the remaining position keeps
 *   its own fair share of entry commission (prorated by quantity), and
 *   nothing else about it changes.
 * - `fullyClosePosition` — an exit fill for exactly the open quantity.
 *   Realizes PnL/R for the whole position; there is no remaining position.
 */

function validateStop(
  direction: "long" | "short",
  entryPrice: PriceUnits,
  stopPrice: PriceUnits | undefined,
): PositionError | undefined {
  if (stopPrice === undefined) return undefined;

  // Long: a stop protects against price falling, so it must sit below
  // entry. Short: the reverse. Same rule `closePosition` itself enforces
  // (INVALID_STOP) -- checked here too so a bad stop is rejected at open
  // time, not only when the position is eventually closed.
  const validSide =
    direction === "long" ? stopPrice < entryPrice : stopPrice > entryPrice;
  if (validSide) return undefined;

  return {
    code: "INVALID_STOP",
    message: `plannedStopPrice must be ${direction === "long" ? "below" : "above"} the entry price for a ${direction} position.`,
  };
}

function validateTarget(
  direction: "long" | "short",
  entryPrice: PriceUnits,
  targetPrice: PriceUnits | undefined,
): PositionError | undefined {
  if (targetPrice === undefined) return undefined;

  // Long: a target sits above entry (that's the definition of profit-taking
  // on a rise). Short: below. Combined with validateStop, this also
  // guarantees stop and target can never cross for the side they're on --
  // for a long, stop < entry < target implies stop < target, with no
  // separate ordering check needed (bracket.ts's INVALID_BRACKET check,
  // implied here rather than duplicated).
  const validSide =
    direction === "long" ? targetPrice > entryPrice : targetPrice < entryPrice;
  if (validSide) return undefined;

  return {
    code: "INVALID_TARGET",
    message: `plannedTargetPrice must be ${direction === "long" ? "above" : "below"} the entry price for a ${direction} position.`,
  };
}

export function openPosition(input: OpenPositionInput): OpenPositionResult {
  if (input.fill.quantity <= 0) {
    return {
      ok: false,
      error: {
        code: "INVALID_QUANTITY",
        message: "Fill quantity must be greater than zero.",
      },
    };
  }

  const stopError = validateStop(
    input.direction,
    input.fill.fillPrice,
    input.plannedStopPrice,
  );
  if (stopError) return { ok: false, error: stopError };

  const targetError = validateTarget(
    input.direction,
    input.fill.fillPrice,
    input.plannedTargetPrice,
  );
  if (targetError) return { ok: false, error: targetError };

  return {
    ok: true,
    position: {
      direction: input.direction,
      entryPrice: input.fill.fillPrice,
      quantity: input.fill.quantity,
      entryCommission: input.fill.commission,
      entryEngineVersion: input.engineVersion,
      ...(input.plannedStopPrice !== undefined
        ? { plannedStopPrice: input.plannedStopPrice }
        : {}),
      ...(input.plannedTargetPrice !== undefined
        ? { plannedTargetPrice: input.plannedTargetPrice }
        : {}),
    },
  };
}

/**
 * Adds a same-direction fill to an already-open position. There is no
 * `direction` parameter -- a position's direction is fixed at
 * `openPosition` and adding more of the opposite side is a partial close,
 * not an add (`partiallyClosePosition`/`fullyClosePosition` below). Planned
 * stop/target are carried over unchanged; adjusting them is a separate
 * concern (order ticket UI, a later session) this reducer doesn't decide.
 */
export function addToPosition(input: AddToPositionInput): AddToPositionResult {
  const { position, fill } = input;

  if (fill.quantity <= 0) {
    return {
      ok: false,
      error: {
        code: "INVALID_QUANTITY",
        message: "Fill quantity must be greater than zero.",
      },
    };
  }

  const entryPrice = weightedAverageEntryPrice(
    { price: position.entryPrice, quantity: position.quantity },
    { price: fill.fillPrice, quantity: fill.quantity },
  );
  const quantity = (position.quantity + fill.quantity) as QuantityUnits;
  const entryCommission = (position.entryCommission +
    fill.commission) as MoneyUnits;

  return {
    ok: true,
    position: { ...position, entryPrice, quantity, entryCommission },
  };
}

/**
 * Closes part of an open position (`fill.quantity` strictly less than the
 * position's open quantity). The closed slice's entry commission is its
 * proportional share of the position's total accumulated entry commission
 * (`prorateMoney`); the remaining position keeps the rest, found by
 * subtraction so the two shares always sum back to the original with no
 * unit gained or lost (see `position-math.ts`'s doc comment on why not to
 * prorate twice). Realized PnL/R-multiple for the closed slice comes
 * straight from the engine's `closePosition` -- this function's only job is
 * assembling its inputs and bookkeeping what's left open.
 *
 * Can still reject with the engine's own `INVALID_STOP` (bubbled through
 * unchanged): a stop that was valid when the position opened can become
 * invalid after an `addToPosition` moves the weighted-average entry price
 * past it, since `addToPosition` doesn't re-validate the carried-over stop.
 * This is the point that surfaces it.
 */
export function partiallyClosePosition(
  input: ClosePositionInput,
): PartialCloseResult {
  const { position, fill } = input;

  if (fill.quantity <= 0) {
    return {
      ok: false,
      error: {
        code: "INVALID_QUANTITY",
        message: "Fill quantity must be greater than zero.",
      },
    };
  }
  if (fill.quantity >= position.quantity) {
    return {
      ok: false,
      error: {
        code: "NOT_A_PARTIAL_CLOSE",
        message:
          "Fill quantity must be less than the open position's quantity; use fullyClosePosition to close all of it.",
      },
    };
  }

  const closedEntryCommission = prorateMoney(
    position.entryCommission,
    fill.quantity,
    position.quantity,
  );
  const remainingEntryCommission = (position.entryCommission -
    closedEntryCommission) as MoneyUnits;
  const remainingQuantity = (position.quantity -
    fill.quantity) as QuantityUnits;

  const closed = closePosition({
    direction: position.direction,
    quantity: fill.quantity,
    entryFillPrice: position.entryPrice,
    entryCommission: closedEntryCommission,
    exitFillPrice: fill.fillPrice,
    exitCommission: fill.commission,
    ...(position.plannedStopPrice !== undefined
      ? { plannedStopPrice: position.plannedStopPrice }
      : {}),
  });
  if (!closed.ok) {
    return { ok: false, error: closed.error };
  }

  return {
    ok: true,
    remainingPosition: {
      ...position,
      quantity: remainingQuantity,
      entryCommission: remainingEntryCommission,
    },
    closed,
  };
}

/**
 * Closes an open position entirely (`fill.quantity` exactly equal to the
 * position's open quantity). All accumulated entry commission belongs to
 * this one closing fill -- no proration needed, unlike the partial case.
 * Can also bubble `INVALID_STOP` from the engine's `closePosition`, for the
 * same reason `partiallyClosePosition` can (see its doc comment).
 */
export function fullyClosePosition(input: ClosePositionInput): FullCloseResult {
  const { position, fill } = input;

  if (fill.quantity <= 0) {
    return {
      ok: false,
      error: {
        code: "INVALID_QUANTITY",
        message: "Fill quantity must be greater than zero.",
      },
    };
  }
  if (fill.quantity < position.quantity) {
    return {
      ok: false,
      error: {
        code: "NOT_A_FULL_CLOSE",
        message:
          "Fill quantity is less than the open position's quantity; use partiallyClosePosition to close only part of it.",
      },
    };
  }
  if (fill.quantity > position.quantity) {
    return {
      ok: false,
      error: {
        code: "QUANTITY_EXCEEDS_POSITION",
        message: "Fill quantity exceeds the open position's quantity.",
      },
    };
  }

  const closed = closePosition({
    direction: position.direction,
    quantity: fill.quantity,
    entryFillPrice: position.entryPrice,
    entryCommission: position.entryCommission,
    exitFillPrice: fill.fillPrice,
    exitCommission: fill.commission,
    ...(position.plannedStopPrice !== undefined
      ? { plannedStopPrice: position.plannedStopPrice }
      : {}),
  });
  if (!closed.ok) {
    return { ok: false, error: closed.error };
  }

  return { ok: true, closed };
}
