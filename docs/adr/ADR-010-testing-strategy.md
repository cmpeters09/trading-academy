# ADR-010: Testing Strategy and Coverage Priorities

**Status:** Accepted · **Date:** 2026-07-12

## Context
Vitest and Playwright are named but with no policy on what must be tested, leaving "Tested" in the Definition of Done unenforceable.

## Decision
Priority-ordered testing pyramid:
1. **Unit (Vitest) — mandatory, high coverage:** simulator fill engine, PnL/stats calculations (win rate, profit factor, drawdown, expectancy), XP/streak/level logic, position-sizing math. These are pure functions; target ~100% branch coverage. A wrong statistic is an educational failure, not just a bug.
2. **Integration (Vitest + supabase local):** Edge Functions (trade validation, XP grants), RLS policies (user A cannot read user B).
3. **E2E (Playwright) — critical paths only:** signup → first lesson → quiz; open replay → place trade → journal it; dashboard loads.
4. UI component tests: only for complex interactive components (order ticket, quiz).

## Rationale
Educational correctness concentrates in the math; that's where testing budget goes. E2E kept thin to stay fast (small team, Rule 15/20).

## Consequences
- CI blocks merge on unit + integration; e2e runs on main.
- Every stats formula gets a test case with hand-computed expected values documented inline.
