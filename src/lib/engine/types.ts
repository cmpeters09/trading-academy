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
