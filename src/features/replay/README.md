# Replay

## Purpose

Candle-by-candle market replay: step or auto-play through historical bars one at a time, with every future bar genuinely hidden — not just undrawn — until the cursor reaches it (NON_NEGOTIABLES Rule 5: "learn by doing," via market replay). Feeds the simulator (M-9) and, later, the backtester (M-18) and psychology scenarios (M-19).

## Architecture

- **`engine/cursor.ts`** — the pure replay state machine (Session 1). The cursor is a candle **timestamp**, not an array index (`engine/types.ts`), so it means the same thing regardless of how the candle array happens to be indexed when re-fetched. `getRevealedCandles(candles, cursor)` is the one function anything outside this module should call to get bars to display — it returns `candles[0..cursor]` inclusive, or `[]` at `cursor === null`. No React, no fetching, no clock — same input, same output, forever (ENGINEERING_PRINCIPLES §3.1/§18).
- **`store.ts`** — the feature's Zustand store (Session 2, ADR-005): `cursor`, `isPlaying`, `speed`. It does **not** hold the candle array; every action (`stepForward`, `stepBackward`, `jumpToStart`, `jumpToEnd`) takes `candles` as a parameter, so there is exactly one source of candle data (server state, fetched by whatever composes this feature) and the store can never drift from it.
- **`hooks/useReplayPlayback.ts`** — the one legitimate timer in this feature (Session 2). While `isPlaying`, steps the cursor forward once per tick at the configured `speed`, and auto-pauses on reaching the last bar. Its pure pieces (`intervalForSpeed`, `startPlaybackTicker`) are exported and unit-tested directly against the store, with no React rendering involved.
- **`hooks/useReplayBarFeed.ts`** — the wiring point into `/lib/engine` (Session 3). Watches the store's cursor and, on every distinct cursor value, converts the current bar from `Candle` (decimal) to `EngineBar` (integer `PriceUnits`, ADR-014) via `candleToEngineBar` and calls an optional `onBarRevealed` callback. This is *only* the mechanism — nothing calls it with real logic yet; M-9's order/position tracking is the intended consumer.
- **`components/ReplayChart.tsx`** — the feature's container (Session 3). Owns the store subscription, computes `getRevealedCandles(candles, cursor)`, and passes **only that slice** to the shared `<PriceChart>` (ADR-004). `<PriceChart>` never receives the raw `candles` array, so it architecturally cannot render a future bar. Also resets the store when the `candles` reference changes (switching instrument/timeframe) — see the in-file comment for why that has to happen during render, not in an effect.
- **`components/ReplayControls.tsx`** — step back / play-pause / step forward / speed, calling the store's actions directly.
- **`src/app/(app)/replay/page.tsx`** — the route. A Server Component that fetches candles via M-3's `getCandles`/`getInstrumentBySymbol` and renders `<ReplayChart>`.

## Public API

Exported from `index.ts`: `ReplayChart`, `useReplayPlayback`, `useReplayStore`, `ReplayStore` (type). `ReplayControls` is feature-internal (composed by `ReplayChart`); nothing outside this feature should import it directly.

## Extension guide

- **M-9 (order entry):** pass a real `onBarRevealed` to `<ReplayChart>` and call into `/lib/engine`'s fill functions from it. Decide there how a bar re-visited by stepping backward should behave (e.g. an already-filled order shouldn't fill twice) — `useReplayBarFeed` deliberately doesn't make that call, since there's no order state yet to make it meaningful.
- **Resumable sessions (TD-06):** deferred until M-9 creates `sim_accounts`, which `replay_sessions`' required FK needs. The cursor is already shaped as a timestamp specifically so a persisted `cursor_ts` can be converted straight back into a `ReplayCursor` via `engine/cursor.ts` when that lands.
- **New playback control** (e.g. jump-to-start/end): the store already has `jumpToStart`/`jumpToEnd` actions; add buttons to `ReplayControls.tsx` calling them.

## Known limitations

- **TD-05:** only daily (`1d`) candles are seeded. The `/replay` route fixes the timeframe at `1d` rather than offering a selector like `/chart` does, since any other timeframe would be an empty chart with nothing to step through.
- **No resumable sessions yet (TD-06):** progress is lost on refresh/navigation.
- **`useReplayBarFeed` fires on any cursor change**, not just forward advances — see the Extension guide above.
