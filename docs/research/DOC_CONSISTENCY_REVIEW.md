# DOC_CONSISTENCY_REVIEW.md

# Trading Academy — Documentation Consistency Review

Performed after ENGINEERING_PRINCIPLES.md v1.0, before M-1.
Findings are ranked. **C = contradiction** (two docs disagree; must be resolved). **G = gap** (no standard exists where one is needed). **I = improvement**.

---

## Blocking — resolve before M-1 begins

### C-1 · Stale v1 documents are still in the project folder
`Project_Vision`, `Feature_roadmap`, and `Architecture` (v1, no extension) sit alongside `PROJECT_VISION.md`, `FEATURE_ROADMAP.md`, and `ARCHITECTURE.md` (v2). They directly contradict the v2 docs — the v1 `Architecture` still says **"AI: OpenAI / Claude API"**, which ADR-003 closed, and the v1 roadmap has no M-3 Data Foundation and no XP ledger in Phase 1.

Two sources of truth is worse than one wrong one, because you cannot tell which is wrong.

**Action:** delete the three v1 files from the project. Their history is preserved in git; nothing is lost. **This is the single highest-value fix in this review** — every day they remain, the risk of building against them grows.

### C-2 · `PROJECT_INSTRUCTIONS.md` does not exist
It is named as a source of truth but is not in the project. The closest artifact is `Master_Prompt` (MASTER_PROMPT.md v1.0), and `NON_NEGOTIABLES.md` is stored as `Non_Negotialbes` (typo, no extension).

**Action:** rename `Non_Negotialbes` → `NON_NEGOTIABLES.md` and `Master_Prompt` → `MASTER_PROMPT.md`. Either create `PROJECT_INSTRUCTIONS.md` as the single entry-point index (recommended: a short document that lists the doc hierarchy and points to each) or stop referencing it.

### C-3 · Engine location conflict — ADR-007 vs. the modularity rule
ADR-007 places the fill engine at `features/simulator/engine/` and states it is "shared with the backtester." But `ARCHITECTURE.md` requires features to be self-contained, and Constitution Rule 16 forbids coupling unrelated features. A backtester importing deep into the simulator's internals is precisely the coupling both documents prohibit.

This is a genuine implementation-revealed conflict, so it qualifies for reopening under your own rule.

**Resolution (adopted in ENGINEERING_PRINCIPLES §3.1):** the engine lives at **`/lib/engine`** — pure, React-free, Supabase-free, imported by simulator, replay, backtester, and the validating Edge Function. This changes nothing about ADR-007's *substance* (deterministic client-side engine, server re-validation, versioned fills) — only its address.

**Action:** write **ADR-013: Shared Trading Engine Location**, marked `Supersedes ADR-007 (location only)`. Update ARCHITECTURE.md's folder structure.

### C-4 · Phase numbering collision in PROJECT_VISION.md
The vision's roadmap section says *"Phase 5 (commercial) unchanged"* — a leftover from v1's five-phase **business** roadmap. In FEATURE_ROADMAP.md v2, **Phase 5 is the AI Coach**. Two different meanings for "Phase 5" in documents that reference each other.

**Action:** rename the business track to **"Stage A–E"** or delete the sentence. Build phases keep the numbers.

---

## Contradictions — resolve during M-1

### C-5 · "Every table has `created_at`/`updated_at`" is false in the schema
ARCHITECTURE.md states this as a convention. `DATABASE_SCHEMA.md` omits both from: `instruments`, `candles`, `dataset_segments`, `lessons`, `lesson_prerequisites`, `activity_log`, `trade_orders`, `emotions`, `achievements`, `challenges`, `journal_emotions`.

Some omissions are correct (`candles` — 5M+ rows, timestamps would be waste; `activity_log` — the date *is* the record). The rule as written is simply not the rule you follow.

**Action:** restate the convention honestly: *"`created_at`/`updated_at` on all user-mutable tables. Reference and ledger tables carry `created_at` only. `candles` and `activity_log` carry neither — justified in the schema doc."* Then add `created_at` where it is genuinely missing (`instruments`, `dataset_segments`, `lessons`, `achievements`, `challenges`).

### C-6 · Soft-deleted parents and hard-deleted children
`journal_attachments` uses `on delete cascade` from `journal_entries` — but `journal_entries` is **soft**-deleted (ADR-011). The cascade will never fire. Deleting a journal entry therefore leaves its screenshots live in Storage, and the attachment rows orphaned-but-present.

Same shape of problem: `journal_emotions` / `journal_mistakes` hang off a soft-deleted parent.

**Action:** define the soft-delete contract explicitly in ADR-011 (or a new ADR): soft-deleting a parent MUST (a) filter its children everywhere via the shared query helper, and (b) enqueue Storage cleanup. Cascades remain, for the hard-delete (account-deletion) path only.

### C-7 · Definition of Done exists in three places, slightly differently
`ARCHITECTURE.md`, `MASTER_PROMPT.md`, and `NON_NEGOTIABLES.md` Rule 20 each list it. The lists diverge (only one mentions "integrates cleanly"; none mention RLS, migrations, or debt).

**Action:** ENGINEERING_PRINCIPLES §23 is now canonical. Replace the other three with a one-line pointer. A checklist that exists in three versions is a checklist nobody uses.

### C-8 · ADR numbering is inconsistent
Files are `ADR-001…ADR-012` (three digits), but PROJECT_VISION.md and elsewhere refer to `ADR-0014` (four digits) and to ADRs 13–15 that do not exist.

**Action:** three digits, always (ENGINEERING_PRINCIPLES §2). Fix the stray references. Write the missing ADRs (below) rather than leaving dangling citations — a citation to a nonexistent document is worse than no citation.

