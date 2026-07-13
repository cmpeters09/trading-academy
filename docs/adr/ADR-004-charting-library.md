# ADR-004: TradingView Lightweight Charts + Custom Replay Wrapper

**Status:** Accepted · **Date:** 2026-07-12

## Context
Lightweight Charts is named in the stack, but the replay engine (candle-by-candle, hide-future-data, speed control) is not something the library provides out of the box. Undecided: build replay on top of it, or adopt a heavier charting solution.

## Decision
Keep **Lightweight Charts** for all price rendering. Build a thin, feature-owned wrapper: `features/replay/engine/` holds the playback state machine (cursor, speed, pause) and feeds the chart incrementally via `series.update()`. The chart never receives future candles — enforcement lives in the engine, not the UI.

## Rationale
- Library is small (~45KB), fast, and canvas-based — matches Rule 15 (performance).
- Full TradingView Charting Library requires licensing and iframes; overkill for education.
- Keeping "hide future data" in the data layer (engine) rather than the view prevents leaks (e.g., autoscale hinting at future range).

## Consequences
- Drawing tools (trendlines, S/R marking for pattern lessons) must be built as an overlay layer; scoped as its own milestone (M-13).
- One shared `<PriceChart>` component in `/components/chart/`; features compose it, never instantiate the library directly.
