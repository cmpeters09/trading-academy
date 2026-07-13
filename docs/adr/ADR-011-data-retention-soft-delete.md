# ADR-011: Deletion Policy — Soft Delete for User Content, Hard Delete Elsewhere

**Status:** Accepted · **Date:** 2026-07-12

## Context
ARCHITECTURE.md says "soft delete when appropriate" without defining "appropriate," which guarantees inconsistency.

## Decision
- **Soft delete** (`deleted_at timestamptz`) only on user-authored content a user may regret deleting: `journal_entries`, `strategies`, `trades` (deleting a trade would silently corrupt stats history — instead it's excluded from views).
- **Hard delete** for everything else (attachments follow their parent; challenge progress, sessions).
- All queries go through views or query helpers that filter `deleted_at IS NULL`; features never re-implement the filter ad hoc.
- Account deletion = hard cascade of everything (privacy requirement), implemented as one Edge Function.

## Consequences
- Stats integrity preserved: a "deleted" trade is hidden, and stats recompute without it, but the audit trail (XP already granted) remains explainable.