### C-9 · `orders.user_id` is an undocumented denormalization
ARCHITECTURE.md says there are exactly **two** deliberate denormalizations (`profiles.xp_total`, materialized `trades`). But `orders.user_id` is derivable through `sim_account_id → sim_accounts.user_id`. It is there — correctly — so RLS can filter without a join on a hot table.

**Action:** document it as the *third* intentional denormalization, justified by RLS performance. An undocumented denormalization is indistinguishable from a mistake to a future maintainer.

---

## Gaps — no standard exists where one is needed

### G-1 · No CI pipeline anywhere in the roadmap
ADR-010 says *"CI blocks merge on unit + integration"* and ENGINEERING_PRINCIPLES assumes lint/typecheck/test/axe gates — but **M-1 does not include setting up CI**, and no milestone does. Every quality gate in this project currently depends on you remembering to run things by hand.

**Action:** add to M-1: *GitHub Actions — typecheck, lint, unit, integration; commitlint; branch protection on `main`.* This is the load-bearing infrastructure under half of what these documents promise.

### G-2 · No ADR for money/numeric precision
The rule (Postgres `numeric`, integer minor units in TypeScript, no floats) is the single most consequential correctness decision in a trading app, and it currently lives only in ENGINEERING_PRINCIPLES §9 and in your head.

**Action:** **ADR-014: Numeric Precision and Money Representation.**

### G-3 · No ADR for configuration, secrets, and environments
Which env vars exist, where they live (Vercel vs Supabase), how local dev is seeded, what happens on a missing var (fail fast at boot, not at first use). Currently undefined.

**Action:** **ADR-015: Environment & Secrets Management.**

### G-4 · No observability decision
ENGINEERING_PRINCIPLES §8 defines a logging *philosophy* and a `logger` abstraction, but no sink, no error tracking (Sentry?), no alerting on the two things that can silently hurt you: AI spend and failed trade validations.

**Action:** **ADR-016: Observability & Error Tracking** — may legitimately conclude "Vercel/Supabase logs for now, revisit at first external user," but the trigger condition must be named.

### G-5 · Leaderboards are architecturally impossible under default-deny RLS
PROJECT_VISION says leaderboards are *"feasible without rework."* But ADR-012 makes every user table default-deny with `user_id = auth.uid()` — no user can read another user's rows, so no leaderboard can be assembled client-side. It needs a service-role RPC or a materialized public view.

Not urgent (leaderboards are far future), but the vision currently claims a property the architecture does not provide.

**Action:** soften the vision's claim to *"requires a dedicated aggregate view; no data model rework"* — which is true and precise.

### G-6 · `TECHNICAL_DEBT.md` does not exist
Constitution Rule 17 requires debt to be documented in a list. The list has never been created.

**Action:** create it now, empty, with the TD-nn template. A debt register created *after* the first debt is a debt register that starts incomplete.

### G-7 · No Web Worker decision for backtests
ENGINEERING_PRINCIPLES §12 mandates it; no ADR or milestone accounts for it. M-18 says "runs the same fill engine" with no mention of where it runs. A synchronous 10-year backtest on the main thread freezes the tab.

**Action:** note it in M-18's checklist now; it also constrains `/lib/engine` (must be worker-transferable — another reason it cannot live inside a feature, reinforcing C-3).

### G-8 · Roadmap M-3 contains a non-code blocker
M-3's first checkbox is *"Resolve data licensing (RISKS R-1)"* — but R-1 says decide **before** M-3. As written, the milestone cannot start until its own first item is done.

**Action:** promote it to **M-0: Data Licensing Decision** — a research task with a deliverable (a written vendor decision + terms summary), sitting before M-3 on the critical path. It is the only true external blocker in the project; giving it a milestone number makes it visible instead of buried.

---

## Improvements

- **I-1 — `sim_accounts.balance`** has no default while `starting_balance` does; every insert must set both. Add `default 100000` or set it in a trigger, or the first insert will fail in a way that looks mysterious.
- **I-2 — Add a `docs/GLOSSARY.md`.** Your own priorities say you are starting from zero trading knowledge. R-multiple, expectancy, profit factor, slippage, and bar-path ambiguity all appear in these documents as if understood. A glossary is a *lesson-content asset* as much as an engineering one — it will become the first draft of your Market Basics track.
- **I-3 — Version and date every document header** (`Version 2.0 · Last updated: 2026-07-13`). Two of the current docs have versions; the rest do not.
- **I-4 — RISKS_AND_UNKNOWNS.md needs a review cadence.** A risk register that is not revisited at milestone boundaries is an artifact, not a tool. Add: *"Reviewed at every milestone boundary."*
- **I-5 — MASTER_PROMPT.md and ENGINEERING_PRINCIPLES.md now overlap** (both cover code quality, testing, documentation standards). Master Prompt should be trimmed to what it uniquely does — defining the AI collaborator's role and product philosophy — and defer to this document on all engineering specifics.

---

## Summary of proposed new artifacts

| Artifact | Purpose | When |
|---|---|---|
| ADR-013 | Shared engine location (`/lib/engine`), supersedes ADR-007 (location only) | Before M-1 |
| ADR-014 | Numeric precision & money representation | Before M-1 |
| ADR-015 | Environment & secrets management | Before M-1 |
| ADR-016 | Observability & error tracking | Before M-3 |
| TECHNICAL_DEBT.md | Rule 17 register | Now (empty) |
| PROJECT_INSTRUCTIONS.md | Entry-point index to the doc hierarchy | Now |
| GLOSSARY.md | Domain vocabulary; seeds lesson content | Before M-6 |
| M-0 | Data licensing decision, promoted out of M-3 | Now |
| CI pipeline | Added to M-1 checklist | M-1 |

**Delete:** the three v1 documents (`Project_Vision`, `Feature_roadmap`, `Architecture`).
