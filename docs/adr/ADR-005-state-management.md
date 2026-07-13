# ADR-005: State Management Split — TanStack Query vs Zustand

**Status:** Accepted · **Date:** 2026-07-12

## Context
Both TanStack Query and Zustand are in the stack with no rule for which owns what. This ambiguity is the most common source of state bugs (server data duplicated into client stores).

## Decision
- **TanStack Query owns all server state** (anything persisted in Postgres): trades, journal, progress, stats. No copying query results into Zustand.
- **Zustand owns ephemeral client state only**: replay playback position, unsubmitted order ticket, UI panels, simulator session before persistence.
- Theme/auth session use Supabase client + React context, not Zustand.

## Rationale
Clear ownership eliminates cache-sync bugs and duplicate sources of truth (Coding Philosophy: simplicity, consistency).

## Consequences
- Mutations invalidate queries; optimistic updates only for journal notes and order placement.
- One Zustand store per feature (`features/replay/store.ts`), never a global app store.
