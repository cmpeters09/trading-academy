# ADR-007: Simulator Execution — Client-Side Engine, Server-Side Persistence & Validation

**Status:** Accepted · **Date:** 2026-07-12
**Partially superseded by ADR-013** (2026-08-05) — engine *location* only.
The "Decision" section below still says `features/simulator/engine/`; the
engine actually lives at `/lib/engine` per ADR-013. Execution model, fill
rules, and server re-validation approach are unchanged and still governed by
this ADR.

## Context
Undecided whether order fills/PnL are computed on the client (responsive, cheatable) or server (authoritative, slower). Matters for replay speed and future leaderboards.

## Decision
- The **fill engine runs client-side** as a pure, deterministic TypeScript module (`features/simulator/engine/`): given (order, candle, config) → execution. Same module is unit-testable and reusable by the backtester.
- Completed executions/trades are persisted through an Edge Function that **re-validates** them server-side against the same candle data (same engine code compiled for Deno) before writing.
- Fill model v1: market orders fill at next candle open ± configurable slippage; limit/stop fill on candle range touch; per-trade commission from config. Documented in the engine README.

## Rationale
- Client-side keeps replay at 60fps with instant feedback (Rule 15).
- Server re-validation makes stats trustworthy before leaderboards exist, without building real-time infrastructure.
- One engine shared by simulator + backtester = no drift between "practice" and "test" results (Rule 16).

## Consequences
- Engine must be side-effect free and versioned (`engine_version` stored on every trade) so historical trades remain interpretable after model changes.
- Leaderboards (Phase 4+ of vision) become feasible without rework.
