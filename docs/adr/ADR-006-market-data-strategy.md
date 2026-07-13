# ADR-006: Market Data — Curated Historical Datasets, No Live Feed (Phases 1–6)

**Status:** Accepted · **Date:** 2026-07-12

## Context
The single biggest unresolved decision. Simulator, replay, pattern trainer, and backtesting all need OHLCV data, but no source, storage format, or licensing approach was ever chosen. Live data feeds are expensive, licensing-restricted, and unnecessary for education.

## Decision
1. **Historical-only** through Phase 6. No live/streaming quotes.
2. A **curated dataset library**: ~50–100 liquid instruments (major US stocks, ETFs, BTC/ETH, major FX pairs), daily bars for 10+ years plus selected intraday (5m/15m/1h) segments around instructive events (2008, 2020 crash, earnings gaps, trend runs).
3. Stored in a partitioned Postgres `candles` table, seeded via repo-versioned import scripts. Source: end-of-day data from providers whose terms permit redistribution in derived educational form (candidates: Stooq, Tiingo, Polygon flat files — final vendor pending license review, see RISKS R-1).
4. Replay sessions reference a `dataset_segment` so lessons can say "replay March 2020 on SPY."

## Rationale
- Deterministic data makes lessons reproducible and testable — every user replays the same market.
- Removes real-time infrastructure, websockets, and per-user quote costs entirely.
- Curated "interesting" segments are pedagogically better than random recent data (Rule 1, Rule 5).

## Consequences
- "Live paper trading" moves permanently to Future Ideas; roadmap updated.
- Data volume manageable (~100 instruments × 10y daily ≈ 250k rows; intraday segments add ~5–10M rows) — fine for Postgres with a composite index; revisit partitioning if it grows.
- An `instruments` + `candles` schema is a Phase 1 prerequisite (dependency graph updated: simulator depends on data foundation, not just auth).
