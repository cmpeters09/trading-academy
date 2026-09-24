# Simulator

## Purpose

The paper-trading simulator: place orders against replayed or live market
data, track open positions, and realize PnL/R-multiple on close
(NON_NEGOTIABLES Rule 5 — "learn by doing," via simulated trading; Rule 9 —
realistic simulations). Feeds the journal (M-9 later sessions) and stats
dashboards once trades persist.

**Status: M-9 (Simulator UI) shipped. M-11 (Trade Persistence) Session 2
of ~6 in progress.** M-9 built `sim_accounts` and the full pending-order →
fill → open position → close lifecycle, entirely in-memory (Zustand),
including risk-% position sizing, live unrealized PnL/R, and TD-10's
manual close + honest single-leg exits. M-11 Session 1 added the
`orders`/`executions`/`trades`/`trade_orders` tables + RLS (writes
Edge-Function-only, TD-11 tracks the still-missing automated RLS test).
M-11 Session 2 (this one): `services/simulator/sim-accounts.ts`'s
`getOrCreateDefaultSimAccount` (real `sim_accounts` read/insert, no
longer just a table nobody touches), and `entryTs`/`instrumentId`/
`simAccountId` threaded through `OpenPosition`/`process-bar.ts`/
`store.ts`/`ReplaySimulator` so a closed trade (`ClosedTrade`, richer
shape as of this session) carries everything DATABASE_SCHEMA.md's
`trades` row needs. Still no actual DB write of an order/execution/trade
— that's M-11 Session 3/4 (the `validate-trade` Edge Function). Between
Sessions 2 and 3, a debt-register audit paid TD-08's stop half:
`addToPosition` now re-validates a carried-over `plannedStopPrice`
against the new weighted-average entry price and rejects the add
(`INVALID_STOP`) rather than letting it drift invalid.

## Architecture

