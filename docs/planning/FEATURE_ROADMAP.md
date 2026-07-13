# FEATURE_ROADMAP.md

# Trading Academy Development Roadmap

Version 2.0 — milestones now have IDs (M-x) matching /docs/MILESTONE_DEPENDENCIES.md.
"Depends on" lists hard prerequisites; parallel-friendly milestones are noted.

> Goal: Build the world's best interactive trading education platform.

# Development Principles
- One milestone in progress at a time; complete it before starting the next.
- Every milestone produces a usable improvement.
- Refactor regularly. Never sacrifice quality for speed.

Status Key: ⬜ Not Started · 🟨 In Progress · ✅ Complete

---

# Phase 1 — Foundation

## M-1 Project Setup — depends on: nothing
- ⬜ Initialize Next.js (App Router, ADR-001), TypeScript strict, Tailwind, shadcn/ui
- ⬜ ESLint & Prettier, theme system, dark mode (dark-first)
- ⬜ Responsive layout shell, error handling, loading skeletons, empty states
- ⬜ Supabase project + local dev + migration tooling (ADR-002)

## M-2 Authentication & Profiles — depends on: M-1
- ⬜ Sign up / login / forgot password / email verification (Supabase Auth)
- ⬜ `profiles` + `user_settings` tables with RLS (ADR-012), profile creation trigger
- ⬜ Timezone capture at onboarding (required for streaks, ADR-009)

## M-3 Data Foundation — depends on: M-1 (originally missing from v1 roadmap; added — blocks all chart features)
- ✅ Data source resolved for dev phase: **yfinance** (free, no key — ADR-016). Licensing revisit deferred to pre-commercial (ADR-017 trigger, see RISKS R-1).
- ⬜ `instruments`, `candles`, `dataset_segments` tables + import scripts (ADR-006, ADR-016)
- ⬜ Seed initial dataset: ~20 instruments daily + 3 curated intraday segments
- ⬜ Shared `<PriceChart>` component on Lightweight Charts (ADR-004)

## M-5 XP Ledger & Activity Log — depends on: M-2 ★ MOVED from Phase 8 (ADR-009)
- ⬜ `xp_events` (append-only, idempotent), `activity_log`, xp_total trigger
- ⬜ Grant-XP Edge Function (service-role only)
- ⬜ Level function + streak computation with timezone/DST tests
(Achievements, challenges, quests remain in Phase 8 — only the ledger moves early.)

## M-4 Dashboard v1 — depends on: M-2, M-5
- ⬜ Welcome screen, learning progress, XP + level, daily streak
- ⬜ Recent activity, recommended lessons (static until M-6)

---

# Phase 2 — Education

## M-6 Lesson Engine — depends on: M-2, M-3, M-5
- ⬜ MDX pipeline: `/content/lessons`, frontmatter → `lessons` table sync (ADR-008)
- ⬜ Lesson shell as Server Component; lazy-loaded interactive embeds (RISKS R-5)
- ⬜ `lesson_progress`, prerequisites/unlocking, completion → XP grant
- ⬜ Acceptance test: one full lesson (explanation + chart + quiz + XP) end to end

## M-7 Knowledge Checks — depends on: M-6
- ⬜ Multiple choice, true/false, fill-in-the-blank, scenario questions (`<Quiz>` MDX components)
- ⬜ `quiz_attempts` persistence; adaptive difficulty (v2, after attempt data exists)

---

# Phase 3 — Trading Simulator

## M-8 Simulator Fill Engine — depends on: M-3 · ∥ can run parallel with M-6
- ⬜ Pure TS engine: market/limit/stop fills, slippage, commission, partial fills
- ⬜ Bar-path ambiguity rule: resolve against the trader + flag (RISKS R-3)
- ⬜ ~100% branch coverage with hand-computed cases (ADR-010); `engine_version` tagging

