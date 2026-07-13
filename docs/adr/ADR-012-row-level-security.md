# ADR-012: Row Level Security — Default-Deny on Every Table

**Status:** Accepted · **Date:** 2026-07-12

## Context
"Use Row Level Security" was stated without a model. RLS mistakes are the #1 Supabase security failure.

## Decision
- RLS **enabled on every table**, no exceptions. Default deny.
- User-data tables: `user_id = auth.uid()` policies for select/insert/update; deletes go through soft-delete updates or Edge Functions.
- Shared reference tables (`instruments`, `candles`, `lessons`, `achievements` definitions): authenticated `SELECT` only; writes only via service role (Edge Functions / migrations).
- Privileged writes (XP, achievement grants, trade validation) happen exclusively in Edge Functions with the service-role key; the anon key can never write to gamification tables.
- Every table's policies are declared in the same migration file that creates it — a table without policies fails code review.

## Consequences
- Integration tests assert cross-user isolation per ADR-010.
- Slight query overhead accepted; indexes on `user_id` everywhere (already required for performance).
