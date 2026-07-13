# ADR-003: AI Provider — Anthropic Claude API Behind an Abstraction Layer

**Status:** Accepted · **Date:** 2026-07-12

## Context
ARCHITECTURE.md says "OpenAI / Claude API" — an explicitly unresolved choice. The AI Coach (Phase 5) needs long-context trade-history analysis and mentor-style coaching per Rule 18.

## Decision
Use **Anthropic Claude** as the primary provider. All AI calls go through a single `services/ai/` interface (`generateCoachReview()`, `generateLessonHint()`, ...) implemented in a Supabase Edge Function. The provider is a config value, not scattered SDK calls.

## Rationale
- Coaching quality depends on long context (full journal + stats); Claude's context window fits.
- The mentor persona (guide, don't answer; never shame) is enforced via one centrally versioned system prompt — impossible to keep consistent if calls are scattered.
- Abstraction keeps switching cost near zero if pricing/quality changes.

## Consequences
- Prompts live in `/services/ai/prompts/` and are code-reviewed like source.
- Cost control: reviews generated on-demand and cached per trade, never auto-run in bulk (see RISKS R-4).