## M-10 Replay Engine — depends on: M-3
- ⬜ Candle-by-candle playback state machine, pause, speed, multi-timeframe
- ⬜ Future data hidden at the engine layer, never the view (ADR-004)
- ⬜ Resumable sessions (`replay_sessions`)

## M-9 Simulator UI — depends on: M-2, M-8, M-10
- ⬜ Buy/sell, long/short, position sizing (risk-% helper), stop loss, take profit
- ⬜ Partial exits, order/position panels, `sim_accounts`

## M-11 Trade Persistence — depends on: M-9
- ⬜ Edge Function: server-side re-validation with the same engine (ADR-007)
- ⬜ `orders`/`executions`/`trades` materialization, R-multiple capture

---

# Phase 4 — Analytics

## M-12 Journal — depends on: M-11 · ∥ parallel with M-13
- ⬜ Entries linked to trades, setup/reasoning/review, confidence, followed_plan
- ⬜ Emotion + mistake tagging (normalized vocabularies), screenshots via Storage
- ⬜ Journaling → XP (process reward, Rule 3)

## M-13 Statistics — depends on: M-11 · ∥ parallel with M-12
- ⬜ Win rate, profit factor, drawdown, equity curve, expectancy, distributions, calendar
- ⬜ Process metrics first-class: plan-adherence %, avg R, risk-limit violations
- ⬜ Every formula unit-tested with documented expected values (ADR-010)

---

# Phase 5 — AI

## M-14 AI Coach — depends on: M-12, M-13
- ⬜ Claude via Edge Function + `services/ai` abstraction, versioned mentor prompt (ADR-003)
- ⬜ On-demand trade reviews cached in `ai_reviews`; weekly digests; cost ceiling (RISKS R-4)
- ⬜ Psychology & risk pattern detection from structured journal tags

## M-15 AI Tutor — depends on: M-6
- ⬜ Interactive Q&A, guided hints (guide, don't answer), quiz generation, lesson recommendations

---

# Phase 6 — Practice

## M-16 Pattern Recognition — depends on: M-3, M-6
- ⬜ Candlesticks, trends, S/R, breakouts, reversals, chart patterns
- ⬜ Requires drawing-overlay layer on `<PriceChart>` (scoped in ADR-004)

## M-17 Strategy Builder — depends on: M-8
- ⬜ Rule builder (indicators, entry/exit logic, risk rules) → `strategies` (jsonb definition)

## M-18 Backtesting — depends on: M-17, M-13
- ⬜ Runs the same fill engine over dataset segments; `backtests`/`backtest_trades`
- ⬜ Metrics reuse M-13 calculation modules; optimization later

---

# Phase 7 — Psychology (M-19) — depends on: M-10, M-12
- ⬜ FOMO / revenge / fear simulators built on replay scenarios
- ⬜ Discipline challenges, emotional journaling prompts

# Phase 8 — Full Gamification (M-20) — depends on: M-5, M-6, M-11
- ⬜ Achievements, daily quests, weekly challenges, rewards (definitions + jsonb criteria per schema §6)
- ⬜ Streak UI polish (ledger + streak math already live since M-5)

# Phase 9 — Macro
- ⬜ Economic calendar, macro simulator, sector rotation, correlations
- (No live news feed — consistent with ADR-006; uses historical event data.)

# Phase 10 — Portfolio
- ⬜ Portfolio simulator, allocation, diversification, risk analysis (reuses sim_accounts/orders)

# Phase 11 — Polish
- ⬜ Accessibility audit, performance pass, animation polish, UI consistency,
  security review (RLS test suite), documentation sweep, bug fixing
- (Accessibility/testing are per-milestone requirements; Phase 11 is the audit, not the start.)

---

# Future Ideas
Mobile apps · voice AI coach · multiplayer competitions · options/futures simulators ·
economic event replay · community strategies · AI lesson generator ·
**Live paper trading & broker integrations — explicitly out of scope through Phase 6 (ADR-006, RISKS R-7); revisit only with legal review.**
