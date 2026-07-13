# RISKS_AND_UNKNOWNS.md

# Trading Academy — Pre-Implementation Risk Register

Format: risk → impact → mitigation → owner decision needed before which milestone.

---

## R-1 · Market data licensing (RESOLVED for development phase — reopens before commercial launch)
**Risk:** ADR-006 commits to curated historical datasets but the vendor/license was unresolved. Most "free" OHLCV sources (Yahoo scrapes, unofficial APIs) prohibit redistribution; shipping their data inside a commercial product is a legal problem, not a technical one.
**Resolution (ADR-016):** For the current development phase — personal, non-commercial, zero-cost — the project uses **yfinance** (free, unofficial Yahoo Finance wrapper, no API key). This unblocks M-3 immediately.
**Remaining exposure:** yfinance has no redistribution license and no stability guarantee (Yahoo can change endpoints without notice). This is accepted risk *only* while the product has no external users and no monetization.
**Mitigation / trigger to revisit:** Before any public launch, paid users, or monetization, ADR-016 must be superseded by ADR-017, evaluating licensed vendors in this order: (1) Stooq — free, permissive for EOD; (2) Tiingo/Polygon paid tiers with redistribution terms read in full; (3) Binance public data (crypto only, unrestricted) as a fallback for early replay segments.
**Decide before:** ADR-017 required before commercial/public release, not before M-3. M-3 is now unblocked.

## R-2 · Solo-developer bandwidth vs. roadmap size (HIGH)
**Risk:** The roadmap describes a multi-quarter product for a full team; available time is ~1–2 hrs/day with frequent interruptions.
**Impact:** Half-finished features violate the Definition of Done and Rule 20; morale risk.
**Mitigation:** Milestones M-1…M-20 are already sized so each produces a usable increment, and MILESTONE_DEPENDENCIES.md marks parallel pairs and the critical path. Work rule: never have more than one milestone in progress. Treat Phase 2 + M-8 as the "minimum lovable product" checkpoint before committing further.
**Decide before:** ongoing.

## R-3 · Replay realism vs. data granularity (MEDIUM)
**Risk:** Daily candles make intraday fill simulation (stop hit before or after target within the same bar?) ambiguous. The fill engine must define bar-path assumptions or backtests will silently lie — the classic backtesting pitfall.
**Impact:** Wrong stats teach wrong lessons; violates Rule 8 (do not fabricate certainty).
**Mitigation:** Engine v1 rule (documented in ADR-007's engine README): if both stop and target fall within one bar, resolve **against** the trader (conservative assumption) and surface a "resolution ambiguous" flag on the trade. Use intraday segments for lessons where precision matters.
**Decide before:** M-8 (rule chosen above; revisit only with evidence).

## R-4 · AI Coach cost & latency (MEDIUM)
**Risk:** Per-trade reviews with full journal context can get expensive at scale and slow at ~1 request/trade.
**Mitigation:** ADR-003/schema already enforce: on-demand generation only, cached in `ai_reviews`, weekly digest batches instead of per-trade auto-runs, token budget per review. Add a monthly cost ceiling env config before M-14.
**Decide before:** M-14.

## R-5 · MDX interactive-lesson complexity (MEDIUM)
**Risk:** ADR-008's embedded components (`<Quiz>`, chart exercises) blur the server/client boundary in the App Router; naive setup ships the whole chart lib in every lesson bundle.
**Mitigation:** Lesson shell is a Server Component; interactive embeds are lazy-loaded Client Components. Prove the pattern with one full lesson (explanation + chart + quiz + XP grant) as M-6's acceptance test before authoring content at volume.
**Decide before:** M-6.

## R-6 · Streak/timezone correctness (LOW, but user-visible when wrong)
**Risk:** Streaks computed in UTC break for evening users ("I practiced yesterday and lost my streak").
**Mitigation:** Already designed: `profiles.timezone` + `activity_log.activity_date` computed in user TZ (ADR-009). Add unit tests for DST transitions per ADR-010.

## R-7 · Scope gravity toward "real trading" features (STRATEGIC)
**Risk:** Future ideas (broker integrations, live paper trading) pull the product toward being a brokerage-adjacent tool, which carries regulatory weight (investment-advice territory) and contradicts the education-first constitution.
**Mitigation:** Constitution Rule 11 as the filter; ADR-006 formally moved live data out of scope. The AI Coach must critique *process on simulated trades*, never suggest real-market actions — encode this in the system prompt (ADR-003) and test for it.
**Decide before:** M-14 prompt review.

## R-8 · Educational content accuracy (STRATEGIC)
**Risk:** The platform's credibility rests on lesson content being correct and probability-framed (Rule 4). Software quality can't compensate for a wrong lesson.
**Mitigation:** Content review checklist per lesson: no certainty claims, risk concepts precede strategy concepts in track ordering (Rule 2 enforced via `lesson_prerequisites`), every claim about a pattern phrased as historical tendency.

---

## Resolved since last review (no longer unknowns)
AI provider (ADR-003) · router choice (ADR-001) · state ownership (ADR-005) · lesson storage (ADR-008) · XP model (ADR-009) · fill engine location (ADR-007) · deletion policy (ADR-011) · RLS model (ADR-012) · charting/replay approach (ADR-004) · data strategy minus licensing (ADR-006) · **dev-phase data source (ADR-016, R-1 resolved for now).**

**Remaining true unknown: the R-3 bar-path rule's real-world adequacy.** R-1 is resolved for the development phase but carries a named trigger (see above) to reopen before commercial launch — track it, don't forget it. Everything else is a managed risk with a decided mitigation.
