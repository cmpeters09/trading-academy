# Simulator

## Purpose

The paper-trading simulator: place orders against replayed or live market
data, track open positions, and realize PnL/R-multiple on close
(NON_NEGOTIABLES Rule 5 — "learn by doing," via simulated trading; Rule 9 —
realistic simulations). Feeds the journal (M-9 later sessions) and stats
dashboards once trades persist.

**Status: Session 2 of ~4. Order ticket UI exists; nothing is wired to the
engine, replay, or persistence yet.** Session 1 was `sim_accounts` (the DB
table) and pure account/order/position *state logic*. Session 2 adds the
order-entry panel: it validates and captures a typed order, and stops
there. See Extension guide below for what's next.

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
- **`components/OrderTicket.tsx`** (Session 2) — the order-entry panel.
  Client component (leaf — nothing above it needs to be client-side).
  Direction (buy/long, sell/short), order type (market/limit/stop),
  quantity, and optional planned stop-loss/target. Inline field errors via
  the shared `<FormField>` (`aria-describedby`, `aria-invalid`), not
  toasts (§7). On a valid submit it converts to engine units and either
  calls the `onSubmit` prop or logs the captured order (`logger.info`,
  §8) — it does **not** call `/lib/engine`, fill anything, or persist
  anything; that's Session 3.
- **`components/CapturedOrderSummary.tsx`** (Session 2) — read-only
  presenter that echoes back a captured order in human units
  (`from*Units`, ADR-014), split out of `OrderTicket.tsx` to keep that
  file under the component size guideline (§3.3) and keep capture/display
  as two separately-testable concerns (§3.2).

## Public API

Exported from `index.ts`: `openPosition`, `addToPosition`,
`partiallyClosePosition`, `fullyClosePosition`, and their input/result
types (`OpenPosition`, `PositionFill`, `PositionError`, etc.); `OrderTicket`
(the component), `orderTicketSchema`, and `OrderTicketSubmission` (Session
2). `CapturedOrderSummary` stays internal — nothing outside this feature
needs to render one directly.

```ts
openPosition(input: OpenPositionInput) -> OpenPositionResult
addToPosition(input: AddToPositionInput) -> AddToPositionResult
partiallyClosePosition(input: ClosePositionInput) -> PartialCloseResult
fullyClosePosition(input: ClosePositionInput) -> FullCloseResult

<OrderTicket onSubmit={(order: OrderTicketSubmission) => void} />
```

## Extension guide

- **Session 3 (wire the ticket to the engine/replay):** pass `OrderTicket`
  an `onSubmit` that takes the `OrderTicketSubmission`, calls the matching
  `/lib/engine` fill function (`fillMarketOrder`/`fillLimitOrder`/
  `fillStopOrder`) against the revealed bar, reduces the result to a
  `PositionFill`, then calls `openPosition`/`addToPosition`/etc. here.
  `features/replay/hooks/useReplayBarFeed.ts` already names this feature
  as the intended consumer of its `onBarRevealed` callback — that's where
  the wiring happens. Debiting/crediting `sim_accounts.balance` is still
  *not* this module's job (ADR-007: engine stays pure, persistence goes
  through an Edge Function with re-validation — the same
  `orderTicketSchema` should be re-validated there too, per §7, never
  trusted from the client alone).
- **`replay_sessions` (TD-06):** `sim_accounts` existing means the FK
  blocker is cleared, but the migration and persistence work are a
  separate, later session — not bundled here.
- **New position-state transition** (e.g. moving a stop, adjusting a
  target on an already-open position): add it to `lib/position.ts` next to
  the existing four, with its own input/result types in `lib/types.ts` and
  hand-computed tests in `lib/position.test.ts`, same pattern.
- **Session 4 (risk-% position sizing helper):** a new pure function
  alongside `order-ticket-schema.ts`, surfaced in `OrderTicket` as an
  optional "size by risk %" input feeding `quantity` — out of scope here
  on purpose.

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
  only; nothing reads or writes `balance` (Session 2+).
- **No order lifecycle (`orders`/`executions` tables) yet.** This session
  only models an already-open position's state transitions from fills that
  are assumed to have already happened; deciding *whether* an order fills
  is entirely `/lib/engine`'s job (ADR-007), not this module's.
- **A market order's planned stop/target are only checked against each
  other, not against a real entry price** (Session 2). `orderTicketSchema`
  has no fill price to validate against until Session 3 wires up the
  engine — see `lib/order-ticket-schema.ts`'s doc comment. Session 1's
  `openPosition` still enforces the real check once the actual fill price
  is known, so an invalid stop/target can't silently reach an open
  position; it just isn't caught at ticket-submit time for a market order.
- **`OrderTicket` has no component tests yet** (TD-09). The validation
  logic it depends on (`orderTicketSchema`, `toOrderTicketSubmission`) is
  covered at 100% branches; the React wiring around it (conditional field
  visibility, error-to-input linkage, submit → confirmation) is currently
  verified only by typecheck/lint/manual review — the repo has no React
  Testing Library/jsdom infrastructure yet, and adding it was deliberately
  deferred rather than bundled into this session.
