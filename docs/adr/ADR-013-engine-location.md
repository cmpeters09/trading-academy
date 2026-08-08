# ADR-013: Engine Location — `/lib/engine`, Not `features/simulator/engine/`

**Status:** Accepted · **Date:** 2026-08-05
**Supersedes:** ADR-007 (location only — ADR-007's execution model, fill rules,
and server re-validation approach remain in force unchanged)

## Context

ADR-007 originally placed the fill engine at `features/simulator/engine/`.
ENGINEERING_PRINCIPLES.md §3.1 later described `/lib/engine` as the settled
location — imported by the simulator, replay (M-10), and backtester (M-18),
and compiled for the Edge Function that re-validates trades server-side
(ADR-007) — but no ADR ever recorded that change; §3.1 cited a decision that
didn't formally exist (tracked as TD-02). This ADR formalizes it before M-8,
per TD-02's own trigger ("before M-8 (simulator engine)").

## Decision

The fill engine lives at **`/lib/engine`**, not inside any feature.

## Rationale

- **Three consumers, one feature-shaped home would force two of them into a
  deep import.** The simulator (M-9), the replay engine (M-10), and the
  backtester (M-18) all call the same fill logic. If it lived in
  `features/simulator/engine/`, the backtester and replay features would
  import into another feature's internals — exactly the coupling
  PROJECT_MAP.md and ENGINEERING_PRINCIPLES §1 forbid ("Deep imports are how
  a modular codebase quietly becomes a monolith").
- **It has to run somewhere React/Next.js/Supabase can't reach.** The same
  engine code is compiled for the Deno-based Edge Function that re-validates
  trades server-side (ADR-007) and, per the roadmap, runs inside a Web
  Worker for backtesting (ENGINEERING_PRINCIPLES §12). A module inside
  `/features` carries an implicit assumption of a React/Next.js runtime that
  neither of those environments provides.
- **§3.1's purity rule needs a home that can't accidentally violate it.**
  `/lib` is already documented as "framework-agnostic domain logic with no
  React import" (PROJECT_MAP.md); placing the engine anywhere else makes "no
  React, no Supabase, no feature imports" a matter of discipline instead of
  a structural fact about the folder.

## Consequences

- ADR-007's "Decision" section still literally says
  `features/simulator/engine/`; its Status line is updated to note the
  partial supersession, but its content is left untouched per
  ENGINEERING_PRINCIPLES §15 (ADRs are immutable) — this ADR is the record
  of what changed and why.
- `/lib/engine` is imported by feature code (`features/simulator`, later
  `features/replay`), never the reverse — consistent with PROJECT_MAP.md's
  "Where do I put a new...?" table, which already listed this location for
  trading calculations before this ADR made it official.
- TD-02 is paid by this ADR together with ADR-014.
