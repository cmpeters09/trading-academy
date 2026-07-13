# ARCHITECTURE.md

# Trading Academy Technical Architecture

Version 2.1 — updated to reflect ADR-001 … ADR-012, ADR-016 (see `/docs/adr/`).
Where this document and an ADR conflict, the ADR governs.

---

# Technology Stack (all choices now final)

Frontend
- Next.js — **App Router, React Server Components by default** (ADR-001)
- React, TypeScript (strict mode)
- Tailwind CSS + shadcn/ui
- Framer Motion (sparingly)
- TanStack Query — **server state only** (ADR-005)
- Zustand — **ephemeral client state only, one store per feature** (ADR-005)

Backend
- Supabase is the **sole backend**: Postgres, Auth, Storage, Edge Functions (ADR-002)
- No custom API server. Next.js Route Handlers only as thin adapters.

Charts
- TradingView Lightweight Charts via one shared `<PriceChart>` component; replay playback logic lives in a feature-owned engine, never in the view (ADR-004)

Market Data
- Curated historical OHLCV only; no live feeds through Phase 6 (ADR-006). Seeded by versioned import scripts into `instruments` / `candles` / `dataset_segments`.
- **Development-phase source: yfinance** (free, no API key) per ADR-016 — a deliberate, temporary substitute for a licensed vendor while the project is personal/non-commercial and zero-cost. Import scripts are written against the schema, not the vendor, so swapping sources later (ADR-017, pre-commercial) does not touch `instruments`/`candles`/`dataset_segments` or anything downstream.

Forms
- React Hook Form + Zod (Zod schemas shared with Edge Function validation)

Authentication
- Supabase Auth

AI
- **Anthropic Claude API**, called only from Edge Functions through the `services/ai/` interface with versioned prompts (ADR-003)

Testing
- Vitest (unit/integration) + Playwright (critical-path e2e) per the priority pyramid in ADR-010

Deployment
- Vercel (app) + Supabase (backend), SQL migrations versioned in-repo

---

# Folder Structure

/app                — routes, layouts (Server Components by default)
/components         — shared UI (incl. /components/chart/PriceChart)
/content/lessons    — MDX lesson content (ADR-008)
/features           — self-contained feature modules
/hooks
/lib
/services           — supabase client, /services/ai (provider abstraction + prompts)
/store              — (feature stores live inside their feature; nothing global here except theme helpers)
/styles
/types
/utils
/supabase           — migrations, Edge Functions, seed/import scripts
/docs               — this file, /docs/adr, DATABASE_SCHEMA.md, MILESTONE_DEPENDENCIES.md, RISKS_AND_UNKNOWNS.md
/public

# Feature Structure

/features
  /dashboard /lessons /simulator /replay /journal /statistics
  /coach /backtester /strategy-builder /pattern-recognition
  /psychology /portfolio /settings

Each feature is self-contained: its UI, hooks, engine code, and Zustand store (if any) live together. The simulator **fill engine** (`features/simulator/engine/`) is a pure TypeScript module shared with the backtester and re-run server-side for validation (ADR-007).

---

# State Management (ADR-005)

- Server state (anything in Postgres): TanStack Query. Never copied into Zustand.
- Ephemeral client state (replay cursor, unsubmitted order ticket, UI panels): Zustand, one store per feature.
- Auth session + theme: Supabase client + React context.

# Data Flow

Server Components → services → Supabase (reads)
Client Components → hooks (TanStack Query) → services → Supabase (reads/writes under RLS)
Privileged writes (XP grants, trade validation, AI calls) → Edge Functions with service role — **never** from the client.

UI components never touch the database client directly.

---

# Database (see /docs/DATABASE_SCHEMA.md for full schema)

Principles, now made concrete:
- UUID PKs everywhere except `candles`, which uses its natural composite key (justified in schema doc).
- Normalized; the two deliberate denormalizations (`profiles.xp_total`, materialized `trades`) are trigger-/function-maintained caches with documented provenance.
- Soft delete (`deleted_at`) **only** on journal entries, trades, and strategies; hard delete elsewhere; account deletion is a full cascade (ADR-011).
- `created_at`/`updated_at` on every table.
- XP is an append-only ledger; levels and streaks are computed, never stored (ADR-009).

# Security (ADR-012)

- RLS enabled on every table, default deny. Policies ship in the same migration that creates the table.
- User tables: `user_id = auth.uid()`. Reference tables (candles, lessons, achievement definitions): authenticated SELECT only.
- Gamification and trade-validation writes are service-role-only via Edge Functions.
- All input validated with Zod on both client and Edge Function. Secrets only in Edge Function env.

---

# Design System

Dark mode first. Typography with clear hierarchy. Color tokens: Primary / Neutral / Success / Warning / Danger + consistent chart palette. Framer Motion limited to page transitions, hover, skeletons, micro-interactions — never decoration alone.

# Performance

- Lazy-load the chart bundle and all lesson interactive embeds (they are Client Components inside Server Component lesson shells — see RISKS R-5).
- `candles` reads use the composite index range-scan pattern; stats read the materialized `trades` table, never recompute from raw executions on page load.
- Memoize chart series transforms; measure before optimizing.

# Accessibility

Keyboard navigation, ARIA labels, contrast, screen reader support, focus management, semantic HTML. Required per Constitution Rule 14 — part of every milestone's Definition of Done, not a Phase 11 cleanup.

# Error Handling

Friendly messages, retries via TanStack Query defaults, graceful fallbacks, log unexpected errors. Edge Functions return typed error shapes.

# Documentation

Every major feature ships with: Purpose, Architecture, API usage, Extension guide, Known limitations. Architectural decisions go in `/docs/adr` — one ADR per decision, never edited retroactively (superseding ADRs instead).

# Definition of Done

Unchanged: functional, polished, responsive, accessible, tested per ADR-010, documented, refactored, no known bugs, production-ready. Nothing ships half-finished.
