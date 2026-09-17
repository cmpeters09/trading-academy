# Simulator

## Purpose

The paper-trading simulator: place orders against replayed or live market
data, track open positions, and realize PnL/R-multiple on close
(NON_NEGOTIABLES Rule 5 — "learn by doing," via simulated trading; Rule 9 —
realistic simulations). Feeds the journal (M-9 later sessions) and stats
dashboards once trades persist.

**Status: Session 1 of ~4. No UI, no order ticket, no persistence yet** —
this session is `sim_accounts` (the DB table) and pure account/order/
position *state logic* only. See Extension guide below for what's next.

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

## Public API

Exported from `index.ts`: `openPosition`, `addToPosition`,
`partiallyClosePosition`, `fullyClosePosition`, and their input/result
types (`OpenPosition`, `PositionFill`, `PositionError`, etc.). Nothing else
in this feature is public yet — there's nothing else built.

```ts
openPosition(input: OpenPositionInput) -> OpenPositionResult
addToPosition(input: AddToPositionInput) -> AddToPositionResult
partiallyClosePosition(input: ClosePositionInput) -> PartialCloseResult
fullyClosePosition(input: ClosePositionInput) -> FullCloseResult
```

## Extension guide

- **Session 2+ (order ticket, fills, `sim_accounts` balance updates):**
  call `/lib/engine`'s fill functions (`fillMarketOrder`/etc.) against a
  revealed bar, reduce the result to a `PositionFill`, then call the
  matching transition here. Debiting/crediting a `sim_accounts.balance` row
  is *not* handled by this module — that's a persistence concern for a
  later session (ADR-007: engine stays pure, persistence goes through an
  Edge Function with re-validation).
- **Chart/`onBarRevealed` wiring:** `features/replay/hooks/
  useReplayBarFeed.ts` already names this feature as the intended consumer
  of its `onBarRevealed` callback — that's where a real order/position flow
  gets wired in.
- **`replay_sessions` (TD-06):** `sim_accounts` existing means the FK
  blocker is cleared, but the migration and persistence work are a
  separate, later session — not bundled here.
- **New position-state transition** (e.g. moving a stop, adjusting a
  target on an already-open position): add it to `lib/position.ts` next to
  the existing four, with its own input/result types in `lib/types.ts` and
  hand-computed tests in `lib/position.test.ts`, same pattern.

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
