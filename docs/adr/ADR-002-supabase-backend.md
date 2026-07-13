# ADR-002: Supabase as the Sole Backend Platform

**Status:** Accepted · **Date:** 2026-07-12

## Context
Stack lists Supabase, PostgreSQL, and Edge Functions but doesn't state whether a separate API layer (custom Node backend) will ever exist, or where business logic lives.

## Decision
Supabase is the sole backend: Postgres (data), Supabase Auth (identity), Storage (screenshots), Edge Functions (server-side logic: AI proxy, trade validation, XP grants). **No custom backend server.** Next.js Route Handlers are allowed only as thin adapters, never as a second source of business logic.

## Rationale
- One platform = less operational surface for a small team.
- RLS + Auth integration gives per-user security without middleware (Security Standards).
- Edge Functions keep secrets (AI keys) off the client.

## Consequences
- All privileged writes (XP, achievements, AI calls) go through Edge Functions using the service role.
- Vendor lock-in accepted; mitigated by plain Postgres schema and SQL migrations kept in-repo.
