# ADR-001: Next.js App Router with React Server Components

**Status:** Accepted · **Date:** 2026-07-12

## Context
ARCHITECTURE.md specifies Next.js but not which router. App Router vs Pages Router changes folder structure, data fetching, and how server components are used ("Use server components where appropriate" implies App Router but was never decided).

## Decision
Use the **App Router** exclusively. Server Components by default; Client Components (`"use client"`) only where interactivity is required (charts, simulator, forms).

## Rationale
- Server Components reduce client bundle size — critical since charting libs are heavy (Performance Rule).
- Nested layouts map cleanly to the feature-module structure (dashboard shell, lesson shell).
- Streaming + Suspense gives loading skeletons for free, matching the "loading states" milestone.
- Pages Router is legacy; new code targeting it accrues immediate technical debt (violates Rule 17).

## Consequences
- TanStack Query is used only inside Client Components; server data flows through Server Components / Route Handlers.
- Team must learn the server/client boundary discipline; documented in ARCHITECTURE.md Data Flow section.
