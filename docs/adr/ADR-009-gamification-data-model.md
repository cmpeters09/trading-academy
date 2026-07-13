# ADR-009: Gamification — Append-Only XP Event Ledger, Derived Levels & Streaks

**Status:** Accepted · **Date:** 2026-07-12

## Context
XP, levels, streaks, achievements, and challenges appear across phases with no data model. Naive approach (an `xp` integer on the profile) can't answer "why do I have this XP," breaks on retroactive rule changes, and invites double-granting bugs.

## Decision
- **`xp_events`**: append-only ledger (user, amount, reason, source type + id, timestamp). Profile `xp_total` is a denormalized sum maintained by trigger; **level is computed** from total via a pure function in code, never stored.
- XP is granted **only by Edge Functions** (never client) with an idempotency key (`source_type + source_id + reason` unique) so completing a lesson twice can't double-grant.
- **Streaks** derive from a daily `activity_log` (one row per user per UTC-day of qualifying activity), computed against the user's stored timezone; not an incrementing counter (counters corrupt silently).
- **Achievements/challenges** are definition tables + user-progress tables; criteria evaluated server-side on relevant events.

## Rationale
- Auditability supports honest feedback (Rule 8) and rewarding *process* — XP reasons like `journal_completed`, `risk_limit_respected` are first-class, not just `trade_won` (Rule 3: never reward profit alone).
- Append-only ledgers are the standard fix for the exact bugs gamification systems suffer.

## Consequences
- Slightly more tables (see DATABASE_SCHEMA.md §6) in exchange for correctness.
- Rule 3 is enforceable in data: XP reasons for discipline exist; there is deliberately **no XP reason for raw profit**.
