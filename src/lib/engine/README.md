# Fill Engine

## Purpose

The deterministic, pure fill/PnL engine — fills, slippage, commission,
bracket exits, realized PnL, and R-multiple. Shared by the simulator
(M-9), the replay engine (M-10), the backtester (M-18), and, per ADR-007,
the same logic compiled for the server-side Edge Function that
re-validates trades before persistence (M-11) — none of which exist yet.
This module exists first because everything downstream of it needs it.

## Architecture

**§3.1: no React, no Supabase, no feature imports.** Every function here
is a pure function of its arguments — same input, same output, forever,
with no hidden dependency on the wall clock, a database, or a framework.
That's what makes it usable from a Deno Edge Function and a Web Worker
alike, and what makes ~100% branch coverage with hand-computed expected
values (ENGINEERING_PRINCIPLES §14) actually meaningful — there's no
hidden state to make a test lie.

| File | Purpose |
|---|---|
| `types.ts` | Branded types (`PriceUnits`/`QuantityUnits`/`MoneyUnits`), scale constants, `ENGINE_VERSION`, and every order/config/result type. |
| `units.ts` | The only place a decimal dollar amount is allowed to round into an integer type. `priceQuantityToMoney` — the price × quantity multiply every PnL calculation reuses. |
| `commission.ts` | `computeCommission` — flat fee or per-share rate. |
| `slippage.ts` | `computeSlippageOffset` — fixed amount or basis points, always a magnitude; callers apply direction. |
| `market-fill.ts` | `fillMarketOrder` — fills at the next bar's open ± slippage. |
| `limit-fill.ts` | `fillLimitOrder` — fills at exactly the limit price on range touch. |
| `stop-fill.ts` | `fillStopOrder` — fills like a triggered market order on range touch. |
| `bracket.ts` | `resolveBracket` — stop-loss/take-profit resolution, including bar-path ambiguity (RISKS R-3). |
| `close-position.ts` | `closePosition` — gross/net PnL and R-multiple for a completed round-trip. |

## The fill model v1 (ADR-007)

- **Market orders** fill at the next bar's `open`, adjusted *against* the
  trader by slippage — buys fill above open, sells fill below. Never in
  the trader's favor.
- **Limit orders** fill at *exactly* the limit price when the bar's range
  touches it (inclusive: `<=`/`>=`), never better. Real markets sometimes
  give price improvement; proving whether that would have happened needs
  intra-bar detail a daily candle doesn't have, so v1 assumes none rather
  than invent certainty the data can't support.
- **Stop orders** (as entries, or as the stop leg of a bracket) fill like
  a triggered market order once the bar's range touches the stop price —
  stop price ± slippage. A stop is a promise to trigger, not a promise of
  price.
- **Bracket exits** (`resolveBracket`) pair a stop-loss and a take-profit
  around an open position. If a single bar's range touches *both* — the
  bar-path ambiguity case, RISKS R-3 — a daily candle cannot tell you
  which was hit first ("dropped to the stop, then rallied to the target"
  and "rallied to the target, then dropped to the stop" produce identical
  OHLC). This is resolved as a stop-out — the worse outcome — and the
  result is stamped `resolutionAmbiguous: true`, never silently merged
  into an ordinary stop-out.
- **Commission** is either a flat fee per fill or a per-share rate, from
  `EngineConfig`.

Every one of these follows the same rule when the data leaves the true
outcome genuinely uncertain: **resolve against the trader, and record the
uncertainty rather than hide it** (Constitution Rule 8).

## Money representation (ADR-014)

- `PriceUnits` / `MoneyUnits` — integer, 1 unit = 1/10,000 of the
  instrument's currency.
- `QuantityUnits` — integer, 1 unit = 1/100,000,000 of a share, matching
  `candles`/`instruments`' own `numeric(18,8)` columns.
- All three are branded (`number & { __brand }`) so a price can never be
  silently substituted for a quantity or a plain number.
- **Convert only at the boundary.** `units.ts`'s `toPriceUnits`/
  `toQuantityUnits`/`toMoneyUnits` are the only places a decimal is
  allowed to round into one of these types; `fromPriceUnits`/etc. are the
  only places one converts back. Every calculation in between is exact
  integer arithmetic.
- `priceQuantityToMoney` is the one multiply every PnL calculation in this
  engine reuses (commission's `per_unit` rate, gross PnL, planned risk) —
  done in `BigInt` because the intermediate product can exceed
  `Number.MAX_SAFE_INTEGER` even when neither the inputs nor the final,
  rescaled answer do.
- **R-multiple is the one sanctioned float in this engine's output.** It's
  a ratio, not a money amount — dividing two `MoneyUnits` integers of the
  same scale cancels the scale out exactly, and nothing downstream does
  further arithmetic on it. Same category of boundary conversion as
  `fromMoneyUnits`, just producing a ratio instead of a dollar amount.

## Public API

```ts
// Units (units.ts)
toPriceUnits(decimal) / fromPriceUnits(units)
toQuantityUnits(decimal) / fromQuantityUnits(units)
toMoneyUnits(decimal) / fromMoneyUnits(units)
priceQuantityToMoney(price, quantity) -> MoneyUnits

// Pricing building blocks
computeCommission(quantity, CommissionConfig) -> MoneyUnits
computeSlippageOffset(basePrice, SlippageConfig) -> PriceUnits (magnitude only)

// Fills
fillMarketOrder(order, bar, config) -> MarketFillResult
fillLimitOrder(order, bar, config) -> LimitFillResult
fillStopOrder(order, bar, config) -> StopFillResult
resolveBracket(order, bar, config) -> BracketResult

// Realized PnL
closePosition(position: ClosedPosition) -> ClosedPositionResult
```

Every result type is a discriminated union: `{ ok: true, ... }` or
`{ ok: false, error: { code, message } }` (ENGINEERING_PRINCIPLES §7) —
never thrown for an expected outcome. `fillMarketOrder`/`fillLimitOrder`/
`fillStopOrder`/`resolveBracket`/`closePosition` all stamp `engineVersion`
on every branch, success or rejection, including `"unfilled"`/`"none"`
outcomes.

## Extension guide

- **New slippage or commission model:** extend `SlippageConfig`/
  `CommissionConfig`'s union in `types.ts`, handle the new variant in
  `slippage.ts`/`commission.ts`, add hand-computed tests exercising it
  through at least one fill function.
- **Any change to fill/slippage/commission/bracket semantics:** bump
  `ENGINE_VERSION` in `types.ts`. Never mutate what a past version number
  means — that's what makes a historical trade's `engine_version`
  meaningful (§3.1).
- **Server-side reuse (M-11):** this module has zero Node/browser-specific
  APIs (no `fetch`, no DOM) beyond `BigInt`, which Deno also supports —
  compiling it for the Edge Function that re-validates trades should be a
  build-target change, not a rewrite.

## Known limitations

- **No intra-bar partial fills.** An order fills for its full quantity or
  not at all within a bar — daily OHLC can't model intra-bar liquidity
  without inventing precision the data doesn't have (the same information
  gap RISKS R-3 exists to name honestly).
- **No running position/order state yet.** `closePosition` takes an
  already-known entry fill and exit fill; it doesn't track an open
  position across multiple bars or multiple partial-exit orders. That's
  the simulator/replay feature's job (M-9/M-10), built on top of these
  pure functions — "multiple separate orders closing one position over
  time" is the read of "partial fills" this milestone targets, not
  intra-bar partial quantity.
- **Not yet compiled for Deno.** ADR-007 anticipates this exact code
  running server-side for trade re-validation; that wiring is M-11.
