/**
 * Branded integer types for the fill engine (ADR-014). A `PriceUnits` and a
 * `QuantityUnits` are both plain numbers at runtime, but TypeScript refuses
 * to let you pass one where the other is expected, or either where a plain
 * `number` is expected — the exact "multiplied price by price" bug class
 * ENGINEERING_PRINCIPLES §9 calls out by name becomes a type error instead
 * of a wrong number in production.
 *
 * Never construct these with `as` at a call site. Always go through
 * units.ts's `toPriceUnits`/`toQuantityUnits`/`toMoneyUnits` — that's the
 * one place a decimal is allowed to become one of these.
 */
export type PriceUnits = number & { readonly __brand: "PriceUnits" };
export type QuantityUnits = number & { readonly __brand: "QuantityUnits" };
export type MoneyUnits = number & { readonly __brand: "MoneyUnits" };

/**
 * ADR-014 — 1 PriceUnits/MoneyUnits = 1/10,000 of the instrument's
 * currency (four decimal digits: covers cent-precision stocks and typical
 * crypto quoting on one simple, round scale).
 */
export const PRICE_SCALE = 10_000;

/**
 * ADR-014 — 1 QuantityUnits = 1/100,000,000 of a share, matching
 * `candles`/`instruments`' own `numeric(18,8)` column precision
 * (DATABASE_SCHEMA.md §4). BTC-USD is a real seeded instrument, so
 * "satoshi-like" is a literal description, not just an analogy.
 */
export const QUANTITY_SCALE = 100_000_000;

/**
 * Stamped on every engine result (ENGINEERING_PRINCIPLES §3.1: "Every
 * engine output carries engineVersion. Changing fill semantics = bump the
 * version, never mutate history."). Bump this — never edit a past result's
 * meaning — the moment any fill/slippage/commission rule changes.
 */
export const ENGINE_VERSION = "1.0.0";

// ---------------------------------------------------------------------------
// Orders, bars, config (M-8 Session 1: market order fills, ADR-007)
// ---------------------------------------------------------------------------

/** One OHLC bar, already converted to PriceUnits (see units.ts). */
export type EngineBar = {
  ts: string;
  open: PriceUnits;
  high: PriceUnits;
  low: PriceUnits;
  close: PriceUnits;
};

export type EngineOrder = {
  side: "buy" | "sell";
  type: "market" | "limit" | "stop";
  quantity: QuantityUnits;
  limitPrice?: PriceUnits;
  stopPrice?: PriceUnits;
};

/**
 * ADR-007: market orders fill at the next bar's open, adjusted AGAINST the
 * trader by slippage — never in their favor, same conservative philosophy
 * as the bar-path ambiguity rule (RISKS R-3). `fixed_bps` scales with
 * price (a $1,000 stock slips more in dollar terms than a $10 one at the
 * same bps); `fixed_amount` is a flat PriceUnits offset regardless of
 * price.
 *
 * Limit orders don't use this at all — filling at your limit price *or
 * better* is the definition of a limit order. Stop orders will (Session
 * 2): once triggered, a stop behaves like a market order and is exposed to
 * the same slippage, usually worse, since stops trigger during the exact
 * fast-moving conditions that cause it.
 */
export type SlippageConfig =
  | { model: "fixed_amount"; value: PriceUnits }
  | { model: "fixed_bps"; bps: number };

/**
 * `flat`: one fee per fill, regardless of size (typical of many modern
 * brokers). `per_unit`: a price-per-share rate — deliberately typed as
 * `PriceUnits`, not `MoneyUnits`, so total commission can reuse
 * `priceQuantityToMoney(ratePerUnit, quantity)` directly (units.ts) instead
 * of a second, separately-tested multiply helper that does the identical
 * math under a different name.
 */
export type CommissionConfig =
  | { model: "flat"; value: MoneyUnits }
  | { model: "per_unit"; ratePerUnit: PriceUnits };

export type EngineConfig = {
  slippage: SlippageConfig;
  commission: CommissionConfig;
};

/** A domain-level rejection (§7 class 1) — malformed input, never thrown. */
export type EngineError = { code: string; message: string };

export type MarketFillResult =
  | {
      ok: true;
      fillPrice: PriceUnits;
      commission: MoneyUnits;
      slippage: PriceUnits;
      engineVersion: string;
    }
  | { ok: false; error: EngineError; engineVersion: string };

// ---------------------------------------------------------------------------
// Limit/stop entry fills (M-8 Session 2, ADR-007 "fill on candle range touch")
// ---------------------------------------------------------------------------

/**
 * A limit order fills at EXACTLY its limit price, never better (see
 * limit-fill.ts's module doc for why) — so, unlike a stop, there is no
 * `slippage` field on a filled result. It genuinely doesn't apply.
 */
export type LimitFillResult =
  | {
      ok: true;
      status: "filled";
      fillPrice: PriceUnits;
      commission: MoneyUnits;
      engineVersion: string;
    }
  | {
      ok: true;
      status: "unfilled";
      reason: "limit_not_touched";
      engineVersion: string;
    }
  | { ok: false; error: EngineError; engineVersion: string };

/**
 * A triggered stop fills like a market order — stop price adjusted by
 * slippage, same as fillMarketOrder — so this result shape does carry
 * `slippage`, unlike LimitFillResult.
 */
export type StopFillResult =
  | {
      ok: true;
      status: "filled";
      fillPrice: PriceUnits;
      commission: MoneyUnits;
      slippage: PriceUnits;
      engineVersion: string;
    }
  | {
      ok: true;
      status: "unfilled";
      reason: "stop_not_touched";
      engineVersion: string;
    }
  | { ok: false; error: EngineError; engineVersion: string };