- **`sim_accounts`** (`supabase/migrations/20260917090000_create_sim_accounts.sql`,
  DATABASE_SCHEMA.md §4) — one row per simulator account a user creates.
  RLS: select/insert/update scoped to `user_id = auth.uid()` (ADR-012). No
  delete policy yet (out of scope; default-deny until a deliberate decision
  is made). This table unblocks TD-06 (`replay_sessions`' FK), which is
  still not built.
- **`services/simulator/sim-accounts.ts`** (M-11 Session 2, not in this
  feature — services are cross-cutting, §6) — `getOrCreateDefaultSimAccount`,
  called from `/replay/page.tsx` (a Server Component). Returns the user's
  `is_default` `sim_account`, creating one (starting/current balance
  $100,000, per DATABASE_SCHEMA.md's default) on first visit. Returns
  `null` only when nobody's signed in — normally unreachable, since
  `src/proxy.ts` (Next.js 16's renamed middleware convention) already
  redirects an unauthenticated visit to `/login`; this covers the small
  race window between that check and the page's own `getUser()` call.
  Known gap (TD-12): no DB-level unique constraint stops two concurrent
  first-visits from both inserting a default account.
- **`lib/types.ts`** — every type this feature's pure logic needs:
  `PositionFill` (the `{ fillPrice, quantity, commission }` a caller
  extracts from any `/lib/engine` fill result before handing it to this
  module), `OpenPosition` (the position shape itself, plus `entryTs` as of
  M-11 Session 2), `TradeContext` (M-11 Session 2 — which instrument/
  `sim_account` the session trades, threaded through `processBar` only to
  stamp a closed trade), and the input/result type for each transition
  below. Following `/lib/engine`'s own convention, all types live here —
  `position.ts`/`position-math.ts` only import and implement.
- **`lib/position-math.ts`** — the two integer-only calculations
  `/lib/engine` doesn't provide because it has no running position state
  (its README says so explicitly): `weightedAverageEntryPrice` (for
  `addToPosition`) and `prorateMoney` (for splitting entry commission on a
  partial close). Both multiply in `BigInt` first, same discipline as the
  engine's own `priceQuantityToMoney` (ADR-014), because the intermediate
  product can overflow `Number.MAX_SAFE_INTEGER` even though neither input
  nor final result do.
- **`lib/position.ts`** — the reducer: `openPosition`, `addToPosition`,
  `partiallyClosePosition`, `fullyClosePosition`. Pure `(state, fill) ->
  result` functions, discriminated-union results (§7), never throw for an
  expected outcome. Realized PnL/R-multiple comes straight from
  `/lib/engine`'s `closePosition` — this module assembles its inputs
  (apportioning entry commission on a partial close) and tracks what
  remains open; it does not re-derive fill or PnL math.
- **`lib/order-ticket-schema.ts`** (Session 2) — `orderTicketSchema`, the
  React Hook Form + Zod schema behind `OrderTicket` (ADR-005: this is form
  state, not a Zustand store — nothing else reads an unsubmitted ticket
  yet, so there's no cross-component state to own). Every price/quantity
  field is a raw string in the form (native text inputs, not
  `type="number"`, to sidestep browser-specific number-input quirks); the
  schema parses and validates them as plain decimals, including the
  cross-field "stop/target on the correct side" checks (mirrors
  `lib/position.ts`'s `validateStop`/`validateTarget`, extended to use the
  ticket's own limit/stop price as the reference when one is known — a
  market order has no known entry price yet, so it falls back to checking
  the stop and target only against each other). `toOrderTicketSubmission`
  is a separate, deliberately un-fancy step that converts the schema's
  validated decimals into the engine's branded `PriceUnits`/`QuantityUnits`
  (ADR-014) — kept out of the schema itself so `useForm`'s field types stay
  plain strings-in/numbers-out, with no zod-transform-into-branded-type
  generic fighting React Hook Form's resolver typing.
- **`components/OrderTicket.tsx`** (Session 2, sizing added Session 4) —
  the order-entry panel. Client component (leaf — nothing above it needs
  to be client-side). Direction (buy/long, sell/short), order type
  (market/limit/stop), quantity, and optional planned stop-loss/target.
  Inline field errors via the shared `<FormField>` (`aria-describedby`,
  `aria-invalid`), not toasts (§7). On a valid submit it converts to
  engine units and either calls the `onSubmit` prop or logs the captured
  order (`logger.info`, §8) — it does **not** call `/lib/engine` to fill
  anything or persist anything (that's Session 3/`PositionPanel`), though
  it DOES call `/lib/engine`'s `computePositionSize` for sizing, via
  `lib/sized-quantity.ts`.
- **`components/CapturedOrderSummary.tsx`** (Session 2) — read-only
  presenter that echoes back a captured order in human units
  (`from*Units`, ADR-014), split out of `OrderTicket.tsx` to keep that
  file under the component size guideline (§3.3) and keep capture/display
  as two separately-testable concerns (§3.2). Only renders when
  `OrderTicket` is used standalone (no `onSubmit`) — once wired (Session
  3), `PositionPanel` owns showing what happened to an order.
- **`lib/to-engine-order.ts`** (Session 3) — `toEngineOrder`, the one
  place a ticket's `direction` (long/short) becomes the engine's `side`
  (buy/sell). Opening a long is a buy; opening a short is a sell — this
  fill model has no separate short-selling order type.
- **`lib/engine-config.ts`** (Session 3) — `DEFAULT_ENGINE_CONFIG`, a
  fixed, modest slippage/commission config (NON_NEGOTIABLES Rule 9 —
  simulations must model friction, never a zero-cost fill). Not
  per-`sim_account` configurable — `sim_accounts` has no such column
  (DATABASE_SCHEMA.md §4) — this is an app-wide default until a later
  session makes it one.
- **`lib/process-bar.ts`** (Session 3, manual close + single-leg exits
  added Session 4, `context` param added M-11 Session 2) — the keystone:
  `processBar(state, bar, config, context) -> result`, pure. Given the
  simulator's current pending order / open position / close request and
  one revealed bar, reuses `/lib/engine`'s fill functions, `resolveBracket`
  (bar-path ambiguity, RISKS R-3), and `finishClose` (this module's own
  shared "apply `fullyClosePosition`, unwrap its double-nested result, and
  assemble the richer `ClosedTrade`" helper) — never re-derives fill or
  PnL math. A filled order becomes an open position via `openPosition`,
  stamped with `entryTs` from the fill bar. An open position can then exit
  four ways: a manual close request (`closeRequested`, TD-10 — takes
  PRIORITY over everything else, fills at THIS bar's open via
  `fillMarketOrder`, same as an entry); a complete bracket (both planned
  stop AND target) via `resolveBracket`; a stop-only position via
  `fillStopOrder` directly (the closing side, opposite of the entry side);
  or a target-only position via `fillLimitOrder` directly. Every exit
  path assembles a `ClosedTrade` (M-11 Session 2 — everything
  DATABASE_SCHEMA.md's `trades` row needs: `instrumentId`/`simAccountId`
  from `context`, `entryTs` from the position, `exitTs` from the closing
  bar, `avgEntry`/`avgExit`/`quantity`/`plannedStop`/`plannedTarget`
  alongside the engine's own realized PnL/R fields) via `finishClose`. No
  same-bar exit check on the bar a position just opened on (a daily bar's
  OHLC has no sub-bar ordering info — see the module's own doc comment).
  Re-visited bars (step back, then forward again) can't double-fill or
  double-close: a fill/close clears `pendingOrder`/`closeRequested`, and a
  no-outcome check is idempotent — verified both by unit test and live in
  a browser.
- **`store.ts`** (Session 3, `lastPrice`/`requestClose` added Session 4,
  `instrumentId`/`simAccountId` added M-11 Session 2) — `useSimulatorStore`
  (ADR-005: ephemeral client state, one store per feature). Holds
  `pendingOrder` / `position` / `lastClosedTrade` / `orderError` /
  `lastPrice` / `closeRequested` / `instrumentId` / `simAccountId`;
  `submitOrder`, `requestClose`, and `onBarRevealed` are thin delegates to
  Session 1's reducer and `process-bar.ts` — all the actual logic lives
  in `lib/`, same split as `features/replay/store.ts`. `lastPrice` is set
  to every revealed bar's close, independent of whether that bar caused a
  fill — it's the mark price `PositionPanel` uses for unrealized PnL/R.
  `requestClose` (TD-10) is a no-op unless a position is open and no
  close is already requested. `reset(context: TradeContext)` (M-11
  Session 2, signature changed from a no-arg `reset()`) resets to flat AND
  (re)stamps which instrument/account the session trades; `onBarRevealed`
  throws if it somehow runs before `instrumentId`/`simAccountId` are set
  (unreachable in normal operation — `ReplaySimulator` always syncs them
  first).
- **`lib/unrealized-pnl.ts`** (Session 4) — `computeUnrealizedPnl`. Same
  gross-PnL formula as Session 1's `closePosition` (`priceQuantityToMoney`
  on the price delta, reused, never re-derived), marked against
  `lastPrice` instead of a real exit fill, with NO commission subtracted
  — nothing has actually been paid to exit yet. Deliberately GROSS, not
  net (Q3 in this session's plan) — `PositionPanel` labels it "before exit
  costs" rather than show a number that quietly assumes a guessed exit
  fee. `rMultiple` is `null` both when there's no planned stop AND when
  one sits on the wrong side of entry — no longer reachable through
  normal use since TD-08 was paid (`openPosition`/`addToPosition` both
  reject that now), but this is display math, not a validator, so the
  defensive check stays rather than trusting the caller.
- **`components/PositionPanel.tsx`** (Session 3, unrealized PnL/R and the
  close button added Session 4) — switches between the order ticket
  (flat), a "pending, waiting for the next bar" status, and the
  open-position readout (direction, quantity, avg entry, bracket if set,
  unrealized PnL/R once a mark price exists, and either a "Close
  position" button or a "closing at the next bar's open" status once
  clicked, TD-10), plus an inline rejected-order error or last-closed-trade
  summary next to the ticket (§7: inline, never a toast). Unrealized
  PnL/R is colored (`text-success`/`text-danger`) but always paired with
  an explicit `+`/`-` sign, never color alone (§11).
- **`components/ReplaySimulator.tsx`** (Session 3, `instrumentId`/
  `simAccountId` props added M-11 Session 2) — mounts `PositionPanel`
  next to replay's `ReplayChart`, wiring `onBarRevealed` (M-10's
  mechanism) straight to `useSimulatorStore`. Lives here, not in
  `replay/`, so `replay` stays feature-agnostic to trading orders (§16) —
  this is simulator consuming replay's public surface, never a deep
  import. `"use client"` stays at this leaf; `/replay/page.tsx` above it
  is still a Server Component (now also resolving the sim account via
  `getOrCreateDefaultSimAccount`). Syncs the store's `instrumentId`/
  `simAccountId` (and resets on either changing, same as a candle-array
  change) by comparing props against the STORE's own values during
  render, not a separate local mirror — the only way this also fires
  correctly on first mount, which is what lets `onBarRevealed`'s
  null-context guard be unreachable in practice.
- **`/lib/engine/position-sizing.ts`** (Session 4, NOT in this feature —
  see its own file) — `computePositionSize`. GLOSSARY.md "Position
  sizing": `quantity = (accountBalance x riskPct) / |entryPrice -
  stopPrice|`, clamped at `MAX_RISK_PCT` (5, `user_settings
  .default_risk_pct`'s DB constraint), rounded down. Lives in `/lib/engine`
  per ENGINEERING_PRINCIPLES §3.1, which explicitly lists position sizing
  as engine territory alongside fills/PnL — not `features/simulator/lib`.
- **`lib/sized-quantity.ts`** (Session 4) — `computeSizedQuantity`, the
  pure half of `OrderTicket`'s live "size by risk" recompute. Takes the
  four raw sizing form values (account balance, risk %, planned entry
  price, planned stop-loss) and returns one of three outcomes: `incomplete`
  (some field still blank), `rejected` (the engine refused the input —
  e.g. entry equals stop), or `sized` (a quantity string + an explanatory
  note, including the 5%-clamp wording). `OrderTicket` only wires this to
  React Hook Form's `getValues()`/`setValue("quantity", ...)` — every
  actual decision is here, hand-tested without a DOM.
- **`components/SizeByRiskFields.tsx`** (Session 4) — presenter, split out
  of `OrderTicket.tsx` (§3.2/§3.3, same reasoning as
  `CapturedOrderSummary`) for the three sizing inputs (account balance,
  risk %, planned entry price — `plannedStopPrice` is the fourth input
  this needs, already its own field elsewhere on the ticket, not
  duplicated here) plus the live note.

## Public API

Exported from `index.ts`: `openPosition`, `addToPosition`,
`partiallyClosePosition`, `fullyClosePosition`, and their input/result
types (`OpenPosition`, `PositionFill`, `PositionError`, etc.); `OrderTicket`,
`orderTicketSchema`, `OrderTicketSubmission` (Session 2); `ReplaySimulator`,
`useSimulatorStore`, `SimulatorStore` (Session 3) — `ReplaySimulator` is
the one thing a route needs to mount. `CapturedOrderSummary`,
`PositionPanel`, and the `lib/` wiring functions (`toEngineOrder`,
`processBar`) stay internal.

```ts
openPosition(input: OpenPositionInput) -> OpenPositionResult
addToPosition(input: AddToPositionInput) -> AddToPositionResult
partiallyClosePosition(input: ClosePositionInput) -> PartialCloseResult
fullyClosePosition(input: ClosePositionInput) -> FullCloseResult

<ReplaySimulator
  candles={candles}
  instrumentLabel={instrument.symbol}
  timeframeLabel="1 day"
  instrumentId={instrument.id}
  simAccountId={simAccount.id}
/>
```

## Extension guide

- **`replay_sessions` (TD-06):** `sim_accounts` existing means the FK
  blocker is cleared, but the migration and persistence work are a
  separate, later session — not bundled here.
- **Persistence (a later session):** nothing here touches the DB.
  `sim_accounts.balance`, `orders`, `executions`, `trades` all stay
  untouched — per ADR-007, that's an Edge Function's job, re-validating
  against the same candle data (the same `/lib/engine` code, compiled for
  Deno) before writing, never trusting the client's fills as-is.
- **New position-state transition** (e.g. moving a stop, adjusting a
  target on an already-open position): add it to `lib/position.ts` next to
  the existing four, with its own input/result types in `lib/types.ts` and
  hand-computed tests in `lib/position.test.ts`, same pattern.
- **Partial manual close:** `requestClose`/`tryCloseAtMarket` only support
  closing the WHOLE position (mirrors `fullyClosePosition`). A "close half"
  action would need a new store field (how much to close) and
  `partiallyClosePosition` instead — not built, no current demand.

## Known limitations

- **`addToPosition` does not re-validate a carried-over planned TARGET
  against the new weighted-average entry price** (TD-08's target half is
  intentionally still open — see below; the STOP half was paid M-11 debt
  audit). A target that was valid when the position opened can end up on
  the wrong side of the entry after an add moves it, and nothing catches
  that — but the engine never enforces a target's side at close time
  either (`closePosition`'s input has no `plannedTargetPrice` field), so
  there's no downstream failure this would be closing a gap for, unlike
  the stop.
- **`sim_accounts.balance` is still never read or written.**
  `getOrCreateDefaultSimAccount` (M-11 Session 2) reads/creates the row
  and its `balance` column exists, but nothing in the simulator marks
  against it, deducts a loss, or credits a gain — that's persistence
  (M-11 Session 4+), when a validated trade actually settles.
- **No order lifecycle (`orders`/`executions`/`trades` tables) yet.**
  Nothing here is written to the DB — `processBar` only mutates in-memory
  Zustand state, now enriched with everything a `trades` row needs
  (`ClosedTrade`, M-11 Session 2) but not yet sent anywhere; deciding
  *whether* an order fills is entirely `/lib/engine`'s job (ADR-007), not
  this module's, and *persisting* a fill is the `validate-trade` Edge
  Function's job (M-11 Session 3/4), not this module's either.
- **`replaySessionId` is never set.** `ClosedTrade` has no such field —
  `replay_sessions` doesn't exist yet (TD-06, still open); every trade
  this milestone eventually persists gets `replay_session_id = null` at
  the point Session 4/5 actually writes it.
- **A market order's planned stop/target are only checked against each
  other at submit time, not against a real entry price** (Session 2,
  still true). `orderTicketSchema` has no fill price to validate against
  until the order actually fills — see `lib/order-ticket-schema.ts`'s doc
  comment. Session 1's `openPosition` still enforces the real check once
  the actual (slipped) fill price is known — `process-bar.test.ts`'s "a
  market order's planned stop can end up on the wrong side" case is this
  exact scenario, hand-verified — so an invalid stop/target can't silently
  reach an open position; it's just caught one step later than a limit/
  stop order's would be.
- **Only one order/position at a time.** `useSimulatorStore.submitOrder`
  is a no-op while a pending order or open position already exists, and
  `PositionPanel` hides the ticket in both states — `addToPosition`
  (Session 1, stop re-validation added M-11 debt audit) is never called
  from the UI. Adding to, or partially closing, an open position isn't
  possible from this UI yet; no session has scheduled that UI work.
- **`OrderTicket`, `PositionPanel`, `ReplaySimulator`, and
  `SizeByRiskFields` have no component tests yet** (TD-09). The
  validation/domain logic they depend on (`orderTicketSchema`,
  `toOrderTicketSubmission`, `processBar`, `computePositionSize`,
  `computeSizedQuantity`) is covered at 100% branches; the React wiring
  around it is currently verified only by typecheck/lint and a manual,
  live browser pass — the repo has no React Testing Library/jsdom
  infrastructure yet, and adding it was deliberately deferred rather than
  bundled into these sessions.
- **"Planned entry price" (sizing) doesn't sync with the limit/stop
  price.** They're deliberately independent fields (Session 4) — sizing a
  position doesn't require the order to actually be a limit/stop order at
  that exact price, and two-way syncing them would add real complexity
  for a marginal convenience. A trader using a limit order can type the
  same number in both if they want them to match; nothing does it for
  them.
