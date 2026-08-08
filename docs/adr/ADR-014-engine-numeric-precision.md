# ADR-014: Engine Numeric Precision — Integer Minor Units, Not Floating Point

**Status:** Accepted · **Date:** 2026-08-05

## Context

ENGINEERING_PRINCIPLES.md §9 states money/price/quantity math must use
"integer minor units (cents/satoshis)" inside the engine, converting only at
the display boundary — but never specified the actual scale, a branded-type
shape, or how to handle intermediate overflow when multiplying two large
scaled integers. M-8 (the fill engine) is the first code that needs this
decided precisely, and it's tracked as part of TD-02's trigger ("before
M-8").

## Decision

Three branded integer types, all plain `number` at runtime (not `BigInt` —
see Consequences):

- **`PriceUnits`** — 1 unit = 1/10,000 of the instrument's currency (four
  decimal digits). `$150.10` → `1,501,000`.
- **`QuantityUnits`** — 1 unit = 1/100,000,000 of a share, matching
  `candles`/`instruments`' own `numeric(18,8)` column precision
  (DATABASE_SCHEMA.md §4).
- **`MoneyUnits`** — same 1/10,000 scale as `PriceUnits`, used for realized
  PnL, commission, and slippage cost.

Conversion to/from plain `number` (decimal dollars) happens only in
`/lib/engine/units.ts`'s exported helpers (`toPriceUnits`/`fromPriceUnits`/
etc.) — never inline at a call site.

Multiplying a `PriceUnits` by a `QuantityUnits` (the core of any PnL
calculation) is done via a dedicated `priceQuantityToMoney()` helper that
performs the multiplication in `BigInt`, then converts the result back to a
safe `MoneyUnits` number — see Consequences for why.

## Rationale

- **Binary floating point cannot represent most decimal fractions exactly**
  (`0.1 + 0.2 !== 0.3` in IEEE 754, the representation every JS `number`
  uses). In a fill engine, that's not a curiosity — the error is small per
  multiplication but compounds across every simulated trade, and this
  product's stats (win rate, expectancy) are the thing users are meant to
  trust (Constitution Rule 8; ENGINEERING_PRINCIPLES §14: "a wrong number is
  worse than a crash").
- **Whole-number arithmetic has no such error.** `+`, `-`, and `*` on
  integers are exact in JavaScript up to `Number.MAX_SAFE_INTEGER`
  (2^53 − 1, ≈9.007×10^15).
- **A single scale for money and price** (1/10,000) avoids a second
  conversion layer between "price space" and "money space" — R-multiple,
  commission, and PnL are all directly comparable numbers without
  rescaling.
- **Quantity gets its own, finer scale** because it must represent
  fractional shares/crypto units precisely (`instruments.tick_size`/
  `candles` already use `numeric(18,8)`) without forcing prices to carry
  that same precision unnecessarily.

## Consequences

- **Overflow risk in `price × quantity`, solved with `BigInt` at one
  boundary.** A $1,000 price (`10,000,000` `PriceUnits`) times a
  10,000-share quantity (`1,000,000,000,000` `QuantityUnits`) is
  `10,000,000,000,000,000,000` — beyond `Number.MAX_SAFE_INTEGER` even
  though neither the inputs nor the final (rescaled) answer are.
  `priceQuantityToMoney()` is therefore the one place in the engine that
  touches `BigInt`, isolated and unit-tested with hand-computed cases,
  rather than adopting `BigInt` throughout the engine (which would fight
  TypeScript's arithmetic operators and every downstream consumer for no
  benefit at this app's realistic position sizes).
- **The DB stores `numeric`, not integers** (`orders`/`executions`/`trades`,
  DATABASE_SCHEMA.md §4) — conversion happens once, at the service layer
  that reads/writes those tables (not yet built; M-11 Trade Persistence),
  never inside the engine and never inside a UI component
  (ENGINEERING_PRINCIPLES §4's serialization-at-the-boundary rule extends
  naturally to this).
- Branded types mean `PriceUnits` and `QuantityUnits` cannot be assigned to
  each other or to a plain `number` without an explicit, named conversion —
  the type system rejects the exact bug class ("multiplied price by price")
  §9 calls out by name.
- TD-02 is paid by this ADR together with ADR-013.
