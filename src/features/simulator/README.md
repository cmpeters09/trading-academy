# Simulator

## Purpose

The paper-trading simulator: place orders against replayed or live market
data, track open positions, and realize PnL/R-multiple on close
(NON_NEGOTIABLES Rule 5 — "learn by doing," via simulated trading; Rule 9 —
realistic simulations). Feeds the journal (M-9 later sessions) and stats
dashboards once trades persist.

**Status: Session 4 of ~4 (in progress) — making the keystone usable and
closing out M-9's debt.** Session 1 was `sim_accounts` and pure
account/order/position *state logic*. Session 2 added the order-entry
panel. Session 3 wired order → engine → position end to end. Session 4,
sub-session A: a risk-% position-sizing helper (`/lib/engine`'s
`computePositionSize`) wired into `OrderTicket` as an optional "size by
risk" section that live-fills `quantity`. Still to come this session:
fuller P&L/R display (B), TD-10's manual close + single-bracket-leg exit
(C), and close-out (D). Still no persistence to the DB.

## Architecture

- **`sim_accounts`** (`supabase/migrations/20260917090000_create_sim_accounts.sql`,
  DATABASE_SCHEMA.md §4) — one row per simulator account a user creates.
  RLS: select/insert/update scoped to `user_id = auth.uid()` (ADR-012). No
  delete policy yet (out of scope; default-deny until a deliberate decision
  is made). This table unblocks TD-06 (`replay_sessions`' FK), which is
  still not built.
- **`lib/types.ts`** — every type this feature's pure logic needs:
  `PositionFill` (the `{ fillPrice, quantity, commission }` a caller
  extracts from any `/lib/engine` fill result before handing it to this
  module), `OpenPosition` (the position shape itself), and the
  input/result type for each transition below. Following `/lib/engine`'s
  own convention, all types live here — `position.ts`/`position-math.ts`
  only import and implement.
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
- **`lib/process-bar.ts`** (Session 3) — the keystone: `processBar(state,
  bar, config) -> result`, pure. Given the simulator's current pending
  order / open position and one revealed bar, reuses `/lib/engine`'s fill
  functions and `resolveBracket` (bar-path ambiguity, RISKS R-3) — never
  re-derives fill or PnL math. A filled order becomes an open position via
  `openPosition`; a COMPLETE bracket hit (both planned stop AND target —
  `resolveBracket` has no meaning for one leg) fully closes it via
  `fullyClosePosition`. No same-bar bracket check on the bar a position
  just opened on (a daily bar's OHLC has no sub-bar ordering info — see
  the module's own doc comment). Re-visited bars (step back, then forward
  again) can't double-fill or double-close: a fill clears the pending
  order, and a no-outcome check is idempotent — verified both by unit test
  and live in a browser (step back after a fill, step forward again, the
  position doesn't change).
- **`store.ts`** (Session 3) — `useSimulatorStore` (ADR-005: ephemeral
  client state, one store per feature). Holds `pendingOrder` / `position`
  / `lastClosedTrade` / `orderError`; `submitOrder` and `onBarRevealed` are
  thin delegates to Session 1's reducer and `process-bar.ts` — all the
  actual logic lives in `lib/`, same split as `features/replay/store.ts`.
- **`components/PositionPanel.tsx`** (Session 3) — switches between the
  order ticket (flat), a "pending, waiting for the next bar" status, and
  the open-position readout (direction, quantity, avg entry, bracket if
  set), plus an inline rejected-order error or last-closed-trade summary
  next to the ticket (§7: inline, never a toast).
- **`components/ReplaySimulator.tsx`** (Session 3) — mounts `PositionPanel`
  next to replay's `ReplayChart`, wiring `onBarRevealed` (M-10's
  mechanism) straight to `useSimulatorStore`. Lives here, not in
  `replay/`, so `replay` stays feature-agnostic to trading orders (§16) —
  this is simulator consuming replay's public surface, never a deep
  import. `"use client"` stays at this leaf; `/replay/page.tsx` above it
  is still a Server Component.
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
- **TD-10 (manual close / single-leg bracket):** the natural next increment
  on top of Session 3's wiring — a "Close position" action in
  `PositionPanel`, and a product decision on whether a stop-only or
  target-only position should auto-exit. In progress this session
  (sub-session C).
- **Fuller P&L/R display (Session 4, sub-session B):** `PositionPanel`'s
  open-position readout doesn't show unrealized PnL/R yet — reuse the
  engine's own numbers (a `priceQuantityToMoney` call against the current
  bar's price), don't recompute from scratch.

## Known limitations

- **`addToPosition` does not re-validate a carried-over planned stop or
  target against the new weighted-average entry price** (TD-08). A stop
  that was valid when the position opened can become invalid after an add
  that moves the average entry price past it (e.g. adding to a long at a
  much lower price can leave the stop above the new entry). This surfaces
  as the engine's own `INVALID_STOP` the next time the position is closed
  (`partiallyClosePosition`/`fullyClosePosition`), not at the moment the
  add happens — see `lib/position.test.ts`'s "bubbles the engine's
  INVALID_STOP" cases for the exact scenario. A future session should
  decide the product behavior here (reject the add? clear the stop?
  require the caller to supply a new one?) rather than this session
  guessing.
- **No `sim_accounts` balance logic yet.** This session is table + RLS
  only; nothing reads or writes `balance` (a later, persistence session).
- **No order lifecycle (`orders`/`executions` tables) yet.** Nothing here
  is written to the DB — `processBar` only mutates in-memory Zustand
  state; deciding *whether* an order fills is entirely `/lib/engine`'s job
  (ADR-007), not this module's.
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
- **No manual close, and a position with only one bracket leg never
  auto-exits** (TD-10). `PositionPanel` has no "close position" button;
  the only way an open position closes is a complete bracket (both a
  planned stop AND target) getting hit.
- **Only one order/position at a time.** `useSimulatorStore.submitOrder`
  is a no-op while a pending order or open position already exists, and
  `PositionPanel` hides the ticket in both states — `addToPosition`
  (Session 1) is never called from the UI (TD-08's trigger still hasn't
  fired). Adding to, or partially closing, an open position isn't
  possible from this UI yet.
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
