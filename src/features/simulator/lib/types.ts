import type {
  ClosedPositionResult,
  MoneyUnits,
  PriceUnits,
  QuantityUnits,
} from "@/lib/engine/types";

/**
 * A fill the position reducer (`position.ts`) consumes — the entry/exit
 * side of a single order execution. Deliberately narrower than
 * `/lib/engine`'s own fill result types (`MarketFillResult`/
 * `LimitFillResult`/etc.): those carry fill-specific fields (`slippage`,
 * `status`, ...) this module doesn't need, so a caller extracts
 * `{ fillPrice, quantity, commission }` from whichever engine result
 * produced the fill before calling in here. This keeps the reducer's input
 * shape stable even if the engine adds a new fill type later
 * (ENGINEERING_PRINCIPLES §16: composition over a union that would have to
 * grow with the engine).
 */
export type PositionFill = {
  fillPrice: PriceUnits;
  quantity: QuantityUnits;
  commission: MoneyUnits;
};

/**
 * An open (possibly partially closed, possibly added-to) simulator
 * position. `entryPrice` is the volume-weighted average fill price across
 * every entry fill so far — a single position built from two adds has one
 * `entryPrice`, not a list of fills, because that's what closing math
 * (entry vs. exit) needs (ADR-007/`closePosition`). `entryCommission` is
 * the running total commission paid across every entry fill, carried so a
 * later partial close can attribute its fair share back out
 * (`position-math.ts`'s `prorateMoney`).
 *
 * `entryEngineVersion` is stamped once, from the fill that opened the
 * position (ENGINEERING_PRINCIPLES §3.1: every engine output carries
 * `engineVersion`) — it identifies which fill-engine semantics priced the
 * entry, and is never overwritten by a later add-to, even one priced under
 * a newer engine version. A position's *entry* identity is set at open.
 *
 * `plannedStopPrice`/`plannedTargetPrice` are each independently optional
 * and validated only against `entryPrice` at the moment they're set
 * (`openPosition`) — `addToPosition` does not re-validate a carried-over
 * stop/target against the position's new weighted-average entry price. See
 * the feature README's "Known limitations" for why that's a real, named
 * gap rather than an oversight.
 *
 * `entryTs` (M-11 Session 2) is the bar timestamp of the fill that OPENED
 * this position (market time, not wall clock -- matches every other `ts`
 * in this feature). Stamped once at `openPosition` and, like
 * `entryEngineVersion`, never touched by a later `addToPosition` -- a
 * position's entry identity (when and under what engine version it began)
 * is fixed at open. This is what lets a closed trade report `entry_ts`
 * (DATABASE_SCHEMA.md `trades`) without the store having to track it as
 * separate, driftable state.
 */
export type OpenPosition = {
  direction: "long" | "short";
  entryPrice: PriceUnits;
  quantity: QuantityUnits;
  entryCommission: MoneyUnits;
  entryEngineVersion: string;
  entryTs: string;
  plannedStopPrice?: PriceUnits;
  plannedTargetPrice?: PriceUnits;
};

/**
 * Which instrument and `sim_account` the current simulator session is
 * trading against (M-11 Session 2). Not part of `OpenPosition` itself --
 * unlike `entryTs`/`entryEngineVersion`, these describe the SESSION a
 * position was opened in, not the position's own entry fill, and a session
 * only ever trades one instrument against one account at a time (ReplaySimulator).
 * Threaded through `processBar` only to stamp a closed trade with what a
 * `trades` row needs (`instrument_id`/`sim_account_id`); the engine and
 * position reducer stay ignorant of both, same as they're ignorant of
 * `user_id`.
 */
export type TradeContext = {
  instrumentId: string;
  simAccountId: string;
};

/** A domain-level rejection (§7 class 1) — never thrown. Same shape as the engine's `EngineError`. */
export type PositionError = { code: string; message: string };

export type OpenPositionInput = {
  direction: "long" | "short";
  fill: PositionFill;
  engineVersion: string;
  entryTs: string;
  plannedStopPrice?: PriceUnits;
  plannedTargetPrice?: PriceUnits;
};

export type OpenPositionResult =
  { ok: true; position: OpenPosition } | { ok: false; error: PositionError };

export type AddToPositionInput = {
  position: OpenPosition;
  fill: PositionFill;
};

export type AddToPositionResult =
  { ok: true; position: OpenPosition } | { ok: false; error: PositionError };

export type ClosePositionInput = {
  position: OpenPosition;
  fill: PositionFill;
};

export type PartialCloseResult =
  | {
      ok: true;
      remainingPosition: OpenPosition;
      closed: ClosedPositionResult;
    }
  | { ok: false; error: PositionError };

export type FullCloseResult =
  | { ok: true; closed: ClosedPositionResult }
  | { ok: false; error: PositionError };
